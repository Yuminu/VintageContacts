import { initDb } from './db.js';
import { createApp } from './app.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const dbPath = process.env.DB_PATH || 'data/contacts.sqlite';

const db = initDb();
const app = createApp({ db });
const server = app.listen(port, host, () => {
  console.log(`VintageContacts: http://${host}:${port}/`);
  console.log(`SQLite: ${dbPath}`);
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用，请关闭已有服务或通过 PORT 设置其他端口。`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`收到 ${signal}，正在关闭服务...`);
  server.closeAllConnections?.();
  server.close(() => {
    try {
      db.close();
    } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
