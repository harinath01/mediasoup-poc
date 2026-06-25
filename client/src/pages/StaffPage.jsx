import React, { useEffect, useRef, useState } from 'react';
import * as mediasoupClient from 'mediasoup-client';
import { apiCall, sendJsonBeacon } from '../api.js';
import AppShell from '../components/AppShell.jsx';
import StaffDashboard from '../components/StaffDashboard.jsx';
import StaffJoinPanel from '../components/StaffJoinPanel.jsx';
import { useRoomChat } from '../useRoomChat.js';

function StaffPage() {
  const TWO_HOURS_IN_SECONDS = 2 * 60 * 60;
  const [name, setName] = useState('');
  const [rooms, setRooms] = useState([]);
  const [joined, setJoined] = useState(false);
  const [roomInfo, setRoomInfo] = useState('');
  const [status, setStatus] = useState({ state: 'idle', text: 'Refresh rooms to begin.' });
  const [error, setError] = useState('');
  const [tiles, setTiles] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(TWO_HOURS_IN_SECONDS);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatDraft, setChatDraft] = useState('');
  const [chatRecipient, setChatRecipient] = useState('all');
  const recvTransportRef = useRef(null);
  const deviceRef = useRef(null);
  const consumedProducerIdsRef = useRef(new Set());
  const streamMapRef = useRef(new Map());
  const pollIntervalRef = useRef(null);
  const currentRoomIdRef = useRef('');
  const hasLeftRef = useRef(false);
  const tileVideoRefs = useRef(new Map());
  const joinedRoomId = roomInfo.split(' | ')[0]?.replace('Room: ', '') || '';
  const joinedName = roomInfo.split(' | ')[1]?.replace('Staff: ', '') || '';
  const { messages, presence, connected: chatConnected, chatError, sendMessage } = useRoomChat({
    enabled: joined,
    roomId: joinedRoomId,
    name: joinedName,
    role: 'staff',
  });

  useEffect(() => {
    refreshRooms();
  }, []);

  useEffect(() => {
    for (const tile of tiles) {
      const video = tileVideoRefs.current.get(tile.studentName);
      if (video && video.srcObject !== tile.stream) {
        video.srcObject = tile.stream;
      }
    }
  }, [tiles]);

  useEffect(() => {
    function handlePageHide() {
      beaconLeave();
    }

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      beaconLeave();
    };
  }, []);

  useEffect(() => {
    if (!joined) {
      setTimeRemainingSeconds(TWO_HOURS_IN_SECONDS);
      return;
    }

    const timer = window.setInterval(() => {
      setTimeRemainingSeconds(current => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [joined]);

  async function refreshRooms() {
    setRefreshing(true);
    setError('');

    try {
      const result = await apiCall('GET', '/api/rooms');
      setRooms(result);
    } catch (err) {
      setError(err.message || 'Failed to load rooms.');
    } finally {
      setRefreshing(false);
    }
  }

  async function joinRoom(roomId) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter your name first.');
      return;
    }

    setError('');
    setStatus({ state: 'connecting', text: 'Joining room...' });
    hasLeftRef.current = false;
    currentRoomIdRef.current = roomId;

    try {
      const result = await apiCall('POST', '/api/staff/join', { name: trimmedName, roomId });
      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: result.routerRtpCapabilities });
      deviceRef.current = device;

      const recvTransport = device.createRecvTransport({
        ...result.transport,
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      recvTransportRef.current = recvTransport;
      setJoined(true);
      setRoomInfo(`Room: ${result.roomId} | Staff: ${result.name}`);
      consumedProducerIdsRef.current = new Set();
      clearTiles();

      recvTransport.on('connectionstatechange', state => {
        switch (state) {
          case 'connecting':
            setStatus({ state: 'connecting', text: 'Connecting...' });
            break;
          case 'connected':
            setStatus({ state: 'connected', text: 'Monitoring Active' });
            break;
          case 'failed':
            setStatus({ state: 'failed', text: 'Connection Failed' });
            break;
          case 'disconnected':
            setStatus({ state: 'connecting', text: 'Disconnected - reconnecting...' });
            break;
          default:
            break;
        }
      });

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        apiCall('POST', '/api/staff/connect-transport', {
          transportId: recvTransport.id,
          dtlsParameters,
        }).then(callback).catch(errback);
      });

      setStatus({ state: 'connecting', text: 'Fetching producers...' });
      const producers = await apiCall('GET', `/api/staff/room/${roomId}/producers`);

      for (const producer of producers) {
        await consumeProducer(producer);
      }

      pollIntervalRef.current = window.setInterval(pollNewProducers, 3000);
      setStatus({ state: 'connected', text: 'Monitoring Active' });
    } catch (err) {
      setError(err.message || 'Failed to join room.');
      setStatus({ state: 'failed', text: 'Connection Failed' });
      cleanupStaffSession(false);
    }
  }

  async function consumeProducer(producer) {
    if (!recvTransportRef.current || !deviceRef.current) return;
    if (consumedProducerIdsRef.current.has(producer.id)) return;

    consumedProducerIdsRef.current.add(producer.id);
    setStatus({ state: 'connecting', text: `Consuming ${producer.kind} from ${producer.studentName}...` });

    const consumerData = await apiCall('POST', '/api/staff/consume', {
      transportId: recvTransportRef.current.id,
      producerId: producer.id,
      rtpCapabilities: deviceRef.current.rtpCapabilities,
    });

    const consumer = await recvTransportRef.current.consume({
      id: consumerData.id,
      producerId: consumerData.producerId,
      kind: consumerData.kind,
      rtpParameters: consumerData.rtpParameters,
    });

    let stream = streamMapRef.current.get(producer.studentName);
    if (!stream) {
      stream = new MediaStream();
      streamMapRef.current.set(producer.studentName, stream);
    }

    stream.addTrack(consumer.track);

    setTiles(current => {
      const existing = current.find(tile => tile.studentName === producer.studentName);
      if (existing) {
        return current.map(tile => (tile.studentName === producer.studentName ? { ...tile, stream } : tile));
      }

      return [...current, { studentName: producer.studentName, stream, audioEnabled: false }];
    });
  }

  async function pollNewProducers() {
    if (!recvTransportRef.current || !currentRoomIdRef.current) return;

    try {
      const producers = await apiCall('GET', `/api/staff/room/${currentRoomIdRef.current}/producers`);
      for (const producer of producers) {
        await consumeProducer(producer);
      }
    } catch (err) {
      console.error('failed to poll producers', err);
    }
  }

  function toggleRemoteAudio(studentName) {
    setTiles(current =>
      current.map(tile => {
        if (tile.studentName !== studentName) return tile;
        return { ...tile, audioEnabled: !tile.audioEnabled };
      })
    );
  }

  async function leaveRoom() {
    const transport = recvTransportRef.current;
    if (!transport || hasLeftRef.current) return;

    hasLeftRef.current = true;

    try {
      await apiCall('POST', '/api/staff/leave', { transportId: transport.id });
    } catch (err) {
      console.error('failed to leave room', err);
    }

    cleanupStaffSession(true);
  }

  function beaconLeave() {
    const transport = recvTransportRef.current;
    if (!transport || hasLeftRef.current) return;

    hasLeftRef.current = true;
    sendJsonBeacon('/api/staff/leave', { transportId: transport.id });
    cleanupStaffSession(false);
  }

  function cleanupStaffSession(resetUi) {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (recvTransportRef.current) {
      recvTransportRef.current.close();
      recvTransportRef.current = null;
    }

    consumedProducerIdsRef.current = new Set();
    currentRoomIdRef.current = '';
    deviceRef.current = null;
    clearTiles();

    if (resetUi) {
      setJoined(false);
      setRoomInfo('');
      setStatus({ state: 'idle', text: 'Refresh rooms to begin.' });
      setChatDraft('');
      setChatRecipient('all');
    }
  }

  function clearTiles() {
    for (const tile of streamMapRef.current.values()) {
      for (const track of tile.getTracks()) {
        track.stop();
      }
    }

    streamMapRef.current = new Map();
    tileVideoRefs.current.clear();
    setTiles([]);
    setSidebarOpen(true);
  }

  async function handleSendChatMessage() {
    const text = chatDraft.trim();
    if (!text) return;

    try {
      await sendMessage({
        text,
        recipientMode: chatRecipient === 'all' ? 'all' : 'student',
        recipientName: chatRecipient === 'all' ? null : chatRecipient,
      });
      setChatDraft('');
    } catch (err) {
      setError(err.message || 'Failed to send chat message.');
    }
  }

  return (
    <AppShell
      mainClassName={joined ? 'max-w-[1760px] xl:h-[calc(100vh-24px)]' : 'max-w-[560px]'}
      rootClassName={joined ? 'items-start overflow-hidden py-3 xl:py-3' : ''}
    >
      {!joined ? (
        <StaffJoinPanel
          error={error}
          joinRoom={joinRoom}
          name={name}
          refreshRooms={refreshRooms}
          refreshing={refreshing}
          rooms={rooms}
          setName={setName}
        />
      ) : (
        <StaffDashboard
          error={error}
          leaveRoom={leaveRoom}
          roomInfo={roomInfo}
          rooms={rooms}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          chatConnected={chatConnected}
          chatDraft={chatDraft}
          chatError={chatError}
          chatRecipient={chatRecipient}
          messages={messages}
          presence={presence}
          sendChatMessage={handleSendChatMessage}
          setChatDraft={setChatDraft}
          setChatRecipient={setChatRecipient}
          timeRemaining={formatTimeRemaining(timeRemainingSeconds)}
          tileVideoRefs={tileVideoRefs}
          tiles={tiles}
          toggleRemoteAudio={toggleRemoteAudio}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      )}
    </AppShell>
  );
}

function formatTimeRemaining(totalSeconds) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export default StaffPage;
