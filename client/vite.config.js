import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    port: 5173,
    proxy: {
      '/api/': 'http://localhost:3001',
    },
  },
});
