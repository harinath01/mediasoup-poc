import { types as mediasoupTypes } from 'mediasoup';

let _worker: mediasoupTypes.Worker | null = null;

export function setWorker(worker: mediasoupTypes.Worker) {
  _worker = worker;
}

export function getWorker(): mediasoupTypes.Worker {
  if (!_worker) throw new Error('Worker not initialized');
  return _worker;
}
