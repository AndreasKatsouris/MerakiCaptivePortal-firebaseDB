const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
// Phase 7 ④a: the entitlement resolver is the sole writer of materialized
// subscriptions/{uid}/features + limits. Server writers below call it instead
// of inline-copying tier data (see docs/plans/2026-05-31-entitlements-addon-layer-design.md §6).
const { recomputeEntitlements } = require('./entitlements/resolver');

// Secrets — provisioned via Firebase Secrets Manager, never hardcoded.
//   firebase functions:secrets:set MERAKI_SHARED_SECRET
//   firebase functions:secrets:set INITIAL_ADMIN_SETUP_SECRET
const MERAKI_SHARED_SECRET = defineSecret('MERAKI_SHARED_SECRET');
const INITIAL_ADMIN_SETUP_SECRET = defineSecret('INITIAL_ADMIN_SETUP_SECRET');
// CORS origin allowlist — shared with ross.js (and any future entry point)
// via ./cors-allowlist so the policy has a single source of truth.
const { corsOptions } = require('./cors-allowlist');
const cors = require('cors')(corsOptions);
const express = require('express');

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
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
    removeWhatsAppNumberFunction,
    getWhatsAppTemplateConfigFunction,
    updateWhatsAppTemplateConfigFunction,
    addWhatsAppTemplateConfigFunction,
    deleteWhatsAppTemplateConfigFunction,
    sendWhatsAppTestMessageFunction
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

/**
 * Verify the caller holds a valid admin Firebase ID token.
 * On failure, writes the 401/403 response and returns null.
 * On success, returns the decoded token.
 * Mirrors the inline pattern used by markVoucherRedeemed / bulkQueueOperations.
 */
