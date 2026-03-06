import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('./src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
    define: {
      __BUILD_DATE__: JSON.stringify(buildDate),
    },
  },
});
