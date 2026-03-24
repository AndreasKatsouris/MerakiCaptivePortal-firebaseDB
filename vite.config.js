import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  root: 'public',
  publicDir: false,
  plugins: [vue()],
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        'user-dashboard': resolve(__dirname, 'public/user-dashboard.html')
      }
    }
  },
  server: {
    port: 5173,
    open: false,
    cors: true
  }
});
