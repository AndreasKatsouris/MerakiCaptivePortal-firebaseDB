const { onRequest } = require('firebase-functions/v2/https');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({
    origin: [
        'http://localhost:3000',
        'http://localhost:5000',
        'http://localhost:8000',
        'https://merakicaptiveportal-bda0f.web.app',
        'https://merakicaptiveportal-bda0f.firebaseapp.com',
        'https://merakicaptiveportal-firebasedb.web.app',
        'https://merakicaptiveportal-firebasedb.firebaseapp.com'
    ],
    credentials: true
});
const express = require('express');
const { receiveWhatsAppMessage } = require('./receiveWhatsappMessage');
const {
    sendWhatsAppMessage,
    sendBookingConfirmationTemplate,
    sendBookingStatusTemplate,
    sendQueueManualAdditionTemplate
} = require('./utils/whatsappClient');
const {
    markVoucherAsRedeemed,
    getVoucherDetails,
    getPoolAvailability,
    updatePoolStatistics
} = require('./voucherService');
const {
    addGuestToQueue,
    removeGuestFromQueue,
    updateQueueEntryStatus,
    getQueueStatus,
    bulkQueueOperations,
    getGuestQueuePosition,
    validateQMSFeatureAccess,
    getQMSTierInfo,
    getQMSUsageStats,
    validateQMSWhatsAppIntegration
} = require('./queueManagement');
const {
    processQueueMessage,
    sendQueueNotification
} = require('./queueWhatsAppIntegration');
const {
    cleanupOldQueues,
    getQueueAnalytics,
    getRealtimeQueueMetrics
} = require('./queueAnalytics');
const {
    getCacheStats,
    perfMonitor,
    clearAllCaches
} = require('./queueCache');
const {
    initializeWhatsAppSchemaFunction,
    createWhatsAppNumberFunction,
    assignWhatsAppToLocationFunction,
    getWhatsAppByLocationFunction,
    getLocationByWhatsAppFunction,
    getUserWhatsAppNumbersFunction,
    getWhatsAppAnalyticsFunction,
    removeWhatsAppNumberFunction
} = require('./whatsappManagement');
const { receiveWhatsAppMessageEnhanced } = require('./receiveWhatsappMessageEnhanced');
const {
    checkMigrationStatus,
    startMigration,
    rollbackMigration,
    getMigrationStatistics
} = require('./whatsappMigration');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

// Health check endpoint
exports.health = onRequest(async (req, res) => {
    try {
        // Test database connection
        const db = admin.database();
        const healthRef = db.ref('.info/connected');
        const snapshot = await healthRef.once('value');
        const isConnected = snapshot.val() === true;

        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: {
                status: isConnected ? 'connected' : 'disconnected',
                url: admin.app().options.databaseURL
            },
            service: 'sparks-hospitality-functions'
        });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            database: {
                status: 'error',
                error: error.message
            },
            service: 'sparks-hospitality-functions'
        });
    }
});

// Test data endpoint for persistence verification
exports.createTestData = onRequest(async (req, res) => {
    try {
        // Enable CORS
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST, GET, DELETE');
        res.set('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        const db = admin.database();

        if (req.method === 'POST') {
            // Create test data
            const { name } = req.body;
            if (!name) {
                res.status(400).json({ error: 'Name is required' });
                return;
            }

            const testRef = db.ref('test-data').push();
            await testRef.set({
                name: name,
                timestamp: Date.now(),
                createdAt: new Date().toISOString()
            });

            res.status(201).json({
                success: true,
                id: testRef.key,
                name: name,
                message: 'Test data created successfully'
            });
        } else if (req.method === 'GET') {
            // Get test data
            const { name } = req.query;

            if (name) {
                // Search for specific test data by name
                const snapshot = await db.ref('test-data')
                    .orderByChild('name')
                    .equalTo(name)
                    .once('value');

                if (snapshot.exists()) {
                    const data = snapshot.val();
                    res.status(200).json({
                        success: true,
                        found: true,
                        data: data
                    });
                } else {
                    res.status(404).json({
                        success: true,
                        found: false,
                        message: 'Test data not found'
                    });
                }
            } else {
                // Get all test data
                const snapshot = await db.ref('test-data').once('value');
                res.status(200).json({
                    success: true,
                    data: snapshot.val() || {}
                });
            }
        } else if (req.method === 'DELETE') {
            // Delete test data
            const { name } = req.query;

            if (name) {
                // Delete specific test data by name
                const snapshot = await db.ref('test-data')
                    .orderByChild('name')
                    .equalTo(name)
                    .once('value');

                if (snapshot.exists()) {
                    const updates = {};
                    snapshot.forEach(child => {
                        updates[child.key] = null;
                    });
                    await db.ref('test-data').update(updates);

                    res.status(200).json({
                        success: true,
                        message: 'Test data deleted successfully'
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        message: 'Test data not found'
                    });
                }
            } else {
                // Delete all test data
                await db.ref('test-data').remove();
                res.status(200).json({
                    success: true,
                    message: 'All test data deleted successfully'
                });
            }
        } else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Test data operation failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create Express app for WhatsApp webhook with proper middleware
const whatsappApp = express();
whatsappApp.use(express.urlencoded({ extended: true })); // Parse form-encoded data
whatsappApp.use(express.json()); // Parse JSON data
whatsappApp.all('*', receiveWhatsAppMessageEnhanced); // Handle all HTTP methods

// Export the main WhatsApp webhook function with multi-location support
exports.receiveWhatsAppMessage = functions.https.onRequest(receiveWhatsAppMessageEnhanced);

// Export the booking notification functions
exports.sendGuestBookingNotification = functions.https.onRequest(async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).send('');
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed');
    }

    try {
        const booking = req.body;

        if (!booking || !booking.phoneNumber) {
            return res.status(400).json({ error: 'Invalid booking data' });
        }

        // Send booking confirmation using template
        await sendBookingConfirmationTemplate(booking.phoneNumber, booking);

        console.log('Guest booking notification sent:', {
            bookingId: booking.id,
            phoneNumber: booking.phoneNumber,
            guestName: booking.guestName
        });

        res.status(200).json({
            success: true,
            message: 'Guest notification sent successfully'
        });

    } catch (error) {
        console.error('Error sending guest booking notification:', error);
        res.status(500).json({
            error: 'Failed to send notification',
            details: error.message
        });
    }
});

exports.sendGuestStatusNotification = functions.https.onRequest(async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).send('');
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed');
    }

    try {
        const booking = req.body;

        if (!booking || !booking.phoneNumber || !booking.status) {
            return res.status(400).json({ error: 'Invalid booking data' });
        }

        // Send booking status update using template
        await sendBookingStatusTemplate(booking.phoneNumber, booking);

        console.log('Guest status notification sent:', {
            bookingId: booking.id,
            phoneNumber: booking.phoneNumber,
            status: booking.status
        });

        res.status(200).json({
            success: true,
            message: 'Status notification sent successfully'
        });

    } catch (error) {
        console.error('Error sending guest status notification:', error);
        res.status(500).json({
            error: 'Failed to send status notification',
            details: error.message
        });
    }
});

