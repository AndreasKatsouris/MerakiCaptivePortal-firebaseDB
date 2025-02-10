const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

// This function sets admin claim for specified email addresses
exports.setAdminClaim = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        // Only handle POST requests (and optionally OPTIONS)
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }
        const email = req.body.email;
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
            
            res.json({
                result: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${user.email}`,
                isAdmin: isAdmin
            });
        } catch (error) {
            console.error('Error setting admin claim:', error);
            res.status(500).json({ error: 'Error setting admin claim' });
        }
    });
}); 