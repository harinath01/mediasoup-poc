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
  const pausedConsumerCount = Array.from(consumers.values()).filter(entry => entry.consumer.paused).length;

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
      pausedConsumers: pausedConsumerCount,
      resumedConsumers: consumers.size - pausedConsumerCount,
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

function appendGauge(lines: string[], name: string, help: string, value: number | null | undefined) {
  if (!Number.isFinite(value)) return;
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} gauge`);
  lines.push(`${name} ${value}`);
}

/**
 * Prometheus text exposition for the in-process mediasoup metrics.
 * Keep /api/metrics as JSON for the existing dashboard and consumers.
 */
export async function getPrometheusMetrics() {
  const snapshot = await getMetricsSnapshot();
  const lines: string[] = [];
  const { status, topology, bandwidth, rtpQuality } = snapshot;

  appendGauge(lines, 'mediasoup_worker_healthy', 'Whether the mediasoup worker is healthy (1) or not (0)', status.workerHealth === 'healthy' ? 1 : 0);
  appendGauge(lines, 'mediasoup_workers', 'Number of mediasoup workers', status.workerCount);
  appendGauge(lines, 'mediasoup_worker_died_total', 'Number of mediasoup worker deaths', status.workerDiedCount);
  appendGauge(lines, 'mediasoup_worker_cpu_percent', 'Mediasoup worker CPU usage percentage', status.worker?.cpuPercent);
  appendGauge(lines, 'mediasoup_worker_rss_bytes', 'Mediasoup worker resident memory in bytes', status.worker?.rssBytes);

  appendGauge(lines, 'mediasoup_active_rooms', 'Active rooms', topology.activeRooms);
  appendGauge(lines, 'mediasoup_active_webrtc_transports', 'Active WebRTC transports', topology.activeWebRtcTransports);
  appendGauge(lines, 'mediasoup_active_producers', 'Active media producers', topology.activeProducers);
  appendGauge(lines, 'mediasoup_active_consumers', 'Open media consumers, including paused consumers', topology.activeConsumers);
  appendGauge(lines, 'mediasoup_paused_consumers', 'Open media consumers that are paused', topology.pausedConsumers);
  appendGauge(lines, 'mediasoup_resumed_consumers', 'Open media consumers that are resumed', topology.resumedConsumers);

  appendGauge(lines, 'mediasoup_transport_recv_bitrate_bps', 'Aggregate transport receive bitrate in bits per second', bandwidth.totalRecvBitrate);
  appendGauge(lines, 'mediasoup_transport_send_bitrate_bps', 'Aggregate transport send bitrate in bits per second', bandwidth.totalSendBitrate);
  appendGauge(lines, 'mediasoup_available_outgoing_bitrate_bps', 'Aggregate available outgoing bitrate in bits per second', bandwidth.totalAvailableOutgoingBitrate);
  appendGauge(lines, 'mediasoup_rtp_recv_bitrate_bps', 'Aggregate RTP receive bitrate in bits per second', bandwidth.totalRtpRecvBitrate);
  appendGauge(lines, 'mediasoup_rtp_send_bitrate_bps', 'Aggregate RTP send bitrate in bits per second', bandwidth.totalRtpSendBitrate);
  appendGauge(lines, 'mediasoup_rtt_milliseconds', 'Average RTP round trip time in milliseconds', rtpQuality.rttMs.avg);
  appendGauge(lines, 'mediasoup_jitter', 'Average RTP jitter', rtpQuality.jitter.avg);
  appendGauge(lines, 'mediasoup_packets_lost', 'Aggregate RTP packets lost', rtpQuality.packetLoss.packetsLost);
  appendGauge(lines, 'mediasoup_nack_total', 'Aggregate NACK count', rtpQuality.controlSignals.nackCount);
  appendGauge(lines, 'mediasoup_pli_total', 'Aggregate PLI count', rtpQuality.controlSignals.pliCount);
  appendGauge(lines, 'mediasoup_fir_total', 'Aggregate FIR count', rtpQuality.controlSignals.firCount);

  return `${lines.join('\n')}\n`;
}
