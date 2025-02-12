const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    console.log('Function invocation details:', {
        hasAuth: !!context.auth,
        authDetails: context.auth ? {
            uid: context.auth.uid,
            email: context.auth.token.email,
            tokenVerified: !!context.auth.token
        } : null,
        requestData: {
            hasEmail: !!data?.email,
            hasToken: !!data?.idToken,
            timestamp: data?.timestamp
        }
    });

    let userId;

    try {
        if (context.auth) {
            userId = context.auth.uid;
        } else if (data.idToken) {
            console.log('Manually verifying ID token...');
            const decodedToken = await admin.auth().verifyIdToken(data.idToken);
            userId = decodedToken.uid;
        } else {
            console.error('Auth verification failed: No token provided');
            throw new functions.https.HttpsError('unauthenticated', 'No authentication detected');
        }

        console.log('Processing admin claim for user:', userId);

        // Get user record
        const userRecord = await admin.auth().getUser(userId);
        console.log('User record found:', userRecord.uid);

        // Check if the user is an admin
        const adminEmails = ['andreas@askgroupholdings.com'];
        const isAdmin = adminEmails.includes(userRecord.email.toLowerCase());

        console.log('Admin status check:', { userEmail: userRecord.email, isAdmin });

        // Set admin claim
        await admin.auth().setCustomUserClaims(userId, { admin: isAdmin });

        // Retrieve updated claims
        const updatedUser = await admin.auth().getUser(userId);
        console.log('Updated user claims:', updatedUser.customClaims);

        return { success: true, isAdmin, claims: updatedUser.customClaims };

    } catch (error) {
        console.error('Error in setAdminClaim:', {
            error: error.message,
            stack: error.stack
        });
        throw new functions.https.HttpsError('internal', error.message);
    }
});