/**
 * Format booking confirmation message for guests
 * @param {Object} booking - Booking data
 * @returns {string} Formatted confirmation message
 */
function formatGuestBookingConfirmation(booking) {
    return `🎉 **Booking Confirmed!**\n\n` +
        `Hi ${booking.guestName},\n\n` +
        `Your table reservation has been confirmed:\n\n` +
        `📋 **Booking Details:**\n` +
        `• Booking ID: ${booking.id}\n` +
        `• Date: ${booking.date}\n` +
        `• Time: ${booking.time}\n` +
        `• Location: ${booking.location}\n` +
        `• Section: ${booking.section}\n` +
        `• Number of Guests: ${booking.numberOfGuests}\n` +
        `${booking.specialRequests ? `• Special Requests: ${booking.specialRequests}\n` : ''}` +
        `\n✅ **Status:** ${booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}\n\n` +
        `We look forward to serving you! If you need to make any changes, please contact us.\n\n` +
        `🤖 This booking was created by our staff. Reply to this message if you have any questions.`;
}

/**
 * Format status update message for guests
 * @param {Object} booking - Booking data
 * @returns {string} Formatted status update message
 */
function formatGuestStatusUpdate(booking) {
    let statusMessage = '';
    let statusEmoji = '';

    switch (booking.status) {
        case 'confirmed':
            statusMessage = 'Your booking has been confirmed! We look forward to serving you.';
            statusEmoji = '✅';
            break;
        case 'cancelled':
            statusMessage = 'Your booking has been cancelled. We apologize for any inconvenience. Please contact us if you have any questions.';
            statusEmoji = '❌';
            break;
        case 'pending':
            statusMessage = 'Your booking is currently pending confirmation. We will update you soon.';
            statusEmoji = '⏳';
            break;
        default:
            statusMessage = `Your booking status has been updated to: ${booking.status}`;
            statusEmoji = '📋';
    }

    return `${statusEmoji} **Booking Status Update**\n\n` +
        `Hi ${booking.guestName},\n\n` +
        `${statusMessage}\n\n` +
        `📋 **Booking Details:**\n` +
        `• Booking ID: ${booking.id}\n` +
        `• Date: ${booking.date}\n` +
        `• Time: ${booking.time}\n` +
        `• Location: ${booking.location}\n` +
        `• Section: ${booking.section}\n` +
        `• Number of Guests: ${booking.numberOfGuests}\n` +
        `${booking.specialRequests ? `• Special Requests: ${booking.specialRequests}\n` : ''}` +
        `\n🤖 Reply to this message if you have any questions about your booking.`;
}

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

// Export Guest Sync Functions
const guestSync = require('./guestSync');
exports.syncWifiToGuest = guestSync.syncWifiToGuest;
exports.syncGuestToSendGrid = guestSync.syncGuestToSendGrid;

/**
 * Cloud Function for user registration
 * This function securely creates user data in the database when a new user signs up
 */
