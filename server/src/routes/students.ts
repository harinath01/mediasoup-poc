import { Router, Request, Response } from 'express';
import { getOrCreateRoom, routers, transports } from '../rooms.js';
import { getWorker } from '../worker.js';

const router = Router();

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
    listenInfos: [{ protocol: 'udp', ip: '0.0.0.0', announcedAddress: '127.0.0.1' }],
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

export default router;
