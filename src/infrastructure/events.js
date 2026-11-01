export function eventHub(store) {
  const clients = new Set();
  function disconnect(client) { clearInterval(client.timer); clients.delete(client); client.res.end(); }
  return {
    connect(req, res) {
      res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      res.write('retry: 3000\nevent: connected\ndata: {"connected":true}\n\n');
      const client = { res, userId: req.session.user.id, sid: req.sessionID };
      client.timer = setInterval(() => {
        store.get(client.sid, (err, session) => {
          if (err || !session?.user) return disconnect(client);
          res.write(': heartbeat\n\n');
        });
      }, 15000);
      client.timer.unref();
      clients.add(client);
      req.on('close', () => { clearInterval(client.timer); clients.delete(client); });
    },
    publish(userId, type, task) {
      const data = JSON.stringify({ type, task, occurredAt: new Date().toISOString() });
      for (const c of clients) if (c.userId === userId) {
        // Comprobar sesión también al publicar, sin ventana de exposición tras logout.
        store.get(c.sid, (err, session) => {
          if (err || !session?.user) return disconnect(c);
          if (!c.res.write(`event: task.changed\ndata: ${data}\n\n`)) disconnect(c);
        });
      }
    },
    closeSession(sid) { for (const c of clients) if (c.sid === sid) disconnect(c); },
    close() { for (const c of clients) disconnect(c); }
  };
}
