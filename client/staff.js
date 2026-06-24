import { apiCall } from './api.js';
import * as mediasoupClient from 'mediasoup-client';

let device = null;
let recvTransport = null;
let currentRoomId = '';
let currentName = '';
let consumedProducerIds = new Set();
let pollInterval = null;
let streams = {};

function setStatus(state, text) {
  const bar = document.getElementById('statusBar');
  const dot = bar.querySelector('.dot');
  const label = document.getElementById('statusText');
  bar.className = `status ${state}`;
  dot.className = `dot ${state}`;
  label.textContent = text;
}

function toggleRemoteAudio(studentName) {
  const tile = document.getElementById(`tile-${studentName}`);
  if (!tile) return;
  const btn = tile.querySelector('.mute-btn');
  const video = tile.querySelector('video');
  const stream = video?.srcObject;
  if (!stream) return;
  const track = stream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  btn.className = `mute-btn${track.enabled ? '' : ' muted'}`;
  btn.textContent = track.enabled ? '🔊' : '🔇';
}

function addVideoTile(studentName, stream) {
  const grid = document.getElementById('videoGrid');

  let tile = document.getElementById(`tile-${studentName}`);
  if (!tile) {
    tile = document.createElement('div');
    tile.id = `tile-${studentName}`;
    tile.className = 'video-tile';

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;

    const label = document.createElement('div');
    label.className = 'label';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = studentName;

    const muteBtn = document.createElement('button');
    muteBtn.className = 'mute-btn';
    muteBtn.textContent = '🔊';
    muteBtn.onclick = () => toggleRemoteAudio(studentName);

    label.appendChild(nameSpan);
    label.appendChild(muteBtn);

    tile.appendChild(video);
    tile.appendChild(label);
    grid.appendChild(tile);
  }

  const video = tile.querySelector('video');
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
}

async function consumeProducer(producer) {
  if (consumedProducerIds.has(producer.id)) return;
  consumedProducerIds.add(producer.id);

  setStatus('connecting', `Consuming ${producer.kind} from ${producer.studentName}...`);

  const consumerData = await apiCall('POST', '/api/staff/consume', {
    transportId: recvTransport.id,
    producerId: producer.id,
    rtpCapabilities: device.rtpCapabilities,
  });

  const consumer = await recvTransport.consume({
    id: consumerData.id,
    producerId: consumerData.producerId,
    kind: consumerData.kind,
    rtpParameters: consumerData.rtpParameters,
  });

  console.log(`consumed ${consumer.kind} from ${producer.studentName}`);

  if (!streams[producer.studentName]) {
    streams[producer.studentName] = new MediaStream();
  }
  streams[producer.studentName].addTrack(consumer.track);
  addVideoTile(producer.studentName, streams[producer.studentName]);
}

async function pollNewProducers() {
  if (!recvTransport || !currentRoomId) return;

  const producers = await apiCall('GET', `/api/staff/room/${currentRoomId}/producers`);

  for (const producer of producers) {
    await consumeProducer(producer);
  }
}

async function onRefresh() {
  const rooms = await apiCall('GET', '/api/rooms');
  const list = document.getElementById('roomList');

  if (!rooms.length) {
    list.innerHTML = '<li class="empty">No rooms yet.</li>';
    return;
  }

  list.innerHTML = rooms
    .map(
      r => `
    <li>
      <span>${r.id}</span>
      <span class="info">
        <span>👤 ${r.students}</span>
        <span>⭐ ${r.staff}</span>
      </span>
      <button class="small" onclick="onJoinRoom('${r.id}')">Join</button>
    </li>`
    )
    .join('');
}

async function onJoinRoom(roomId) {
  const name = document.getElementById('name').value.trim();
  if (!name) {
    alert('Enter your name first');
    return;
  }

  if (pollInterval) clearInterval(pollInterval);
  currentName = name;
  currentRoomId = roomId;

  const result = await apiCall('POST', '/api/staff/join', { name, roomId });
  console.log('staff join payload:', JSON.stringify(result, null, 2));

  document.getElementById('joinCard').classList.add('hidden');
  document.getElementById('activeCard').classList.remove('hidden');
  document.getElementById('roomInfo').textContent = `Room: ${result.roomId} | Staff: ${result.name}`;

  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: result.routerRtpCapabilities });

  recvTransport = device.createRecvTransport({
    ...result.transport,
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  recvTransport.on('connectionstatechange', state => {
    console.log('recv transport state:', state);
    switch (state) {
      case 'connecting':
        setStatus('connecting', 'Connecting...');
        break;
      case 'connected':
        setStatus('connected', 'Monitoring Active');
        break;
      case 'failed':
        setStatus('failed', 'Connection Failed');
        break;
      case 'disconnected':
        setStatus('connecting', 'Disconnected — reconnecting...');
        break;
    }
  });

  recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
    apiCall('POST', '/api/staff/connect-transport', {
      transportId: recvTransport.id,
      dtlsParameters,
    }).then(callback).catch(errback);
  });

  consumedProducerIds.clear();
  streams = {};

  setStatus('connecting', 'Fetching producers...');

  const producers = await apiCall('GET', `/api/staff/room/${roomId}/producers`);
  console.log('room producers:', producers);

  for (const producer of producers) {
    await consumeProducer(producer);
  }

  pollInterval = setInterval(pollNewProducers, 3000);
  setStatus('connected', 'Monitoring Active');
}

window.onRefresh = onRefresh;
window.onJoinRoom = onJoinRoom;

onRefresh();
