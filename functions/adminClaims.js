const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    console.log('Function invoked:', { hasAuth: !!context.auth, hasToken: !!data.idToken });

    let userId;

    try {
        // Ensure the token is included in the request
        if (!data.idToken) {
            console.error('Auth verification failed: No token provided');
            throw new functions.https.HttpsError('unauthenticated', 'No authentication detected. Please provide an ID token.');
        }

        console.log('Verifying ID token manually...');
        const decodedToken = await admin.auth().verifyIdToken(data.idToken);
        userId = decodedToken.uid;

        console.log('User authenticated:', userId);

        // Get user details
        const userRecord = await admin.auth().getUser(userId);
        const adminEmails = ['andreas@askgroupholdings.com'];
        const isAdmin = adminEmails.includes(userRecord.email.toLowerCase());

        console.log('Admin status check:', { userEmail: userRecord.email, isAdmin });

        // Set admin claim
        await admin.auth().setCustomUserClaims(userId, { admin: isAdmin });

        console.log('Admin claim set successfully for:', userId);
        return { success: true, isAdmin };

    } catch (error) {
        console.error('Error in setAdminClaim:', error);
        throw new functions.https.HttpsError('internal', 'Failed to set admin claim: ' + error.message);
    }
});



