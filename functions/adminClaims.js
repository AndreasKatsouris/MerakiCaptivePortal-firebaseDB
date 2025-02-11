const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp();
}

// Import and re-export the setAdminClaim function
exports.setAdminClaim = functions.https.onCall((data, context) => {
    console.log('Function called with:', { data, context });
    
    // Check authentication
    if (!context.auth) {
        console.error('No auth context found');
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated to perform this action.'
        );
    }

    const uid = context.auth.uid;
    const email = data.email.toLowerCase();
    
    console.log('Processing request for:', { uid, email });

    // List of admin emails
    const adminEmails = [
        'andreas@askgroupholdings.com'
    ];

    // Check if user should be admin
    const isAdmin = adminEmails.includes(email);
    console.log('Admin check:', { email, isAdmin });

    // Set custom claims
    return admin.auth()
        .setCustomUserClaims(uid, { admin: isAdmin })
        .then(() => {
            return {
                success: true,
                isAdmin: isAdmin,
                message: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${email}`
            };
        })
        .catch(error => {
            console.error('Error setting admin claim:', error);
            throw new functions.https.HttpsError('internal', error.message);
        });
});