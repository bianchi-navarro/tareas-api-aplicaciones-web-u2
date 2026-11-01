import session from 'express-session';

export class SQLiteSessionStore extends session.Store {
  constructor(db) { super(); this.db = db; }
  get(sid, done) {
    try {
      const row = this.db.prepare('SELECT data FROM sessions WHERE sid = ? AND expires_at > ?').get(sid, Date.now());
      done(null, row ? JSON.parse(row.data) : null);
    } catch (error) { done(error); }
  }
  set(sid, value, done = () => {}) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
      this.db.prepare('INSERT INTO sessions VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data, expires_at=excluded.expires_at')
        .run(sid, JSON.stringify(value), new Date(value.cookie.expires).getTime());
      done(null);
    } catch (error) { done(error); }
  }
  destroy(sid, done = () => {}) {
    try { this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); done(null); }
    catch (error) { done(error); }
  }
  touch(sid, value, done) { this.set(sid, value, done); }
}
