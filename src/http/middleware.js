import { randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError } from '../domain/errors.js';

export function identify(req, res, next) { req.requestId = randomUUID(); res.set('X-Request-Id', req.requestId); next(); }
export function requireUser(req, res, next) {
  if (!req.session.user) return next(new AppError(401, 'AUTH_REQUIRED', 'Inicie sesión para continuar.'));
  next();
}
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('X-CSRF-Token') ?? '';
  const expected = req.session.csrfToken ?? '';
  const a = Buffer.from(sent), b = Buffer.from(expected);
  if (!b.length || a.length !== b.length || !timingSafeEqual(a, b))
    return next(new AppError(403, 'CSRF_INVALID', 'Token CSRF inválido. Obtenga uno en GET /api/session.'));
  next();
}
export function requireJson(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json'))
    return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Utilice Content-Type: application/json.'));
  next();
}
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let known = error;
  if (error.type === 'entity.parse.failed') known = new AppError(400, 'INVALID_JSON', 'El cuerpo no contiene JSON válido.');
  if (error.type === 'entity.too.large') known = new AppError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera 16 KB.');
  if (!(known instanceof AppError)) {
    console.error(`[${req.requestId}]`, error);
    known = new AppError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.');
  }
  res.status(known.status).json({ error: { code: known.code, message: known.message,
    details: known.details, requestId: req.requestId } });
}
