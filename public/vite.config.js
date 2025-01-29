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
        format: 'iife',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Make sure external dependencies are handled properly
        globals: {
          vue: 'Vue',
          firebase: 'firebase'
        }
      }
    },
    // Don't minimize for easier debugging during development
    minify: false,
    sourcemap: true
  }
})