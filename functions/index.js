const { onRequest } = require('firebase-functions/v2/https');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const { receiveWhatsAppMessage } = require('./receiveWhatsappMessage');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}
exports.receiveWhatsAppMessage = onRequest(receiveWhatsAppMessage);

/**
 * Cloud Function to handle Meraki Webhook
 */
exports.merakiWebhook = onRequest((req, res) => {
    if (req.method === 'GET') {
        const validator = "371de0de57b8741627daa5e30f25beb917614141"; // Replace with your validator string
        console.log("Meraki validator string requested.");
        return res.status(200).send(validator);
    }

    console.log('Received POST request from Meraki Scanning API.');

    const sharedSecret = 'Giulietta!16'; // Replace with your shared secret

    if (req.body.secret !== sharedSecret) {
        console.error('Invalid secret received. Unauthorized access attempt.');
        return res.status(403).send('Unauthorized');
    }

    const data = req.body;
    console.log('Verified secret. Data received:', JSON.stringify(data, null, 2));

    const ref = admin.database().ref('scanningData').push();
    ref.set(data)
        .then(() => {
            console.log('Data successfully stored in Firebase.');
            return res.status(200).send('Data received and stored.');
        })
        .catch((error) => {
            console.error('Error storing data:', error);
            return res.status(500).send('Error storing data.');
        });
});

exports.getGoogleConfig = onRequest(async (req, res) => {
    res.json({
        apiKey: functions.config.google.places_api_key,
        placeId: functions.config.google.place_id
    });
});

/**
 * Cloud Function to set admin claims for a user
 * Requires the caller to be an admin themselves
 */
