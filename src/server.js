import { createApp } from './app.js';
const application = createApp();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const server = application.app.listen(port, host, () => console.log(`Tareas U2: http://${host}:${port}`));
function shutdown() {
  application.close();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
