import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

function getSocketServerUrl() {
  if (typeof window === 'undefined') return undefined;

  if (window.location.port === '5173') {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }

  return undefined;
}

export function useRoomChat({ enabled, roomId, name, role }) {
  const socketRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [presence, setPresence] = useState({ students: [], staff: [] });
  const [mediaProducers, setMediaProducers] = useState([]);
  const [connected, setConnected] = useState(false);
  const [chatError, setChatError] = useState('');

  const socketUrl = useMemo(() => getSocketServerUrl(), []);

  useEffect(() => {
    if (!enabled || !roomId || !name || !role) {
      setMessages([]);
      setPresence({ students: [], staff: [] });
      setMediaProducers([]);
      setConnected(false);
      setChatError('');
      return undefined;
    }

    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket'],
    });

    socketRef.current = socket;

    function handleConnect() {
      setConnected(true);
      socket.emit('chat:join', { roomId, name, role }, response => {
        if (!response?.ok) {
          setChatError(response?.error || 'Failed to join chat.');
          return;
        }

        setMessages(response.messages || []);
        setPresence(response.presence || { students: [], staff: [] });
        setChatError('');
      });
    }

    function handleDisconnect() {
      setConnected(false);
    }

    function handleMessage(message) {
      setMessages(current => [...current, message]);
    }

    function handlePresence(nextPresence) {
      setPresence(nextPresence);
    }

    function handleConnectError(error) {
      setChatError(error?.message || 'Failed to connect chat.');
    }

    function handleMediaProducers(nextMediaProducers) {
      setMediaProducers(nextMediaProducers || []);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('chat:message', handleMessage);
    socket.on('chat:presence', handlePresence);
    socket.on('media:producers', handleMediaProducers);
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.emit('chat:leave');
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('chat:message', handleMessage);
      socket.off('chat:presence', handlePresence);
      socket.off('media:producers', handleMediaProducers);
      socket.off('connect_error', handleConnectError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, roomId, name, role, socketUrl]);

  async function sendMessage({ text, recipientMode = 'all', recipientName = null }) {
    const socket = socketRef.current;
    if (!socket || !roomId) {
      throw new Error('Chat is not connected.');
    }

    return new Promise((resolve, reject) => {
      socket.emit('chat:message', { roomId, text, recipientMode, recipientName }, response => {
        if (!response?.ok) {
          reject(new Error(response?.error || 'Failed to send message.'));
          return;
        }

        resolve(response.message);
      });
    });
  }

  return {
    messages,
    presence,
    mediaProducers,
    connected,
    chatError,
    sendMessage,
  };
}
