const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize admin SDK
if (!admin.apps.length) {
    admin.initializeApp();
}

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Log the incoming request
    console.log('Received request:', { data, auth: context.auth });

    // Check authentication
    if (!context.auth) {
        console.error('No auth context found');
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated to perform this action.'
        );
    }

    try {
        const uid = context.auth.uid;
        const email = data.email.toLowerCase(); // Get email from data, not context

        console.log('Processing request for:', { uid, email });

        // List of admin emails
        const adminEmails = [
            'andreas@askgroupholdings.com'
            // Add more admin emails here
        ];

        // Check if user should be admin
        const isAdmin = adminEmails.includes(email);
        console.log('Admin check:', { email, isAdmin, adminEmails });

        // Set custom claims
        await admin.auth().setCustomUserClaims(uid, { admin: isAdmin });
        console.log('Claims set successfully');

        return {
            success: true,
            isAdmin: isAdmin,
            message: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${email}`
        };

    } catch (error) {
        console.error('Error in setAdminClaim:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});