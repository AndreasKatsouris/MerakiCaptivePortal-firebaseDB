# Sparks Hospitality -- Cloud Functions Catalog

## Overview

The platform deploys **69+ Cloud Functions** from a single `functions/index.js` entry point, with business logic split across module files. Functions use a mix of Firebase Functions v1 (`firebase-functions`) and v2 (`firebase-functions/v2/https`) APIs.

**Region:** `us-central1`
**Runtime:** Node.js 22
**Admin SDK:** Firebase Admin 12.7.0

## Function Categories

### Health & Testing

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `health` | HTTP (v2 onRequest) | None | Health check -- tests RTDB connectivity, returns status |
| `createTestData` | HTTP (v2 onRequest) | None | CRUD operations on `test-data` node for persistence testing |

---

### Authentication & User Management

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `registerUser` | onCall (v1) | Authenticated | Creates user profile, subscription, initial location during registration |
| `setAdminClaim` | HTTP POST (v2) | Admin | Sets/removes admin custom claim and `admin-claims` DB entry |
| `verifyAdminStatus` | HTTP GET (v2) | Authenticated | Returns `{ isAdmin: true/false }` via dual claim + DB check |
| `createUserAccount` | HTTP POST (v2) | Admin | Creates Firebase Auth user, profile, subscription, location assignments |
| `setupInitialAdmin` | HTTP POST (v2) | Setup Secret | One-time bootstrap for first admin user |

**`registerUser` Details:**
- Input: `{ firstName, lastName, businessName, businessAddress, businessPhone, businessType, selectedTier, tierData }`
- Creates: `users/{uid}`, `subscriptions/{uid}`, `locations/{pushId}`, `userLocations/{uid}/{locationId}`
- Trial: 14-day trial period
- Protection: Merges instead of overwriting existing data

**`createUserAccount` Details:**
- Input: `{ email, password, firstName, lastName, businessName, phoneNumber, tier, isAdmin, locationIds }`
- Validates tier exists in `subscriptionTiers` node
- Validates location count against tier limits
- Creates Auth user, user record, subscription, userLocations entries

---

### Booking Notifications

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `sendGuestBookingNotification` | HTTP POST (v1) | None | Sends WhatsApp booking confirmation to guest |
| `sendGuestStatusNotification` | HTTP POST (v1) | None | Sends WhatsApp booking status update to guest |

**Input (both):** Booking object with `{ id, phoneNumber, guestName, date, time, location, section, numberOfGuests, status, specialRequests }`

**Output:** WhatsApp template message via Twilio.

---

### WiFi & Meraki Integration

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `merakiWebhook` | HTTP (v2 onRequest) | Shared Secret | Receives Meraki Scanning API POST data, stores in `scanningData` |
| `syncWifiToGuest` | RTDB onCreate (`/wifiLogins/{sessionID}`) | N/A (trigger) | Syncs WiFi login data to guest profile in `guests/{phoneNumber}` |
| `syncGuestToSendGrid` | RTDB onWrite (`/guests/{phoneNumber}`) | N/A (trigger) | Syncs guest data to SendGrid marketing contacts |

**`merakiWebhook` Details:**
- GET: Returns validator string for Meraki handshake
- POST: Validates shared secret, stores data in `scanningData/{pushId}`

**`syncWifiToGuest` Details:**
- Normalizes phone number
- Creates or updates guest profile
- Preserves existing name/email, adds WiFi login timestamp

---

### Data Management

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `clearScanningData` | HTTP POST (v2) | Admin | Clears all `scanningData` records |
| `tempClearData` | HTTP POST (v2) | Setup Secret | One-time cleanup of scanning data + init admin-claims |
| `getGoogleConfig` | HTTP (v2 onRequest) | None | Returns Google Places API key and place ID from config |

---

### Voucher Management

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `markVoucherRedeemed` | HTTP POST (v2) | Admin | Marks a voucher as redeemed at POS |
| `getVoucherDetails` | HTTP GET (v2) | Admin | Looks up voucher by code and reward type |
| `getVoucherPoolAvailability` | HTTP GET (v2) | Admin | Returns pool statistics for a reward type |
| `updateVoucherPoolStats` | HTTP POST (v2) | Admin | Refreshes voucher pool statistics |

**`markVoucherRedeemed` Input:** `{ voucherCode, rewardTypeId, redemptionData }`
**`getVoucherDetails` Query:** `?voucherCode=...&rewardTypeId=...`
**`getVoucherPoolAvailability` Query:** `?rewardTypeId=...`

---

