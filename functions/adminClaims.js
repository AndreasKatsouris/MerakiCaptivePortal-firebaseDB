const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

// Changed to onCall instead of onRequest
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    try {
        const email = data.email;
        const adminEmails = [
            'andreas@askgroupholdings.com',  // Replace with your admin email
            // Add more admin emails here if needed
        ];

        // Get user by email
        const user = await admin.auth().getUserByEmail(email);
        
        // Add debug logging
        console.log('Setting admin claim for:', {
            userEmail: user.email,
            adminEmails: adminEmails,
            isInList: adminEmails.includes(user.email)
        });
        
        // Check if user's email is in admin list (case-insensitive)
        const isAdmin = adminEmails.some(e =>
            e.toLowerCase() === user.email.toLowerCase()
        );
        
        // Set admin claim
        await admin.auth().setCustomUserClaims(user.uid, { admin: isAdmin });
        
        // Add verification logging
        const updatedUser = await admin.auth().getUser(user.uid);
        console.log('Updated user claims:', {
            email: user.email,
            claims: updatedUser.customClaims
        });
        
        return {
            result: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${user.email}`,
            isAdmin: isAdmin
        };
    } catch (error) {
        console.error('Error setting admin claim:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});