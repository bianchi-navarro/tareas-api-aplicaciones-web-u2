import { AppError } from '../domain/errors.js';
import { normalizeTitle, publicTask } from '../domain/validation.js';

export function taskRepository(db) {
  function get(owner, id) {
    const row = db.prepare('SELECT * FROM tasks WHERE owner_id = ? AND id = ?').get(owner, id);
    if (!row) throw new AppError(404, 'TASK_NOT_FOUND', 'La tarea no existe.');
    return publicTask(row);
  }
  function write(operation) {
    try { return operation(); }
    catch (error) {
      if (error.code === 'ERR_SQLITE_ERROR' && error.message.includes('UNIQUE constraint failed: tasks.'))
        throw new AppError(409, 'DUPLICATE_TITLE', 'Ya tiene una tarea con ese título.');
      throw error;
    }
  }
  return {
    get,
    list(owner, { status, priority, q, limit = 50, offset = 0 } = {}) {
      // SQL fijo: ningún dato del cliente se concatena en la consulta.
      const params = [owner, status ?? null, status ?? null, priority ?? null, priority ?? null, q ?? null, q ?? null];
      const where = 'WHERE owner_id = ? AND (? IS NULL OR status = ?) AND (? IS NULL OR priority = ?) AND (? IS NULL OR instr(lower(title), lower(?)) > 0)';
      const total = db.prepare(`SELECT count(*) AS total FROM tasks ${where}`).get(...params).total;
      const rows = db.prepare(`SELECT * FROM tasks ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
      return { data: rows.map(publicTask), meta: { total, limit, offset } };
    },
    all(owner) { return db.prepare('SELECT * FROM tasks WHERE owner_id = ? ORDER BY id').all(owner).map(publicTask); },
    create(owner, input) {
      const now = new Date().toISOString();
      return write(() => {
        const result = db.prepare('INSERT INTO tasks(owner_id,title,title_key,description,status,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(owner, input.title, normalizeTitle(input.title), input.description, input.status, input.priority, now, now);
        return get(owner, Number(result.lastInsertRowid));
      });
    },
    update(owner, id, version, input) {
      const current = get(owner, id);
      const next = { ...current, ...input };
      return write(() => {
        const result = db.prepare('UPDATE tasks SET title=?,title_key=?,description=?,status=?,priority=?,version=version+1,updated_at=? WHERE owner_id=? AND id=? AND version=?')
          .run(next.title, normalizeTitle(next.title), next.description, next.status, next.priority, new Date().toISOString(), owner, id, version);
        if (!result.changes) throw new AppError(412, 'VERSION_CONFLICT', 'La tarea cambió. Recárguela antes de editar.');
        return get(owner, id);
      });
    },
    remove(owner, id, version) {
      get(owner, id);
      const result = db.prepare('DELETE FROM tasks WHERE owner_id=? AND id=? AND version=?').run(owner, id, version);
      if (!result.changes) throw new AppError(412, 'VERSION_CONFLICT', 'La tarea cambió. Recárguela antes de eliminar.');
    }
  };
}
