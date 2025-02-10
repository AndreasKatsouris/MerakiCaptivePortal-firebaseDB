const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

// This function sets admin claim for specified email addresses
exports.setAdminClaim = functions.https.onCall(async (data) => {
    // List of admin email addresses
    const adminEmails = [
        'andreas@askgroupholdings.com',  // Replace this with your actual admin email
        // Add more admin emails here if needed
    ];

    try {
        // Get user by email
        const user = await admin.auth().getUserByEmail(data.email);
        
        // Add debug logging
        console.log('Setting admin claim for:', {
            userEmail: user.email,
            adminEmails: adminEmails,
            isInList: adminEmails.includes(user.email),
            exactMatch: adminEmails.some(email => email === user.email)
        });
        
        // Check if user's email is in admin list (case-insensitive)
        const isAdmin = adminEmails.some(email => 
            email.toLowerCase() === user.email.toLowerCase()
        );
        
        // Set admin claim
        await admin.auth().setCustomUserClaims(user.uid, { admin: isAdmin });
        
        // Force token refresh on the server side
        await admin.auth().revokeRefreshTokens(user.uid);
        
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