const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { addContact } = require('./sendgridClient');
const { normalizePhoneNumber } = require('./dataManagement');

/**
 * Sync WiFi Login data to the main Guest profile
 * Trigger: onCreate of wifiLogins/{sessionID}
 */
exports.syncWifiToGuest = functions.database.ref('/wifiLogins/{sessionID}')
    .onCreate(async (snapshot, context) => {
        const wifiData = snapshot.val();
        const rawPhoneNumber = wifiData.phoneNumber;

        if (!rawPhoneNumber) {
            console.log('No phone number in WiFi login data, skipping sync.');
            return null;
        }

        // Normalize phone number to match the key used in guests node
        const phoneNumber = normalizePhoneNumber(rawPhoneNumber);

        const guestRef = admin.database().ref(`guests/${phoneNumber}`);

        try {
            const guestSnapshot = await guestRef.once('value');
            const existingGuest = guestSnapshot.val() || {};

            // Merge data
            // We prioritize existing data for name/email if it exists, but if the WiFi login provides new info, we might want to capture it.
            // Strategy: Update if missing in existing profile.
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
                // Try to split name
                const parts = wifiData.name.split(' ');
                if (parts.length > 0) updates.firstName = parts[0];
                if (parts.length > 1) updates.lastName = parts.slice(1).join(' ');
            }

            // If guest doesn't exist at all, we are creating a new one
            if (!guestSnapshot.exists()) {
                updates.createdAt = admin.database.ServerValue.TIMESTAMP;
                updates.phoneNumber = phoneNumber;
                updates.source = 'wifi_login';
            }

            await guestRef.update(updates);
            console.log(`Synced WiFi data for ${phoneNumber} to guest profile.`);
        } catch (error) {
            console.error('Error syncing WiFi data to guest:', error);
        }
    });

/**
 * Sync Guest data to SendGrid
 * Trigger: onWrite of guests/{phoneNumber}
 */
exports.syncGuestToSendGrid = functions.database.ref('/guests/{phoneNumber}')
    .onWrite(async (change, context) => {
        const guestData = change.after.val();
        const phoneNumber = context.params.phoneNumber;

        // If data was deleted
        if (!guestData) {
            console.log(`Guest ${phoneNumber} deleted. Skipping SendGrid sync.`);
            return null;
        }

        // We need at least an email to sync to SendGrid Marketing Campaigns
        if (!guestData.email) {
            console.log(`Guest ${phoneNumber} has no email. Skipping SendGrid sync.`);
            return null;
        }

        const contactData = {
            email: guestData.email,
            firstName: guestData.firstName || (guestData.name ? guestData.name.split(' ')[0] : ''),
            lastName: guestData.lastName || (guestData.name ? guestData.name.split(' ').slice(1).join(' ') : ''),
            phoneNumber: phoneNumber
        };

        try {
            await addContact(contactData);
        } catch (error) {
            console.error(`Failed to sync guest ${phoneNumber} to SendGrid:`, error);
        }
    });
