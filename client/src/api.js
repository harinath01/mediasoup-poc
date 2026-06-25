export async function apiCall(method, path, body) {
  const opts = { method };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(path, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || 'Request failed');
  }

  return data;
}

export function sendJsonBeacon(path, body) {
  const payload = new Blob([JSON.stringify(body)], { type: 'application/json' });
  return navigator.sendBeacon(path, payload);
}
