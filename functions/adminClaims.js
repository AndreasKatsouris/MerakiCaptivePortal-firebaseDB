const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Debug logging - safely handle circular references
    console.log('setAdminClaim function called');
    console.log('Data received:', {
        email: data.email
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

    try {
        // Get the user info directly from the auth context
        const userId = context.auth.uid;
        const userEmail = data.email.toLowerCase(); // Use provided email but normalize it

        // List of admin emails
        const adminEmails = [
            'andreas@askgroupholdings.com'
            // Add other admin emails as needed
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