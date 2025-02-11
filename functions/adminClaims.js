const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    console.log('Function called with data:', data);
    console.log('Function context:', context);

    try {
        // Validate input data
        if (!data || !data.email) {
            console.error('Missing email in request data');
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Email is required'
            );
        }

        const email = data.email.trim().toLowerCase();
        console.log('Processing email:', email);

        // List of admin emails
        const adminEmails = [
            'andreas@askgroupholdings.com'
        ];
        console.log('Admin emails configured:', adminEmails);

        // Get user by email
        console.log('Fetching user by email...');
        const user = await admin.auth().getUserByEmail(email);
        console.log('User found:', {
            uid: user.uid,
            email: user.email,
            currentClaims: user.customClaims
        });

        // Check if user should be admin
        const isAdmin = adminEmails.includes(email);
        console.log('Admin status check:', {
            email,
            isAdmin,
            matchFound: adminEmails.includes(email)
        });

        // Set the admin claim
        console.log('Setting custom claims...');
        await admin.auth().setCustomUserClaims(user.uid, { admin: isAdmin });

        // Verify the claims were set
        const updatedUser = await admin.auth().getUser(user.uid);
        console.log('Updated user claims:', {
            email: updatedUser.email,
            claims: updatedUser.customClaims
        });

        return {
            success: true,
            isAdmin: isAdmin,
            message: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${email}`
        };

    } catch (error) {
        console.error('Error in setAdminClaim:', {
            error: error.message,
            code: error.code,
            stack: error.stack
        });

        // Map specific errors to appropriate responses
        if (error.code === 'auth/user-not-found') {
            throw new functions.https.HttpsError(
                'not-found',
                'No user found with this email address'
            );
        }

        if (error.code === 'auth/invalid-email') {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Invalid email format'
            );
        }

        // For any other errors
        throw new functions.https.HttpsError(
            'internal',
            'Error setting admin claim: ' + error.message
        );
    }
});