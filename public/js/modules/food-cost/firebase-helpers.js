/**
 * Food Cost Module - Firebase Helpers
 * Handles Firebase initialization and database access for the Food Cost module
 * Following the project's established Firebase Realtime Database Operations pattern
 */

// Local Firebase references to avoid global conflicts
let _rtdb, _auth, _ref, _get, _set, _update, _push, _remove;

/**
 * Ensures Firebase is initialized for the Food Cost module
 * @returns {boolean} - True if Firebase is successfully initialized
 */
export function ensureFirebaseInitialized() {
    // If Firebase is already initialized, return true
    if (_rtdb && _ref && _get && _set) {
        return true;
    }
    
    console.log('Attempting to initialize Firebase for Food Cost module...');
    
    try {
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
            
            // Verify initialization was successful
            if (_rtdb && _ref && _get && _set) {
                console.log('Firebase initialized successfully from firebaseExports');
                return true;
            }
        }
    } catch (error) {
        console.error('Error initializing Firebase:', error);
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
    
    // Verify if all essential Firebase functions are available
    if (_rtdb && _ref && _get && _set) {
        console.log('Firebase initialized successfully for Food Cost module');
        return true;
    } else {
        console.error('Failed to initialize Firebase for Food Cost module');
        return false;
    }
}

/**
 * Initialize Firebase references
 */
export function initFirebaseReferences() {
    ensureFirebaseInitialized();
}

/**
 * Get the database instance
 * @returns {object} - The Firebase Realtime Database instance
 */
export function getDatabase() {
    // Make sure Firebase is initialized
    ensureFirebaseInitialized();
    // Return the database instance
    return _rtdb;
}

/**
 * Get a reference to a specific path in the database
 * @param {string} path - The path to reference
 * @returns {object} - The Firebase reference
 */
export function getRef(path) {
    // Make sure Firebase is initialized
    ensureFirebaseInitialized();
    
    // Check if path is a valid string
    if (typeof path !== 'string') {
        console.error('getRef error: Path must be a string', path);
        return _ref(getDatabase(), ''); // Return a reference to the root as a fallback
    }
    
    // Return a reference to the specified path
    return _ref(getDatabase(), path);
}

/**
 * Get data from a reference or path
 * @param {object|string} refOrPath - The reference or path to get data from
 * @returns {Promise} - Promise resolving to the data
 */
export function getData(refOrPath) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _get(refOrPath);
    }
    // Otherwise, treat it as a path string and get a reference
    return _get(getRef(refOrPath));
}

/**
 * Set data at a reference or path
 * @param {object|string} refOrPath - The reference or path to set data at
 * @param {any} data - The data to set
 * @returns {Promise} - Promise resolving when the data is set
 */
export function setData(refOrPath, data) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _set(refOrPath, data);
    }
    // Otherwise, treat it as a path string and get a reference
    return _set(getRef(refOrPath), data);
}

/**
 * Update data at a reference or path
 * @param {object|string} refOrPath - The reference or path to update data at
 * @param {any} data - The data to update
 * @returns {Promise} - Promise resolving when the data is updated
 */
export function updateData(refOrPath, data) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _update(refOrPath, data);
    }
    // Otherwise, treat it as a path string and get a reference
    return _update(getRef(refOrPath), data);
}

/**
 * Push data to a reference or path
 * @param {object|string} refOrPath - The reference or path to push data to
 * @param {any} data - The data to push
 * @returns {Promise} - Promise resolving with the new reference
 */
export function pushData(refOrPath, data) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _push(refOrPath, data);
    }
    // Otherwise, treat it as a path string and get a reference
    return _push(getRef(refOrPath), data);
}

/**
 * Remove data at a reference or path
 * @param {object|string} refOrPath - The reference or path to remove data from
 * @returns {Promise} - Promise resolving when the data is removed
 */
export function removeData(refOrPath) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _remove(refOrPath);
    }
    // Otherwise, treat it as a path string and get a reference
    return _remove(getRef(refOrPath));
}

// Export Firebase functions for use in the Food Cost module
export { _rtdb as rtdb, _auth as auth, _ref as ref, _get as get, _set as set, _update as update, _push as push, _remove as remove };
