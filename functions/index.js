const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
//const crypto = require('crypto');
//const appConfig = functions.config().firebase;

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
});

const testRef = admin.database().ref('test').push();
testRef.set({test: "data"})
    .then(() => {
        console.log('Test data successfully stored in Firebase');
    })
    .catch(error => {
        console.error('Error storing test data:', error);
    });


// Create a Cloud Function to handle HTTP requests
exports.merakiWebhook = onRequest((req, res) => {

    const testRef = admin.database().ref('test').push();
testRef.set({test: "data 2"})
    .then(() => {
        console.log('Test 2 data successfully stored in Firebase');
    })
    .catch(error => {
        console.error('Error storing test 2 data:', error);
    });

    // Check if it's a GET request for validation
    if (req.method === 'GET') {
        const validator = "371de0de57b8741627daa5e30f25beb917614141"; // Replace with your validator string
        console.log("Validator string requested");
        res.status(200).send(validator);
        return;
    }

    // Handle POST request from Meraki Scanning API
    console.log('Webhook received');

    const sharedSecret = 'Giulietta!16';

    console.log('Received headers:', req.headers); // Log all headers

    // Directly compare the shared secret in the request body
    if (req.body.secret !== sharedSecret) {
        console.error('Invalid secret - Unauthorized access attempt');
        return res.status(403).send('Unauthorized');
    }

    console.log('Secret verification passed');

    const data = req.body;
    console.log('Data received:', JSON.stringify(data, null, 2));

    console.log('Storing data to Firebase:', JSON.stringify(data, null, 2));


    //const ref = admin.database().ref('scanningData').push();
    const ref = admin.database().ref('scanningData').push();
console.log('Database reference path:', ref.path.toString());

    ref.set(data)
        .then(() => {
            console.log('Data successfully stored in Firebase');
            res.status(200).send('Data received and stored');
        })
        .catch(error => {
            console.error('Error storing data:', error);
            res.status(500).send('Error storing data');
        });
});


    /**
    //const signature = req.headers['x-cisco-meraki-signature'];
    const signature = req.headers['x-cisco-meraki-signature'] || req.headers['X-Cisco-Meraki-Signature'] || req.headers['x-cisco-Meraki-Signature'];

    console.log('Received headers:', req.headers); // Log all headers
      
    console.log('Signature from headers:', signature);

    const hmac = crypto.createHmac('sha1', sharedSecret);
    hmac.update(JSON.stringify(req.body));
    const computedSignature = hmac.digest('hex');
    console.log('Computed signature:', computedSignature);

    if (signature !== computedSignature) {
        console.error('Invalid signature - Unauthorized access attempt');
        return res.status(403).send('Unauthorized');
    }

    console.log('Signature verification passed');

    const data = req.body;
    console.log('Data received:', JSON.stringify(data, null, 2));

    // Store data by Client MAC
    data.data.observations.forEach(client => {
        client.apMac = data.data.apMac;    
        admin.database().ref('location/' + data.type + '/' + client.clientMac).set(client)
            .then(() => {
                console.log('Data successfully stored for client MAC:', client.clientMac);
            })
            .catch(error => {
                console.error('Error storing data for client MAC:', client.clientMac, error);
            });
    });

    res.status(200).send('Data received and processed');
});
*/
