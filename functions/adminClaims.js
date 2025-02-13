const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    console.log('Function invoked:', { hasAuth: !!context.auth, hasToken: !!data.idToken });

    let userId;

    try {
        if (context.auth) {
            userId = context.auth.uid;
        } else if (data.idToken) {
            console.log('Verifying token manually...');
            const decodedToken = await admin.auth().verifyIdToken(data.idToken);
            userId = decodedToken.uid;
        } else {
            console.error('Auth verification failed: No token provided');
            throw new functions.https.HttpsError('unauthenticated', 'No authentication detected');
        }

        console.log('Assigning admin claim to:', userId);

        // Get user details
        const userRecord = await admin.auth().getUser(userId);
        const adminEmails = ['andreas@askgroupholdings.com'];
        const isAdmin = adminEmails.includes(userRecord.email.toLowerCase());

        console.log('Admin status check:', { userEmail: userRecord.email, isAdmin });

        // Set admin claim
        await admin.auth().setCustomUserClaims(userId, { admin: isAdmin });

        return { success: true, isAdmin };

    } catch (error) {
        console.error('Error in setAdminClaim:', error);
        throw new functions.https.HttpsError('internal', 'Failed to set admin claim');
    }
});