### Queue Management System (QMS)

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `addGuestToQueue` | HTTP POST (v1) | CORS | Adds guest to location queue |
| `removeGuestFromQueue` | HTTP POST (v1) | CORS | Removes guest from queue |
| `updateQueueEntryStatus` | HTTP POST (v1) | CORS | Updates queue entry status |
| `getQueueStatus` | HTTP GET (v1) | CORS | Returns queue status for location |
| `bulkQueueOperations` | HTTP POST (v1) | Admin | Bulk queue operations |
| `getGuestQueuePosition` | HTTP GET (v1) | CORS | Returns guest's position in queue |
| `processQueueMessage` | HTTP POST (v1) | CORS | Processes WhatsApp queue messages |
| `sendQueueNotification` | HTTP POST (v1) | Admin | Sends WhatsApp queue notification |
| `sendManualQueueAdditionNotification` | HTTP POST (v1) | Admin | WhatsApp notification for manual queue addition |
| `cleanupOldQueues` | HTTP POST (v1) | Admin | Manual queue cleanup (configurable retention) |
| `cleanupOldQueuesScheduled` | Scheduled (cron) | N/A | Automated queue cleanup |
| `getQueueAnalytics` | HTTP GET (v1) | Admin | Queue analytics for location/date range |
| `getRealtimeQueueMetrics` | HTTP GET (v1) | CORS | Real-time queue metrics |
| `getQueuePerformanceStats` | HTTP GET (v1) | Admin | Cache and performance statistics |
| `clearQueueCache` | HTTP POST (v1) | Admin | Clears in-memory queue caches |

**`addGuestToQueue` Input:** `{ locationId, phoneNumber, guestName, partySize, specialRequests }`
**`getQueueStatus` Query:** `?locationId=...&date=...`
**`getGuestQueuePosition` Query:** `?phoneNumber=...&locationId=...`
**`sendManualQueueAdditionNotification` Input:** `{ phoneNumber, guestName, locationName, position, partySize, estimatedWaitTime, specialRequests }`

---

### QMS Tier Integration (onCall)

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `getQMSTierInfo` | onCall (v1) | Authenticated | Returns user's QMS tier info and limits |
| `getQMSUsageStats` | onCall (v1) | Authenticated | Returns QMS usage statistics with tier checking |
| `validateQMSFeatureAccess` | onCall (v1) | Authenticated | Validates access to specific QMS features |
| `validateQMSWhatsAppIntegration` | onCall (v1) | Authenticated | Validates WhatsApp integration access for QMS |

**`getQMSUsageStats` Input:** `{ locationId }`
**`validateQMSFeatureAccess` Input:** `{ featureId }`

---

### WhatsApp Management

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `receiveWhatsAppMessage` | HTTP (v1) | Twilio webhook | Receives inbound WhatsApp messages (enhanced handler) |
| `receiveWhatsAppMessageEnhanced` | HTTP (v1) | Twilio webhook | Enhanced multi-location message handler |
| `initializeWhatsAppSchema` | HTTP (v1) | Authenticated | Initializes WhatsApp database schema |
| `createWhatsAppNumber` | HTTP (v1) | Authenticated | Registers a WhatsApp business number |
| `assignWhatsAppToLocation` | HTTP (v1) | Authenticated | Maps a WhatsApp number to a location |
| `getWhatsAppByLocation` | HTTP (v1) | Authenticated | Looks up WhatsApp number for a location |
| `getLocationByWhatsApp` | HTTP (v1) | Authenticated | Reverse lookup: WhatsApp number to location |
| `getUserWhatsAppNumbers` | HTTP (v1) | Authenticated | Lists all WhatsApp numbers for a user |
| `getWhatsAppAnalytics` | HTTP (v1) | Authenticated | WhatsApp messaging analytics |
| `removeWhatsAppNumber` | HTTP (v1) | Authenticated | Removes a registered WhatsApp number |

---

### WhatsApp Migration

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `checkWhatsAppMigrationStatus` | HTTP (v1) | Admin | Checks migration status to new schema |
| `startWhatsAppMigration` | HTTP (v1) | Admin | Starts migration to new WhatsApp schema |
| `rollbackWhatsAppMigration` | HTTP (v1) | Admin | Rolls back WhatsApp migration |
| `getWhatsAppMigrationStatistics` | HTTP (v1) | Admin | Migration progress statistics |
| `checkMigrationStatus` | HTTP (v1) | Authenticated | Check migration status (duplicate endpoint) |
| `startMigration` | HTTP (v1) | Authenticated | Start migration (duplicate endpoint) |

---

### Performance Monitoring (FPM)

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `performanceTest` | onCall (v1) | Admin | Tests function response time, memory, cold starts |
| `performanceTestHTTP` | HTTP (v1) | Admin | Same as above, HTTP endpoint for direct fetch |
| `runSystemOptimization` | onCall (v1) | Admin | Cleans old logs, clears caches, runs GC |
| `getSystemMetrics` | onCall (v1) | Admin | Comprehensive system metrics (node, memory, DB, cache) |

**`performanceTest` Output:**
```json
{
  "responseTime": 45,
  "dbResponseTime": 120,
  "memoryUsage": { "rss": 95, "heapUsed": 50, "heapTotal": 80, "external": 5 },
  "coldStart": false,
  "timestamp": 1700000000000,
  "region": "us-central1"
}
```

