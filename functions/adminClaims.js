const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    console.log('Function called with data:', data);
    console.log('Auth context:', context);

    // Check if request is authenticated
    if (!context.auth) {
        console.log('No auth context found');
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    try {
        // Use email from the data parameter
        const email = data.email;
        const uid = context.auth.uid;

        console.log('Processing request for:', { email, uid });

        // List of admin emails
        const adminEmails = [
            'andreas@askgroupholdings.com'
        ];

        // Check if user should be admin
        const isAdmin = adminEmails.includes(email.toLowerCase());
        console.log('Admin check result:', { email, isAdmin });

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