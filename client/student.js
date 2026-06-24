import { apiCall } from './api.js';
import * as mediasoupClient from 'mediasoup-client';

let sendTransport = null;

function setStatus(state, text) {
  const bar = document.getElementById('statusBar');
  const dot = bar.querySelector('.dot');
  const label = document.getElementById('statusText');

  bar.className = `status ${state}`;
  dot.className = `dot ${state}`;
  label.textContent = text;
}

async function onJoin() {
  const name = document.getElementById('name').value.trim();
  const roomId = document.getElementById('roomId').value.trim();

  if (!name || !roomId) {
    alert('Name and Room ID are required');
    return;
  }

  const result = await apiCall('POST', '/api/students/join', { name, roomId });
  console.log('student join payload:', JSON.stringify(result, null, 2));

  document.getElementById('joinCard').classList.add('hidden');
  document.getElementById('activeCard').classList.remove('hidden');
  document.getElementById('roomInfo').textContent = `Room: ${result.roomId} | Name: ${result.name}`;

  const device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: result.routerRtpCapabilities });

  sendTransport = device.createSendTransport({
    ...result.transport,
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  sendTransport.on('connectionstatechange', state => {
    console.log('transport connection state:', state);
    switch (state) {
      case 'connecting':
        setStatus('connecting', 'Connecting...');
        break;
      case 'connected':
        setStatus('connected', 'Proctoring Active');
        break;
      case 'failed':
        setStatus('failed', 'Connection Failed');
        break;
      case 'disconnected':
        setStatus('connecting', 'Disconnected — reconnecting...');
        break;
    }
  });

  sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
    apiCall('POST', '/api/students/connect-transport', {
      transportId: sendTransport.id,
      dtlsParameters,
    }).then(callback).catch(errback);
  });

  sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
    try {
      const { id } = await apiCall('POST', '/api/students/produce', {
        transportId: sendTransport.id,
        kind,
        rtpParameters,
      });
      callback({ id });
    } catch (err) {
      errback(err);
    }
  });

  sendTransport.on('iceStateChange', state => {
    console.log('transport ICE state:', state);
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: { width: { ideal: 640 }, height: { ideal: 480 } },
  });
  document.getElementById('localVideo').srcObject = stream;

  setStatus('connecting', 'Publishing media...');

  for (const track of stream.getTracks()) {
    await sendTransport.produce({ track });
    console.log(`produced ${track.kind} track`);
  }
}

window.onJoin = onJoin;
