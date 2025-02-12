const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Initial logging
    console.log('setAdminClaim function called with data:', {
        email: data?.email,
        timestamp: data?.timestamp
    });

    console.log('Auth context details:', {
        exists: !!context.auth,
        uid: context.auth?.uid,
        token: context.auth?.token ? 'Present' : 'Missing'
    });

    // Ensure user is authenticated
    if (!context.auth) {
        console.error('Authentication missing. Full context:', JSON.stringify({
            rawRequest: context.rawRequest?.headers,
            app: context.app
        }));
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    // Validate email
    if (!data?.email) {
        console.error('Email missing from request data');
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Email must be provided'
        );
    }

    try {
        const userId = context.auth.uid;
        const userEmail = data.email.toLowerCase();

        console.log('Processing admin claim for:', {
            userId,
            userEmail,
            requestTimestamp: data.timestamp
        });

        // Admin emails list
        const adminEmails = [
            'andreas@askgroupholdings.com'
        ];

        const isAdmin = adminEmails.includes(userEmail);
        console.log('Admin status check:', { userEmail, isAdmin });

        // Set custom claim
        await admin.auth().setCustomUserClaims(userId, { 
            admin: isAdmin,
            updatedAt: Date.now()
        });

        // Verify claim
        const updatedUser = await admin.auth().getUser(userId);
        console.log('Updated user claims:', updatedUser.customClaims);

        return {
            success: true,
            isAdmin,
            message: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${userEmail}`,
            timestamp: Date.now()
        };

    } catch (error) {
        console.error('Error in setAdminClaim:', {
            error: error.message,
            stack: error.stack
        });
        throw new functions.https.HttpsError(
            'internal',
            'Error setting admin claim: ' + error.message
        );
    }
});