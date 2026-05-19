'use strict';
// Manual mock for firebase-admin — used by vitest unit tests that import functions/ross.js
// Prevents "default Firebase app does not exist" errors at module load time.

const mockRef = {
    push: () => ({ key: 'mock-push-key' }),
    once: () => Promise.resolve({ val: () => null }),
    set: () => Promise.resolve(),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
};

const mockDb = {
    ref: () => mockRef,
};

const mockAuth = {
    verifyIdToken: () => Promise.resolve({ uid: 'mock-uid' }),
};

const admin = {
    database: () => mockDb,
    auth: () => mockAuth,
    initializeApp: () => {},
    credential: { cert: () => ({}) },
};

module.exports = admin;
