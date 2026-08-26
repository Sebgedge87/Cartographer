import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // relative base so the same build works in a Tauri/Electron shell
  base: './',
  server: { port: 5173 },
});
