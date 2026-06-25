import { Router, Request, Response } from 'express';
import { cleanupTransport, getOrCreateRoom, registerProducer, registerTransport, transports } from '../rooms.js';
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
  registerTransport(transport, {
    roomId,
    participantName: name,
    role: 'student',
  });

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

  const transportEntry = transports.get(transportId);
  if (!transportEntry) {
    res.status(404).json({ error: 'transport not found' });
    return;
  }

  await transportEntry.transport.connect({ dtlsParameters });
  console.log(`[connect-transport] transport=${transportId}`);
  res.json({ ok: true });
});

router.post('/api/students/produce', async (req: Request, res: Response) => {
  const { transportId, kind, rtpParameters, name, roomId, sourceType, displayLabel } = req.body;
  if (!transportId || !kind || !rtpParameters) {
    res.status(400).json({ error: 'transportId, kind, and rtpParameters are required' });
    return;
  }

  if (sourceType && sourceType !== 'camera' && sourceType !== 'screen') {
    res.status(400).json({ error: 'sourceType must be camera or screen' });
    return;
  }

  const transportEntry = transports.get(transportId);
  if (!transportEntry) {
    res.status(404).json({ error: 'transport not found' });
    return;
  }

  const producer = await transportEntry.transport.produce({ kind, rtpParameters });
  registerProducer(producer, {
    transportId,
    roomId: roomId || '',
    studentName: name || 'unknown',
    sourceType: sourceType || 'camera',
    displayLabel: displayLabel || undefined,
  });

  console.log(`[produce] transport=${transportId}, kind=${kind}, source=${sourceType || 'camera'}, producer=${producer.id}`);
  res.json({ id: producer.id });
});

router.post('/api/students/leave', (req: Request, res: Response) => {
  const { transportId } = req.body;
  if (!transportId) {
    res.status(400).json({ error: 'transportId is required' });
    return;
  }

  cleanupTransport(transportId);
  res.json({ ok: true });
});

export default router;
