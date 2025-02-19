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
    if (path === undefined || path === null) {
        throw new Error('Path cannot be null or undefined');
    }

    // Convert to string and clean
    const pathString = String(path).trim();
    if (!pathString) {
        throw new Error('Path cannot be empty');
    }

    // Remove leading/trailing slashes and spaces
    const cleanPath = pathString.replace(/^[/\s]+|[/\s]+$/g, '');
    
    // Validate path segments
    const segments = cleanPath.split('/');
    const validSegments = segments.map(segment => {
        // Remove invalid characters
        return segment.replace(/[.#$\[\]]/g, '_');
    });

    // Join segments back together
    const finalPath = validSegments.join('/');
    
    console.log('Database path:', finalPath);
    return rtdb.ref(finalPath);
};

const get = async (ref) => await ref.once('value');
const set = async (ref, data) => await ref.set(data);
const update = async (ref, data) => await ref.update(data);

const push = (path) => {
    if (path === undefined || path === null) {
        throw new Error('Path cannot be null or undefined');
    }

    // Convert to string and clean
    const pathString = String(path).trim();
    if (!pathString) {
        throw new Error('Path cannot be empty');
    }

    // Remove leading/trailing slashes and spaces
    const cleanPath = pathString.replace(/^[/\s]+|[/\s]+$/g, '');
    
    // Validate path segments
    const segments = cleanPath.split('/');
    const validSegments = segments.map(segment => {
        // Remove invalid characters
        return segment.replace(/[.#$\[\]]/g, '_');
    });

    // Join segments back together
    const finalPath = validSegments.join('/');
    
    console.log('Push path:', finalPath);
    return rtdb.ref(finalPath).push();
};

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
