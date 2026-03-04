// firebase-init-check.js
window.addEventListener('load', () => {
    // Check Firebase initialization
    if (!firebase.app()) {
        console.error('Firebase not initialized!');
        return;
    }

    // Check Functions initialization
    try {
        const functions = firebase.functions();
        console.log('Functions initialized:', functions);
    } catch (e) {
        console.error('Functions not initialized:', e);
    }

    // Check Auth initialization
    try {
        const auth = firebase.auth();
        console.log('Auth initialized:', auth);
    } catch (e) {
        console.error('Auth not initialized:', e);
    }
});