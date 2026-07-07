import { Router, Request, Response } from 'express';
import {
  cleanupTransport,
  consumers,
  getOrCreateRoom,
  producers,
  registerConsumer,
  registerTransport,
  routers,
  transports,
} from '../rooms.js';
import { getOrCreateRoomRouter, createWebRtcTransport } from '../utils.js';

const router = Router();

router.post('/api/staff/join', async (req: Request, res: Response) => {
  const { name, roomId } = req.body;
  if (!name || !roomId) {
    res.status(400).json({ error: 'name and roomId are required' });
    return;
  }

  const room = getOrCreateRoom(roomId);
  if (!room.staff.includes(name)) {
    room.staff.push(name);
  }

  const roomRouter = routers.get(roomId);
  if (!roomRouter) {
    res.status(404).json({ error: 'room has no router — no student has joined yet' });
    return;
  }

  const transport = await createWebRtcTransport(roomRouter);
  registerTransport(transport, {
    roomId,
    participantName: name,
    role: 'staff',
  });

  console.log(`[staff join] room=${roomId}, name=${name}, transport=${transport.id}`);

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

router.post('/api/staff/connect-transport', async (req: Request, res: Response) => {
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
  console.log(`[staff connect-transport] transport=${transportId}`);
  res.json({ ok: true });
});

router.get('/api/staff/room/:roomId/producers', (req: Request, res: Response) => {
  const roomId = req.params.roomId as string;
  const roomRouter = routers.get(roomId);
  if (!roomRouter) {
    res.status(404).json({ error: 'room not found' });
    return;
  }

  const roomProducers = Array.from(producers.values())
    .filter(p => p.roomId === roomId)
    .map(p => ({
      id: p.producer.id,
      kind: p.producer.kind,
      studentName: p.studentName,
      sourceType: p.sourceType,
      displayLabel: p.displayLabel || null,
    }));

  res.json(roomProducers);
});

router.post('/api/staff/consume', async (req: Request, res: Response) => {
  const { transportId, producerId, rtpCapabilities } = req.body;
  if (!transportId || !producerId || !rtpCapabilities) {
    res.status(400).json({ error: 'transportId, producerId, and rtpCapabilities are required' });
    return;
  }

  const transportEntry = transports.get(transportId);
  if (!transportEntry) {
    res.status(404).json({ error: 'transport not found' });
    return;
  }

  const producerEntry = producers.get(producerId);
  if (!producerEntry) {
    res.status(404).json({ error: 'producer not found' });
    return;
  }

  const consumer = await transportEntry.transport.consume({
    producerId,
    rtpCapabilities,
    paused: true,
  });
  registerConsumer(consumer, {
    transportId,
    roomId: transportEntry.roomId,
    staffName: transportEntry.participantName,
    studentName: producerEntry.studentName,
    producerId,
    kind: consumer.kind,
    sourceType: producerEntry.sourceType,
  });
  console.log(`[consume] transport=${transportId}, producer=${producerId}, consumer=${consumer.id}`);

  res.json({
    id: consumer.id,
    consumerId: consumer.id,
    producerId: consumer.producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
    type: consumer.type,
    paused: consumer.paused,
  });
});

router.post('/api/staff/pause-consumer', async (req: Request, res: Response) => {
  const { consumerId } = req.body;
  if (!consumerId) {
    res.status(400).json({ error: 'consumerId is required' });
    return;
  }

  const consumerEntry = consumers.get(consumerId);
  if (!consumerEntry) {
    res.status(404).json({ error: 'consumer not found' });
    return;
  }

  const transportEntry = transports.get(consumerEntry.transportId);
  if (!transportEntry || transportEntry.role !== 'staff') {
    res.status(404).json({ error: 'staff consumer transport not found' });
    return;
  }

  await consumerEntry.consumer.pause();
  res.json({ ok: true, consumerId, paused: true });
});

router.post('/api/staff/resume-consumer', async (req: Request, res: Response) => {
  const { consumerId } = req.body;
  if (!consumerId) {
    res.status(400).json({ error: 'consumerId is required' });
    return;
  }

  const consumerEntry = consumers.get(consumerId);
  if (!consumerEntry) {
    res.status(404).json({ error: 'consumer not found' });
    return;
  }

  const transportEntry = transports.get(consumerEntry.transportId);
  if (!transportEntry || transportEntry.role !== 'staff') {
    res.status(404).json({ error: 'staff consumer transport not found' });
    return;
  }

  await consumerEntry.consumer.resume();
  res.json({ ok: true, consumerId, paused: false });
});

router.post('/api/staff/close-consumer', (req: Request, res: Response) => {
  const { consumerId } = req.body;
  if (!consumerId) {
    res.status(400).json({ error: 'consumerId is required' });
    return;
  }

  const consumerEntry = consumers.get(consumerId);
  if (!consumerEntry) {
    res.status(404).json({ error: 'consumer not found' });
    return;
  }

  const transportEntry = transports.get(consumerEntry.transportId);
  if (!transportEntry || transportEntry.role !== 'staff') {
    res.status(404).json({ error: 'staff consumer transport not found' });
    return;
  }

  consumerEntry.consumer.close();
  res.json({ ok: true, consumerId });
});

router.post('/api/staff/leave', (req: Request, res: Response) => {
  const { transportId } = req.body;
  if (!transportId) {
    res.status(400).json({ error: 'transportId is required' });
    return;
  }

  cleanupTransport(transportId);
  res.json({ ok: true });
});

export default router;
