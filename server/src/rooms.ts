import { types as mediasoupTypes } from 'mediasoup';
import { clearChatRoom } from './chat.js';

export interface Room {
  id: string;
  students: string[];
  staff: string[];
}

type ParticipantRole = 'student' | 'staff';
export type ProducerSourceType = 'camera' | 'screen';

interface TransportEntry {
  transport: mediasoupTypes.WebRtcTransport;
  roomId: string;
  participantName: string;
  role: ParticipantRole;
}

interface ProducerEntry {
  producer: mediasoupTypes.Producer;
  transportId: string;
  roomId: string;
  studentName: string;
  sourceType: ProducerSourceType;
  displayLabel?: string;
}

interface ConsumerEntry {
  consumer: mediasoupTypes.Consumer;
  transportId: string;
  roomId: string;
  staffName: string;
  studentName: string;
  producerId: string;
  kind: mediasoupTypes.MediaKind;
  sourceType: ProducerSourceType;
}

const rooms = new Map<string, Room>();

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = { id: roomId, students: [], staff: [] };
    rooms.set(roomId, room);
  }
  return room;
}

export function getAllRooms(): Map<string, Room> {
  return rooms;
}

export const routers = new Map<string, mediasoupTypes.Router>();

export const transports = new Map<string, TransportEntry>();

export const producers = new Map<string, ProducerEntry>();
export const consumers = new Map<string, ConsumerEntry>();

function removeParticipant(roomId: string, participantName: string, role: ParticipantRole) {
  const room = rooms.get(roomId);
  if (!room) return;

  const list = role === 'student' ? room.students : room.staff;
  const index = list.indexOf(participantName);
  if (index >= 0) {
    list.splice(index, 1);
  }

  if (!room.students.length && !room.staff.length) {
    const router = routers.get(roomId);
    if (router && !router.closed) {
      router.close();
    }
    clearChatRoom(roomId);
    rooms.delete(roomId);
    routers.delete(roomId);
  }
}

export function removeProducer(producerId: string) {
  producers.delete(producerId);
}

export function removeConsumer(consumerId: string) {
  consumers.delete(consumerId);
}

export function registerTransport(
  transport: mediasoupTypes.WebRtcTransport,
  details: Omit<TransportEntry, 'transport'>
) {
  transports.set(transport.id, { transport, ...details });

  transport.on('dtlsstatechange', state => {
    if (state === 'closed') {
      cleanupTransport(transport.id);
    }
  });

  transport.observer.on('close', () => {
    cleanupTransport(transport.id);
  });
}

export function registerProducer(
  producer: mediasoupTypes.Producer,
  details: Omit<ProducerEntry, 'producer'>
) {
  producers.set(producer.id, { producer, ...details });

  producer.on('transportclose', () => {
    removeProducer(producer.id);
  });

  producer.observer.on('close', () => {
    removeProducer(producer.id);
  });
}

export function registerConsumer(
  consumer: mediasoupTypes.Consumer,
  details: Omit<ConsumerEntry, 'consumer'>
) {
  consumers.set(consumer.id, { consumer, ...details });

  consumer.on('transportclose', () => {
    removeConsumer(consumer.id);
  });

  consumer.on('producerclose', () => {
    removeConsumer(consumer.id);
  });

  consumer.observer.on('close', () => {
    removeConsumer(consumer.id);
  });
}

export function cleanupTransport(transportId: string) {
  const entry = transports.get(transportId);
  if (!entry) return;

  transports.delete(transportId);

  for (const [consumerId, consumerEntry] of consumers.entries()) {
    if (consumerEntry.transportId !== transportId) continue;
    consumerEntry.consumer.close();
    consumers.delete(consumerId);
  }

  for (const [producerId, producerEntry] of producers.entries()) {
    if (producerEntry.transportId !== transportId) continue;
    producerEntry.producer.close();
    producers.delete(producerId);
  }

  removeParticipant(entry.roomId, entry.participantName, entry.role);

  if (!entry.transport.closed) {
    entry.transport.close();
  }
}
