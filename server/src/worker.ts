import { types as mediasoupTypes } from 'mediasoup';

let _worker: mediasoupTypes.Worker | null = null;
let workerDiedCount = 0;
let lastCpuSample: { timestamp: number; totalCpuMs: number } | null = null;

export interface WorkerRuntimeSnapshot {
  pid: number;
  alive: boolean;
  health: 'healthy' | 'died' | 'closed';
  cpuPercent: number | null;
  userCpuMs: number | null;
  systemCpuMs: number | null;
  rssBytes: number | null;
}

export function setWorker(worker: mediasoupTypes.Worker) {
  _worker = worker;

  worker.on('died', err => {
    workerDiedCount += 1;
    console.error(`mediasoup worker died, pid=${worker.pid}`, err);
  });
}

export function getWorker(): mediasoupTypes.Worker {
  if (!_worker) throw new Error('Worker not initialized');
  return _worker;
}

export function getWorkerCount(): number {
  return _worker ? 1 : 0;
}

export function getWorkerDiedCount(): number {
  return workerDiedCount;
}

export async function getWorkerRuntimeSnapshot(): Promise<WorkerRuntimeSnapshot | null> {
  if (!_worker) {
    return null;
  }

  const alive = !_worker.closed && !_worker.died && !_worker.subprocessClosed;

  if (!alive) {
    return {
      pid: _worker.pid,
      alive: false,
      health: _worker.died ? 'died' : 'closed',
      cpuPercent: null,
      userCpuMs: null,
      systemCpuMs: null,
      rssBytes: null,
    };
  }

  const usage = await _worker.getResourceUsage();
  const totalCpuMs = usage.ru_utime + usage.ru_stime;
  const now = Date.now();
  let cpuPercent: number | null = null;

  if (lastCpuSample) {
    const elapsedMs = now - lastCpuSample.timestamp;
    const cpuDeltaMs = totalCpuMs - lastCpuSample.totalCpuMs;
    if (elapsedMs > 0) {
      cpuPercent = Math.max(0, Number(((cpuDeltaMs / elapsedMs) * 100).toFixed(2)));
    }
  }

  lastCpuSample = {
    timestamp: now,
    totalCpuMs,
  };

  return {
    pid: _worker.pid,
    alive: true,
    health: 'healthy',
    cpuPercent,
    userCpuMs: usage.ru_utime,
    systemCpuMs: usage.ru_stime,
    rssBytes: usage.ru_maxrss * 1024,
  };
}
