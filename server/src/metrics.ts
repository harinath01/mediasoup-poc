import { types as mediasoupTypes } from 'mediasoup';
import { consumers, getAllRooms, producers, transports } from './rooms.js';
import { getWorkerCount, getWorkerDiedCount, getWorkerRuntimeSnapshot } from './worker.js';

type NumericSummary = {
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  sum: number;
};

type TransportStatLike = mediasoupTypes.WebRtcTransportStat;
type RtpStatLike = mediasoupTypes.ProducerStat | mediasoupTypes.ConsumerStat;

function summarize(values: number[]): NumericSummary {
  if (!values.length) {
    return { count: 0, min: null, max: null, avg: null, sum: 0 };
  }

  const sum = values.reduce((total, value) => total + value, 0);

  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: Number((sum / values.length).toFixed(2)),
    sum: Number(sum.toFixed(2)),
  };
}

function sumBy<T>(items: T[], getValue: (item: T) => number | null | undefined): number {
  return Number(
    items.reduce((total, item) => {
      const value = getValue(item);
      return Number.isFinite(value) ? total + Number(value) : total;
    }, 0).toFixed(2)
  );
}

async function safeResolve<T>(factory: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await factory();
  } catch {
    return fallback;
  }
}

export async function getMetricsSnapshot() {
  const workerSnapshot = await getWorkerRuntimeSnapshot();

  const transportStats = (
    await Promise.all(
      Array.from(transports.values()).map(entry =>
        safeResolve(
          async () => (await entry.transport.getStats()) as TransportStatLike[],
          []
        )
      )
    )
  ).flat();

  const producerStats = (
    await Promise.all(
      Array.from(producers.values()).map(entry =>
        safeResolve(
          async () => (await entry.producer.getStats()) as mediasoupTypes.ProducerStat[],
          []
        )
      )
    )
  ).flat();

  const consumerStats = (
    await Promise.all(
      Array.from(consumers.values()).map(entry =>
        safeResolve(
          async () => (await entry.consumer.getStats()) as RtpStatLike[],
          []
        )
      )
    )
  ).flat();

  const producerScoreValues = Array.from(producers.values()).flatMap(entry =>
    entry.producer.score.map(score => score.score)
  );
  const consumerScoreValues = Array.from(consumers.values()).map(entry => entry.consumer.score.score);
  const rtpStats = [...producerStats, ...consumerStats];

  return {
    updatedAt: new Date().toISOString(),
    status: {
      workerHealth: workerSnapshot?.health ?? 'closed',
      workerCount: getWorkerCount(),
      workerDiedCount: getWorkerDiedCount(),
      worker: workerSnapshot,
    },
    topology: {
      activeRooms: getAllRooms().size,
      activeWebRtcTransports: transports.size,
      activeProducers: producers.size,
      activeConsumers: consumers.size,
    },
    bandwidth: {
      totalRecvBitrate: sumBy(transportStats, stat => stat.recvBitrate),
      totalSendBitrate: sumBy(transportStats, stat => stat.sendBitrate),
      totalRtpRecvBitrate: sumBy(transportStats, stat => stat.rtpRecvBitrate),
      totalRtpSendBitrate: sumBy(transportStats, stat => stat.rtpSendBitrate),
      totalAvailableOutgoingBitrate: sumBy(transportStats, stat => stat.availableOutgoingBitrate),
    },
    rtpQuality: {
      producerScore: summarize(producerScoreValues),
      consumerScore: summarize(consumerScoreValues),
      rttMs: summarize(
        rtpStats
          .map(stat => stat.roundTripTime)
          .filter((value): value is number => Number.isFinite(value))
      ),
      packetLoss: {
        packetsLost: sumBy(rtpStats, stat => stat.packetsLost),
        fractionLost: summarize(rtpStats.map(stat => stat.fractionLost)),
      },
      jitter: summarize(rtpStats.map(stat => stat.jitter)),
      controlSignals: {
        nackCount: sumBy(rtpStats, stat => stat.nackCount),
        pliCount: sumBy(rtpStats, stat => stat.pliCount),
        firCount: sumBy(rtpStats, stat => stat.firCount),
      },
    },
  };
}
