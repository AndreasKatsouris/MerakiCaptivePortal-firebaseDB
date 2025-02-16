const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    console.log('Function invoked:', { hasToken: !!data.idToken });

    let userId;

    try {
        // Check if ID token is provided
        if (!data.idToken) {
            console.warn('Auth verification failed: No token provided');
            return { success: false, error: 'No authentication detected. Please provide an ID token.' };
        }

        console.log('Received ID Token. Attempting to verify...');

        // Verify ID Token
        const decodedToken = await admin.auth().verifyIdToken(data.idToken);
        userId = decodedToken.uid;

        console.log('User authenticated:', userId);

        // Get user details
        const userRecord = await admin.auth().getUser(userId);
        const adminEmails = ['andreas@askgroupholdings.com']; // Add your admin emails here
        const isAdmin = adminEmails.includes(userRecord.email.toLowerCase());

        console.log('Admin status check:', { userEmail: userRecord.email, isAdmin });

        // Set admin claim
        try {
            await admin.auth().setCustomUserClaims(userId, { admin: isAdmin });
            console.log('Admin claim successfully set for:', userId);
            return { success: true, isAdmin };
        } catch (claimError) {
            console.warn('Admin claim assignment failed:', claimError);
            return { success: true, isAdmin: false, warning: 'User authenticated but admin claim could not be assigned.' };
        }
    } catch (error) {
        console.error('Error in setAdminClaim:', error);
        return { success: false, error: 'Failed to set admin claim: ' + error.message };
    }
});