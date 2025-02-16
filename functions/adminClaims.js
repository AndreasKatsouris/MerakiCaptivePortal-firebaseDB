const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    console.log('setAdminClaim called:', {
        hasToken: !!data.idToken,
        context: context ? 'exists' : 'missing'
    });

    try {
        // Verify ID Token
        const decodedToken = await admin.auth().verifyIdToken(data.idToken);
        const userId = decodedToken.uid;
        
        // Get user details
        const userRecord = await admin.auth().getUser(userId);
        console.log('Processing user:', userRecord.email);

        // Admin emails whitelist
        const adminEmails = ['andreas@askgroupholdings.com'];
        const isAdmin = adminEmails.includes(userRecord.email.toLowerCase());

        // Set custom claims
        const claims = {
            admin: isAdmin,
            email: userRecord.email,
            timestamp: Date.now()
        };

        console.log('Setting claims:', claims);
        await admin.auth().setCustomUserClaims(userId, claims);

        return {
            success: true,
            isAdmin,
            claims
        };

    } catch (error) {
        console.error('Error in setAdminClaim:', error);
        return {
            success: false,
            error: error.message
        };
    }
});