exports.setAdminClaim = onRequest(async (req, res) => {
    console.log('[setAdminClaim] Received request:', {
        method: req.method,
        headers: req.headers,
        origin: req.headers.origin || 'No origin'
    });

    // Verify the request method
    if (req.method !== 'POST') {
        console.error('[setAdminClaim] Invalid method:', req.method);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Verify that the request has a valid Firebase ID token
        const idToken = req.headers.authorization?.split('Bearer ')[1];
        console.log('[setAdminClaim] Auth header present:', !!idToken);
        
        if (!idToken) {
            console.error('[setAdminClaim] No token provided');
            return res.status(401).json({ error: 'Unauthorized - No token provided' });
        }

        // Verify the token and get the caller's claims
        console.log('[setAdminClaim] Verifying caller token');
        const callerToken = await admin.auth().verifyIdToken(idToken);
        console.log('[setAdminClaim] Caller token verified:', {
            uid: callerToken.uid,
            claims: callerToken
        });
        
        // Check if the caller is an admin
        if (!callerToken.admin === true) {
            console.error('[setAdminClaim] Caller is not admin:', callerToken.uid);
            return res.status(403).json({ error: 'Forbidden - Caller is not an admin' });
        }
        console.log('[setAdminClaim] Caller admin status verified');

        const { uid, isAdmin } = req.body;
        console.log('[setAdminClaim] Request details:', { targetUid: uid, isAdmin });
        
        if (!uid) {
            console.error('[setAdminClaim] No uid provided in request');
            return res.status(400).json({ error: 'Bad Request - No uid provided' });
        }

        // Set the admin claim
        console.log('[setAdminClaim] Setting custom claims for user:', uid);
        await admin.auth().setCustomUserClaims(uid, { admin: !!isAdmin });
        console.log('[setAdminClaim] Custom claims set successfully');
        
        // Update the admin-claims node in the Realtime Database
        console.log('[setAdminClaim] Updating admin-claims in database');
        if (isAdmin) {
            await admin.database().ref(`admin-claims/${uid}`).set(true);
            console.log('[setAdminClaim] Added admin to database');
        } else {
            await admin.database().ref(`admin-claims/${uid}`).remove();
            console.log('[setAdminClaim] Removed admin from database');
        }

        console.log('[setAdminClaim] Operation completed successfully');
        return res.status(200).json({ message: `Successfully ${isAdmin ? 'added' : 'removed'} admin claim for user ${uid}` });
    } catch (error) {
        console.error('[setAdminClaim] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Cloud Function to verify admin status of a user
 * Returns isAdmin: true/false based on the user's custom claims
 */
exports.verifyAdminStatus = onRequest(async (req, res) => {
    console.log('[verifyAdminStatus] Received request:', {
        method: req.method,
        headers: req.headers,
        origin: req.headers.origin || 'No origin'
    });

    // Enable CORS
    return cors(req, res, async () => {
        console.log('[verifyAdminStatus] CORS middleware passed');

        // Only allow GET requests
        if (req.method !== 'GET') {
            console.error('[verifyAdminStatus] Invalid method:', req.method);
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            // Get the ID token from the Authorization header
            const authHeader = req.headers.authorization;
            console.log('[verifyAdminStatus] Auth header present:', !!authHeader);

            const idToken = authHeader?.split('Bearer ')[1];
            if (!idToken) {
                console.error('[verifyAdminStatus] No token provided in Authorization header');
                return res.status(401).json({ error: 'No token provided', isAdmin: false });
            }

            console.log('[verifyAdminStatus] Verifying ID token...');
            // Verify the token and get the user's claims
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            console.log('[verifyAdminStatus] Token verified. User:', {
                uid: decodedToken.uid,
                claims: decodedToken
            });
            
            // Check admin claim and admin-claims database entry
            console.log('[verifyAdminStatus] Checking admin-claims in database...');
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => {
                    const val = snapshot.val();
                    console.log('[verifyAdminStatus] Database admin value:', val);
                    return val === true;
                });

            // User is admin if both custom claim and database entry exist
            const isAdmin = decodedToken.admin === true && isAdminInDb;
            console.log('[verifyAdminStatus] Admin status result:', {
                tokenClaim: decodedToken.admin === true,
                databaseClaim: isAdminInDb,
                finalResult: isAdmin
            });

            // Set proper content type
            res.set('Content-Type', 'application/json');
            console.log('[verifyAdminStatus] Sending response:', { isAdmin });
            return res.status(200).json({ isAdmin: isAdmin });
        } catch (error) {
            console.error('[verifyAdminStatus] Error:', error);
            if (error.code === 'auth/id-token-expired') {
                return res.status(401).json({ 
                    error: 'Token expired', 
                    code: error.code,
                    isAdmin: false 
                });
            }
            if (error.code === 'auth/argument-error') {
                return res.status(401).json({ 
                    error: 'Invalid token format', 
                    code: error.code,
                    isAdmin: false 
                });
            }
            return res.status(401).json({ 
                error: error.message, 
                code: error.code || 'unknown',
                isAdmin: false 
            });
        }
    });
});

/**
 * One-time setup endpoint to create the initial admin user
 * This should be secured and disabled after initial setup
 */
exports.setupInitialAdmin = onRequest(async (req, res) => {
    console.log('[setupInitialAdmin] Received request:', {
        method: req.method,
        headers: req.headers,
        origin: req.headers.origin || 'No origin'
    });

    // Enable CORS
    return cors(req, res, async () => {
        console.log('[setupInitialAdmin] CORS middleware passed');

        if (req.method !== 'POST') {
            console.error('[setupInitialAdmin] Invalid method:', req.method);
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const { email, setupSecret } = req.body;
            console.log('[setupInitialAdmin] Processing setup for email:', email);

            // Verify setup secret to prevent unauthorized access
            const SETUP_SECRET = 'MerakiAdmin2024!'; // You should change this!
            console.log('[setupInitialAdmin] Verifying setup secret');
            if (setupSecret !== SETUP_SECRET) {
                console.error('[setupInitialAdmin] Invalid setup secret provided');
                return res.status(403).json({ error: 'Invalid setup secret' });
            }
            console.log('[setupInitialAdmin] Setup secret verified');

            // Get user by email
            console.log('[setupInitialAdmin] Looking up user by email');
            const user = await admin.auth().getUserByEmail(email);
            if (!user) {
                console.error('[setupInitialAdmin] User not found:', email);
                return res.status(404).json({ error: 'User not found' });
            }
            console.log('[setupInitialAdmin] Found user:', user.uid);

            // Set custom claims
            console.log('[setupInitialAdmin] Setting admin custom claims');
            await admin.auth().setCustomUserClaims(user.uid, { admin: true });
            console.log('[setupInitialAdmin] Custom claims set successfully');
            
            // Add to admin-claims in database
            console.log('[setupInitialAdmin] Adding admin to database');
            await admin.database().ref(`admin-claims/${user.uid}`).set(true);
            console.log('[setupInitialAdmin] Database updated successfully');

            // Get all admin users to verify
            console.log('[setupInitialAdmin] Retrieving all admin users');
            const adminSnapshot = await admin.database().ref('admin-claims').once('value');
            const adminUsers = adminSnapshot.val() || {};
            console.log('[setupInitialAdmin] Total admin count:', Object.keys(adminUsers).length);

            // Set proper content type
            res.set('Content-Type', 'application/json');
            
            console.log('[setupInitialAdmin] Setup completed successfully');
            return res.status(200).json({ 
                message: 'Admin setup successful',
                user: {
                    uid: user.uid,
                    email: user.email,
                    isAdmin: true
                },
                totalAdmins: Object.keys(adminUsers).length
            });
        } catch (error) {
            console.error('[setupInitialAdmin] Error:', error);
            return res.status(500).json({ error: error.message });
        }
    });
});

/**
 * TEMPORARY: One-time setup endpoint to clear scanning data
 * WARNING: Remove this endpoint after use!
 */
exports.tempClearData = onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { setupSecret } = req.body;

        // Simple secret verification
        const TEMP_SECRET = 'MerakiSetup2024!'; // You should change this
        if (setupSecret !== TEMP_SECRET) {
            return res.status(403).json({ error: 'Invalid setup secret' });
        }

        // Get current count for reporting
        const beforeCount = await admin.database()
            .ref('scanningData')
            .once('value')
            .then(snapshot => {
                const data = snapshot.val();
                return data ? Object.keys(data).length : 0;
            });

        // Clear the scanning data
        await admin.database().ref('scanningData').remove();

        // Initialize admin-claims node
        await admin.database().ref('admin-claims').set({});

        return res.status(200).json({
            message: 'Database cleaned successfully',
            recordsCleared: beforeCount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in setup:', error);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * Cloud Function to clear scanning data
 * Only admins can use this endpoint
 */
exports.clearScanningData = onRequest(async (req, res) => {
    // Enable CORS
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            // Verify admin token
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                return res.status(401).json({ error: 'No token provided' });
            }

            // Verify the token and check admin status
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            // Get current count for reporting
            const beforeCount = await admin.database()
                .ref('scanningData')
                .once('value')
                .then(snapshot => {
                    const data = snapshot.val();
                    return data ? Object.keys(data).length : 0;
                });

            // Clear the scanning data
            await admin.database().ref('scanningData').remove();

            return res.status(200).json({
                message: 'Scanning data cleared successfully',
                recordsCleared: beforeCount,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error clearing scanning data:', error);
            return res.status(500).json({ error: error.message });
        }
    });
});
