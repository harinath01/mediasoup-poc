import express from 'express';
import * as mediasoup from 'mediasoup';
import { setWorker } from './worker.js';
import studentRoutes from './routes/students.js';
import staffRoutes from './routes/staff.js';
import { getAllRooms } from './rooms.js';

const app = express();
const PORT = 3001;

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
  console.log(`mediasoup worker started, pid=${worker.pid}`);

  app.listen(PORT, () => {
    console.log(`server listening on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('failed to start server', err);
  process.exit(1);
});
