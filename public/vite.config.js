import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [],

  root: 'PUBLIC',

  resolve: {
    alias: {
      '@': resolve(__dirname, 'PUBLIC'),
      '@/components': resolve(__dirname, 'PUBLIC/components'),
      '@/js': resolve(__dirname, 'PUBLIC/js')
    }
  },



  build: {
    outDir: '../dist',
    rollupOptions: {
      input: {
        campaigns: resolve(__dirname, 'PUBLIC/campaigns/campaigns.js'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },
    // Don't minimize for easier debugging during development
    minify: false,
    sourcemap: true
  },

  server: {
    port: 3000,
    open: '/user-dashboard.html'
  },

  // Enable development optimizations
  optimizeDeps: {
    include: []
  }
})