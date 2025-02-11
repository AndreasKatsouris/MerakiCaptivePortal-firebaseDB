const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({
    origin: true,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
});

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

exports.setAdminClaim = functions.https.onRequest((req, res) => {
    // Wrap the function in cors middleware
    return cors(req, res, async () => {
        try {
            // Only allow POST method
            if (req.method !== 'POST') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

            const { email } = req.body;

            // Validate email
            if (!email) {
                return res.status(400).json({ error: 'Email is required' });
            }

            const adminEmails = [
                'andreas@askgroupholdings.com'  // Replace with actual admin emails
                // Add more admin emails as needed
            ];

            // Get user by email
            const user = await admin.auth().getUserByEmail(email);
            
            // Check if user's email is in admin list
            const isAdmin = adminEmails.some(e => 
                e.toLowerCase() === email.toLowerCase()
            );
            
            // Set admin claim
            await admin.auth().setCustomUserClaims(user.uid, { admin: isAdmin });
            
            // Verify the claim was set
            const updatedUser = await admin.auth().getUser(user.uid);
            
            console.log('Admin claim set for:', {
                email: user.email,
                isAdmin: isAdmin,
                claims: updatedUser.customClaims
            });

            return res.status(200).json({
                success: true,
                message: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${email}`,
                isAdmin: isAdmin
            });
        } catch (error) {
            console.error('Error setting admin claim:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});