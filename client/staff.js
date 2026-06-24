import { apiCall } from './api.js';

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
    </li>`
    )
    .join('');
}

async function onJoin() {
  const name = document.getElementById('name').value.trim();
  const roomId = document.getElementById('roomId').value.trim();

  if (!name || !roomId) {
    alert('Name and Room ID are required');
    return;
  }

  const result = await apiCall('POST', '/api/staff/join', { name, roomId });
  console.log('staff join result:', result);
}

window.onRefresh = onRefresh;
window.onJoin = onJoin;

onRefresh();
