const admin = require('firebase-admin');

// Firebase configuration
const firebaseConfig = {
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    storageBucket: "merakicaptiveportal-firebasedb.appspot.com",
    projectId: "merakicaptiveportal-firebasedb"
};

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp(firebaseConfig);
}

// Get service instances
const auth = admin.auth();
const db = admin.firestore();
const rtdb = admin.database();
const storage = admin.storage();
const bucket = storage.bucket();

// Database functions
const ref = (path) => {
    // Ensure path is a string and handle empty/root path
    const pathString = path ? String(path) : '/';
    // Remove leading/trailing slashes for consistency
    const cleanPath = pathString.replace(/^\/+|\/+$/g, '');
    return rtdb.ref(cleanPath);
};
const get = async (ref) => await ref.once('value');
const set = async (ref, data) => await ref.set(data);
const update = async (ref, data) => await ref.update(data);
const push = (ref) => rtdb.ref(ref).push();
const remove = async (ref) => await ref.remove();

// Storage functions
const uploadFile = async (path, file) => {
    const fileRef = bucket.file(path);
    await fileRef.save(file);
    return await fileRef.getSignedUrl({
        action: 'read',
        expires: '03-01-2500'
    });
};

// Export all instances and functions
module.exports = {
    admin,
    auth,
    db,
    rtdb,
    storage,
    bucket,
    // Database operations
    ref,
    get,
    set,
    update,
    push,
    remove,
    // Storage operations
    uploadFile
};
