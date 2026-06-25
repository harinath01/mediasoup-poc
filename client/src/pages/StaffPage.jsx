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
  const streamMapRef = useRef(new Map());
  const producerMapRef = useRef(new Map());
  const consumerMapRef = useRef(new Map());
  const pollIntervalRef = useRef(null);
  const currentRoomIdRef = useRef('');
  const hasLeftRef = useRef(false);
  const tileVideoRefs = useRef(new Map());
  const tilesRef = useRef([]);
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
    tilesRef.current = tiles;
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
      await syncRoomProducers(producers);

      pollIntervalRef.current = window.setInterval(pollNewProducers, 3000);
      setStatus({ state: 'connected', text: 'Monitoring Active' });
    } catch (err) {
      setError(err.message || 'Failed to join room.');
      setStatus({ state: 'failed', text: 'Connection Failed' });
      cleanupStaffSession(false);
    }
  }

  function buildProducerMap(producers) {
    const nextMap = new Map();

    for (const producer of producers) {
      const current = nextMap.get(producer.studentName) || {
        cameraVideo: null,
        cameraAudio: null,
        screenVideo: null,
        screenAudio: null,
      };

      if (producer.sourceType === 'screen' && producer.kind === 'video') current.screenVideo = producer;
      if (producer.sourceType === 'screen' && producer.kind === 'audio') current.screenAudio = producer;
      if (producer.sourceType === 'camera' && producer.kind === 'video') current.cameraVideo = producer;
      if (producer.sourceType === 'camera' && producer.kind === 'audio') current.cameraAudio = producer;

      nextMap.set(producer.studentName, current);
    }

    return nextMap;
  }

  function buildNextTiles(currentTiles, nextProducerMap) {
    const currentTileMap = new Map(currentTiles.map(tile => [tile.studentName, tile]));
    const nextTiles = [];

    for (const [studentName, producerInfo] of nextProducerMap.entries()) {
      const existingTile = currentTileMap.get(studentName);
      let stream = streamMapRef.current.get(studentName);
      if (!stream) {
        stream = new MediaStream();
        streamMapRef.current.set(studentName, stream);
      }

      const availableSourceTypes = [];
      if (producerInfo.cameraVideo) availableSourceTypes.push('camera');
      if (producerInfo.screenVideo) availableSourceTypes.push('screen');

      const activeSourceType = availableSourceTypes.includes(existingTile?.activeSourceType)
        ? existingTile.activeSourceType
        : availableSourceTypes.includes('camera')
          ? 'camera'
          : availableSourceTypes[0] || 'camera';

      nextTiles.push({
        studentName,
        stream,
        audioEnabled: existingTile?.audioEnabled ?? false,
        activeSourceType,
        availableSourceTypes,
        displayLabel:
          activeSourceType === 'screen'
            ? producerInfo.screenVideo?.displayLabel || 'Screen'
            : producerInfo.cameraVideo?.displayLabel || 'Camera',
      });
    }

    return nextTiles;
  }

  async function createConsumer(producerId) {
    const transport = recvTransportRef.current;
    const device = deviceRef.current;
    if (!transport || !device) return null;

    const consumerData = await apiCall('POST', '/api/staff/consume', {
      transportId: transport.id,
      producerId,
      rtpCapabilities: device.rtpCapabilities,
    });

    return transport.consume({
      id: consumerData.id,
      producerId: consumerData.producerId,
      kind: consumerData.kind,
      rtpParameters: consumerData.rtpParameters,
    });
  }

  function removeStreamTrack(studentName, kind) {
    const stream = streamMapRef.current.get(studentName);
    if (!stream) return;

    for (const track of [...stream.getTracks()]) {
      if (track.kind === kind) {
        stream.removeTrack(track);
        track.stop();
      }
    }
  }

  async function syncStudentConsumers(tile, producerInfo) {
    const desiredVideoProducer =
      tile.activeSourceType === 'screen'
        ? producerInfo.screenVideo || producerInfo.cameraVideo
        : producerInfo.cameraVideo || producerInfo.screenVideo;
    const desiredAudioProducer = producerInfo.cameraAudio || producerInfo.screenAudio;

    const currentConsumerState = consumerMapRef.current.get(tile.studentName) || {
      videoConsumer: null,
      audioConsumer: null,
      videoProducerId: null,
      audioProducerId: null,
    };

    if (currentConsumerState.videoProducerId !== desiredVideoProducer?.id) {
      if (currentConsumerState.videoConsumer) {
        currentConsumerState.videoConsumer.close();
        removeStreamTrack(tile.studentName, 'video');
      }

      currentConsumerState.videoConsumer = null;
      currentConsumerState.videoProducerId = null;

      if (desiredVideoProducer) {
        setStatus({ state: 'connecting', text: `Consuming ${desiredVideoProducer.sourceType} video from ${tile.studentName}...` });
        const consumer = await createConsumer(desiredVideoProducer.id);
        if (consumer) {
          currentConsumerState.videoConsumer = consumer;
          currentConsumerState.videoProducerId = desiredVideoProducer.id;
          tile.stream.addTrack(consumer.track);
        }
      }
    }

    if (currentConsumerState.audioProducerId !== desiredAudioProducer?.id) {
      if (currentConsumerState.audioConsumer) {
        currentConsumerState.audioConsumer.close();
        removeStreamTrack(tile.studentName, 'audio');
      }

      currentConsumerState.audioConsumer = null;
      currentConsumerState.audioProducerId = null;

      if (desiredAudioProducer) {
        const consumer = await createConsumer(desiredAudioProducer.id);
        if (consumer) {
          currentConsumerState.audioConsumer = consumer;
          currentConsumerState.audioProducerId = desiredAudioProducer.id;
          tile.stream.addTrack(consumer.track);
        }
      }
    }

    consumerMapRef.current.set(tile.studentName, currentConsumerState);
  }

  function removeStudentConsumption(studentName) {
    const consumerState = consumerMapRef.current.get(studentName);
    if (consumerState?.videoConsumer) consumerState.videoConsumer.close();
    if (consumerState?.audioConsumer) consumerState.audioConsumer.close();
    consumerMapRef.current.delete(studentName);

    const stream = streamMapRef.current.get(studentName);
    if (stream) {
      for (const track of stream.getTracks()) {
        stream.removeTrack(track);
        track.stop();
      }
      streamMapRef.current.delete(studentName);
    }

    tileVideoRefs.current.delete(studentName);
  }

  async function syncRoomProducers(producers) {
    const nextProducerMap = buildProducerMap(producers);
    producerMapRef.current = nextProducerMap;

    const nextTiles = buildNextTiles(tilesRef.current, nextProducerMap);
    const nextStudentNames = new Set(nextTiles.map(tile => tile.studentName));

    for (const studentName of [...consumerMapRef.current.keys()]) {
      if (!nextStudentNames.has(studentName)) {
        removeStudentConsumption(studentName);
      }
    }

    setTiles(nextTiles);

    for (const tile of nextTiles) {
      const producerInfo = nextProducerMap.get(tile.studentName);
      if (producerInfo) {
        await syncStudentConsumers(tile, producerInfo);
      }
    }
  }

  async function pollNewProducers() {
    if (!recvTransportRef.current || !currentRoomIdRef.current) return;

    try {
      const producers = await apiCall('GET', `/api/staff/room/${currentRoomIdRef.current}/producers`);
      await syncRoomProducers(producers);
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

  async function switchTileSource(studentName, sourceType) {
    const nextTiles = tilesRef.current.map(tile => {
      if (tile.studentName !== studentName) return tile;
      if (!tile.availableSourceTypes.includes(sourceType)) return tile;

      const producerInfo = producerMapRef.current.get(studentName);
      return {
        ...tile,
        activeSourceType: sourceType,
        displayLabel:
          sourceType === 'screen'
            ? producerInfo?.screenVideo?.displayLabel || 'Screen'
            : producerInfo?.cameraVideo?.displayLabel || 'Camera',
      };
    });

    setTiles(nextTiles);

    const updatedTile = nextTiles.find(tile => tile.studentName === studentName);
    const producerInfo = producerMapRef.current.get(studentName);
    if (updatedTile && producerInfo) {
      await syncStudentConsumers(updatedTile, producerInfo);
    }
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

    currentRoomIdRef.current = '';
    deviceRef.current = null;
    producerMapRef.current = new Map();

    for (const studentName of [...consumerMapRef.current.keys()]) {
      removeStudentConsumption(studentName);
    }

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
    consumerMapRef.current = new Map();
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
          switchTileSource={switchTileSource}
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
