import { Router, Request, Response } from 'express';
import { getOrCreateRoom } from '../rooms.js';

const router = Router();

router.post('/api/staff/join', (req: Request, res: Response) => {
  const { name, roomId } = req.body;
  if (!name || !roomId) {
    res.status(400).json({ error: 'name and roomId are required' });
    return;
  }

  const room = getOrCreateRoom(roomId);
  if (!room.staff.includes(name)) {
    room.staff.push(name);
  }

  console.log(`[staff join] room=${roomId}, name=${name}`);
  res.json({ ok: true, role: 'staff', name, roomId });
});

export default router;
