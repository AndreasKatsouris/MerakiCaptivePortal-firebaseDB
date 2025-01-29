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
        format: 'iife',  // Use IIFE for better compatibility
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Global variable name for your campaign manager
        name: 'CampaignManager',
        // Make Vue available globally
        globals: {
          vue: 'Vue'
        }
      }
    },
    // Generate sourcemaps for debugging
    sourcemap: true
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'campaigns'),
      'vue': 'vue/dist/vue.esm-bundler.js'
    }
  },

  optimizeDeps: {
    include: ['firebase/app', 'firebase/database', 'firebase/auth']
  }
})