async function requireAdmin(req, res) {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
        res.status(401).json({ error: 'No token provided' });
        return null;
    }
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const isAdminInDb = await admin.database()
            .ref(`admin-claims/${decodedToken.uid}`)
            .once('value')
            .then(snapshot => snapshot.val() === true);
        if (decodedToken.admin !== true || !isAdminInDb) {
            res.status(403).json({ error: 'Unauthorized - Admin access required' });
            return null;
        }
        return decodedToken;
    } catch (error) {
        console.error('[requireAdmin] Token verification failed:', error.message);
        res.status(401).json({ error: 'Invalid token' });
        return null;
    }
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
        // Test-data seeding must never run in production. Disabled unless
        // ENABLE_TEST_DATA is explicitly set to 'true' (local/dev only).
        if (process.env.ENABLE_TEST_DATA !== 'true') {
            return res.status(404).end();
        }

        // DANGER: below this point there is NO auth check and wildcard CORS.
        // This endpoint is safe ONLY because of the ENABLE_TEST_DATA gate above.
        // Never set ENABLE_TEST_DATA=true in production.
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
exports.merakiWebhook = onRequest({ secrets: [MERAKI_SHARED_SECRET] }, (req, res) => {
    if (req.method === 'GET') {
        const validator = "371de0de57b8741627daa5e30f25beb917614141"; // Replace with your validator string
        console.log("Meraki validator string requested.");
        return res.status(200).send(validator);
    }

    console.log('Received POST request from Meraki Scanning API.');

    const sharedSecret = MERAKI_SHARED_SECRET.value();

    if (!sharedSecret || req.body.secret !== sharedSecret) {
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
// v2 callable: single `request` arg replaces v1 `(data, context)` — see PR #67.
exports.registerUser = onCall(async (request) => {
    const { data, auth } = request;

    console.log('[registerUser] Function called with auth:', {
        hasAuth: !!auth,
        uid: auth?.uid,
        email: auth?.token?.email,
        emailVerified: auth?.token?.email_verified
    });

    // Ensure user is authenticated
    if (!auth) {
        console.error('[registerUser] No authentication context found');
        throw new HttpsError(
            'unauthenticated',
            'You must be logged in to register.'
        );
    }

    try {
        const userId = auth.uid;
        const userEmail = auth.token.email || data.email;
        console.log('[registerUser] Processing registration for user:', userId, userEmail);

        const {
            firstName,
            lastName,
            businessName,
            businessAddress,
            businessPhone,
            businessType,
            isFranchise,
            franchiseName,
            brandName,
            selectedTier,
            tier,
            tierData
        } = data;

        // PR 2: prefer the explicit `tier` field; fall back to legacy
        // `selectedTier` for compat with any older callers still in flight.
        const tierId = tier || selectedTier || null;

        // PR 2 review (Major #1): validate tierId against the canonical
        // subscriptionTiers node — never trust the caller. Mirrors the
        // pattern already used by createUserAccount (line 858). Use the
        // server-fetched tier data for features/limits so a client can't
        // inflate its own subscription by stuffing tierData on the way in.
        if (!tierId) {
            throw new HttpsError('invalid-argument', 'Tier is required.');
        }
        const canonicalTierSnap = await admin.database().ref(`subscriptionTiers/${tierId}`).once('value');
        if (!canonicalTierSnap.exists()) {
            console.error('[registerUser] Invalid tier:', tierId);
            throw new HttpsError('invalid-argument', `Unknown tier: ${tierId}`);
        }
        const canonicalTierData = canonicalTierSnap.val() || {};

        // PR 2 review (Major #1): bound free-text user-supplied strings
        // before persisting to RTDB. Keeps a misconfigured or malicious
        // client from writing arbitrarily large blobs into shared nodes.
        const MAX_NAME = 200;
        const tooLong = (s) => typeof s === 'string' && s.length > MAX_NAME;
        if (tooLong(franchiseName)) throw new HttpsError('invalid-argument', 'franchiseName too long.');
        if (tooLong(brandName))     throw new HttpsError('invalid-argument', 'brandName too long.');
        if (tooLong(businessName))  throw new HttpsError('invalid-argument', 'businessName too long.');

        // Create user data
        const userData = {
            uid: userId,
            email: userEmail,
            firstName: firstName,
            lastName: lastName,
            displayName: `${firstName} ${lastName}`,
            tier: tierId,
            businessInfo: {
                name: businessName,
                address: businessAddress,
                phone: businessPhone,
                type: businessType
            },
            isFranchise: isFranchise || false,
            franchiseName: franchiseName || '',
            brandName: brandName || '',
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
            status: 'active',
            role: 'user'
        };

        // Create subscription data. Write both `tier` (canonical) and
        // `tierId` (legacy) to bridge the historical field-name drift —
        // see docs/plans/2026-05-05-pr42-signup-v2-hifi.md §2 Q5.
        const subscriptionData = {
            userId: userId,
            tier: tierId,
            tierId: tierId,
            status: 'trial', // Start with trial
            startDate: admin.database.ServerValue.TIMESTAMP,
            trialEndDate: Date.now() + (14 * 24 * 60 * 60 * 1000), // 14-day trial
            // Phase 7 ④a: features/limits are NO LONGER written inline here.
            // The resolver materializes them from the tier (+ any add-ons) below,
            // as the sole writer — see recomputeEntitlements() call after the write.
            metadata: {
                signupSource: 'web',
                initialTier: tierId
            }
        };

        // PR 2 review (Minor #4): atomic multi-path write. Read existing
        // state to honour the merge-vs-overwrite guards, then commit
        // users/subs/onboarding-progress in a single `update()` call so a
        // mid-sequence failure can't leave the account half-initialised
        // (the post-login router reads onboarding-progress first thing
        // post-signup — a missing node mis-routes silently).
        // The locations + userLocations writes stay separate because they
        // need a `push()` key.
        const userRef         = admin.database().ref(`users/${userId}`);
        const subscriptionRef = admin.database().ref(`subscriptions/${userId}`);
        const onboardingRef   = admin.database().ref(`onboarding-progress/${userId}`);

        const [existingUserSnap, existingSubSnap, existingOnboardingSnap] = await Promise.all([
            userRef.once('value'),
            subscriptionRef.once('value'),
            onboardingRef.once('value'),
        ]);

        let userPayload = userData;
        if (existingUserSnap.exists()) {
            console.log(`⚠️ [CloudFunction] User ${userId} already exists, merging data instead of overwriting`);
            const existingUserData = existingUserSnap.val();
            userPayload = {
                ...existingUserData,
                ...userData,
                // Preserve existing phone numbers if they exist
                phoneNumber:   existingUserData.phoneNumber   || userData.phoneNumber,
                phone:         existingUserData.phone         || userData.phone,
                businessPhone: existingUserData.businessPhone || userData.businessPhone,
                updatedAt: admin.database.ServerValue.TIMESTAMP
            };
        }

        let subPayload = subscriptionData;
        if (existingSubSnap.exists()) {
            console.log(`⚠️ [CloudFunction] Subscription ${userId} already exists, merging data instead of overwriting`);
            subPayload = {
                ...existingSubSnap.val(),
                ...subscriptionData,
                updatedAt: admin.database.ServerValue.TIMESTAMP
            };
        }

        const multiWrite = {
            [`users/${userId}`]:         userPayload,
            [`subscriptions/${userId}`]: subPayload,
        };
        // PR 2 + PR 1 contract: initialise onboarding-progress only when
        // absent so we can't stomp a wizard that has already advanced
        // past helloSeen on a re-entry of an existing account.
        if (!existingOnboardingSnap.exists()) {
            multiWrite[`onboarding-progress/${userId}`] = {
                completed: false,
                helloSeen: false,
                createdAt: admin.database.ServerValue.TIMESTAMP
            };
        }
        await admin.database().ref().update(multiWrite);

        // Phase 7 ④a: materialize features/limits via the resolver (sole writer).
        // The subscription record (with tier + status) is already written above,
        // so recompute reads it back, merges base tier + add-ons, and writes the
        // canonical features/limits. Best-effort: the account is already created, and
        // readers fall back to tier constants when features is absent (audit finding B),
        // so a recompute hiccup is self-healing via the daily cron — log, don't fail signup.
        try {
            await recomputeEntitlements(userId);
        } catch (recomputeErr) {
            console.error(`[registerUser] recomputeEntitlements failed for ${userId}:`, recomputeErr.message);
        }

        // Create initial location for the user
        const locationData = {
            name: businessName,
            address: businessAddress,
            phone: businessPhone,
            type: businessType,
            ownerId: userId,
            isFranchise: isFranchise || false,
            franchiseName: franchiseName || '',
            brandName: brandName || businessName,
            createdAt: admin.database.ServerValue.TIMESTAMP,
            status: 'active',
            settings: {
                timezone: 'UTC',
                currency: 'USD',
                language: 'en'
            }
        };

        // Create a location and link it to the user (separate from the
        // multi-path write above because the location node needs a push() key)
        const locationRef = await admin.database().ref('locations').push();
        await locationRef.set(locationData);
        await admin.database().ref(`userLocations/${userId}/${locationRef.key}`).set(true);

        return { success: true, userId: userId };

    } catch (error) {
        // Let explicit HttpsError validation throws (invalid-argument for
        // bad tier, name-too-long, etc.) propagate with their original code
        // and message. Without this guard the outer catch rewraps them as
        // generic 'internal', hiding validation reasons from the client.
        if (error instanceof HttpsError) throw error;
        console.error('Error in registerUser function:', error);
        throw new HttpsError(
            'internal',
            'An error occurred during registration.'
        );
    }
});

exports.getGoogleConfig = onRequest(async (req, res) => {
    // Returns a billable API key — admin only. Non-admin operators also hold
    // Firebase Auth accounts, so a token-only check would still leak the key.
    // (Defence in depth: the key should also carry an HTTP-referrer
    // restriction in the GCP console.)
    if (!await requireAdmin(req, res)) return;

    res.json({
        apiKey: functions.config.google.places_api_key,
        placeId: functions.config.google.place_id
    });
});

/**
 * Cloud Function to set admin claims for a user
 * Requires the caller to be an admin themselves
 */
exports.setAdminClaim = onRequest((req, res) => cors(req, res, async () => {
    console.log('[setAdminClaim] Received request:', {
        method: req.method,
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
            admin: callerToken.admin === true
        });

        // Check if the caller is an admin
        if (callerToken.admin !== true) {
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
}));

/**
 * Cloud Function to verify admin status of a user
 * Returns isAdmin: true/false based on the user's custom claims
 */
exports.verifyAdminStatus = onRequest(async (req, res) => {
    console.log('[verifyAdminStatus] Received request:', {
        method: req.method,
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
                admin: decodedToken.admin === true
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
exports.createUserAccount = onRequest({ invoker: 'public' }, async (req, res) => {
    console.log('[createUserAccount] Received request:', {
        method: req.method,
        contentType: req.headers['content-type']
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

            // Create or reinstate Firebase Auth user
            let userRecord;
            let reinstated = false;

            try {
                userRecord = await admin.auth().createUser({
                    email,
                    password,
                    emailVerified: false,
                    displayName: `${firstName} ${lastName}`
                });
                console.log('[createUserAccount] Firebase Auth user created:', userRecord.uid);
            } catch (createError) {
                if (createError.code === 'auth/email-already-exists') {
                    // User exists in Auth — reinstate by updating their account
                    console.log('[createUserAccount] Auth account exists, reinstating user:', email);
                    const existingUser = await admin.auth().getUserByEmail(email);
                    await admin.auth().updateUser(existingUser.uid, {
                        password,
                        displayName: `${firstName} ${lastName}`,
                        disabled: false
                    });
                    userRecord = await admin.auth().getUser(existingUser.uid);
                    reinstated = true;
                    console.log('[createUserAccount] User reinstated:', userRecord.uid);
                } else {
                    throw createError;
                }
            }

            // Set admin claim if requested
            if (isAdmin) {
                await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
                await admin.database().ref(`admin-claims/${userRecord.uid}`).set(true);
                console.log('[createUserAccount] Admin claims set');
            } else if (reinstated) {
                // Clear admin claims if reinstating as non-admin
                await admin.auth().setCustomUserClaims(userRecord.uid, { admin: false });
                await admin.database().ref(`admin-claims/${userRecord.uid}`).remove();
            }

            // Create/update user record in database
            const userData = {
                email,
                displayName: `${firstName} ${lastName}`,
                firstName,
                lastName,
                businessName: businessName || '',
                phoneNumber: phoneNumber || '',
                createdAt: admin.database.ServerValue.TIMESTAMP,
                lastLogin: admin.database.ServerValue.TIMESTAMP,
                emailVerified: false,
                requiresPasswordChange: true
            };

            if (reinstated) {
                // Merge with any existing data, reset onboarding so user goes through setup again
                await admin.database().ref(`users/${userRecord.uid}`).update(userData);
                await admin.database().ref(`onboarding-progress/${userRecord.uid}`).remove();
                console.log('[createUserAccount] User record updated (reinstated), onboarding reset');
            } else {
                await admin.database().ref(`users/${userRecord.uid}`).set(userData);
                console.log('[createUserAccount] User record created');
            }

            // Create subscription with locationIds
            const subscriptionData = {
                userId: userRecord.uid,
                tier: tier,
                tierId: tier,
                status: 'active',
                paymentStatus: 'active',
                startDate: admin.database.ServerValue.TIMESTAMP,
                // Phase 7 ④a: features/limits materialized by the resolver below,
                // not inline-copied here (resolver = sole writer).
                locationIds: assignedLocations,
                metadata: {
                    signupSource: 'admin',
                    initialTier: tier,
                    createdBy: decodedToken.uid
                }
            };

            await admin.database().ref(`subscriptions/${userRecord.uid}`).set(subscriptionData);
            // Phase 7 ④a: materialize features/limits via the resolver (sole writer)
            // after the subscription record exists. Best-effort (self-heals via the
            // daily cron; readers fall back to tier constants meanwhile) — log, don't fail.
            try {
                await recomputeEntitlements(userRecord.uid);
            } catch (recomputeErr) {
                console.error(`[createUserAccount] recomputeEntitlements failed for ${userRecord.uid}:`, recomputeErr.message);
            }
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

            // Send welcome email with temporary password
            let emailSent = false;
            try {
                const sgClient = require('./sendgridClient').client;
                const loginUrl = 'https://merakicaptiveportal-firebasedb.web.app/user-login.html';

                const emailData = {
                    personalizations: [{
                        to: [{ email, name: `${firstName} ${lastName}` }],
                        subject: 'Welcome to Sparks Hospitality — Your Account is Ready'
                    }],
                    from: {
                        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@sparkshospitality.co.za',
                        name: 'Sparks Hospitality'
                    },
                    content: [{
                        type: 'text/html',
                        value: `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                <div style="background: linear-gradient(135deg, #0d6efd, #6610f2); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                                    <h1 style="color: white; margin: 0;">Welcome to Sparks Hospitality</h1>
                                </div>
                                <div style="padding: 30px; background: #ffffff; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 8px 8px;">
                                    <p>Hi ${escapeHtml(firstName)},</p>
                                    <p>Your account has been created by an administrator. Here are your login details:</p>
                                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                        <p style="margin: 5px 0;"><strong>Email:</strong> ${escapeHtml(email)}</p>
                                        <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${escapeHtml(password)}</p>
                                        <p style="margin: 5px 0;"><strong>Subscription:</strong> ${escapeHtml(tierData.name || tier)}</p>
                                    </div>
                                    <p style="text-align: center; margin: 25px 0;">
                                        <a href="${loginUrl}" style="background: #0d6efd; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Log In Now</a>
                                    </p>
                                    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                                        <strong>Important:</strong> You will be asked to change your password when you first log in. After that, a short onboarding wizard will help you set up your business profile.
                                    </div>
                                    <p style="color: #6c757d; font-size: 0.9em; margin-top: 25px;">If you did not expect this email, please ignore it or contact support.</p>
                                </div>
                            </div>`
                    }]
                };

                await sgClient.request({
                    url: '/v3/mail/send',
                    method: 'POST',
                    body: emailData
                });
                emailSent = true;
                console.log('[createUserAccount] Welcome email sent to', email);
            } catch (emailError) {
                console.error('[createUserAccount] Failed to send welcome email:', emailError.message);
                // Don't fail the whole operation if email fails
            }

            // Return success
            return res.status(200).json({
                success: true,
                message: reinstated ? 'User reinstated successfully' : 'User created successfully',
                userId: userRecord.uid,
                email: email,
                tier: tier,
                isAdmin: isAdmin || false,
                locationCount: assignedLocations.length,
                emailSent,
                reinstated
            });

        } catch (error) {
            console.error('[createUserAccount] Error:', error);

            // Return user-friendly error messages for known cases
            let statusCode = 500;
            let errorMessage = 'Failed to create user';

            if (error.code === 'auth/email-already-exists' || (error.errorInfo && error.errorInfo.code === 'auth/email-already-exists')) {
                statusCode = 409;
                errorMessage = 'A user with this email address already exists';
            } else if (error.code === 'auth/invalid-email') {
                statusCode = 400;
                errorMessage = 'The email address is not valid';
            } else if (error.code === 'auth/weak-password') {
                statusCode = 400;
                errorMessage = 'The password is too weak (minimum 6 characters)';
            }

            return res.status(statusCode).json({
                error: errorMessage,
                details: error.message
            });
        }
    });
});

/**
 * Resend welcome email to a user who hasn't logged in yet (Admin only)
 */
exports.resendWelcomeEmail = onRequest({ invoker: 'public' }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // Verify admin
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const idToken = authHeader.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const adminSnapshot = await admin.database().ref(`admin-claims/${decodedToken.uid}`).once('value');
            if (!adminSnapshot.exists()) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const { userId } = req.body;
            if (!userId) {
                return res.status(400).json({ error: 'userId is required' });
            }

            // Get user data
            const userSnapshot = await admin.database().ref(`users/${userId}`).once('value');
            const userData = userSnapshot.val();
            if (!userData) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (!userData.requiresPasswordChange) {
                return res.status(400).json({ error: 'User has already changed their password — welcome email not applicable' });
            }

            // Get subscription tier name
            const subSnapshot = await admin.database().ref(`subscriptions/${userId}`).once('value');
            const subData = subSnapshot.val() || {};
            const tierId = subData.tierId || subData.tier || 'free';
            const tierSnapshot = await admin.database().ref(`subscriptionTiers/${tierId}`).once('value');
            const tierData = tierSnapshot.val() || {};

            // Get auth user to get email
            const authUser = await admin.auth().getUser(userId);

            // Generate a temp password and update
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
            let tempPassword = '';
            for (let i = 0; i < 12; i++) {
                tempPassword += chars.charAt(crypto.randomInt(chars.length));
            }
            await admin.auth().updateUser(userId, { password: tempPassword });

            // Send email
            const sgClient = require('./sendgridClient').client;
            const loginUrl = 'https://merakicaptiveportal-firebasedb.web.app/user-login.html';
            const firstName = userData.firstName || userData.displayName || 'there';

            const emailData = {
                personalizations: [{
                    to: [{ email: authUser.email, name: userData.displayName || authUser.email }],
                    subject: 'Welcome to Sparks Hospitality — Your Account is Ready'
                }],
                from: {
                    email: process.env.SENDGRID_FROM_EMAIL || 'noreply@sparkshospitality.co.za',
                    name: 'Sparks Hospitality'
                },
                content: [{
                    type: 'text/html',
                    value: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: linear-gradient(135deg, #0d6efd, #6610f2); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                                <h1 style="color: white; margin: 0;">Welcome to Sparks Hospitality</h1>
                            </div>
                            <div style="padding: 30px; background: #ffffff; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 8px 8px;">
                                <p>Hi ${escapeHtml(firstName)},</p>
                                <p>Your account has been created by an administrator. Here are your login details:</p>
                                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                    <p style="margin: 5px 0;"><strong>Email:</strong> ${escapeHtml(authUser.email)}</p>
                                    <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${escapeHtml(tempPassword)}</p>
                                    <p style="margin: 5px 0;"><strong>Subscription:</strong> ${escapeHtml(tierData.name || tierId)}</p>
                                </div>
                                <p style="text-align: center; margin: 25px 0;">
                                    <a href="${loginUrl}" style="background: #0d6efd; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Log In Now</a>
                                </p>
                                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                                    <strong>Important:</strong> You will be asked to change your password when you first log in. After that, a short onboarding wizard will help you set up your business profile.
                                </div>
                                <p style="color: #6c757d; font-size: 0.9em; margin-top: 25px;">If you did not expect this email, please ignore it or contact support.</p>
                            </div>
                        </div>`
                }]
            };

            await sgClient.request({
                url: '/v3/mail/send',
                method: 'POST',
                body: emailData
            });

            console.log('[resendWelcomeEmail] Welcome email resent to', authUser.email);

            return res.status(200).json({
                success: true,
                message: `Welcome email resent to ${authUser.email}`
            });

        } catch (error) {
            console.error('[resendWelcomeEmail] Error:', error);
            return res.status(500).json({
                error: 'Failed to resend welcome email',
                details: error.message
            });
        }
    });
});

/**
 * One-time setup endpoint to create the initial admin user
 * This should be secured and disabled after initial setup
 */
exports.setupInitialAdmin = onRequest({ secrets: [INITIAL_ADMIN_SETUP_SECRET] }, async (req, res) => {
    console.log('[setupInitialAdmin] Received request:', {
        method: req.method,
        origin: req.headers.origin || 'No origin'
    });

    // Bootstrap endpoint — disabled unless explicitly enabled. Keep INITIAL_SETUP_ENABLED
    // unset (or anything other than 'true') in production so this cannot be reached.
    if (process.env.INITIAL_SETUP_ENABLED !== 'true') {
        return res.status(404).end();
    }

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
            const SETUP_SECRET = INITIAL_ADMIN_SETUP_SECRET.value();
            console.log('[setupInitialAdmin] Verifying setup secret');
            if (!SETUP_SECRET || setupSecret !== SETUP_SECRET) {
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
 * Cloud Function to record a guest WiFi captive-portal login.
 *
 * Replaces the prior client-side direct RTDB write to /wifiLogins and
 * /activeUsers, which required `.write: true` on those nodes — a public-
 * internet exposure (anyone could write arbitrary data). Now those nodes
 * are admin-only at the rules layer; this CF is the sole guest-write path,
 * running under the Admin SDK after anonymous-auth + per-UID rate limit +
 * shape validation.
 *
 * Auth model: anonymous Firebase Auth. The captive-portal guest has no
 * other identity. Anon UID gives a per-device handle for rate limiting
 * and write attribution. Anonymous-auth uses the same auth hostname
 * family (identitytoolkit.googleapis.com) as RTDB, so it reaches the
 * client through walled gardens that already permit the existing RTDB
 * writes — no new walled-garden whitelist needed for auth itself.
 * (Cloud Functions hostname is the one new dependency; client handles
 * CF failure by falling through to the existing localStorage offline
 * retry queue, so the Meraki redirect path never blocks.)
 */
exports.submitWifiLogin = onCall(
    { timeoutSeconds: 30, memory: '256MiB' },
    async (request) => {
        const { auth, data } = request;

        if (!auth) {
            throw new HttpsError('unauthenticated', 'Sign-in required.');
        }
        const uid = auth.uid;

        // Per-UID 5s debounce. Captive portal is a one-shot flow per
        // device; abuse vector is bot flooding, debounce is sufficient
        // (sliding-window would be overkill).
        const rateRef = admin.database().ref(`rateLimitsWifi/${uid}`);
        const lastSnap = await rateRef.once('value');
        const last = lastSnap.val();
        const now = Date.now();
        if (last?.lastWriteAt && now - last.lastWriteAt < 5000) {
            throw new HttpsError('resource-exhausted', 'Please wait a moment before retrying.');
        }

        // Shape validation + length caps. Caps mirror the .validate rules
        // in database.rules.json (defense in depth — the rules fire on
        // the Admin SDK's multi-path update() below).
        const name = String(data?.name || '').trim().slice(0, 120);
        const email = String(data?.email || '').trim().slice(0, 254);
        const phoneNumber = String(data?.phoneNumber || '').trim().slice(0, 24);
        const table = String(data?.table || '').trim().slice(0, 24);
        const marketingConsent = Boolean(data?.marketingConsent);
        const client_mac = String(data?.client_mac || '').trim().slice(0, 32);
        const node_mac = String(data?.node_mac || '').trim().slice(0, 32);
        const client_ip = String(data?.client_ip || '').trim().slice(0, 45);

        if (!name || name.split(/\s+/).length < 2) {
            throw new HttpsError('invalid-argument', 'Full name (first + last) is required.');
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new HttpsError('invalid-argument', 'Valid email is required.');
        }
        const digits = phoneNumber.replace(/[\s\-()]/g, '');
        if (!/^\+?\d{7,15}$/.test(digits)) {
            throw new HttpsError('invalid-argument', 'Valid phone number is required.');
        }
        const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
        if (client_mac && !macPattern.test(client_mac)) {
            throw new HttpsError('invalid-argument', 'Invalid client MAC.');
        }
        if (node_mac && !macPattern.test(node_mac)) {
            throw new HttpsError('invalid-argument', 'Invalid node MAC.');
        }

        // Server-generated sessionID (replaces client Math.random which
        // is non-cryptographic and collidable).
        const sessionID = admin.database().ref('wifiLogins').push().key;
        const timestamp = new Date().toISOString();

        const loginRecord = {
            sessionID,
            timestamp,
            name,
            email,
            phoneNumber,
            table,
            marketingConsent,
            client_mac,
            node_mac,
            client_ip,
            active: true,
            anonUid: uid
        };
        const activeRecord = {
            sessionID,
            timestamp,
            lastSeen: timestamp,
            name,
            email,
            phoneNumber,
            anonUid: uid
        };

        // Atomic multi-path write. activeUsers key falls back to
        // sessionID when client_mac is empty (e.g. dev / non-Meraki test).
        const activeKey = client_mac || sessionID;
        const patch = {
            [`wifiLogins/${sessionID}`]: loginRecord,
            [`activeUsers/${activeKey}`]: activeRecord,
            [`rateLimitsWifi/${uid}`]: { lastWriteAt: now }
        };
        await admin.database().ref('/').update(patch);

        return { success: true, sessionID };
    }
);

/**
 * Cloud Function to clear scanning data — chunked.
 *
 * Single-write `remove()` on /scanningData hits RTDB's WRITE_TOO_BIG limit
 * (~16 MB) once the node grows. This walks the node in batches via
 * orderByKey().limitToFirst(BATCH) + multi-path null update, staying well
 * under the per-write ceiling. Returns { done } so the client can loop
 * across calls if MAX_BATCHES is exhausted (e.g. millions of records).
 */
exports.clearScanningData = onCall(
    { timeoutSeconds: 540, memory: '512MiB' },
    async (request) => {
        const { auth } = request;

        if (!auth) {
            throw new HttpsError('unauthenticated', 'Sign-in required.');
        }

        const uid = auth.uid;
        const hasAdminClaim = auth.token?.admin === true;
        const isAdminInDb = await admin.database()
            .ref(`admin-claims/${uid}`)
            .once('value')
            .then(snap => snap.val() === true);

        if (!hasAdminClaim || !isAdminInDb) {
            throw new HttpsError('permission-denied', 'Admin access required.');
        }

        const BATCH_SIZE = 500;
        const MAX_BATCHES = 200; // hard cap per invocation: 100K records
        const startedAt = Date.now();
        let deleted = 0;
        let batches = 0;

        while (batches < MAX_BATCHES) {
            const snap = await admin.database()
                .ref('scanningData')
                .orderByKey()
                .limitToFirst(BATCH_SIZE)
                .once('value');
            const val = snap.val();
            if (!val) break;
            const keys = Object.keys(val);
            if (keys.length === 0) break;

            const patch = {};
            for (const k of keys) patch[`scanningData/${k}`] = null;
            await admin.database().ref('/').update(patch);

            deleted += keys.length;
            batches += 1;

            // Short batch = node drained; skip the extra round-trip below
            if (keys.length < BATCH_SIZE) {
                return {
                    success: true,
                    deleted,
                    batches,
                    done: true,
                    durationMs: Date.now() - startedAt
                };
            }
        }

        // Hit MAX_BATCHES with a full final batch — more may remain
        const moreSnap = await admin.database()
            .ref('scanningData')
            .limitToFirst(1)
            .once('value');

        return {
            success: true,
            deleted,
            batches,
            done: !moreSnap.exists(),
            durationMs: Date.now() - startedAt
        };
    }
);

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

            if (decodedToken.admin !== true || !isAdminInDb) {
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

            if (decodedToken.admin !== true || !isAdminInDb) {
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

            if (decodedToken.admin !== true || !isAdminInDb) {
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

            if (decodedToken.admin !== true || !isAdminInDb) {
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
            if (!await requireAdmin(req, res)) return;

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
            if (!await requireAdmin(req, res)) return;

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
            if (!await requireAdmin(req, res)) return;

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

            if (decodedToken.admin !== true || !isAdminInDb) {
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
            if (!await requireAdmin(req, res)) return;

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

            if (decodedToken.admin !== true || !isAdminInDb) {
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

            if (decodedToken.admin !== true || !isAdminInDb) {
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

            if (decodedToken.admin !== true || !isAdminInDb) {
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

            if (decodedToken.admin !== true || !isAdminInDb) {
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

            if (decodedToken.admin !== true || !isAdminInDb) {
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

            if (decodedToken.admin !== true || !isAdminInDb) {
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
// v2 callable: single `request` arg replaces v1 `(data, context)` — see PR #67.
exports.getQMSTierInfo = onCall(async (request) => {
    const { auth } = request;
    try {
        // Ensure user is authenticated
        if (!auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = auth.uid;
        const result = await getQMSTierInfo(userId);

        if (!result.success) {
            throw new HttpsError('internal', result.message);
        }

        return result.tierInfo;
    } catch (error) {
        console.error('Error in getQMSTierInfo:', error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Failed to get QMS tier information');
    }
});

/**
 * Cloud Function for QMS usage statistics
 * Returns user's QMS usage statistics for analytics
 */
// v2 callable: single `request` arg replaces v1 `(data, context)` — see PR #67.
exports.getQMSUsageStats = onCall(async (request) => {
    const { data, auth } = request;
    try {
        // Ensure user is authenticated
        if (!auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated');
        }

        const { locationId } = data;
        if (!locationId) {
            throw new HttpsError('invalid-argument', 'Location ID is required');
        }

        const userId = auth.uid;
        const result = await getQMSUsageStats(userId, locationId);

        if (!result.success) {
            if (result.requiresUpgrade) {
                throw new HttpsError('permission-denied', result.message, {
                    requiresUpgrade: true,
                    requiredFeature: result.requiredFeature
                });
            }
            throw new HttpsError('internal', result.message);
        }

        return result.usageStats;
    } catch (error) {
        console.error('Error in getQMSUsageStats:', error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Failed to get QMS usage statistics');
    }
});

/**
 * Cloud Function for QMS feature access validation
 * Validates if user has access to specific QMS features
 */
// v2 callable: single `request` arg replaces v1 `(data, context)` — see PR #67.
exports.validateQMSFeatureAccess = onCall(async (request) => {
    const { data, auth } = request;
    try {
        // Ensure user is authenticated
        if (!auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated');
        }

        const { featureId } = data;
        if (!featureId) {
            throw new HttpsError('invalid-argument', 'Feature ID is required');
        }

        const userId = auth.uid;
        const hasAccess = await validateQMSFeatureAccess(userId, featureId);

        return {
            hasAccess,
            featureId,
            userId
        };
    } catch (error) {
        console.error('Error in validateQMSFeatureAccess:', error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Failed to validate QMS feature access');
    }
});

/**
 * Cloud Function for QMS WhatsApp integration validation
 * Validates if user has access to WhatsApp integration features
 */
// v2 callable: single `request` arg replaces v1 `(data, context)` — see PR #67.
exports.validateQMSWhatsAppIntegration = onCall(async (request) => {
    const { auth } = request;
    try {
        // Ensure user is authenticated
        if (!auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = auth.uid;
        const result = await validateQMSWhatsAppIntegration(userId);

        if (!result.success) {
            if (result.requiresUpgrade) {
                throw new HttpsError('permission-denied', result.message, {
                    requiresUpgrade: true,
                    requiredFeature: result.requiredFeature
                });
            }
            throw new HttpsError('internal', result.message);
        }

        return {
            hasAccess: true,
            message: result.message
        };
    } catch (error) {
        console.error('Error in validateQMSWhatsAppIntegration:', error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Failed to validate WhatsApp integration access');
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

exports.getWhatsAppTemplateConfig = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ error: 'Authentication required' });
            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
            await getWhatsAppTemplateConfigFunction(req, res);
        } catch (error) {
            console.error('Error in getWhatsAppTemplateConfig:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.updateWhatsAppTemplateConfig = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ error: 'Authentication required' });
            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
            await updateWhatsAppTemplateConfigFunction(req, res);
        } catch (error) {
            console.error('Error in updateWhatsAppTemplateConfig:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.addWhatsAppTemplateConfig = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ error: 'Authentication required' });
            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
            await addWhatsAppTemplateConfigFunction(req, res);
        } catch (error) {
            console.error('Error in addWhatsAppTemplateConfig:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.deleteWhatsAppTemplateConfig = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ error: 'Authentication required' });
            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
            await deleteWhatsAppTemplateConfigFunction(req, res);
        } catch (error) {
            console.error('Error in deleteWhatsAppTemplateConfig:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.sendWhatsAppTestMessage = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ error: 'Authentication required' });
            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
            await sendWhatsAppTestMessageFunction(req, res);
        } catch (error) {
            console.error('Error in sendWhatsAppTestMessage:', error);
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
// v2 callable: single `request` arg replaces v1 `(data, context)` — see PR #67.
exports.performanceTest = onCall(async (request) => {
    const { auth } = request;
    const startTime = process.hrtime.bigint();

    try {
        // Verify admin authentication
        if (!auth) {
            throw new HttpsError('unauthenticated', 'Authentication required');
        }

        const token = await admin.auth().getUser(auth.uid);
        const customClaims = token.customClaims || {};

        if (!customClaims.admin && customClaims.role !== 'admin') {
            throw new HttpsError('permission-denied', 'Admin privileges required');
        }

        // Collect performance metrics
        const memoryUsage = process.memoryUsage();
        const endTime = process.hrtime.bigint();
        const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

        // Simulate database operations to test performance
        const dbStartTime = process.hrtime.bigint();
        const perfSnapshot = await admin.database().ref('performance-test').once('value');
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

        if (error instanceof HttpsError) {
            throw error;
        }

        throw new HttpsError('internal', 'Performance test failed');
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
            const perfSnapshot = await admin.database().ref('performance-test').once('value');
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
// v2 callable: single `request` arg replaces v1 `(data, context)` — see PR #67.
exports.runSystemOptimization = onCall(async (request) => {
    const { auth } = request;
    try {
        // Verify admin authentication
        if (!auth) {
            throw new HttpsError('unauthenticated', 'Authentication required');
        }

        const token = await admin.auth().getUser(auth.uid);
        const customClaims = token.customClaims || {};

        if (!customClaims.admin && customClaims.role !== 'admin') {
            throw new HttpsError('permission-denied', 'Admin privileges required');
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
            userId: auth.uid,
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

        if (error instanceof HttpsError) {
            throw error;
        }

        throw new HttpsError('internal', 'System optimization failed');
    }
});

/**
 * Get comprehensive system metrics for FPM dashboard
 */
// v2 callable: single `request` arg replaces v1 `(data, context)` — see PR #67.
exports.getSystemMetrics = onCall(async (request) => {
    const { auth } = request;
    try {
        // Verify admin authentication
        if (!auth) {
            throw new HttpsError('unauthenticated', 'Authentication required');
        }

        const token = await admin.auth().getUser(auth.uid);
        const customClaims = token.customClaims || {};

        if (!customClaims.admin && customClaims.role !== 'admin') {
            throw new HttpsError('permission-denied', 'Admin privileges required');
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

        if (error instanceof HttpsError) {
            throw error;
        }

        throw new HttpsError('internal', 'Failed to collect system metrics');
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
            console.log('Token extracted, present:', !!token);

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

// ============================================
// ROSS — RESTAURANT OS SERVICE FUNCTIONS
// ============================================
const ross = require('./ross');
exports.rossGetTemplates = ross.rossGetTemplates;
exports.rossCreateTemplate = ross.rossCreateTemplate;
exports.rossUpdateTemplate = ross.rossUpdateTemplate;
exports.rossDeleteTemplate = ross.rossDeleteTemplate;
exports.rossActivateWorkflow = ross.rossActivateWorkflow;
exports.rossSeedFirstWorkflow = ross.rossSeedFirstWorkflow;
exports.rossCreateWorkflow = ross.rossCreateWorkflow;
exports.rossUpdateWorkflow = ross.rossUpdateWorkflow;
exports.rossDeleteWorkflow = ross.rossDeleteWorkflow;
exports.rossGetWorkflows = ross.rossGetWorkflows;
exports.rossManageTask = ross.rossManageTask;
exports.rossCompleteTask = ross.rossCompleteTask;
exports.rossGetReports = ross.rossGetReports;
exports.rossScheduledReminder = ross.rossScheduledReminder;
exports.rossManageStaff = ross.rossManageStaff;
exports.rossGetStaff = ross.rossGetStaff;
exports.rossCreateRun = ross.rossCreateRun;
exports.rossSubmitResponse = ross.rossSubmitResponse;
exports.rossGetRun = ross.rossGetRun;
exports.rossGetRunHistory = ross.rossGetRunHistory;
exports.rossV2Snooze = ross.rossV2Snooze;
exports.rossGetHomeWorkflowDigest = ross.rossGetHomeWorkflowDigest;

// ============================================
// BILLING — Credit Ledger (Phase 7 ①)
// ============================================
const billing = require('./billing/cloud-functions');
exports.billingGrantCredit = billing.billingGrantCredit;
exports.billingGetBalance = billing.billingGetBalance;
exports.billingGetUsage = billing.billingGetUsage;

// ============================================
// ENTITLEMENTS — resolver + add-on layer (Phase 7 ④a)
// ============================================
const entitlements = require('./entitlements/cloud-functions');
exports.entitlementSetTier = entitlements.entitlementSetTier;
exports.entitlementGrantAddOn = entitlements.entitlementGrantAddOn;
exports.entitlementCancelAddOn = entitlements.entitlementCancelAddOn;
exports.entitlementGetEffective = entitlements.entitlementGetEffective;
exports.recomputeExpiringEntitlements = entitlements.recomputeExpiringEntitlements;

// ============================================
// askRoss AGENT — reactive engine (Phase 7 ②)
// ============================================
// SSE onRequest; secret binding (ANTHROPIC_API_KEY) travels with the onRequest options
// inside the module. Depends on ① ledger + ④a entitlements (both live).
exports.rossChat = require('./agent/rossChat').rossChat;
// Daily prune of expired pending confirm-actions + stale debit guards (slice 7, no RTDB TTL).
exports.rossAgentPrune = require('./agent/prune').rossAgentPrune;

// ============================================
// SUBSCRIPTION STATUS MANAGEMENT
// ============================================
const subscriptionStatusManager = require('./subscriptionStatusManager');
exports.checkSubscriptionStatuses = subscriptionStatusManager.checkSubscriptionStatuses;
exports.triggerSubscriptionStatusCheck = subscriptionStatusManager.triggerSubscriptionStatusCheck;
exports.onTrialEndDateUpdate = subscriptionStatusManager.onTrialEndDateUpdate;
exports.onRenewalDateUpdate = subscriptionStatusManager.onRenewalDateUpdate;

// ============================================
// COMPLIANCE SEED DATA (temporary — remove after seeding)
// ============================================
const complianceSeed = require('./seedComplianceData');
exports.seedComplianceData = complianceSeed.seedComplianceData;
