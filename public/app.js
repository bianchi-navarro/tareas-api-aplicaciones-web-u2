const $ = selector => document.querySelector(selector);
let csrfToken, user, tasks = [], stream, editing, deleting, registerMode = false, toastTimer;
const states = { pendiente: 'Pendiente', en_progreso: 'En progreso', completada: 'Completada' };
function toast(message, error = false) {
  $('#toast').textContent = message;
  $('#toast').className = error ? 'error' : '';
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}
async function api(path, { method = 'GET', body, version } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  if (version) headers['If-Match'] = `"${version}"`;
  const response = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && user) {
      stream?.close(); user = null; showWorkspace();
      await initSession();
    }
    throw new Error(result.error?.message ?? 'No fue posible completar la solicitud.');
  }
  return result;
}
function showWorkspace() {
  $('#workspace').hidden = !user;
  $('#auth-view').hidden = Boolean(user);
  if (user) $('#greeting').textContent = `HOLA, ${user.username.toUpperCase()} · ESTE ES TU ESPACIO`;
}
async function initSession() {
  const { data } = await api('/session');
  ({ csrfToken, user } = data);
  showWorkspace();
  if (user) { await loadTasks(); connect(); }
}
function connect() {
  stream?.close();
  stream = new EventSource('/api/events');
  stream.addEventListener('connected', () => {
    $('#connection').textContent = 'En tiempo real'; $('#connection').className = 'connection live';
    loadTasks().catch(error => toast(error.message, true));
  });
  stream.addEventListener('task.changed', () => {
    $('#sync-message').textContent = `Último cambio sincronizado a las ${new Date().toLocaleTimeString('es-EC')}`;
    loadTasks().catch(error => toast(error.message, true));
  });
  stream.onerror = () => {
    $('#connection').textContent = 'Reconectando…'; $('#connection').className = 'connection';
    // Una sesión expirada deja de intentar SSE y regresa al acceso.
    api('/tasks?limit=1').catch(error => toast(error.message, true));
  };
}
async function loadTasks() {
  // Páginas de hasta 99 registros; nunca se ocultan tareas por el límite de la API.
  let offset = 0, collected = [], result;
  do {
    result = await api(`/tasks?limit=99&offset=${offset}`);
    collected = [...collected, ...result.data]; offset += result.data.length;
  } while (result.data.length && offset < result.meta.total);
  tasks = collected;
  render();
}
function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function render() {
  const search = $('#search').value.trim().toLocaleLowerCase();
  const visible = tasks.filter(t => t.title.toLocaleLowerCase().includes(search));
  $('#total').textContent = tasks.length;
  $('#progress-count').textContent = tasks.filter(t => t.status === 'en_progreso').length;
  $('#done-count').textContent = tasks.filter(t => t.status === 'completada').length;
  $('#visible-count').textContent = `${visible.length} tareas`;
  for (const state of Object.keys(states)) {
    const list = visible.filter(t => t.status === state);
    $(`#count-${state}`).textContent = list.length;
    const container = $(`#${state}`); container.replaceChildren();
    if (!list.length) container.append(el('div', search ? 'Sin coincidencias.' : 'Todo listo para tu siguiente paso.', 'empty'));
    for (const task of list) {
      const card = el('article', undefined, 'task-card');
      const badge = el('span', `Prioridad ${task.priority}`, `priority ${task.priority}`);
      const heading = el('h4', task.title);
      const description = el('p', task.description || 'Sin descripción.');
      const bottom = el('div', undefined, 'task-bottom');
      bottom.append(el('small', `#${task.id} · v${task.version}`));
      const actions = el('div', undefined, 'card-actions');
      const edit = el('button', 'Editar'); edit.setAttribute('aria-label', `Editar ${task.title}`);
      edit.onclick = () => openEditor(task);
      const remove = el('button', 'Eliminar', 'delete'); remove.setAttribute('aria-label', `Eliminar ${task.title}`);
      remove.onclick = () => { deleting = task; $('#delete-dialog').showModal(); };
      actions.append(edit, remove); bottom.append(actions); card.append(badge, heading, description, bottom); container.append(card);
    }
  }
}
function openEditor(task) {
  editing = task ?? null;
  const form = $('#task-form'); form.reset();
  if (task) for (const field of ['title', 'description', 'status', 'priority']) form.elements[field].value = task[field];
  $('#dialog-title').textContent = task ? 'Editar tarea' : 'Nueva tarea';
  $('#task-dialog').showModal();
}
$('#auth-toggle').onclick = () => {
  registerMode = !registerMode;
  $('#auth-title').textContent = registerMode ? 'Empieza algo bueno' : 'Bienvenido de nuevo';
  $('#auth-description').textContent = registerMode ? 'Crea tu cuenta y da el primer paso.' : 'Ingresa para continuar con tus tareas.';
  $('#auth-submit').textContent = registerMode ? 'Crear mi cuenta ↗' : 'Entrar a mi espacio ↗';
  $('#auth-toggle').textContent = registerMode ? 'Ya tengo una cuenta. Iniciar sesión' : '¿Primera vez? Crear una cuenta';
  $('#auth-form').elements.password.autocomplete = registerMode ? 'new-password' : 'current-password';
};
$('#auth-form').onsubmit = async event => {
  event.preventDefault(); $('#auth-submit').disabled = true;
  try {
    const { data } = await api(`/auth/${registerMode ? 'register' : 'login'}`, { method: 'POST', body: Object.fromEntries(new FormData(event.target)) });
    ({ csrfToken, user } = data); event.target.reset(); showWorkspace(); await loadTasks(); connect();
  } catch (error) { toast(error.message, true); }
  finally { $('#auth-submit').disabled = false; }
};
$('#logout').onclick = async () => {
  try { await api('/auth/logout', { method: 'POST', body: {} }); stream?.close(); user = null; tasks = []; await initSession(); }
  catch (error) { toast(error.message, true); }
};
$('#new-task').onclick = () => openEditor();
$('#close-dialog').onclick = $('#cancel-task').onclick = () => $('#task-dialog').close();
$('#cancel-delete').onclick = () => $('#delete-dialog').close();
$('#search').oninput = render;
$('#task-form').onsubmit = async event => {
  event.preventDefault();
  const submit = event.submitter; submit.disabled = true;
  try {
    await api(editing ? `/tasks/${editing.id}` : '/tasks', { method: editing ? 'PUT' : 'POST',
      body: Object.fromEntries(new FormData(event.target)), version: editing?.version });
    $('#task-dialog').close(); await loadTasks(); toast(editing ? 'Cambios guardados.' : 'Tu siguiente paso ya está en el tablero.');
  } catch (error) { toast(error.message, true); await loadTasks().catch(() => {}); }
  finally { submit.disabled = false; }
};
$('#confirm-delete').onclick = async () => {
  try {
    await api(`/tasks/${deleting.id}`, { method: 'DELETE', version: deleting.version });
    $('#delete-dialog').close(); await loadTasks(); toast('Tarea eliminada.');
  } catch (error) { toast(error.message, true); $('#delete-dialog').close(); await loadTasks().catch(() => {}); }
};
initSession().catch(error => toast(error.message, true));
