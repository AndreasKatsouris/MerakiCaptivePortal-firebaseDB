import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],

  // Vue components under public/ import the Hi-Fi barrel by the ABSOLUTE path the
  // browser uses (`/js/design-system/hifi/index.js`). Vite refuses to resolve
  // that in a test context because the file lives under publicDir, so any
  // component test failed at transform time before a single assertion ran —
  // which is a large part of why this repo has no component tests.
  //
  // Mapping `/js/` the way the browser maps it lets tests exercise the REAL
  // components rather than stubs. `publicDir: false` applies to this test config
  // only; the build still treats public/ normally (scripts/build.js copies it,
  // vite.config.js is separate).
  publicDir: false,
  resolve: {
    alias: [
      { find: /^\/js\//, replacement: `${path.resolve(rootDir, 'public/js')}/` },
    ],
  },

  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.js']
  }
});
