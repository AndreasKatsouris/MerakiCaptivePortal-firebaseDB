const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

// This function sets admin claim for specified email addresses
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    const email = data.email;
    const adminEmails = [
        'andreas@askgroupholdings.com',  // Replace this with your actual admin email
        // Add more admin emails here if needed
    ];
    try {
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
        throw new functions.https.HttpsError('internal', 'Error setting admin claim');
    }
});