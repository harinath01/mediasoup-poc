import { defineConfig } from 'vite';

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001';
const allowedHosts = process.env.VITE_ALLOWED_HOSTS
  ? process.env.VITE_ALLOWED_HOSTS.split(',').map(host => host.trim()).filter(Boolean)
  : true;

export default defineConfig({
  server: {
    port: 5173,
    allowedHosts,
    proxy: {
      '/api/': apiTarget,
      '/socket.io': {
        target: apiTarget,
        ws: true,
      },
    },
  },
});