exports.registerUser = functions.https.onCall(async (data, context) => {
    console.log('[registerUser] Function called with context:', {
        hasAuth: !!context.auth,
        uid: context.auth?.uid,
        email: context.auth?.token?.email,
        emailVerified: context.auth?.token?.email_verified
    });

    // Ensure user is authenticated
    if (!context.auth) {
        console.error('[registerUser] No authentication context found');
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to register.'
        );
    }

    try {
        const userId = context.auth.uid;
        const userEmail = context.auth.token.email || data.email;
        console.log('[registerUser] Processing registration for user:', userId, userEmail);

        const {
            firstName,
            lastName,
            businessName,
            businessAddress,
            businessPhone,
            businessType,
            selectedTier,
            tierData
        } = data;

        // Create user data
        const userData = {
            uid: userId,
            email: userEmail,
            firstName: firstName,
            lastName: lastName,
            displayName: `${firstName} ${lastName}`,
            businessInfo: {
                name: businessName,
                address: businessAddress,
                phone: businessPhone,
                type: businessType
            },
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
            status: 'active',
            role: 'user'
        };

        // Create subscription data
        const subscriptionData = {
            userId: userId,
            tierId: selectedTier,
            status: 'trial', // Start with trial
            startDate: admin.database.ServerValue.TIMESTAMP,
            trialEndDate: Date.now() + (14 * 24 * 60 * 60 * 1000), // 14-day trial
            features: tierData.features || {},
            limits: tierData.limits || {},
            metadata: {
                signupSource: 'web',
                initialTier: selectedTier
            }
        };

        // Save user data to database with protection against overwrites
        const userRef = admin.database().ref(`users/${userId}`);
        const subscriptionRef = admin.database().ref(`subscriptions/${userId}`);

        // Check if user already exists to prevent overwrites
        const existingUserSnapshot = await userRef.once('value');
        if (existingUserSnapshot.exists()) {
            console.log(`⚠️ [CloudFunction] User ${userId} already exists, merging data instead of overwriting`);
            const existingUserData = existingUserSnapshot.val();

            // Preserve existing data, especially phone numbers
            const mergedUserData = {
                ...existingUserData,
                ...userData,
                // Explicitly preserve phone numbers if they exist
                phoneNumber: existingUserData.phoneNumber || userData.phoneNumber,
                phone: existingUserData.phone || userData.phone,
                businessPhone: existingUserData.businessPhone || userData.businessPhone,
                updatedAt: admin.database.ServerValue.TIMESTAMP
            };

            await userRef.update(mergedUserData);
        } else {
            await userRef.set(userData);
        }

        // Check if subscription already exists
        const existingSubscriptionSnapshot = await subscriptionRef.once('value');
        if (existingSubscriptionSnapshot.exists()) {
            console.log(`⚠️ [CloudFunction] Subscription ${userId} already exists, merging data instead of overwriting`);
            const existingSubscriptionData = existingSubscriptionSnapshot.val();
            const mergedSubscriptionData = {
                ...existingSubscriptionData,
                ...subscriptionData,
                updatedAt: admin.database.ServerValue.TIMESTAMP
            };
            await subscriptionRef.update(mergedSubscriptionData);
        } else {
            await subscriptionRef.set(subscriptionData);
        }

        // Create initial location for the user
        const locationData = {
            name: businessName,
            address: businessAddress,
            phone: businessPhone,
            type: businessType,
            ownerId: userId,
            createdAt: admin.database.ServerValue.TIMESTAMP,
            status: 'active',
            settings: {
                timezone: 'UTC',
                currency: 'USD',
                language: 'en'
            }
        };

        // Create a location and link it to the user
        const locationRef = await admin.database().ref('locations').push();
        await locationRef.set(locationData);
        await admin.database().ref(`userLocations/${userId}/${locationRef.key}`).set(true);

        return { success: true, userId: userId };

    } catch (error) {
        console.error('Error in registerUser function:', error);
        throw new functions.https.HttpsError(
            'internal',
            'An error occurred during registration.'
        );
    }
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
 * Create a new user account (Admin only)
 * Creates Firebase Auth account, user record, and subscription
 */
exports.createUserAccount = onRequest(async (req, res) => {
    console.log('[createUserAccount] Received request:', {
        method: req.method,
        headers: req.headers
    });

    // Enable CORS
    cors(req, res, async () => {
        try {
            // Verify this is an authenticated admin request
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                console.error('[createUserAccount] No authorization header');
                return res.status(401).json({ error: 'Unauthorized - No token provided' });
            }

            const idToken = authHeader.split('Bearer ')[1];
            let decodedToken;
            try {
                decodedToken = await admin.auth().verifyIdToken(idToken);
            } catch (error) {
                console.error('[createUserAccount] Token verification failed:', error);
                return res.status(401).json({ error: 'Unauthorized - Invalid token' });
            }

            // Check if user is admin
            const adminSnapshot = await admin.database().ref(`admin-claims/${decodedToken.uid}`).once('value');
            if (!adminSnapshot.exists()) {
                console.error('[createUserAccount] User is not admin');
                return res.status(403).json({ error: 'Forbidden - Admin access required' });
            }

            // Get request data
            const { email, password, firstName, lastName, businessName, phoneNumber, tier, isAdmin, locationIds } = req.body;

            // Validation
            if (!email || !password || !firstName || !lastName || !tier) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Validate tier exists in database (dynamic validation)
            const tierSnapshot = await admin.database().ref(`subscriptionTiers/${tier}`).once('value');
            const tierData = tierSnapshot.val();

            if (!tierData) {
                console.error('[createUserAccount] Invalid tier:', tier);
                return res.status(400).json({ error: `Invalid tier: ${tier}` });
            }

            // Validate location count against tier limits
            const maxLocations = tierData.limits?.locations || tierData.limits?.maxLocations || 1;
            const assignedLocations = Array.isArray(locationIds) ? locationIds : [];

            if (maxLocations !== Infinity && assignedLocations.length > maxLocations) {
                return res.status(400).json({
                    error: `Tier ${tier} only allows ${maxLocations} location(s), but ${assignedLocations.length} were requested`
                });
            }

            console.log('[createUserAccount] Creating user:', { email, tier, isAdmin, locationCount: assignedLocations.length });

            // Create Firebase Auth user
            const userRecord = await admin.auth().createUser({
                email,
                password,
                emailVerified: false,
                displayName: `${firstName} ${lastName}`
            });

            console.log('[createUserAccount] Firebase Auth user created:', userRecord.uid);

            // Set admin claim if requested
            if (isAdmin) {
                await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
                await admin.database().ref(`admin-claims/${userRecord.uid}`).set(true);
                console.log('[createUserAccount] Admin claims set');
            }

            // Create user record in database
            const userData = {
                email,
                displayName: `${firstName} ${lastName}`,
                firstName,
                lastName,
                businessName: businessName || '',
                phoneNumber: phoneNumber || '',
                createdAt: admin.database.ServerValue.TIMESTAMP,
                lastLogin: admin.database.ServerValue.TIMESTAMP,
                emailVerified: false
            };

            await admin.database().ref(`users/${userRecord.uid}`).set(userData);
            console.log('[createUserAccount] User record created');

            // Create subscription with locationIds
            const subscriptionData = {
                userId: userRecord.uid,
                tierId: tier,
                status: 'active',
                startDate: admin.database.ServerValue.TIMESTAMP,
                features: tierData?.features || {},
                limits: tierData?.limits || {},
                locationIds: assignedLocations, // Store associated locations
                metadata: {
                    signupSource: 'admin',
                    initialTier: tier,
                    createdBy: decodedToken.uid
                }
            };

            await admin.database().ref(`subscriptions/${userRecord.uid}`).set(subscriptionData);
            console.log('[createUserAccount] Subscription created with', assignedLocations.length, 'locations');

            // Create userLocations entries for each assigned location
            if (assignedLocations.length > 0) {
                const userLocationsUpdates = {};
                assignedLocations.forEach(locationId => {
                    userLocationsUpdates[`userLocations/${userRecord.uid}/${locationId}`] = {
                        role: isAdmin ? 'admin' : 'manager',
                        addedAt: admin.database.ServerValue.TIMESTAMP,
                        addedBy: decodedToken.uid
                    };
                });
                await admin.database().ref().update(userLocationsUpdates);
                console.log('[createUserAccount] userLocations entries created');
            }

            // Return success
            return res.status(200).json({
                success: true,
                message: 'User created successfully',
                userId: userRecord.uid,
                email: email,
                tier: tier,
                isAdmin: isAdmin || false,
                locationCount: assignedLocations.length
            });

        } catch (error) {
            console.error('[createUserAccount] Error:', error);
            return res.status(500).json({
                error: 'Failed to create user',
                details: error.message
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

/**
 * Cloud Function to mark a voucher as redeemed
 * Used by staff/admin to redeem vouchers at POS
 */
exports.markVoucherRedeemed = onRequest(async (req, res) => {
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

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            const { voucherCode, rewardTypeId, redemptionData } = req.body;

            if (!voucherCode || !rewardTypeId) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            await markVoucherAsRedeemed(voucherCode, rewardTypeId, {
                redeemedBy: decodedToken.uid,
                ...redemptionData
            });

            return res.status(200).json({
                message: 'Voucher marked as redeemed',
                voucherCode,
                redeemedAt: Date.now()
            });
        } catch (error) {
            console.error('Error in markVoucherRedeemed:', error);
            return res.status(500).json({ error: error.message });
        }
    });
});

/**
 * Cloud Function to get voucher details
 * Used for voucher validation and lookup
 */
exports.getVoucherDetails = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            // Verify admin token
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                return res.status(401).json({ error: 'No token provided' });
            }

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            const { voucherCode, rewardTypeId } = req.query;

            if (!voucherCode || !rewardTypeId) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            const voucherDetails = await getVoucherDetails(voucherCode, rewardTypeId);

            if (!voucherDetails) {
                return res.status(404).json({ error: 'Voucher not found' });
            }

            return res.status(200).json(voucherDetails);
        } catch (error) {
            console.error('Error in getVoucherDetails:', error);
            return res.status(500).json({ error: error.message });
        }
    });
});

/**
 * Cloud Function to get voucher pool availability
 * Used by admin dashboard for pool statistics
 */
