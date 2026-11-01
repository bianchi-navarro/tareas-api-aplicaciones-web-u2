import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
      title_key TEXT NOT NULL, description TEXT NOT NULL CHECK(length(description) <= 2000),
      status TEXT NOT NULL CHECK(status IN ('pendiente','en_progreso','completada')),
      priority TEXT NOT NULL CHECK(priority IN ('baja','media','alta')),
      version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(owner_id, title_key)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS tasks_owner_status ON tasks(owner_id, status);
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
  return db;
}
