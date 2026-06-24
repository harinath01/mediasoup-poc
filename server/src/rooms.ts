import { types as mediasoupTypes } from 'mediasoup';

export interface Room {
  id: string;
  students: string[];
  staff: string[];
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

export const transports = new Map<string, mediasoupTypes.WebRtcTransport>();

export const producers = new Map<
  string,
  { transport: mediasoupTypes.Producer; roomId: string; studentName: string }
>();
