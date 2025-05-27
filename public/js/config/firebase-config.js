// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';
import { getDatabase, ref, push, set, get, update, remove, query, onValue, serverTimestamp, orderByChild, orderByKey, orderByValue, limitToFirst, limitToLast, startAt, endAt, equalTo } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
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
const functions = getFunctions(app);
functions.region = 'us-central1'; // Set the region for Firebase Functions
const rtdb = getDatabase(app);

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
    ref,
    push,
    set,
    get,
    update,
    remove,
    query,
    onValue,
    orderByChild,
    orderByKey,
    orderByValue,
    limitToFirst,
    limitToLast,
    startAt,
    endAt,
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
    orderByChild,
    orderByKey,
    orderByValue,
    limitToFirst,
    limitToLast,
    startAt,
    endAt,
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