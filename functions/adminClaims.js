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

    // Verify auth context (fix)
    if (!context.auth && !data.idToken) {
        console.error('Auth verification failed:', {
            rawAuth: context.auth,
            rawToken: data.idToken || 'None provided'
        });
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be authenticated to call this function'
        );
    }

    let userId;
    try {
        if (context.auth) {
            userId = context.auth.uid;
        } else {
            const decodedToken = await admin.auth().verifyIdToken(data.idToken);
            userId = decodedToken.uid;
        }

        console.log('Processing admin claim:', {
            userId,
            userEmail: data.email
        });

        // Ensure user exists
        const userRecord = await admin.auth().getUser(userId);
        console.log('User record found:', userRecord.uid);

        // Admin emails list
        const adminEmails = ['andreas@askgroupholdings.com'];
        const isAdmin = adminEmails.includes(data.email.toLowerCase());

        console.log('Admin status check:', { userEmail: data.email, isAdmin });

        // Set custom claims
        await admin.auth().setCustomUserClaims(userId, { admin: isAdmin });

        // Verify claims were set
        const updatedUser = await admin.auth().getUser(userId);
        console.log('Updated user claims:', updatedUser.customClaims);

        return {
            success: true,
            isAdmin,
            claims: updatedUser.customClaims
        };

    } catch (error) {
        console.error('Error in setAdminClaim:', {
            error: error.message,
            stack: error.stack
        });
        throw new functions.https.HttpsError('internal', error.message);
    }
});