exports.getVoucherPoolAvailability = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            // Verify admin token
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                return res.status(401).json({ error: 'No token provided' });
            }

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            const { rewardTypeId } = req.query;

            if (!rewardTypeId) {
                return res.status(400).json({ error: 'Missing rewardTypeId parameter' });
            }

            const poolAvailability = await getPoolAvailability(rewardTypeId);
            return res.status(200).json(poolAvailability);
        } catch (error) {
            console.error('Error in getVoucherPoolAvailability:', error);
            return res.status(500).json({ error: error.message });
        }
    });
});

/**
 * Cloud Function to update voucher pool statistics
 * Used by admin to refresh pool stats manually
 */
exports.updateVoucherPoolStats = onRequest(async (req, res) => {
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

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            const { rewardTypeId } = req.body;

            if (!rewardTypeId) {
                return res.status(400).json({ error: 'Missing rewardTypeId parameter' });
            }

            await updatePoolStatistics(rewardTypeId);
            const updatedStats = await getPoolAvailability(rewardTypeId);

            return res.status(200).json({
                message: 'Pool statistics updated',
                stats: updatedStats,
                updatedAt: Date.now()
            });
        } catch (error) {
            console.error('Error in updateVoucherPoolStats:', error);
            return res.status(500).json({ error: error.message });
        }
    });
});

/**
 * Queue Management Functions
 */

/**
 * Add guest to queue
 */
