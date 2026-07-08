import type { Server as SocketServer, Socket } from 'socket.io';

export type ChatRole = 'student' | 'staff';

export interface ChatMessage {
  id: string;
  roomId: string;
  senderName: string;
  senderRole: ChatRole;
  recipientMode: 'all' | 'staff' | 'student';
  recipientName: string | null;
  text: string;
  createdAt: number;
}

interface ChatPresence {
  students: string[];
  staff: string[];
}

interface ChatRoomState {
  messages: ChatMessage[];
  presence: ChatPresence;
}

interface JoinPayload {
  roomId: string;
  name: string;
  role: ChatRole;
}

interface SendMessagePayload {
  roomId: string;
  text: string;
  recipientMode?: 'all' | 'student';
  recipientName?: string | null;
}

const MAX_ROOM_MESSAGES = 100;
const roomState = new Map<string, ChatRoomState>();
let socketServerRef: SocketServer | null = null;

function getOrCreateRoomState(roomId: string): ChatRoomState {
  const existing = roomState.get(roomId);
  if (existing) return existing;

  const state: ChatRoomState = {
    messages: [],
    presence: { students: [], staff: [] },
  };
  roomState.set(roomId, state);
  return state;
}

function getSocketIdentity(socket: Socket) {
  const roomId = socket.data.roomId as string | undefined;
  const name = socket.data.name as string | undefined;
  const role = socket.data.role as ChatRole | undefined;
  return { roomId, name, role };
}

function getParticipantRoom(roomId: string, role: ChatRole, name: string) {
  return `${roomId}:${role}:${name}`;
}

function isMessageVisibleToParticipant(message: ChatMessage, name: string, role: ChatRole) {
  if (role === 'staff') return true;
  if (message.senderRole === 'student' && message.senderName === name) return true;
  if (message.recipientMode === 'all') return true;
  if (message.recipientMode === 'student' && message.recipientName === name) return true;
  return false;
}

function getVisibleMessages(messages: ChatMessage[], name: string, role: ChatRole) {
  return messages.filter(message => isMessageVisibleToParticipant(message, name, role));
}

function broadcastPresence(io: SocketServer, roomId: string) {
  const state = roomState.get(roomId);
  if (!state) return;

  io.to(roomId).emit('chat:presence', {
    students: [...state.presence.students],
    staff: [...state.presence.staff],
  });
}

function removePresence(io: SocketServer, socket: Socket) {
  const { roomId, name, role } = getSocketIdentity(socket);
  if (!roomId || !name || !role) return;

  const state = roomState.get(roomId);
  if (!state) return;

  const list = role === 'student' ? state.presence.students : state.presence.staff;
  const index = list.indexOf(name);
  if (index >= 0) {
    list.splice(index, 1);
  }

  if (!state.presence.students.length && !state.presence.staff.length && !state.messages.length) {
    roomState.delete(roomId);
    return;
  }

  broadcastPresence(io, roomId);
}

export function clearChatRoom(roomId: string) {
  roomState.delete(roomId);
}

export function broadcastMediaState(roomId: string, producers: unknown[]) {
  if (!socketServerRef) return;
  socketServerRef.to(roomId).emit('media:producers', producers);
}

export function registerChatHandlers(io: SocketServer) {
  socketServerRef = io;
  io.on('connection', socket => {
    socket.on('chat:join', (payload: JoinPayload, callback?: (response: unknown) => void) => {
      const roomId = payload.roomId?.trim();
      const name = payload.name?.trim();
      const role = payload.role;

      if (!roomId || !name || (role !== 'student' && role !== 'staff')) {
        callback?.({ ok: false, error: 'roomId, name, and role are required' });
        return;
      }

      const previousRoomId = socket.data.roomId as string | undefined;
      if (previousRoomId && previousRoomId !== roomId) {
        socket.leave(previousRoomId);
        removePresence(io, socket);
      }

      socket.join(roomId);
      socket.join(getParticipantRoom(roomId, role, name));
      socket.data.roomId = roomId;
      socket.data.name = name;
      socket.data.role = role;

      const state = getOrCreateRoomState(roomId);
      const presenceList = role === 'student' ? state.presence.students : state.presence.staff;
      if (!presenceList.includes(name)) {
        presenceList.push(name);
      }

      callback?.({
        ok: true,
        messages: getVisibleMessages(state.messages, name, role),
        presence: {
          students: [...state.presence.students],
          staff: [...state.presence.staff],
        },
      });

      broadcastPresence(io, roomId);
    });

    socket.on('chat:message', (payload: SendMessagePayload, callback?: (response: unknown) => void) => {
      const { roomId, name, role } = getSocketIdentity(socket);
      const text = payload.text?.trim();

      if (!roomId || !name || !role || payload.roomId !== roomId) {
        callback?.({ ok: false, error: 'chat session not joined' });
        return;
      }

      if (!text) {
        callback?.({ ok: false, error: 'message text is required' });
        return;
      }

      const state = getOrCreateRoomState(roomId);
      const recipientMode = role === 'student' ? 'staff' : payload.recipientMode === 'student' ? 'student' : 'all';
      const recipientName = recipientMode === 'student' ? payload.recipientName?.trim() || '' : null;

      if (recipientMode === 'student' && !recipientName) {
        callback?.({ ok: false, error: 'recipientName is required for direct student messages' });
        return;
      }

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        roomId,
        senderName: name,
        senderRole: role,
        recipientMode,
        recipientName,
        text,
        createdAt: Date.now(),
      };

      state.messages.push(message);
      if (state.messages.length > MAX_ROOM_MESSAGES) {
        state.messages.splice(0, state.messages.length - MAX_ROOM_MESSAGES);
      }

      if (recipientMode === 'all') {
        io.to(roomId).emit('chat:message', message);
      } else if (recipientMode === 'staff') {
        for (const staffName of state.presence.staff) {
          io.to(getParticipantRoom(roomId, 'staff', staffName)).emit('chat:message', message);
        }
        io.to(getParticipantRoom(roomId, 'student', name)).emit('chat:message', message);
      } else if (recipientName) {
        for (const staffName of state.presence.staff) {
          io.to(getParticipantRoom(roomId, 'staff', staffName)).emit('chat:message', message);
        }
        io.to(getParticipantRoom(roomId, 'student', recipientName)).emit('chat:message', message);
      }

      callback?.({ ok: true, message });
    });

    socket.on('chat:leave', () => {
      const { roomId, name, role } = getSocketIdentity(socket);
      if (roomId) {
        socket.leave(roomId);
      }
      if (roomId && name && role) {
        socket.leave(getParticipantRoom(roomId, role, name));
      }
      removePresence(io, socket);
      socket.data.roomId = undefined;
      socket.data.name = undefined;
      socket.data.role = undefined;
    });

    socket.on('disconnect', () => {
      removePresence(io, socket);
    });
  });
}
