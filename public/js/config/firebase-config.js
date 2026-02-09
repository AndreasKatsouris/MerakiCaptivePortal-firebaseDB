// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';
import { getDatabase, ref, push, set, get, update, remove, query, onValue, off, serverTimestamp, orderByChild, orderByKey, orderByValue, limitToFirst, limitToLast, startAt, startAfter, endAt, endBefore, equalTo, connectDatabaseEmulator } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBf96GNLhtz6FDdbLxIW9efh98WG__eQmk",
    authDomain: "merakicaptiveportal-firebasedb.firebaseapp.com",
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    projectId: "merakicaptiveportal-firebasedb",
    storageBucket: "merakicaptiveportal-firebasedb.appspot.com",
    messagingSenderId: "899985637961",
    appId: "1:899985637961:web:9c00572c7fec3a671e3598",
    measurementId: "G-476KXB93TV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'us-central1'); // Properly set the region during initialization
const rtdb = getDatabase(app);

// Connect to emulators if running on localhost
// TEMPORARILY DISABLED for Feature #83/#84 testing - emulators not running
if (false && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    try {
        connectDatabaseEmulator(rtdb, 'localhost', 9000);
        connectAuthEmulator(auth, 'http://localhost:9099');
        connectFirestoreEmulator(db, 'localhost', 8080);
        connectFunctionsEmulator(functions, 'localhost', 5001);
        console.log('✅ Connected to Firebase emulators');
    } catch (error) {
        console.warn('⚠️ Could not connect to emulators:', error.message);
    }
}

// Export Firebase instances and auth methods
export {
    app,
    auth,
    db,
    functions,
    httpsCallable,
    rtdb,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    ref,
    push,
    set,
    get,
    update,
    remove,
    query,
    onValue,
    off,
    orderByChild,
    orderByKey,
    orderByValue,
    limitToFirst,
    limitToLast,
    startAt,
    startAfter,
    endAt,
    endBefore,
    equalTo,
    serverTimestamp
};

// Export all the Firebase instances and methods to the window object
// This ensures that non-module scripts can access Firebase functions
window.firebaseExports = {
    rtdb,
    auth,
    db,
    functions,
    ref,
    get,
    set,
    update,
    push,
    remove,
    query,
    onValue,
    off,
    onAuthStateChanged,
    orderByChild,
    orderByKey,
    orderByValue,
    limitToFirst,
    limitToLast,
    startAt,
    startAfter,
    endAt,
    endBefore,
    equalTo,
    serverTimestamp
};

// Also provide an initialization function that can be called to get these exports
window.initializeFirebase = function() {
    return window.firebaseExports;
};

// Dispatch an event to signal Firebase is ready - for scripts that load before this one
document.dispatchEvent(new Event('firebaseReady'));
console.log('Firebase config loaded and ready for use');