---

### Receipt Template Management

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `getReceiptTemplates` | HTTP (v2) | Admin | List all templates with optional filtering |
| `getReceiptTemplate` | HTTP (v2) | Admin | Get single template by ID |
| `createReceiptTemplate` | HTTP (v2) | Admin | Create new OCR template |
| `updateReceiptTemplate` | HTTP (v2) | Admin | Update existing template |
| `deleteReceiptTemplate` | HTTP (v2) | Admin | Delete template |
| `ocrReceiptForTemplate` | HTTP (v2) | Admin | Run OCR on receipt image for template testing |
| `getTemplatePerformance` | HTTP (v2) | Admin | Get template performance/success rate metrics |

**`getReceiptTemplates` Query:** `?brandName=...&status=...&minSuccessRate=...&sortBy=...`

---

### Project Management (Admin)

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `createProject` | HTTP (v2) | Admin | Create internal project |
| `updateProject` | HTTP (v2) | Admin | Update project details |
| `deleteProject` | HTTP (v2) | Admin | Delete project |
| `getProjects` | HTTP (v2) | Admin | List all projects |
| `manageProjectTasks` | HTTP (v2) | Admin | CRUD for project tasks |
| `manageProjectMilestones` | HTTP (v2) | Admin | CRUD for project milestones |

---

### Subscription Status Management

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `checkSubscriptionStatuses` | Scheduled (cron) | N/A | Batch check all subscriptions for expiration |
| `triggerSubscriptionStatusCheck` | onCall (v1) | Admin | Admin-triggered subscription status check |
| `onTrialEndDateUpdate` | RTDB trigger | N/A | Reacts to trial end date changes |
| `onRenewalDateUpdate` | RTDB trigger | N/A | Reacts to renewal date changes |

---

## Source File Map

| File | Functions |
|------|----------|
| `functions/index.js` | All exports (entry point) |
| `functions/guestSync.js` | `syncWifiToGuest`, `syncGuestToSendGrid` |
| `functions/queueManagement.js` | QMS business logic |
| `functions/queueWhatsAppIntegration.js` | Queue WhatsApp message processing |
| `functions/queueAnalytics.js` | Queue analytics, cleanup, scheduled tasks |
| `functions/queueCache.js` | In-memory cache management |
| `functions/voucherService.js` | Voucher redemption, pool management |
| `functions/whatsappManagement.js` | WhatsApp number CRUD, location mapping |
| `functions/whatsappMigration.js` | Schema migration utilities |
| `functions/receiveWhatsappMessage.js` | Legacy WhatsApp webhook handler |
| `functions/receiveWhatsappMessageEnhanced.js` | Enhanced multi-location WhatsApp handler |
| `functions/receiptProcessor.js` | Google Vision OCR processing |
| `functions/receiptTemplateManager.js` | [TODO: verify] Template CRUD operations |
| `functions/templateBasedExtraction.js` | Brand-specific receipt parsing |
| `functions/projectManagement.js` | Admin project CRUD |
| `functions/subscriptionStatusManager.js` | Subscription lifecycle management |
| `functions/dataManagement.js` | Phone number normalization utilities |
| `functions/rewardsProcessor.js` | Rewards processing logic |
| `functions/menuLogic.js` | WhatsApp menu/conversation flow logic |
| `functions/guardRail.js` | Input validation utilities |
| `functions/twilioClient.js` | Twilio SDK initialization |
| `functions/utils/whatsappClient.js` | WhatsApp message sending (Twilio) |
| `functions/utils/whatsappTemplates.js` | Twilio template definitions |
| `functions/utils/whatsappDatabaseSchema.js` | WhatsApp RTDB schema utilities |
| `functions/utils/templateManager.js` | Template management utilities |
| `functions/utils/timezoneUtils.js` | Timezone conversion helpers |
| `functions/utils/database-schema.js` | Database schema definitions |
| `functions/utils/firebaseConfig.js` | Backend Firebase config |
| `functions/config/firebase-admin.js` | Admin SDK initialization |
| `functions/consent/consentmanagement.js` | Guest consent management |
| `functions/constants/campaign.constants.js` | Campaign constants |

## Authentication Patterns

### HTTP Functions (onRequest)
```javascript
const idToken = req.headers.authorization?.split('Bearer ')[1];
const decodedToken = await admin.auth().verifyIdToken(idToken);
```

### Callable Functions (onCall)
```javascript
if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', '...');
}
const userId = context.auth.uid;
```

### Admin Check (Dual Verification)
```javascript
const isAdminInDb = await admin.database()
    .ref(`admin-claims/${decodedToken.uid}`)
    .once('value')
    .then(snapshot => snapshot.val() === true);

if (!decodedToken.admin === true || !isAdminInDb) {
    return res.status(403).json({ error: 'Unauthorized' });
}
```
