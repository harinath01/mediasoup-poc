export async function apiCall(method, path, body) {
  const opts = { method };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  return res.json();
}

export function sendJsonBeacon(path, body) {
  const payload = new Blob([JSON.stringify(body)], { type: 'application/json' });
  return navigator.sendBeacon(path, payload);
}
