import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/examples/showcase/',
  server: {
    port: 5000,
    host: true,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@strata': resolve(__dirname, '../../..', 'src'),
    },
  },
});
