import { vi } from 'vitest';

// Mock Firebase module to avoid HTTPS URL loading errors in Node environment
vi.mock('./public/js/config/firebase-config.js', () => ({
  rtdb: {},
  ref: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  push: vi.fn(),
  remove: vi.fn(),
  query: vi.fn(),
  orderByChild: vi.fn(),
  limitToLast: vi.fn(),
  auth: {},
  db: {},
  functions: {},
  app: {},
  httpsCallable: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  getStorage: vi.fn(),
  storageRef: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn()
}));
