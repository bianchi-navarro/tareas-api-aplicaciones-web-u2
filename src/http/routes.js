import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../domain/errors.js';
import { parse, parseId, parseVersion, credentials, taskCreate, taskReplace, taskPatch, taskQuery } from '../domain/validation.js';
import { csrf, requireJson, requireUser } from './middleware.js';

const save = req => new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
export function apiRoutes({ auth, tasks, events, authLimit = 30 }) {
  const router = Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/health', (req, res) => res.json({ data: { status: 'ok' } }));
  router.get('/session', async (req, res) => {
    req.session.csrfToken ??= randomBytes(32).toString('hex');
    await save(req);
    res.json({ data: { user: req.session.user ?? null, csrfToken: req.session.csrfToken } });
  });
  router.use(csrf, requireJson);
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: authLimit, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Demasiados intentos. Reintente en 15 minutos.')) });
  for (const action of ['register', 'login']) {
    router.post(`/auth/${action}`, limiter, async (req, res) => {
      const input = parse(credentials, req.body);
      const user = auth[action](input);
      events.closeSession(req.sessionID);
      await regenerate(req);
      req.session.user = user;
      req.session.csrfToken = randomBytes(32).toString('hex');
      await save(req);
      res.status(action === 'register' ? 201 : 200).json({ data: { user, csrfToken: req.session.csrfToken } });
    });
  }
  router.post('/auth/logout', requireUser, async (req, res) => {
    const sid = req.sessionID;
    await new Promise((resolve, reject) => req.session.destroy(err => err ? reject(err) : resolve()));
    events.closeSession(sid);
    res.clearCookie('tareas.sid', { path: '/' }).status(204).end();
  });
  router.use(requireUser);
  router.get('/events', (req, res) => events.connect(req, res));
  router.get('/tasks/export', (req, res) => {
    res.attachment('tareas.json').json({ data: tasks.all(req.session.user.id) });
  });
  router.get('/tasks', (req, res) => res.json(tasks.list(req.session.user.id, parse(taskQuery, req.query))));
  router.post('/tasks', (req, res) => {
    const task = tasks.create(req.session.user.id, parse(taskCreate, req.body));
    res.location(`/api/tasks/${task.id}`).set('ETag', `"${task.version}"`).status(201).json({ data: task });
  });
  router.get('/tasks/:id', (req, res) => {
    const task = tasks.get(req.session.user.id, parseId(req.params.id));
    res.set('ETag', `"${task.version}"`).json({ data: task });
  });
  for (const [method, schema] of [['put', taskReplace], ['patch', taskPatch]]) {
    router[method]('/tasks/:id', (req, res) => {
      const task = tasks.update(req.session.user.id, parseId(req.params.id), parseVersion(req.get('If-Match')), parse(schema, req.body));
      res.set('ETag', `"${task.version}"`).json({ data: task });
    });
  }
  router.delete('/tasks/:id', (req, res) => {
    tasks.remove(req.session.user.id, parseId(req.params.id), parseVersion(req.get('If-Match')));
    res.status(204).end();
  });
  router.all('/tasks', (req, res, next) => { res.set('Allow', 'GET, HEAD, POST'); next(new AppError(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.')); });
  router.all('/tasks/:id', (req, res, next) => { res.set('Allow', 'GET, HEAD, PUT, PATCH, DELETE'); next(new AppError(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.')); });
  return router;
}
