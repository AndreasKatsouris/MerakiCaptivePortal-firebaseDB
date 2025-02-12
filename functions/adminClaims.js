const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Proper initialization of Admin SDK
admin.initializeApp();

// Callable function with proper auth check
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Check if request is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    const uid = context.auth.uid;
    const email = context.auth.token.email;

    // Log authentication info
    console.log('Authentication context:', {
        uid: uid,
        email: email,
        token: context.auth.token
    });

    try {
        // List of admin emails
        const adminEmails = [
            'andreas@askgroupholdings.com'
        ];

        // Check if user should be admin
        const isAdmin = adminEmails.includes(email.toLowerCase());

        // Set custom claims
        await admin.auth().setCustomUserClaims(uid, { admin: isAdmin });

        // Get updated user to verify claims
        const updatedUser = await admin.auth().getUser(uid);
        console.log('Updated user claims:', updatedUser.customClaims);

        return {
            success: true,
            isAdmin: isAdmin,
            message: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${email}`,
            claims: updatedUser.customClaims
        };

    } catch (error) {
        console.error('Error in setAdminClaim:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});