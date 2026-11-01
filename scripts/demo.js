import { createApp } from '../src/app.js';
import { authService } from '../src/services/auth-service.js';
import { taskRepository } from '../src/infrastructure/task-repository.js';

// Entorno local de demostración: no se utiliza como configuración de producción.
const application = createApp({ dbPath: './data/demo.sqlite', production: false, trustProxy: false });
const username = 'demo';
let user = application.db.prepare('SELECT id, username FROM users WHERE username=?').get(username);
if (!user) user = authService(application.db).register({ username, password: 'RumboDemo2026!' });
const repository = taskRepository(application.db);
if (!repository.list(user.id).meta.total) {
  for (const task of [
    { title: 'Preparar la defensa del proyecto', description: 'Repasar las rutas HTTP, la validación y la separación de capas.', status: 'pendiente', priority: 'alta' },
    { title: 'Revisar los últimos detalles', description: 'Verificar el informe y los enlaces de la entrega.', status: 'pendiente', priority: 'media' },
    { title: 'Documentar la API REST', description: 'Añadir ejemplos de peticiones, respuestas y manejo de conflictos.', status: 'en_progreso', priority: 'media' },
    { title: 'Probar la persistencia en SQLite', description: 'Los datos y las sesiones se recuperan después de reiniciar.', status: 'completada', priority: 'baja' }
  ]) repository.create(user.id, task);
}
const server = application.app.listen(3000, '127.0.0.1', () => {
  console.log('Demo local: http://127.0.0.1:3000');
  console.log('Usuario: demo | Contraseña de demostración: RumboDemo2026!');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  application.close(); server.close(() => process.exit(0));
});
