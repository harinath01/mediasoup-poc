import { apiCall } from './api.js';

async function onJoin() {
  const name = document.getElementById('name').value.trim();
  const roomId = document.getElementById('roomId').value.trim();

  if (!name || !roomId) {
    alert('Name and Room ID are required');
    return;
  }

  const result = await apiCall('POST', '/api/students/join', { name, roomId });
  console.log('student join payload:', JSON.stringify(result, null, 2));
}

window.onJoin = onJoin;
