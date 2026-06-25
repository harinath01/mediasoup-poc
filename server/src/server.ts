import express from 'express';
import { createServer } from 'node:http';
import * as mediasoup from 'mediasoup';
import { setWorker } from './worker.js';
import studentRoutes from './routes/students.js';
import staffRoutes from './routes/staff.js';
import { getAllRooms } from './rooms.js';
import { Server as SocketIOServer } from 'socket.io';
import { registerChatHandlers } from './chat.js';

const app = express();
const server = createServer(app);
const PORT = 3001;
const io = new SocketIOServer(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

app.use(express.json());

app.use(studentRoutes);
app.use(staffRoutes);

app.get('/api/rooms', (_req, res) => {
  const rooms = getAllRooms();
  const summary = Array.from(rooms.values()).map(r => ({
    id: r.id,
    students: r.students.length,
    staff: r.staff.length,
  }));
  res.json(summary);
});

async function main() {
  const worker = await mediasoup.createWorker();
  setWorker(worker);
  registerChatHandlers(io);
  console.log(`mediasoup worker started, pid=${worker.pid}`);

  server.listen(PORT, () => {
    console.log(`server listening on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('failed to start server', err);
  process.exit(1);
});
