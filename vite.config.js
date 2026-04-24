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
        'user-dashboard':           resolve(__dirname, 'public/user-dashboard.html'),
        'hifi-components':          resolve(__dirname, 'public/hifi/components.html'),
        'ross':                     resolve(__dirname, 'public/ross.html'),
        'onboarding-ross-hello':    resolve(__dirname, 'public/onboarding-ross-hello.html'),
        'group-overview-v2':        resolve(__dirname, 'public/group-overview-v2.html'),
        'food-cost-v2':             resolve(__dirname, 'public/food-cost-v2.html'),
        'guests-v2':                resolve(__dirname, 'public/guests-v2.html'),
        'queue-v2':                 resolve(__dirname, 'public/queue-v2.html'),
        'analytics-v2':             resolve(__dirname, 'public/analytics-v2.html'),
        'campaigns-v2':             resolve(__dirname, 'public/campaigns-v2.html'),
        'receipts-v2':              resolve(__dirname, 'public/receipts-v2.html'),
        'index-v2':                 resolve(__dirname, 'public/index-v2.html')
      }
    }
  },
  server: {
    port: 5173,
    open: false,
    cors: true
  }
});