exports.addGuestToQueue = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const result = await addGuestToQueue(req.body);

            if (result.success) {
                return res.status(200).json(result);
            } else {
                return res.status(400).json(result);
            }
        } catch (error) {
            console.error('Error in addGuestToQueue:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Remove guest from queue
 */
exports.removeGuestFromQueue = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const result = await removeGuestFromQueue(req.body);

            if (result.success) {
                return res.status(200).json(result);
            } else {
                return res.status(400).json(result);
            }
        } catch (error) {
            console.error('Error in removeGuestFromQueue:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Update queue entry status
 */
exports.updateQueueEntryStatus = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const result = await updateQueueEntryStatus(req.body);

            if (result.success) {
                return res.status(200).json(result);
            } else {
                return res.status(400).json(result);
            }
        } catch (error) {
            console.error('Error in updateQueueEntryStatus:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Get queue status
 */
exports.getQueueStatus = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const { locationId, date } = req.query;

            if (!locationId) {
                return res.status(400).json({ error: 'Missing locationId parameter' });
            }

            const result = await getQueueStatus(locationId, date);

            if (result.success) {
                return res.status(200).json(result);
            } else {
                return res.status(400).json(result);
            }
        } catch (error) {
            console.error('Error in getQueueStatus:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Bulk queue operations
 */
exports.bulkQueueOperations = functions.https.onRequest(async (req, res) => {
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

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            const result = await bulkQueueOperations({
                ...req.body,
                adminUserId: decodedToken.uid
            });

            if (result.success) {
                return res.status(200).json(result);
            } else {
                return res.status(400).json(result);
            }
        } catch (error) {
            console.error('Error in bulkQueueOperations:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Get guest queue position
 */
exports.getGuestQueuePosition = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const { phoneNumber, locationId } = req.query;

            if (!phoneNumber || !locationId) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            const result = await getGuestQueuePosition(phoneNumber, locationId);

            if (result.success) {
                return res.status(200).json(result);
            } else {
                return res.status(400).json(result);
            }
        } catch (error) {
            console.error('Error in getGuestQueuePosition:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Process queue message from WhatsApp
 */
exports.processQueueMessage = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const { phoneNumber, message, messageType } = req.body;

            if (!phoneNumber || !message) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            const result = await processQueueMessage(phoneNumber, message, messageType);

            return res.status(200).json(result);
        } catch (error) {
            console.error('Error in processQueueMessage:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Send queue notification via WhatsApp (Admin only)
 */
exports.sendQueueNotification = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            // Verify admin token
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                console.error('[sendQueueNotification] No token provided');
                return res.status(401).json({ error: 'No token provided' });
            }

            console.log('[sendQueueNotification] Verifying admin token...');
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                console.error('[sendQueueNotification] Unauthorized access attempt by user:', decodedToken.uid);
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            console.log('[sendQueueNotification] Admin authentication successful for user:', decodedToken.uid);

            const { phoneNumber, notificationType, queueData } = req.body;

            if (!phoneNumber || !notificationType || !queueData) {
                console.error('[sendQueueNotification] Missing required parameters:', { phoneNumber: !!phoneNumber, notificationType, queueData: !!queueData });
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            console.log('[sendQueueNotification] Processing notification:', { phoneNumber, notificationType, adminUser: decodedToken.uid });
            const result = await sendQueueNotification(phoneNumber, notificationType, queueData);

            if (result.success) {
                console.log('[sendQueueNotification] Notification sent successfully');
                return res.status(200).json(result);
            } else {
                console.error('[sendQueueNotification] Notification failed:', result.message);
                return res.status(400).json(result);
            }
        } catch (error) {
            console.error('[sendQueueNotification] Error:', error);

            // Handle authentication errors specifically
            if (error.code === 'auth/id-token-expired') {
                return res.status(401).json({
                    error: 'Authentication token expired',
                    code: error.code
                });
            }
            if (error.code === 'auth/argument-error') {
                return res.status(401).json({
                    error: 'Invalid authentication token',
                    code: error.code
                });
            }

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Send manual queue addition notification via WhatsApp (Admin only)
 */
exports.sendManualQueueAdditionNotification = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            // Verify admin token
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                console.error('[sendManualQueueAdditionNotification] No token provided');
                return res.status(401).json({ error: 'No token provided' });
            }

            console.log('[sendManualQueueAdditionNotification] Verifying admin token...');
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                console.error('[sendManualQueueAdditionNotification] Unauthorized access attempt by user:', decodedToken.uid);
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            console.log('[sendManualQueueAdditionNotification] Admin authentication successful for user:', decodedToken.uid);

            const { phoneNumber, guestName, locationName, position, partySize, estimatedWaitTime, specialRequests } = req.body;

            if (!phoneNumber || !guestName || !locationName || !position || !partySize || !estimatedWaitTime) {
                console.error('[sendManualQueueAdditionNotification] Missing required parameters:', {
                    phoneNumber: !!phoneNumber,
                    guestName: !!guestName,
                    locationName: !!locationName,
                    position: !!position,
                    partySize: !!partySize,
                    estimatedWaitTime: !!estimatedWaitTime
                });
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            console.log('[sendManualQueueAdditionNotification] Processing notification:', {
                phoneNumber,
                guestName,
                locationName,
                position,
                partySize,
                estimatedWaitTime,
                adminUser: decodedToken.uid
            });

            // Send using the template function
            await sendQueueManualAdditionTemplate(
                phoneNumber,
                guestName,
                locationName,
                position,
                partySize,
                estimatedWaitTime,
                specialRequests
            );

            console.log('[sendManualQueueAdditionNotification] Notification sent successfully');
            return res.status(200).json({
                success: true,
                message: 'Manual queue addition notification sent successfully'
            });

        } catch (error) {
            console.error('[sendManualQueueAdditionNotification] Error:', error);

            // Handle authentication errors specifically
            if (error.code === 'auth/id-token-expired') {
                return res.status(401).json({
                    error: 'Authentication token expired',
                    code: error.code
                });
            }
            if (error.code === 'auth/argument-error') {
                return res.status(401).json({
                    error: 'Invalid authentication token',
                    code: error.code
                });
            }

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Manual queue cleanup function (admin only)
 */
exports.cleanupOldQueues = functions.https.onRequest(async (req, res) => {
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

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            const { retentionDays = 7 } = req.body;
            const result = await cleanupOldQueues(retentionDays);

            if (result.success) {
                return res.status(200).json(result);
            } else {
                return res.status(500).json(result);
            }
        } catch (error) {
            console.error('Error in cleanupOldQueues:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Get queue analytics for a location and date range
 */
exports.getQueueAnalytics = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            // Verify admin token
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                return res.status(401).json({ error: 'No token provided' });
            }

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            const { locationId, startDate, endDate } = req.query;

            if (!locationId || !startDate || !endDate) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            const result = await getQueueAnalytics(locationId, startDate, endDate);

            if (result.success) {
                return res.status(200).json(result);
            } else {
                return res.status(400).json(result);
            }
        } catch (error) {
            console.error('Error in getQueueAnalytics:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Get real-time queue metrics
 */
exports.getRealtimeQueueMetrics = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const { locationId, date } = req.query;

            if (!locationId) {
                return res.status(400).json({ error: 'Missing locationId parameter' });
            }

            const result = await getRealtimeQueueMetrics(locationId, date);

            if (result.success) {
                return res.status(200).json(result);
            } else {
                return res.status(400).json(result);
            }
        } catch (error) {
            console.error('Error in getRealtimeQueueMetrics:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

// Export scheduled cleanup function
exports.cleanupOldQueuesScheduled = require('./queueAnalytics').cleanupOldQueuesScheduled;

/**
 * Get queue system performance statistics (admin only)
 */
exports.getQueuePerformanceStats = functions.https.onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            // Verify admin token
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                return res.status(401).json({ error: 'No token provided' });
            }

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            const cacheStats = getCacheStats();
            const performanceStats = perfMonitor.getMetrics();

            return res.status(200).json({
                success: true,
                data: {
                    cache: cacheStats,
                    performance: performanceStats,
                    timestamp: Date.now()
                }
            });
        } catch (error) {
            console.error('Error in getQueuePerformanceStats:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Clear queue system cache (admin only)
 */
exports.clearQueueCache = functions.https.onRequest(async (req, res) => {
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

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const isAdminInDb = await admin.database()
                .ref(`admin-claims/${decodedToken.uid}`)
                .once('value')
                .then(snapshot => snapshot.val() === true);

            if (!decodedToken.admin === true || !isAdminInDb) {
                return res.status(403).json({ error: 'Unauthorized - Admin access required' });
            }

            clearAllCaches();

            return res.status(200).json({
                success: true,
                message: 'Queue cache cleared successfully',
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Error in clearQueueCache:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Cloud Function for QMS tier information
 * Returns user's QMS tier information and limits
 */
exports.getQMSTierInfo = functions.https.onCall(async (data, context) => {
    try {
        // Ensure user is authenticated
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const result = await getQMSTierInfo(userId);

        if (!result.success) {
            throw new functions.https.HttpsError('internal', result.message);
        }

        return result.tierInfo;
    } catch (error) {
        console.error('Error in getQMSTierInfo:', error);
        throw new functions.https.HttpsError('internal', 'Failed to get QMS tier information');
    }
});

/**
 * Cloud Function for QMS usage statistics
 * Returns user's QMS usage statistics for analytics
 */
exports.getQMSUsageStats = functions.https.onCall(async (data, context) => {
    try {
        // Ensure user is authenticated
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const { locationId } = data;
        if (!locationId) {
            throw new functions.https.HttpsError('invalid-argument', 'Location ID is required');
        }

        const userId = context.auth.uid;
        const result = await getQMSUsageStats(userId, locationId);

        if (!result.success) {
            if (result.requiresUpgrade) {
                throw new functions.https.HttpsError('permission-denied', result.message, {
                    requiresUpgrade: true,
                    requiredFeature: result.requiredFeature
                });
            }
            throw new functions.https.HttpsError('internal', result.message);
        }

        return result.usageStats;
    } catch (error) {
        console.error('Error in getQMSUsageStats:', error);
        if (error.code) {
            throw error; // Re-throw HttpsError
        }
        throw new functions.https.HttpsError('internal', 'Failed to get QMS usage statistics');
    }
});

/**
 * Cloud Function for QMS feature access validation
 * Validates if user has access to specific QMS features
 */
exports.validateQMSFeatureAccess = functions.https.onCall(async (data, context) => {
    try {
        // Ensure user is authenticated
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const { featureId } = data;
        if (!featureId) {
            throw new functions.https.HttpsError('invalid-argument', 'Feature ID is required');
        }

        const userId = context.auth.uid;
        const hasAccess = await validateQMSFeatureAccess(userId, featureId);

        return {
            hasAccess,
            featureId,
            userId
        };
    } catch (error) {
        console.error('Error in validateQMSFeatureAccess:', error);
        throw new functions.https.HttpsError('internal', 'Failed to validate QMS feature access');
    }
});

/**
 * Cloud Function for QMS WhatsApp integration validation
 * Validates if user has access to WhatsApp integration features
 */
exports.validateQMSWhatsAppIntegration = functions.https.onCall(async (data, context) => {
    try {
        // Ensure user is authenticated
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = context.auth.uid;
        const result = await validateQMSWhatsAppIntegration(userId);

        if (!result.success) {
            if (result.requiresUpgrade) {
                throw new functions.https.HttpsError('permission-denied', result.message, {
                    requiresUpgrade: true,
                    requiredFeature: result.requiredFeature
                });
            }
            throw new functions.https.HttpsError('internal', result.message);
        }

        return {
            hasAccess: true,
            message: result.message
        };
    } catch (error) {
        console.error('Error in validateQMSWhatsAppIntegration:', error);
        if (error.code) {
            throw error; // Re-throw HttpsError
        }
        throw new functions.https.HttpsError('internal', 'Failed to validate WhatsApp integration access');
    }
});

// WhatsApp Multi-Location Management Functions
exports.initializeWhatsAppSchema = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;

            await initializeWhatsAppSchemaFunction(req, res);
        } catch (error) {
            console.error('Error in initializeWhatsAppSchema:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.createWhatsAppNumber = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;

            await createWhatsAppNumberFunction(req, res);
        } catch (error) {
            console.error('Error in createWhatsAppNumber:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.assignWhatsAppToLocation = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;

            await assignWhatsAppToLocationFunction(req, res);
        } catch (error) {
            console.error('Error in assignWhatsAppToLocation:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.getWhatsAppByLocation = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;

            await getWhatsAppByLocationFunction(req, res);
        } catch (error) {
            console.error('Error in getWhatsAppByLocation:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.getLocationByWhatsApp = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;

            await getLocationByWhatsAppFunction(req, res);
        } catch (error) {
            console.error('Error in getLocationByWhatsApp:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.getUserWhatsAppNumbers = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;

            await getUserWhatsAppNumbersFunction(req, res);
        } catch (error) {
            console.error('Error in getUserWhatsAppNumbers:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.getWhatsAppAnalytics = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;

            await getWhatsAppAnalyticsFunction(req, res);
        } catch (error) {
            console.error('Error in getWhatsAppAnalytics:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.removeWhatsAppNumber = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;

            await removeWhatsAppNumberFunction(req, res);
        } catch (error) {
            console.error('Error in removeWhatsAppNumber:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

// Enhanced WhatsApp Message Handler with Multi-Location Routing
exports.receiveWhatsAppMessageEnhanced = functions.https.onRequest(receiveWhatsAppMessageEnhanced);

// WhatsApp Migration Functions
exports.checkWhatsAppMigrationStatus = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);

            // Check admin access
            const userRecord = await admin.auth().getUser(decodedToken.uid);
            if (!userRecord.customClaims?.admin) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const status = await checkMigrationStatus();
            res.json({ success: true, ...status });

        } catch (error) {
            console.error('Error in checkWhatsAppMigrationStatus:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.startWhatsAppMigration = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);

            // Check admin access
            const userRecord = await admin.auth().getUser(decodedToken.uid);
            if (!userRecord.customClaims?.admin) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const result = await startMigration();
            res.json(result);

        } catch (error) {
            console.error('Error in startWhatsAppMigration:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.rollbackWhatsAppMigration = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);

            // Check admin access
            const userRecord = await admin.auth().getUser(decodedToken.uid);
            if (!userRecord.customClaims?.admin) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const result = await rollbackMigration();
            res.json(result);

        } catch (error) {
            console.error('Error in rollbackWhatsAppMigration:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.getWhatsAppMigrationStatistics = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);

            // Check admin access
            const userRecord = await admin.auth().getUser(decodedToken.uid);
            if (!userRecord.customClaims?.admin) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const statistics = await getMigrationStatistics();
            res.json({ success: true, ...statistics });

        } catch (error) {
            console.error('Error in getWhatsAppMigrationStatistics:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

// Add the correct exports for migration functions
exports.checkMigrationStatus = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;

            const status = await checkMigrationStatus();
            res.json({ success: true, ...status });

        } catch (error) {
            console.error('Error in checkMigrationStatus:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.startMigration = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // Add authentication middleware
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;

            const result = await startMigration(req.body);
            res.json(result);

        } catch (error) {
            console.error('Error in startMigration:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

// ============================================================================
// FIREBASE PERFORMANCE MONITOR (FPM) FUNCTIONS
// ============================================================================

/**
 * Performance test function for FPM monitoring
 * Tests function response time, memory usage, and cold starts
 * Note: onCall functions automatically handle CORS for allowed Firebase app domains
 */
exports.performanceTest = functions.https.onCall(async (data, context) => {
    const startTime = process.hrtime.bigint();

    try {
        // Verify admin authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
        }

        const token = await admin.auth().getUser(context.auth.uid);
        const customClaims = token.customClaims || {};

        if (!customClaims.admin && customClaims.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
        }

        // Collect performance metrics
        const memoryUsage = process.memoryUsage();
        const endTime = process.hrtime.bigint();
        const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

        // Simulate database operations to test performance
        const dbStartTime = process.hrtime.bigint();
        const testData = await admin.database().ref('performance-test').once('value');
        const dbEndTime = process.hrtime.bigint();
        const dbResponseTime = Number(dbEndTime - dbStartTime) / 1000000;

        const result = {
            responseTime: Math.round(responseTime),
            dbResponseTime: Math.round(dbResponseTime),
            memoryUsage: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
                external: Math.round(memoryUsage.external / 1024 / 1024) // MB
            },
            coldStart: !global.warmFunction, // Simple cold start detection
            timestamp: Date.now(),
            functionName: 'performanceTest',
            region: process.env.FUNCTION_REGION || 'us-central1'
        };

        // Mark function as warm for next invocation
        global.warmFunction = true;

        return result;

    } catch (error) {
        console.error('[FPM] Performance test error:', error);

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', 'Performance test failed');
    }
});

/**
 * HTTP-based performance test endpoint for direct fetch requests (CORS enabled)
 * This endpoint provides the same functionality as the onCall version but supports direct HTTP requests
 * Used by the Firebase Performance Monitor tool and service worker
 */
exports.performanceTestHTTP = functions.https.onRequest((req, res) => {
    // Enable CORS for all origins
    cors(req, res, async () => {
        const startTime = process.hrtime.bigint();

        try {
            // Only accept GET and POST methods
            if (req.method !== 'GET' && req.method !== 'POST') {
                res.status(405).json({ error: 'Method not allowed' });
                return;
            }

            // Verify admin authentication from Authorization header
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
                return;
            }

            const idToken = authHeader.split('Bearer ')[1];

            try {
                const decodedToken = await admin.auth().verifyIdToken(idToken);
                const customClaims = decodedToken;

                if (!customClaims.admin && customClaims.role !== 'admin') {
                    res.status(403).json({ error: 'Admin privileges required', code: 'permission-denied' });
                    return;
                }
            } catch (authError) {
                console.error('[FPM] HTTP Auth verification failed:', authError);
                res.status(401).json({ error: 'Invalid token', code: 'unauthenticated' });
                return;
            }

            // Collect performance metrics
            const memoryUsage = process.memoryUsage();
            const endTime = process.hrtime.bigint();
            const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

            // Simulate database operations to test performance
            const dbStartTime = process.hrtime.bigint();
            const testData = await admin.database().ref('performance-test').once('value');
            const dbEndTime = process.hrtime.bigint();
            const dbResponseTime = Number(dbEndTime - dbStartTime) / 1000000;

            const result = {
                responseTime: Math.round(responseTime),
                dbResponseTime: Math.round(dbResponseTime),
                memoryUsage: {
                    rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
                    external: Math.round(memoryUsage.external / 1024 / 1024) // MB
                },
                coldStart: !global.warmFunction, // Simple cold start detection
                timestamp: Date.now(),
                functionName: 'performanceTestHTTP',
                region: process.env.FUNCTION_REGION || 'us-central1',
                endpoint: 'HTTP'
            };

            // Mark function as warm for next invocation
            global.warmFunction = true;

            // Set CORS headers explicitly for the response
            res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
            res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.set('Access-Control-Allow-Credentials', 'true');

            res.status(200).json({ success: true, data: result });

        } catch (error) {
            console.error('[FPM] HTTP Performance test error:', error);

            res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
            res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.set('Access-Control-Allow-Credentials', 'true');

            res.status(500).json({
                error: 'Performance test failed',
                code: 'internal',
                message: error.message
            });
        }
    });
});

/**
 * System optimization function for automated performance improvements
 */
exports.runSystemOptimization = functions.https.onCall(async (data, context) => {
    try {
        // Verify admin authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
        }

        const token = await admin.auth().getUser(context.auth.uid);
        const customClaims = token.customClaims || {};

        if (!customClaims.admin && customClaims.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
        }

        const optimizations = [];

        // Database optimizations
        try {
            // Clear old performance logs
            const perfRef = admin.database().ref('performance-logs');
            const oldLogs = await perfRef.orderByKey().limitToFirst(100).once('value');

            if (oldLogs.exists()) {
                const updates = {};
                oldLogs.forEach(child => {
                    const timestamp = parseInt(child.key());
                    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                    if (timestamp < weekAgo) {
                        updates[child.key()] = null;
                    }
                });

                if (Object.keys(updates).length > 0) {
                    await perfRef.update(updates);
                    optimizations.push({
                        type: 'database',
                        action: 'cleanup_old_logs',
                        description: `Cleaned up ${Object.keys(updates).length} old performance log entries`,
                        impact: 'Reduced database size and improved query performance'
                    });
                }
            }

            // Optimize cache settings
            await clearAllCaches();
            optimizations.push({
                type: 'cache',
                action: 'clear_caches',
                description: 'Cleared all system caches to free memory',
                impact: 'Improved memory usage and cache hit rates'
            });

        } catch (error) {
            console.error('[FPM] Database optimization error:', error);
            optimizations.push({
                type: 'error',
                action: 'database_optimization',
                description: `Database optimization failed: ${error.message}`,
                impact: 'No changes made to database'
            });
        }

        // Function optimizations
        try {
            // Trigger garbage collection if available
            if (global.gc) {
                global.gc();
                optimizations.push({
                    type: 'memory',
                    action: 'garbage_collection',
                    description: 'Forced garbage collection to free memory',
                    impact: 'Reduced memory footprint'
                });
            }
        } catch (error) {
            console.error('[FPM] Function optimization error:', error);
        }

        // Log optimization results
        const logData = {
            timestamp: Date.now(),
            userId: context.auth.uid,
            optimizations: optimizations,
            totalOptimizations: optimizations.length
        };

        await admin.database().ref(`optimization-logs/${Date.now()}`).set(logData);

        return {
            success: true,
            optimizations: optimizations,
            summary: `Applied ${optimizations.length} optimizations`,
            timestamp: Date.now()
        };

    } catch (error) {
        console.error('[FPM] System optimization error:', error);

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', 'System optimization failed');
    }
});

/**
 * Get comprehensive system metrics for FPM dashboard
 */
exports.getSystemMetrics = functions.https.onCall(async (data, context) => {
    try {
        // Verify admin authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
        }

        const token = await admin.auth().getUser(context.auth.uid);
        const customClaims = token.customClaims || {};

        if (!customClaims.admin && customClaims.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
        }

        const metrics = {
            timestamp: Date.now(),
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                uptime: Math.round(process.uptime()),
                memoryUsage: process.memoryUsage()
            },
            database: {
                connectionStatus: 'connected', // Firebase doesn't expose connection status
                activeConnections: 'unknown',
                queryPerformance: await getDatabaseQueryMetrics()
            },
            functions: {
                activeInstances: 'unknown', // Firebase doesn't expose this
                coldStarts: await getColdStartMetrics(),
                invocationStats: await getInvocationStats()
            },
            cache: await getCacheStats()
        };

        return metrics;

    } catch (error) {
        console.error('[FPM] System metrics error:', error);

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', 'Failed to collect system metrics');
    }
});

/**
 * Helper function to get database query performance metrics
 */
async function getDatabaseQueryMetrics() {
    const startTime = process.hrtime.bigint();

    try {
        // Test various database operations
        const operations = await Promise.all([
            admin.database().ref('guests').limitToLast(1).once('value'),
            admin.database().ref('locations').limitToLast(1).once('value'),
            admin.database().ref('subscriptions').limitToLast(1).once('value')
        ]);

        const endTime = process.hrtime.bigint();
        const totalTime = Number(endTime - startTime) / 1000000;

        return {
            averageQueryTime: Math.round(totalTime / 3),
            totalQueryTime: Math.round(totalTime),
            operationCount: 3,
            successRate: 100
        };

    } catch (error) {
        console.error('Database query metrics error:', error);
        return {
            error: error.message,
            successRate: 0
        };
    }
}

/**
 * Helper function to get cold start metrics (simulated)
 */
async function getColdStartMetrics() {
    // In a real implementation, this would track cold starts
    // For now, we'll simulate based on function warmth
    return {
        coldStartCount: global.warmFunction ? 0 : 1,
        lastColdStart: global.lastColdStart || Date.now(),
        warmInstances: global.warmFunction ? 1 : 0
    };
}

/**
 * Helper function to get function invocation statistics
 */
async function getInvocationStats() {
    // In a real implementation, this would pull from Firebase function logs
    // For now, we'll provide simulated data
    return {
        totalInvocations: Math.floor(Math.random() * 10000 + 1000),
        errorsCount: Math.floor(Math.random() * 50),
        averageExecutionTime: Math.round(Math.random() * 2000 + 500),
        lastInvocation: Date.now()
    };
}

// ================================================================================================
// RECEIPT TEMPLATE MANAGEMENT ENDPOINTS
// ================================================================================================

const {
    getAllTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    uploadTemplateImage,
    getTemplateLogs
} = require('./receiptTemplateManager');

const { detectReceiptText } = require('./receiptProcessor');

/**
 * Get all receipt templates (with optional filtering)
 * GET /getReceiptTemplates?brandName=...&status=...&sortBy=...
 */
exports.getReceiptTemplates = onRequest({ cors: true }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // Verify admin authentication
            if (!req.headers.authorization) {
                return res.status(401).json({ error: 'Unauthorized - No authorization header' });
            }

            const token = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);

            if (!decodedToken.admin) {
                return res.status(403).json({ error: 'Forbidden - Admin access required' });
            }

            // Get query parameters for filtering
            const filters = {
                brandName: req.query.brandName || null,
                status: req.query.status || null,
                minSuccessRate: req.query.minSuccessRate ? parseInt(req.query.minSuccessRate) : undefined,
                sortBy: req.query.sortBy || 'createdAt'
            };

            const templates = await getAllTemplates(filters);

            res.status(200).json({
                success: true,
                count: templates.length,
                templates
            });

        } catch (error) {
            console.error('Error getting templates:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Get a single template by ID
 * GET /getReceiptTemplate/:templateId
 */
exports.getReceiptTemplate = onRequest({ cors: true }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // Verify admin authentication
            if (!req.headers.authorization) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const token = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);

            if (!decodedToken.admin) {
                return res.status(403).json({ error: 'Forbidden - Admin access required' });
            }

            const templateId = req.query.templateId || req.body.templateId;

            if (!templateId) {
                return res.status(400).json({ error: 'Template ID required' });
            }

            const template = await getTemplate(templateId);

            if (!template) {
                return res.status(404).json({ error: 'Template not found' });
            }

            res.status(200).json({
                success: true,
                template
            });

        } catch (error) {
            console.error('Error getting template:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Create a new receipt template
 * POST /createReceiptTemplate
 */
exports.createReceiptTemplate = onRequest({ cors: true }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // Verify admin authentication
            if (!req.headers.authorization) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const token = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);

            if (!decodedToken.admin) {
                return res.status(403).json({ error: 'Forbidden - Admin access required' });
            }

            const templateData = req.body;

            // Validate required fields
            if (!templateData.templateName || !templateData.brandName || !templateData.patterns) {
                return res.status(400).json({
                    error: 'Missing required fields: templateName, brandName, patterns'
                });
            }

            // Create template
            const newTemplate = await createTemplate(templateData, decodedToken.uid);

            res.status(201).json({
                success: true,
                message: 'Template created successfully',
                template: newTemplate
            });

        } catch (error) {
            console.error('Error creating template:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Update an existing template
 * PUT /updateReceiptTemplate
 */
exports.updateReceiptTemplate = onRequest({ cors: true }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // Verify admin authentication
            if (!req.headers.authorization) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const token = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);

            if (!decodedToken.admin) {
                return res.status(403).json({ error: 'Forbidden - Admin access required' });
            }

            const { templateId, updates } = req.body;

            if (!templateId) {
                return res.status(400).json({ error: 'Template ID required' });
            }

            const updatedTemplate = await updateTemplate(templateId, updates, decodedToken.uid);

            res.status(200).json({
                success: true,
                message: 'Template updated successfully',
                template: updatedTemplate
            });

        } catch (error) {
            console.error('Error updating template:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Delete (deprecate) a template
 * DELETE /deleteReceiptTemplate
 */
exports.deleteReceiptTemplate = onRequest({ cors: true }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // Verify admin authentication
            if (!req.headers.authorization) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const token = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);

            if (!decodedToken.admin) {
                return res.status(403).json({ error: 'Forbidden - Admin access required' });
            }

            const templateId = req.query.templateId || req.body.templateId;

            if (!templateId) {
                return res.status(400).json({ error: 'Template ID required' });
            }

            await deleteTemplate(templateId, decodedToken.uid);

            res.status(200).json({
                success: true,
                message: 'Template deleted successfully'
            });

        } catch (error) {
            console.error('Error deleting template:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * OCR a receipt image for template creation
 * POST /ocrReceiptForTemplate
 */
exports.ocrReceiptForTemplate = onRequest({ cors: true }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // Verify admin authentication
            if (!req.headers.authorization) {
                console.error('No authorization header provided');
                return res.status(401).json({ error: 'Unauthorized - No authorization header' });
            }

            const authHeader = req.headers.authorization;
            console.log('Authorization header received:', authHeader ? `Bearer ${authHeader.substring(7, 27)}...` : 'none');

            if (!authHeader.startsWith('Bearer ')) {
                console.error('Invalid authorization header format');
                return res.status(401).json({ error: 'Unauthorized - Invalid authorization format' });
            }

            const token = authHeader.split('Bearer ')[1];
            console.log('Token extracted, length:', token ? token.length : 0);
            console.log('Token first 50 chars:', token ? token.substring(0, 50) : 'null');

            if (!token || token.trim() === '') {
                console.error('Empty token in authorization header');
                return res.status(401).json({ error: 'Unauthorized - Empty token' });
            }

            console.log('Verifying ID token for OCR request...');
            const decodedToken = await admin.auth().verifyIdToken(token);
            console.log('Token verified for user:', decodedToken.uid);

            if (!decodedToken.admin) {
                console.error('User is not an admin:', decodedToken.uid);
                return res.status(403).json({ error: 'Forbidden - Admin access required' });
            }

            const { imageUrl, imageData } = req.body;

            if (!imageUrl && !imageData) {
                return res.status(400).json({ error: 'Either imageUrl or imageData is required' });
            }

            // Perform OCR
            let result;
            if (imageData) {
                // Handle base64 image data
                const vision = require('@google-cloud/vision');
                const client = new vision.ImageAnnotatorClient();

                // Extract base64 content (remove data:image/...;base64, prefix if present)
                let base64Content = imageData;
                if (imageData.includes('base64,')) {
                    base64Content = imageData.split('base64,')[1];
                }

                // Convert base64 string to Buffer for Vision API
                const imageBuffer = Buffer.from(base64Content, 'base64');

                [result] = await client.textDetection({
                    image: { content: imageBuffer }
                });
            } else {
                // Handle image URL
                [result] = await detectReceiptText(imageUrl);
            }

            if (!result || !result.textAnnotations || result.textAnnotations.length === 0) {
                return res.status(400).json({
                    error: 'No text detected in image. Please try a clearer image.'
                });
            }

            const fullText = result.textAnnotations[0].description;
            const lines = fullText.split('\n').map((line, index) => ({
                lineNumber: index,
                text: line.trim()
            }));

            res.status(200).json({
                success: true,
                fullText,
                lines,
                lineCount: lines.length
            });

        } catch (error) {
            console.error('Error OCR-ing receipt:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Get template performance logs
 * GET /getTemplatePerformance/:templateId?limit=100
 */
exports.getTemplatePerformance = onRequest({ cors: true }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // Verify admin authentication
            if (!req.headers.authorization) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const token = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);

            if (!decodedToken.admin) {
                return res.status(403).json({ error: 'Forbidden - Admin access required' });
            }

            const templateId = req.query.templateId || null;
            const limit = parseInt(req.query.limit) || 100;

            const logs = await getTemplateLogs(templateId, limit);

            res.status(200).json({
                success: true,
                count: logs.length,
                logs
            });

        } catch (error) {
            console.error('Error getting template performance:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

// ============================================
// PROJECT MANAGEMENT FUNCTIONS
// ============================================
const projectManagement = require('./projectManagement');
exports.createProject = projectManagement.createProject;
exports.updateProject = projectManagement.updateProject;
exports.deleteProject = projectManagement.deleteProject;
exports.getProjects = projectManagement.getProjects;
exports.manageProjectTasks = projectManagement.manageProjectTasks;
exports.manageProjectMilestones = projectManagement.manageProjectMilestones;
