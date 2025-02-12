const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Note: Don't initialize admin here, it's done in index.js

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Debug logging
    console.log('setAdminClaim function called');
    console.log('Data received:', JSON.stringify(data));
    console.log('Auth context:', context.auth ? {
        uid: context.auth.uid,
        email: context.auth.token.email,
        token: context.auth.token
    } : 'No auth context');

    // Ensure user is authenticated
    if (!context.auth) {
        console.error('Request not authenticated');
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    try {
        // Get the user info directly from the auth context
        const userId = context.auth.uid;
        const userEmail = data.email.toLowerCase(); // Use provided email but normalize it

        console.log('Processing admin claim for:', {
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

        // Return the result
        return {
            success: true,
            isAdmin: isAdmin,
            message: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${userEmail}`,
            claims: updatedUser.customClaims
        };

    } catch (error) {
        console.error('Error setting admin claim:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Error setting admin claim: ' + error.message
        );
    }
});