const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Log complete invocation details
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

    // Verify auth context
    if (!context.auth) {
        console.error('Auth verification failed:', {
            rawAuth: context.auth,
            rawToken: context.rawRequest?.headers?.authorization
        });
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be authenticated to call this function'
        );
    }

    // Verify data
    if (!data?.email) {
        console.error('Missing email in request data');
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Email is required'
        );
    }

    try {
        const userId = context.auth.uid;
        const userEmail = data.email.toLowerCase();

        console.log('Processing admin claim:', {
            userId,
            userEmail,
            authEmail: context.auth.token.email
        });

        // Verify user exists
        const userRecord = await admin.auth().getUser(userId);
        console.log('User record found:', userRecord.uid);

        // Admin emails list
        const adminEmails = ['andreas@askgroupholdings.com'];
        const isAdmin = adminEmails.includes(userEmail);

        console.log('Admin status check:', {
            userEmail,
            isAdmin,
            inAdminList: adminEmails.includes(userEmail)
        });

        // Set custom claims
        await admin.auth().setCustomUserClaims(userId, {
            admin: isAdmin,
            updatedAt: Date.now()
        });

        const updatedUser = await admin.auth().getUser(userId);
        console.log('Updated user claims:', updatedUser.customClaims);
        
        return {
            success: true,
            isAdmin,
            claims: updatedUser.customClaims,
            timestamp: Date.now()  // Ensures client can verify fresh claims
        };
        

    } catch (error) {
        console.error('Error in setAdminClaim:', {
            error: error.message,
            stack: error.stack
        });
        throw new functions.https.HttpsError('internal', error.message);
    }
});