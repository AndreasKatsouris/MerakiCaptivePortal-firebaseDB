const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize admin SDK
if (!admin.apps.length) {
    admin.initializeApp();
}

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Check if request is authorized
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated to perform this action.'
        );
    }

    try {
        // The user's ID token will have already been verified by the Functions SDK
        const uid = context.auth.uid;
        const email = context.auth.token.email;

        console.log('Processing request for:', {
            uid: uid,
            email: email,
            existingClaims: context.auth.token.claims
        });

        // List of admin emails
        const adminEmails = [
            'andreas@askgroupholdings.com'
            // Add more admin emails here
        ];

        // Check if user should be admin
        const isAdmin = adminEmails.includes(email.toLowerCase());

        // Set custom claims
        await admin.auth().setCustomUserClaims(uid, { admin: isAdmin });

        // Get a new token with updated claims
        const updatedUser = await admin.auth().getUser(uid);

        // Force token refresh
        await admin.auth().revokeRefreshTokens(uid);

        console.log('Updated user claims:', {
            uid: uid,
            email: email,
            newClaims: updatedUser.customClaims,
            tokenRevoked: true
        });

        return {
            success: true,
            isAdmin: isAdmin,
            message: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${email}`,
            requiresRefresh: true
        };

    } catch (error) {
        console.error('Error in setAdminClaim:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});