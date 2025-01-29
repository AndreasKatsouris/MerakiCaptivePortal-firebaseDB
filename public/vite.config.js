import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  
  build: {
    outDir: 'public/js/dist',
    rollupOptions: {
      input: {
        campaigns: resolve(__dirname, 'campaigns/campaigns.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]'
      }
    }
  },

  server: {
    port: 3000,
    open: true
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'campaigns'),
      'vue': 'vue/dist/vue.esm-bundler.js'
    }
  },

  // Add this to handle Firebase and other external dependencies
  optimizeDeps: {
    include: ['firebase/app', 'firebase/database', 'firebase/auth']
  }
})