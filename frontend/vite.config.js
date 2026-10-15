import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// In dev, forward /api calls to the Express server so the browser sees ONE origin.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
