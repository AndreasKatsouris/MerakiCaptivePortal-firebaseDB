/**
 * Food Cost Module - Firebase Helpers
 * Handles Firebase initialization and database access for the Food Cost module
 * Following the project's established Firebase Realtime Database Operations pattern
 */

// Local Firebase references to avoid global conflicts
let _rtdb, _auth, _ref, _get, _set, _update, _push, _remove, _query, _orderByChild, _startAt, _endAt;

/**
 * Ensures Firebase is initialized for the Food Cost module
 * @returns {Promise<boolean>} - True if Firebase is successfully initialized
 */
export async function ensureFirebaseInitialized() {
    // If Firebase is already initialized, return true
    if (_rtdb && _ref && _get && _set) {
        return true;
    }
    
    console.log('Attempting to initialize Firebase for Food Cost module...');
    
    // CRITICAL FIX: Wait for Firebase config to be loaded if not yet available
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
        try {
            // RACE CONDITION FIX: Wait for firebaseReady event if needed
            if (!window.firebaseExports) {
                console.log('Waiting for Firebase config to load...');
                await new Promise((resolve) => {
                    if (window.firebaseExports) {
                        resolve();
                    } else {
                        const handleFirebaseReady = () => {
                            document.removeEventListener('firebaseReady', handleFirebaseReady);
                            resolve();
                        };
                        document.addEventListener('firebaseReady', handleFirebaseReady);
                        // Fallback timeout
                        setTimeout(resolve, 1000);
                    }
                });
            }
            
            // Try to get Firebase from global exports - PRIMARY METHOD
            // This follows the project standard of importing from firebase-config.js
            if (window.firebaseExports) {
                console.log('Found window.firebaseExports, using it for Firebase initialization');
                _rtdb = window.firebaseExports.rtdb;
                _auth = window.firebaseExports.auth;
                _ref = window.firebaseExports.ref;
                _get = window.firebaseExports.get;
                _set = window.firebaseExports.set;
                _update = window.firebaseExports.update;
                _push = window.firebaseExports.push;
                _remove = window.firebaseExports.remove;
                _query = window.firebaseExports.query;
                _orderByChild = window.firebaseExports.orderByChild;
                _startAt = window.firebaseExports.startAt;
                _endAt = window.firebaseExports.endAt;
                
                // Verify initialization was successful
                if (_rtdb && _ref && _get && _set) {
                    console.log('✅ Firebase initialized successfully for Food Cost module');
                    return true;
                }
            }
            
            // If still not available, wait a bit and try again
            if (attempts < maxAttempts - 1) {
                console.log(`Firebase not ready, waiting... (attempt ${attempts + 1}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        } catch (error) {
            console.error('Error initializing Firebase:', error);
        }
        attempts++;
    }
    
    // Another fallback: try to get directly from window object
    if (!_rtdb && window.rtdb) _rtdb = window.rtdb;
    if (!_auth && window.auth) _auth = window.auth;
    if (!_ref && window.ref) _ref = window.ref;
    if (!_get && window.get) _get = window.get;
    if (!_set && window.set) _set = window.set;
    if (!_update && window.update) _update = window.update;
    if (!_push && window.push) _push = window.push;
    if (!_remove && window.remove) _remove = window.remove;
    if (!_query && window.query) _query = window.query;
    if (!_orderByChild && window.orderByChild) _orderByChild = window.orderByChild;
    if (!_startAt && window.startAt) _startAt = window.startAt;
    if (!_endAt && window.endAt) _endAt = window.endAt;
    
    // Verify if all essential Firebase functions are available
    if (_rtdb && _ref && _get && _set) {
        console.log('✅ Firebase initialized successfully for Food Cost module');
        return true;
    } else {
        console.error('❌ Failed to initialize Firebase for Food Cost module after', maxAttempts, 'attempts');
        console.error('Available Firebase functions:', {
            rtdb: !!_rtdb,
            ref: !!_ref,
            get: !!_get,
            set: !!_set,
            auth: !!_auth
        });
        return false;
    }
}

/**
 * Initialize Firebase references
 */
export async function initFirebaseReferences() {
    await ensureFirebaseInitialized();
}

/**
 * Get the database instance
 * @returns {Promise<object>} - The Firebase Realtime Database instance
 */
export async function getDatabase() {
    // Make sure Firebase is initialized
    await ensureFirebaseInitialized();
    // Return the database instance
    return _rtdb;
}

/**
 * Get a reference to a specific path in the database
 * @param {string} path - The path to reference
 * @returns {Promise<object>} - The Firebase reference
 */
export async function getRef(path) {
    // Make sure Firebase is initialized
    await ensureFirebaseInitialized();
    
    // Check if path is a valid string
    if (typeof path !== 'string') {
        console.error('getRef error: Path must be a string', path);
        const db = await getDatabase();
        return _ref(db, ''); // Return a reference to the root as a fallback
    }
    
    // Return a reference to the specified path
    const db = await getDatabase();
    return _ref(db, path);
}

/**
 * Get data from a reference or path
 * @param {object|string} refOrPath - The reference or path to get data from
 * @returns {Promise} - Promise resolving to the data
 */
export async function getData(refOrPath) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _get(refOrPath);
    }
    // Otherwise, treat it as a path string and get a reference
    const ref = await getRef(refOrPath);
    return _get(ref);
}

/**
 * Set data at a reference or path
 * @param {object|string} refOrPath - The reference or path to set data at
 * @param {any} data - The data to set
 * @returns {Promise} - Promise resolving when the data is set
 */
export async function setData(refOrPath, data) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _set(refOrPath, data);
    }
    // Otherwise, treat it as a path string and get a reference
    const ref = await getRef(refOrPath);
    return _set(ref, data);
}

/**
 * Update data at a reference or path
 * @param {object|string} refOrPath - The reference or path to update data at
 * @param {any} data - The data to update
 * @returns {Promise} - Promise resolving when the data is updated
 */
export async function updateData(refOrPath, data) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _update(refOrPath, data);
    }
    // Otherwise, treat it as a path string and get a reference
    const ref = await getRef(refOrPath);
    return _update(ref, data);
}

/**
 * Push data to a reference or path
 * @param {object|string} refOrPath - The reference or path to push data to
 * @param {any} data - The data to push
 * @returns {Promise} - Promise resolving with the new reference
 */
export async function pushData(refOrPath, data) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _push(refOrPath, data);
    }
    // Otherwise, treat it as a path string and get a reference
    const ref = await getRef(refOrPath);
    return _push(ref, data);
}

/**
 * Remove data at a reference or path
 * @param {object|string} refOrPath - The reference or path to remove data from
 * @returns {Promise} - Promise resolving when the data is removed
 */
export async function removeData(refOrPath) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _remove(refOrPath);
    }
    // Otherwise, treat it as a path string and get a reference
    const ref = await getRef(refOrPath);
    return _remove(ref);
}

/**
 * Export Firebase services
 * These are exposed as getters to ensure they're always initialized
 */
export function getRtdb() {
    ensureFirebaseInitialized();
    return _rtdb;
}

export function getAuth() {
    ensureFirebaseInitialized();
    return _auth;
}

// Export as constants for backward compatibility
export const rtdb = getRtdb();
export const auth = getAuth();

// Also export the Firebase functions directly for convenience
export { _ref as ref, _get as get, _set as set, _update as update, _push as push, _remove as remove, _query as query, _orderByChild as orderByChild, _startAt as startAt, _endAt as endAt };
