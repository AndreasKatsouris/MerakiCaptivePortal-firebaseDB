import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  
  // Specify build output directory
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'admin-dashboard.html'),
      }
    }
  },

  // Configure server
  server: {
    port: 3000,
    open: '/admin-dashboard.html'
  },

  // Configure module resolution
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      'vue': 'vue/dist/vue.esm-bundler.js'
    }
  }
})