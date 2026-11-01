import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './infrastructure/database.js';
import { SQLiteSessionStore } from './infrastructure/session-store.js';
import { taskRepository } from './infrastructure/task-repository.js';
import { eventHub } from './infrastructure/events.js';
import { authService } from './services/auth-service.js';
import { taskService } from './services/task-service.js';
import { apiRoutes } from './http/routes.js';
import { identify, errorHandler } from './http/middleware.js';
import { AppError } from './domain/errors.js';

export function createApp({ dbPath = process.env.DB_PATH ?? './data/tareas.sqlite',
  secret = process.env.SESSION_SECRET, production = process.env.NODE_ENV === 'production',
  trustProxy = process.env.TRUST_PROXY === '1', authLimit } = {}) {
  if (production && (!secret || secret.length < 32)) throw new Error('Producción requiere SESSION_SECRET de al menos 32 caracteres.');
  const db = openDatabase(dbPath);
  const store = new SQLiteSessionStore(db);
  const events = eventHub(store);
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  if (trustProxy) app.set('trust proxy', 1);
  app.use(identify, helmet({ strictTransportSecurity: production ? undefined : false,
    contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': production ? [] : null } } }));
  app.use(express.json({ limit: '16kb', strict: false }));
  app.use('/api', session({ name: 'tareas.sid', secret: secret ?? randomBytes(48).toString('hex'), store,
    resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'strict', secure: production, maxAge: 3600000 } }));
  app.use('/api', apiRoutes({ auth: authService(db), tasks: taskService(taskRepository(db), events), events, authLimit }));
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
  app.use((req, res, next) => next(new AppError(404, 'ROUTE_NOT_FOUND', 'Ruta no encontrada.')));
  app.use(errorHandler);
  return { app, db, close: () => { events.close(); db.close(); } };
}
