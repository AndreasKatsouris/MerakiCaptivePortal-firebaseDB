exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    if (!data.idToken) {
        throw new functions.https.HttpsError('invalid-argument', 'No ID token provided');
    }

    try {
        // Verify ID Token
        const decodedToken = await admin.auth().verifyIdToken(data.idToken);
        const userEmail = decodedToken.email;

        // Check if email is from allowed domain
        if (!userEmail.endsWith('@askgroupholdings.com')) {
            return { success: false, error: 'Unauthorized email domain' };
        }

        // Set admin claim
        await admin.auth().setCustomUserClaims(decodedToken.uid, {
            admin: true,
            email: userEmail
        });

        return {
            success: true,
            isAdmin: true
        };
    } catch (error) {
        console.error('Error setting admin claim:', error);
        return {
            success: false,
            error: error.message
        };
    }
});