import { Router, Request, Response } from 'express';
import { getOrCreateRoom, transports, producers } from '../rooms.js';
import { getOrCreateRoomRouter, createWebRtcTransport } from '../utils.js';

const router = Router();

router.post('/api/students/join', async (req: Request, res: Response) => {
  const { name, roomId } = req.body;
  if (!name || !roomId) {
    res.status(400).json({ error: 'name and roomId are required' });
    return;
  }

  const room = getOrCreateRoom(roomId);
  if (!room.students.includes(name)) {
    room.students.push(name);
  }

  const roomRouter = await getOrCreateRoomRouter(roomId);
  const transport = await createWebRtcTransport(roomRouter);
  transports.set(transport.id, transport);

  console.log(`[student join] room=${roomId}, name=${name}, transport=${transport.id}`);

  res.json({
    ok: true,
    name,
    roomId,
    routerRtpCapabilities: roomRouter.rtpCapabilities,
    transport: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    },
  });
});

router.post('/api/students/connect-transport', async (req: Request, res: Response) => {
  const { transportId, dtlsParameters } = req.body;
  if (!transportId || !dtlsParameters) {
    res.status(400).json({ error: 'transportId and dtlsParameters are required' });
    return;
  }

  const transport = transports.get(transportId);
  if (!transport) {
    res.status(404).json({ error: 'transport not found' });
    return;
  }

  await transport.connect({ dtlsParameters });
  console.log(`[connect-transport] transport=${transportId}`);
  res.json({ ok: true });
});

router.post('/api/students/produce', async (req: Request, res: Response) => {
  const { transportId, kind, rtpParameters, name, roomId } = req.body;
  if (!transportId || !kind || !rtpParameters) {
    res.status(400).json({ error: 'transportId, kind, and rtpParameters are required' });
    return;
  }

  const transport = transports.get(transportId);
  if (!transport) {
    res.status(404).json({ error: 'transport not found' });
    return;
  }

  const producer = await transport.produce({ kind, rtpParameters });
  producers.set(producer.id, {
    transport: producer,
    roomId: roomId || '',
    studentName: name || 'unknown',
  });

  console.log(`[produce] transport=${transportId}, kind=${kind}, producer=${producer.id}`);
  res.json({ id: producer.id });
});

export default router;
