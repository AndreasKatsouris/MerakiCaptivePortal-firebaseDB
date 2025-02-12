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
            // Use Firebase-provided authentication context
            userId = context.auth.uid;
        } else if (context.rawRequest.headers.authorization) {
            console.log('Manually verifying ID token...');
            const authHeader = context.rawRequest.headers.authorization;
            const idToken = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
            if (!idToken) throw new Error('No token provided in authorization header');

            const decodedToken = await admin.auth().verifyIdToken(idToken);
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

        return { success: true, isAdmin };

    } catch (error) {
        console.error('Error in setAdminClaim:', error);
        throw new functions.https.HttpsError('internal', 'Failed to set admin claim');
    }
});




