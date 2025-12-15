import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  
  root: 'PUBLIC',
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'PUBLIC'),
      '@/components': resolve(__dirname, 'PUBLIC/components'),
      '@/js': resolve(__dirname, 'PUBLIC/js')
    }
  },
  
  css: {
    postcss: {
      config: './postcss-v2.config.js'
    }
  },
  
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: {
        campaigns: resolve(__dirname, 'PUBLIC/campaigns/campaigns.js'),
        'user-dashboard-v2': resolve(__dirname, 'PUBLIC/js/user-dashboard-v2.js'),
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
    open: '/user-dashboard-v2.html'
  },
  
  // Enable development optimizations
  optimizeDeps: {
    include: ['vue', '@vueuse/core', 'clsx', 'tailwind-merge']
  }
})