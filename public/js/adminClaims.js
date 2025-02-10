const functions = require('firebase-functions');
const admin = require('firebase-admin');

// This function sets admin claim for specified email addresses
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // List of admin email addresses
    const adminEmails = [
        // Add your admin email addresses here
        'your-email@example.com'  // Replace with your email
    ];

    try {
        // Get user by email
        const user = await admin.auth().getUserByEmail(data.email);
        
        // Check if user's email is in admin list
        const isAdmin = adminEmails.includes(user.email);
        
        // Set admin claim
        await admin.auth().setCustomUserClaims(user.uid, { admin: isAdmin });
        
        return {
            result: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${user.email}`,
            isAdmin: isAdmin
        };
    } catch (error) {
        console.error('Error setting admin claim:', error);
        throw new functions.https.HttpsError('internal', 'Error setting admin claim');
    }
}); 