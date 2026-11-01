import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { AppError } from '../domain/errors.js';

function hash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function matches(password, stored) {
  const [salt, key] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash(password, salt).split(':')[1], 'hex'), Buffer.from(key, 'hex'));
}
export function authService(db) {
  const dummy = hash('dummy-password-never-used');
  return {
    register({ username, password }) {
      try {
        const result = db.prepare('INSERT INTO users(username,password_hash,created_at) VALUES (?,?,?)')
          .run(username, hash(password), new Date().toISOString());
        return { id: Number(result.lastInsertRowid), username };
      } catch (error) {
        if (error.message.includes('UNIQUE constraint failed: users.username'))
          throw new AppError(409, 'USERNAME_TAKEN', 'Ese usuario ya existe.');
        throw error;
      }
    },
    login({ username, password }) {
      const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
      const valid = matches(password, user?.password_hash ?? dummy);
      if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos.');
      return { id: user.id, username: user.username };
    }
  };
}
