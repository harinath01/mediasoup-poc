import { Router, Request, Response } from 'express';
import { getOrCreateRoom, routers, transports } from '../rooms.js';
import { getWorker } from '../worker.js';

const router = Router();

const ANNOUNCED_IP = process.env.MEDIASOUP_LISTEN_IP || '127.0.0.1';

const mediaCodecs = [
  { kind: 'audio' as const, mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video' as const, mimeType: 'video/VP8', clockRate: 90000 },
];

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

  let router = routers.get(roomId);
  if (!router) {
    const worker = getWorker();
    router = await worker.createRouter({ mediaCodecs });
    routers.set(roomId, router);
    console.log(`[router] created for room=${roomId}`);
  }

  const transport = await router.createWebRtcTransport({
    listenInfos: [{ protocol: 'udp', ip: '0.0.0.0', announcedAddress: ANNOUNCED_IP }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });
  transports.set(transport.id, transport);

  console.log(`[student join] room=${roomId}, name=${name}, transport=${transport.id}`);

  res.json({
    ok: true,
    name,
    roomId,
    routerRtpCapabilities: router.rtpCapabilities,
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
  const { transportId, kind, rtpParameters } = req.body;
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
  console.log(`[produce] transport=${transportId}, kind=${kind}, producer=${producer.id}`);
  res.json({ id: producer.id });
});

export default router;
