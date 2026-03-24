/**
 * Build script for Firebase Hosting deployment
 *
 * 1. Copies all files from public/ to dist/ (raw deploy for non-Vue pages)
 * 2. Runs Vite build to compile Vue SFC pages (overwrites compiled versions in dist/)
 */

import { execSync } from 'child_process'
import { cpSync, rmSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const publicDir = resolve(root, 'public')
const distDir = resolve(root, 'dist')

console.log('[build] Step 1: Copying public/ to dist/...')
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true })
}
cpSync(publicDir, distDir, { recursive: true })
console.log('[build] Step 1 complete.')

console.log('[build] Step 2: Running Vite build (compiles Vue SFC pages)...')
execSync('npx vite build', { cwd: root, stdio: 'inherit' })
console.log('[build] Step 2 complete.')

console.log('[build] Done! Deploy dist/ to Firebase Hosting.')
