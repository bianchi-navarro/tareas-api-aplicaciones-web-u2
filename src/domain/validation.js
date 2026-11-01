import { z } from 'zod';
import { AppError } from './errors.js';

const title = z.string().trim().min(3).max(120);
const description = z.string().trim().max(2000);
const status = z.enum(['pendiente', 'en_progreso', 'completada']);
const priority = z.enum(['baja', 'media', 'alta']);
export const taskCreate = z.object({ title, description: description.default(''),
  status: status.default('pendiente'), priority: priority.default('media') }).strict();
export const taskReplace = z.object({ title, description, status, priority }).strict();
export const taskPatch = taskReplace.partial().refine(v => Object.keys(v).length > 0, 'Incluya al menos un campo.');
export const credentials = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/),
  password: z.string().min(10).max(128)
}).strict();
export const taskQuery = z.object({
  status: status.optional(), priority: priority.optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.string().regex(/^[1-9]\d?$/).transform(Number).default(50),
  offset: z.string().regex(/^\d{1,6}$/).transform(Number).default(0)
}).strict();

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError(422, 'VALIDATION_ERROR', 'Los datos no son válidos.',
    result.error.issues.map(i => ({ field: i.path.join('.') || 'body', message: i.message })));
  return result.data;
}
export function parseId(value) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new AppError(400, 'INVALID_ID', 'El identificador debe ser un entero positivo.');
  return Number(value);
}
export function parseVersion(value) {
  if (!value) throw new AppError(428, 'PRECONDITION_REQUIRED', 'Envíe If-Match con la versión, por ejemplo "1".');
  if (!/^"[1-9]\d*"$/.test(value) || !Number.isSafeInteger(Number(value.slice(1, -1))))
    throw new AppError(400, 'INVALID_VERSION', 'If-Match debe contener una versión entre comillas.');
  return Number(value.slice(1, -1));
}
export const normalizeTitle = title => title.normalize('NFKC').toLowerCase();
export const publicTask = row => ({ id: row.id, title: row.title, description: row.description,
  status: row.status, priority: row.priority, version: row.version,
  createdAt: row.created_at, updatedAt: row.updated_at });
