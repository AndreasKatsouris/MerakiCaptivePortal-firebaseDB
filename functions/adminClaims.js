const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp();
}

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Debug logging
    console.log('Function invoked with data:', data);
    console.log('Auth context:', context.auth);

    // Require authentication
    if (!context.auth) {
        console.error('No auth context');
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    try {
        // Get the user's email from the authenticated context
        const userEmail = context.auth.token.email || data.email;
        const uid = context.auth.uid;

        console.log('Processing request:', { userEmail, uid });

        // List of admin emails - update with your admin emails
        const adminEmails = [
            'andreas@askgroupholdings.com'
        ];

        // Check if user should be admin
        const isAdmin = adminEmails.includes(userEmail.toLowerCase());
        console.log('Admin check:', { userEmail, isAdmin });

        // Set custom claims
        await admin.auth().setCustomUserClaims(uid, { admin: isAdmin });
        console.log('Claims set successfully');

        // Get updated user to verify claims
        const updatedUser = await admin.auth().getUser(uid);
        console.log('Updated user claims:', updatedUser.customClaims);

        return {
            success: true,
            isAdmin: isAdmin,
            message: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${userEmail}`
        };

    } catch (error) {
        console.error('Error in setAdminClaim:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});