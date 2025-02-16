// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.x.x/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/9.x.x/firebase-auth.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/9.x.x/firebase-functions.js';

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
const functions = getFunctions(app);

// Export Firebase instances and auth methods
export {
    auth,
    functions,
    signInWithEmailAndPassword,
    signOut
}; 