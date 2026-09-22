import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // The site is a handful of pages; one chunk loads faster than four.
    chunkSizeWarningLimit: 600
  },
  server: {
    port: 5180
  }
});
