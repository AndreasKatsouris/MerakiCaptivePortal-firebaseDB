import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        main: 'admin-dashboard.html',
        campaigns: 'campaigns.js'
      }
    }
  }
})