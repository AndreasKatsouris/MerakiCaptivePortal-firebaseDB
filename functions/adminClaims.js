const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Debug logging
    console.log('setAdminClaim function called');
    console.log('Data received:', {
        email: data?.email
    });
    console.log('Auth context:', context.auth ? {
        uid: context.auth.uid,
        email: context.auth.token.email
    } : 'No auth context');

    // Ensure user is authenticated
    if (!context.auth) {
        console.error('Request not authenticated');
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    // Ensure email was provided
    if (!data?.email) {
        console.error('No email provided');
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Email must be provided'
        );
    }

    try {
        const userId = context.auth.uid;
        const userEmail = data.email.toLowerCase();

        console.log('Processing request for:', {
            userId,
            userEmail
        });

        // List of admin emails
        const adminEmails = [
            'andreas@askgroupholdings.com'
        ];

        // Check if the email should have admin privileges
        const isAdmin = adminEmails.includes(userEmail);
        console.log('Admin check result:', { userEmail, isAdmin });

        // Set the custom claim
        await admin.auth().setCustomUserClaims(userId, { admin: isAdmin });

        // Verify the claim was set
        const updatedUser = await admin.auth().getUser(userId);
        console.log('Updated user claims:', updatedUser.customClaims);

        return {
            success: true,
            isAdmin: isAdmin,
            message: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${userEmail}`
        };

    } catch (error) {
        console.error('Error setting admin claim:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Error setting admin claim: ' + error.message
        );
    }
});