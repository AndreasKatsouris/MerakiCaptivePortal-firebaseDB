const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp();
}


exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be authenticated to call this function.');
    }

    try {
        const userId = context.auth.uid;
        const userEmail = data.email.toLowerCase();

        // Allow only specific emails to become admins
        const adminEmails = ['andreas@askgroupholdings.com'];
        const isAdmin = adminEmails.includes(userEmail);

        await admin.auth().setCustomUserClaims(userId, { admin: isAdmin });

        return { success: true, isAdmin };

    } catch (error) {
        console.error('Error in setAdminClaim:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});





