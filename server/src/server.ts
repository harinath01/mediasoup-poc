import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mediasoup from 'mediasoup';
import { setWorker } from './worker.js';
import studentRoutes from './routes/students.js';
import staffRoutes from './routes/staff.js';
import { getAllRooms } from './rooms.js';
import { Server as SocketIOServer } from 'socket.io';
import { registerChatHandlers } from './chat.js';

const app = express();
const server = createServer(app);
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistDir = path.resolve(__dirname, '../../client/dist');
const io = new SocketIOServer(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

app.use(express.json());

app.use(studentRoutes);
app.use(staffRoutes);

app.use(express.static(clientDistDir));

app.get('/api/rooms', (_req, res) => {
  const rooms = getAllRooms();
  const summary = Array.from(rooms.values()).map(r => ({
    id: r.id,
    students: r.students.length,
    staff: r.staff.length,
  }));
  res.json(summary);
});

app.get(/^(?!\/api\/|\/socket\.io).*/, (_req, res) => {
  res.sendFile(path.join(clientDistDir, 'index.html'));
});

async function main() {
  const worker = await mediasoup.createWorker();
  setWorker(worker);
  registerChatHandlers(io);
  console.log(`mediasoup worker started, pid=${worker.pid}`);

  server.listen(PORT, HOST, () => {
    console.log(`server listening on http://${HOST}:${PORT}`);
  });
}

main().catch(err => {
  console.error('failed to start server', err);
  process.exit(1);
});
