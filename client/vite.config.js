import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the client proxies /api to the Express server so there is no
// CORS setup to remember. In production set VITE_API_URL to the deployed API.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_PROXY || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
