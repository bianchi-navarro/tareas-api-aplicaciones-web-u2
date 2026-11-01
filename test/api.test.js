import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

const secret = 'test-only-secret-with-more-than-32-characters';
async function fixture(t, options = {}) {
  const application = createApp({ dbPath: ':memory:', secret, ...options });
  const server = application.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const cleanup = async () => {
    application.close(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  };
  if (t) t.after(cleanup);
  function client() {
    let cookie = '', csrfToken;
    return {
      get cookie() { return cookie; },
      get token() { return csrfToken; },
      async request(path, { method = 'GET', body, headers = {}, raw } = {}) {
        const response = await fetch(`${base}${path}`, { method,
          headers: { Cookie: cookie, 'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...headers },
          body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const text = await response.text();
        const json = text ? JSON.parse(text) : null;
        if (json?.data?.csrfToken) csrfToken = json.data.csrfToken;
        return { status: response.status, headers: response.headers, json, text };
      },
      async register(username = 'estudiante') {
        await this.request('/session');
        return this.request('/auth/register', { method: 'POST', body: { username, password: 'PruebaSegura123!' } });
      },
      async create(title = 'Preparar entrega', extra = {}) {
        return this.request('/tasks', { method: 'POST', body: { title, ...extra } });
      },
      async stream() {
        const controller = new AbortController();
        const response = await fetch(`${base}/events`, { headers: { Cookie: cookie }, signal: controller.signal });
        assert.equal(response.status, 200);
        const reader = response.body.getReader();
        let buffer = '';
        return {
          response,
          close: () => controller.abort(),
          async next() {
            const timeout = setTimeout(() => controller.abort(), 4000);
            try {
              while (!buffer.includes('\n\n')) {
                const { value, done } = await reader.read();
                if (done) return null;
                buffer += new TextDecoder().decode(value);
              }
              const index = buffer.indexOf('\n\n');
              const message = buffer.slice(0, index); buffer = buffer.slice(index + 2);
              return message;
            } finally { clearTimeout(timeout); }
          }
        };
      }
    };
  }
  return { ...application, client, base, cleanup };
}
const etag = version => ({ 'If-Match': `"${version}"` });
const errorCode = result => result.json.error.code;

test('01. Salud y formato uniforme con identificador de solicitud', async t => {
  const f = await fixture(t); const c = f.client();
  assert.equal((await c.request('/health')).json.data.status, 'ok');
  const r = await c.request('/tasks');
  assert.equal(r.status, 401); assert.equal(errorCode(r), 'AUTH_REQUIRED');
  assert.deepEqual(r.json.error.details, []);
  assert.equal(r.json.error.requestId, r.headers.get('x-request-id'));
});
test('02. Registro, cookie segura para localhost y rotación de sesión', async t => {
  const f = await fixture(t); const c = f.client();
  await c.request('/session'); const before = c.cookie;
  const r = await c.register();
  assert.equal(r.status, 201); assert.notEqual(c.cookie, before);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/);
  assert.match(r.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal(r.json.data.user.username, 'estudiante');
  assert.equal((await c.request('/session')).json.data.user.username, 'estudiante');
});
test('03. Contraseñas con sal y hash, nunca texto plano', async t => {
  const f = await fixture(t); await f.client().register();
  const row = f.db.prepare('SELECT password_hash FROM users').get();
  assert.match(row.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.ok(!row.password_hash.includes('PruebaSegura123!'));
});
test('04. Registro valida nombre, contraseña, campos extra y duplicados', async t => {
  const f = await fixture(t); const c = f.client(); await c.register();
  for (const body of [{ username: '../user', password: 'PruebaSegura123!' },
    { username: 'otro', password: 'corta' }, { username: 'otro', password: 'PruebaSegura123!', role: 'admin' }]) {
    const r = await c.request('/auth/register', { method: 'POST', body });
    assert.equal(r.status, 422); assert.ok(r.json.error.details.length);
  }
  assert.equal((await c.request('/auth/register', { method: 'POST', body: { username: 'ESTUDIANTE', password: 'PruebaSegura123!' } })).status, 409);
});
test('05. Login válido e inválido y logout invalidan la cookie anterior', async t => {
  const f = await fixture(t); const c = f.client(); await c.register(); const oldCookie = c.cookie;
  assert.equal((await c.request('/auth/logout', { method: 'POST', body: {} })).status, 204);
  const r = await fetch(`${f.base}/tasks`, { headers: { Cookie: oldCookie } }); assert.equal(r.status, 401);
  await c.request('/session');
  for (const username of ['estudiante', 'noexiste']) {
    assert.equal((await c.request('/auth/login', { method: 'POST', body: { username, password: 'Incorrecta123!' } })).status, 401);
  }
  assert.equal((await c.request('/auth/login', { method: 'POST', body: { username: 'estudiante', password: 'PruebaSegura123!' } })).status, 200);
});
test('06. CSRF es obligatorio, válido y se rota al autenticar', async t => {
  const f = await fixture(t); const c = f.client(); await c.request('/session'); const old = c.token;
  await c.register(); assert.notEqual(c.token, old);
  for (const token of ['', old, 'invalido']) {
    const r = await c.request('/tasks', { method: 'POST', body: { title: 'Nueva tarea' }, headers: { 'X-CSRF-Token': token } });
    assert.equal(r.status, 403); assert.equal(errorCode(r), 'CSRF_INVALID');
  }
  assert.equal((await c.create()).status, 201);
});
test('07. CRUD completo: POST, GET, PUT, PATCH y DELETE', async t => {
  const f = await fixture(t); const c = f.client(); await c.register();
  const created = await c.create(); const id = created.json.data.id;
  assert.equal(created.status, 201); assert.equal(created.headers.get('location'), `/api/tasks/${id}`);
  assert.equal(created.headers.get('etag'), '"1"');
  const get = await c.request(`/tasks/${id}`); assert.deepEqual(get.json.data, created.json.data);
  const replaced = await c.request(`/tasks/${id}`, { method: 'PUT', headers: etag(1), body: { title: 'Presentar proyecto', description: 'Defensa', status: 'en_progreso', priority: 'alta' } });
  assert.equal(replaced.status, 200); assert.equal(replaced.json.data.version, 2);
  const updated = await c.request(`/tasks/${id}`, { method: 'PATCH', headers: etag(2), body: { status: 'completada' } });
  assert.equal(updated.status, 200); assert.equal(updated.json.data.title, 'Presentar proyecto');
  assert.equal(updated.headers.get('etag'), '"3"');
  const removed = await c.request(`/tasks/${id}`, { method: 'DELETE', headers: etag(3) });
  assert.equal(removed.status, 204); assert.equal(removed.text, '');
  assert.equal((await c.request(`/tasks/${id}`)).status, 404);
});
test('08. Validación completa en creación, reemplazo y cambios parciales', async t => {
  const f = await fixture(t); const c = f.client(); await c.register();
  for (const body of [{}, { title: '  ' }, { title: 'x'.repeat(121) }, { title: 42 },
    { title: 'Válida', status: 'otro' }, { title: 'Válida', priority: 'urgente' },
    { title: 'Válida', description: 'x'.repeat(2001) }, { title: 'Válida', owner_id: 2 }, null, []])
    assert.equal((await c.request('/tasks', { method: 'POST', body })).status, 422);
  const id = (await c.create()).json.data.id;
  for (const [method, body] of [['PUT', { title: 'Incompleta' }], ['PATCH', {}], ['PATCH', { version: 99 }], ['PATCH', { status: null }]])
    assert.equal((await c.request(`/tasks/${id}`, { method, headers: etag(1), body })).status, 422);
});
test('09. Títulos duplicados normalizados generan 409 sin modificar datos', async t => {
  const f = await fixture(t); const c = f.client(); await c.register();
  await c.create('  Informe Final  ');
  assert.equal((await c.create('informe final')).status, 409);
  const second = (await c.create('Otra tarea')).json.data;
  const r = await c.request(`/tasks/${second.id}`, { method: 'PATCH', headers: etag(1), body: { title: 'INFORME FINAL' } });
  assert.equal(r.status, 409); assert.equal(errorCode(r), 'DUPLICATE_TITLE');
  assert.equal((await c.request(`/tasks/${second.id}`)).json.data.version, 1);
});
test('10. Ediciones simultáneas: 428 sin versión y 412 con versión obsoleta', async t => {
  const f = await fixture(t); const c = f.client(); await c.register(); const id = (await c.create()).json.data.id;
  assert.equal((await c.request(`/tasks/${id}`, { method: 'PATCH', body: { status: 'completada' } })).status, 428);
  assert.equal((await c.request(`/tasks/${id}`, { method: 'PATCH', headers: { 'If-Match': '1' }, body: { status: 'completada' } })).status, 400);
  const results = await Promise.all(['en_progreso', 'completada'].map(status => c.request(`/tasks/${id}`, { method: 'PATCH', headers: etag(1), body: { status } })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 412]);
  assert.equal((await c.request(`/tasks/${id}`, { method: 'DELETE', headers: etag(1) })).status, 412);
});
test('11. Aislamiento entre usuarios en listado, lectura, edición, eliminación y exportación', async t => {
  const f = await fixture(t); const a = f.client(), b = f.client(); await a.register('alumno_a'); await b.register('alumno_b');
  const id = (await a.create()).json.data.id;
  assert.equal((await b.request('/tasks')).json.meta.total, 0);
  assert.equal((await b.request(`/tasks/${id}`)).status, 404);
  assert.equal((await b.request(`/tasks/${id}`, { method: 'PATCH', headers: etag(1), body: { status: 'completada' } })).status, 404);
  assert.equal((await b.request(`/tasks/${id}`, { method: 'DELETE', headers: etag(1) })).status, 404);
  assert.deepEqual((await b.request('/tasks/export')).json.data, []);
  assert.equal((await b.create()).status, 201); // mismo título permitido a otro propietario
});
test('12. Filtros, búsqueda literal y paginación coherente', async t => {
  const f = await fixture(t); const c = f.client(); await c.register();
  await c.create('Informe API', { priority: 'alta', status: 'en_progreso' });
  await c.create('Pruebas API', { priority: 'alta', status: 'completada' });
  await c.create('Lectura semanal');
  const r = await c.request('/tasks?priority=alta&q=API&limit=1&offset=1');
  assert.equal(r.json.data.length, 1); assert.equal(r.json.meta.total, 2);
  assert.equal(r.json.data[0].title, 'Informe API');
  assert.equal((await c.request('/tasks?status=completada')).json.meta.total, 1);
  for (const query of ['limit=0', 'limit=100', 'offset=-1', 'status=otro', 'sort=title', 'limit=1&limit=2'])
    assert.equal((await c.request(`/tasks?${query}`)).status, 422);
});
test('13. Consultas parametrizadas resisten cadenas SQL y preservan datos', async t => {
  const f = await fixture(t); const c = f.client(); await c.register();
  const malicious = "'); DROP TABLE tasks; --";
  const r = await c.create(malicious); assert.equal(r.status, 201);
  assert.equal(r.json.data.title, malicious);
  assert.equal((await c.request('/tasks?q=' + encodeURIComponent("' OR 1=1 --"))).json.meta.total, 0);
  assert.equal((await c.request('/tasks')).json.meta.total, 1);
});
test('14. Errores de JSON, tipo de contenido y tamaño conservan el contrato', async t => {
  const f = await fixture(t); const c = f.client(); await c.register();
  for (const [options, expected, code] of [
    [{ raw: '{"title":' }, 400, 'INVALID_JSON'],
    [{ raw: 'texto', headers: { 'Content-Type': 'text/plain' } }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [{ body: { title: 'x'.repeat(17000) } }, 413, 'PAYLOAD_TOO_LARGE']]) {
    const r = await c.request('/tasks', { method: 'POST', ...options }); assert.equal(r.status, expected); assert.equal(errorCode(r), code);
  }
});
test('15. Identificadores inválidos, inexistentes, rutas y métodos', async t => {
  const f = await fixture(t); const c = f.client(); await c.register();
  for (const id of ['0', '-1', 'abc', '1.5', '9007199254740992']) assert.equal((await c.request(`/tasks/${id}`)).status, 400);
  assert.equal((await c.request('/tasks/999')).status, 404);
  assert.equal((await c.request('/inexistente')).status, 404);
  const r = await c.request('/tasks', { method: 'PUT', body: {} });
  assert.equal(r.status, 405); assert.match(r.headers.get('allow'), /POST/);
});
test('16. Exportación es un archivo JSON autorizado y consistente', async t => {
  const f = await fixture(t); const c = f.client(); await c.register(); await c.create();
  const r = await c.request('/tasks/export'); assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="?tareas\.json"?/);
  assert.equal(r.json.data.length, 1); assert.ok(!('owner_id' in r.json.data[0]));
  assert.equal((await f.client().request('/tasks/export')).status, 401);
});
test('17. SSE emite creación, actualización y eliminación después de persistir', async t => {
  const f = await fixture(t); const c = f.client(); await c.register(); const s = await c.stream(); t.after(s.close);
  assert.match(s.response.headers.get('content-type'), /text\/event-stream/);
  assert.match(await s.next(), /event: connected/);
  const task = (await c.create()).json.data;
  const created = await s.next(); assert.match(created, /event: task.changed/); assert.match(created, /"type":"created"/);
  assert.equal((await c.request(`/tasks/${task.id}`)).status, 200);
  await c.request(`/tasks/${task.id}`, { method: 'PATCH', headers: etag(1), body: { status: 'completada' } });
  assert.match(await s.next(), /"type":"updated"/);
  await c.request(`/tasks/${task.id}`, { method: 'DELETE', headers: etag(2) });
  assert.match(await s.next(), /"type":"deleted"/);
});
test('18. SSE aísla eventos por usuario y no emite mutaciones rechazadas', async t => {
  const f = await fixture(t); const a = f.client(), b = f.client(); await a.register('usuario_a'); await b.register('usuario_b');
  const s = await b.stream(); t.after(s.close); await s.next();
  await a.create('Privada de usuario A');
  await b.create('x'); // inválida: no debe publicar evento
  await b.create('Visible de usuario B');
  const message = await s.next(); assert.match(message, /Visible de usuario B/); assert.ok(!message.includes('Privada de usuario A'));
});
test('19. Logout cierra SSE y el endpoint exige autenticación', async t => {
  const f = await fixture(t); const c = f.client(); await c.register(); const s = await c.stream(); t.after(s.close); await s.next();
  await c.request('/auth/logout', { method: 'POST', body: {} }); assert.equal(await s.next(), null);
  assert.equal((await c.request('/events')).status, 401);
});
test('20. Tareas y sesiones sobreviven al reinicio con secreto estable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tareas-u2-')); const dbPath = join(dir, 'test.sqlite');
  let f;
  try {
    f = await fixture(null, { dbPath }); const c = f.client(); await c.register(); const created = await c.create(); const cookie = c.cookie;
    await f.cleanup(); f = null;
    f = await fixture(null, { dbPath });
    const response = await fetch(`${f.base}/tasks/${created.json.data.id}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200); assert.equal((await response.json()).data.title, 'Preparar entrega');
  } finally { if (f) await f.cleanup(); rmSync(dir, { recursive: true, force: true }); }
});
test('21. Una sesión vencida deja de autorizar acceso', async t => {
  const f = await fixture(t); const c = f.client(); await c.register();
  f.db.prepare('UPDATE sessions SET expires_at=0').run();
  assert.equal((await c.request('/tasks')).status, 401);
});
test('22. Limitación de intentos devuelve 429 y error uniforme', async t => {
  const f = await fixture(t, { authLimit: 1 }); const c = f.client(); await c.register();
  const r = await c.request('/auth/login', { method: 'POST', body: { username: 'estudiante', password: 'PruebaSegura123!' } });
  assert.equal(r.status, 429); assert.equal(errorCode(r), 'RATE_LIMITED'); assert.ok(r.headers.get('retry-after'));
});
test('23. Encabezados de seguridad, caché y vista web disponible', async t => {
  const f = await fixture(t); const r = await fetch(f.base.replace('/api', '/'));
  assert.equal(r.status, 200); assert.match(await r.text(), /Rumbo/);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal((await f.client().request('/session')).headers.get('cache-control'), 'no-store');
});
test('24. Producción rechaza secretos ausentes o débiles', () => {
  assert.throws(() => createApp({ production: true, secret: 'corto' }), /SESSION_SECRET/);
});
