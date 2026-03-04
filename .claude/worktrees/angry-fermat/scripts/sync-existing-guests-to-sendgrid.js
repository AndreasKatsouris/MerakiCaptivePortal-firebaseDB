const admin = require('firebase-admin');
const { addContact } = require('../functions/sendgridClient');
const { normalizePhoneNumber } = require('../functions/dataManagement');

// Initialize Firebase Admin
try {
    const serviceAccount = require('../merakicaptiveportal-firebasedb-default-rtdb.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com"
    });
} catch (e) {
    console.log("Trying default credentials...");
    admin.initializeApp({
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com"
    });
}

async function syncWifiLoginsToGuests() {
    console.log('📋 Step 1: Syncing WiFi logins to guests node...\n');

    const wifiLoginsSnapshot = await admin.database().ref('wifiLogins').once('value');
    const wifiLogins = wifiLoginsSnapshot.val() || {};

    let synced = 0;
    let skipped = 0;

    for (const [sessionId, wifiData] of Object.entries(wifiLogins)) {
        const rawPhoneNumber = wifiData.phoneNumber;

        if (!rawPhoneNumber) {
            skipped++;
            continue;
        }

        const phoneNumber = normalizePhoneNumber(rawPhoneNumber);
        const guestRef = admin.database().ref(`guests/${phoneNumber}`);

        try {
            const guestSnapshot = await guestRef.once('value');
            const existingGuest = guestSnapshot.val() || {};

            const updates = {
                lastWifiLogin: wifiData.timestamp,
                currentLocationId: wifiData.node_mac || existingGuest.currentLocationId,
                updatedAt: admin.database.ServerValue.TIMESTAMP
            };

            if (!existingGuest.email && wifiData.email) {
                updates.email = wifiData.email;
            }

            if (!existingGuest.name && wifiData.name) {
                updates.name = wifiData.name;
                const parts = wifiData.name.split(' ');
                if (parts.length > 0) updates.firstName = parts[0];
                if (parts.length > 1) updates.lastName = parts.slice(1).join(' ');
            }

            if (!guestSnapshot.exists()) {
                updates.createdAt = admin.database.ServerValue.TIMESTAMP;
                updates.phoneNumber = phoneNumber;
                updates.source = 'wifi_login';
            }

            await guestRef.update(updates);
            synced++;

            if (synced % 10 === 0) {
                process.stdout.write(`\r✓ Synced ${synced} WiFi logins...`);
            }
        } catch (error) {
            console.error(`\n❌ Error syncing ${phoneNumber}:`, error.message);
        }
    }

    console.log(`\n✅ Synced ${synced} WiFi logins to guests node (${skipped} skipped)\n`);
}

async function syncGuestsToSendGrid() {
    console.log('📧 Step 2: Syncing guests to SendGrid...\n');

    const guestsSnapshot = await admin.database().ref('guests').once('value');
    const guests = guestsSnapshot.val() || {};

    let synced = 0;
    let skipped = 0;
    const errors = [];

    for (const [phoneNumber, guestData] of Object.entries(guests)) {
        if (!guestData.email) {
            skipped++;
            continue;
        }

        const contactData = {
            email: guestData.email,
            firstName: guestData.firstName || (guestData.name ? guestData.name.split(' ')[0] : ''),
            lastName: guestData.lastName || (guestData.name ? guestData.name.split(' ').slice(1).join(' ') : ''),
            phoneNumber: phoneNumber
        };

        try {
            await addContact(contactData);
            synced++;

            if (synced % 5 === 0) {
                process.stdout.write(`\r✓ Synced ${synced} contacts to SendGrid...`);
            }

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            errors.push({ phoneNumber, email: guestData.email, error: error.message });
        }
    }

    console.log(`\n✅ Synced ${synced} contacts to SendGrid (${skipped} skipped - no email)\n`);

    if (errors.length > 0) {
        console.log(`⚠️  ${errors.length} errors occurred:\n`);
        errors.forEach(e => {
            console.log(`   - ${e.email}: ${e.error}`);
        });
    }
}

async function main() {
    console.log('🚀 Starting guest sync to SendGrid...\n');
    console.log('═'.repeat(60));
    console.log('\n');

    try {
        await syncWifiLoginsToGuests();
        await syncGuestsToSendGrid();

        console.log('═'.repeat(60));
        console.log('\n✨ Sync completed successfully!\n');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

main();
