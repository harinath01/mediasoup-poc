import { types as mediasoupTypes } from 'mediasoup';
import { routers } from './rooms.js';
import { getWorker } from './worker.js';

const ANNOUNCED_IP = process.env.MEDIASOUP_LISTEN_IP || '127.0.0.1';

const mediaCodecs = [
  { kind: 'audio' as const, mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video' as const, mimeType: 'video/VP8', clockRate: 90000 },
];

export async function getOrCreateRoomRouter(roomId: string): Promise<mediasoupTypes.Router> {
  let router = routers.get(roomId);
  if (!router) {
    const worker = getWorker();
    router = await worker.createRouter({ mediaCodecs });
    routers.set(roomId, router);
    console.log(`[router] created for room=${roomId}`);
  }
  return router;
}

export async function createWebRtcTransport(router: mediasoupTypes.Router): Promise<mediasoupTypes.WebRtcTransport> {
  return router.createWebRtcTransport({
    listenInfos: [{ protocol: 'udp', ip: '0.0.0.0', announcedAddress: ANNOUNCED_IP }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });
}
