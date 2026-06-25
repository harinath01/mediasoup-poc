import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    allowedHosts: ['liveproctoring.tpsentinel.com'],
    proxy: {
      '/api/': 'http://localhost:3001',
    },
  },
});
