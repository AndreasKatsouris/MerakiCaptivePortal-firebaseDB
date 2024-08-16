const functions = require('firebase-functions/v2'); // Use v2
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();

exports.merakiWebhook = functions.https.onRequest((req, res) => {
    logger.info('Webhook received');

    const sharedSecret = 'Giulietta!16';
    const signature = req.headers['x-cisco-meraki-signature'];
    logger.info('Signature from headers:', signature);

    const hmac = crypto.createHmac('sha1', sharedSecret);
    hmac.update(JSON.stringify(req.body));
    const computedSignature = hmac.digest('hex');
    logger.info('Computed signature:', computedSignature);

    if (signature !== computedSignature) {
        logger.error('Invalid signature - Unauthorized access attempt');
        return res.status(403).send('Unauthorized');
    }

    logger.info('Signature verification passed');
    const data = req.body;

    const ref = admin.database().ref('scanningData').push();
    ref.set(data)
        .then(() => {
            logger.info('Data successfully stored in Firebase');
            res.status(200).send('Data received and stored');
        })
        .catch(error => {
            logger.error('Error storing data:', error);
            res.status(500).send('Error storing data');
        });
});
