/**
 * Vitest global setup — runs once before any test files are loaded.
 * Initializes a minimal Firebase Admin app so that functions/ross.js can
 * call admin.database() at module load time without throwing.
 */
import admin from 'firebase-admin';

export async function setup() {
    // Only init if no app exists yet
    if (!admin.apps || admin.apps.length === 0) {
        admin.initializeApp({
            databaseURL: 'https://test-project-default-rtdb.firebaseio.com',
            projectId: 'test-project',
        });
    }
}

export async function teardown() {
    // Clean up all Firebase apps
    await Promise.all((admin.apps || []).map(app => app.delete()));
}
