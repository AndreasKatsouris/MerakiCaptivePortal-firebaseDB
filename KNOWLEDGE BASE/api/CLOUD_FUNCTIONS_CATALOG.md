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

### Billing — Credit Ledger (Phase 7 ①)

Shared, USD-denominated prepaid credit ledger (`functions/billing/`). Meters paid usage per owner and enforces a prepaid USD-cents balance. The debit path (`recordUsageAndDebit` / `checkBalance`) is **module-only** — never a CF; only `billingGrantCredit`/`billingGetBalance`/`billingGetUsage` are exposed. All `billing/*` RTDB nodes are server-only (`.read:false/.write:false`). See `docs/plans/2026-05-31-metering-credit-ledger-design.md`.

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `billingGrantCredit` | HTTP (v2 onRequest) | Super Admin | Comp a beta owner's balance (v1 credit bridge — no payment rail yet). Body `{ uid, amountCents, reason }`; writes a `billing/grants` audit row |
| `billingGetBalance` | HTTP (v2 onRequest) | Authenticated (self-scoped) | Owner reads own `balanceCents` (+ `currency`). Scoped to the token uid — a body uid is never honoured |
| `billingGetUsage` | HTTP (v2 onRequest) | Authenticated (self-scoped) | Owner reads own usage history, newest-first, paginated. Body `{ limit?, before? }` (limit clamped 1–100) |

---

### Payments — ③ Payment Rail (Paystack top-ups + trial)

Paystack credit top-ups (PAYG) + one-time free trial (`functions/payments/`). The **webhook is the sole grant source of truth**: signature-verified (HMAC-SHA512 over the RAW body), idempotent per Paystack `reference` (write-before-effect claim via RTDB transaction), and the grant amount is ALWAYS re-derived server-side from the bundle — never the event amount. USD is the unit of account (1:1 ledger grant); ZAR is the charge currency (Paystack-SA). **DORMANT until launch** — needs `PAYSTACK_SECRET_KEY` (secret-first deploy), the bundle seed, and the `rossAgent→Free` flip, none of which run before the two wheels land. See `docs/plans/2026-06-08-payment-rail-backend-plan.md`.

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `paymentsListBundles` | HTTP (v2 onRequest) | Authenticated | List active credit bundles (`billing/creditBundles`, server-priced) for the top-up UI |
| `paymentsInitTopup` | HTTP (v2 onRequest) | Authenticated (self-scoped) | Create a Paystack transaction for a bundle; returns `{ authorizationUrl, reference }`. Price comes from the bundle (server-side); `metadata.uid` is taken from the verified token |
| `paymentsClaimTrial` | HTTP (v2 onRequest) | Authenticated (self-scoped) | One-time free-trial credit grant ($1), idempotent per uid via `billing/trialGranted/{uid}` claim-first transaction |
| `paystackWebhook` | HTTP (v2 onRequest) | **None — `x-paystack-signature` HMAC gate** | `charge.success` → idempotent ledger grant. Verified events always 200 (dupes ignored); a grant failure 500s so Paystack retries safely against the claim |

---

### Entitlements — resolver + add-on layer (Phase 7 ④a)

Server-side entitlement resolver (`functions/entitlements/`) — the **sole writer** of materialized `subscriptions/{uid}/features` + `limits`. CFs set only the INPUTS (base tier, add-on records) then call `recomputeEntitlements(uid)`; the resolver merges base-tier + active add-ons and writes the materialized result atomically. Closes the client self-grant vector once the `subscriptions/$uid` `.write` rule-lock slice lands (deploy order: CFs → client → rules). See `docs/plans/2026-05-31-entitlements-addon-layer-design.md`.

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `entitlementSetTier` | HTTP (v2 onRequest) | Admin | Set a user's base tier (validates against `subscriptionTiers/{tierId}`), then recompute. Body `{ uid, tierId }`. Admin-gated (PR4 Q3, relaxed from superAdmin — the admin tier-change UIs route here); owners cannot reach it |
| `entitlementGrantAddOn` | HTTP (v2 onRequest) | Super Admin | Attach an active catalog add-on (validates against `ADDON_CATALOG/{addOnId}`), then recompute. Body `{ uid, addOnId, expiresAt? }` (expiresAt epoch ms) |
| `entitlementCancelAddOn` | HTTP (v2 onRequest) | Super Admin | Cancel an add-on (status → `cancelled`), then recompute. Body `{ uid, addOnId }` |
| `entitlementGetEffective` | HTTP (v2 onRequest) | Authenticated (self-scoped; **any** admin may read any uid) | Read materialized `features`/`limits`/`addOns`. Non-admins restricted to own uid. Body `{ uid? }` |
| `recomputeExpiringEntitlements` | Scheduled (daily 03:00 SAST) | N/A (server-side) | Daily sweep — re-materializes every subscription so expired add-ons / subscriptions drop on schedule. Idempotent |

---

### askRoss Agent — reactive engine (Phase 7 ②)

The project's **first AI-inference CF.** `rossChat` is the v1 reactive engine (raw Anthropic Messages API, streaming SSE): the owner asks Ross a question and Ross answers grounded in tool results, auto-executing only low-risk read/run tools (`functions/agent/`). **Four pre-flight gates** run before any LLM spend — global kill switch (`ross/config/agentKillSwitch`) → per-owner enable (`ross/agentConfig/{uid}/enabled`) → `features.rossAgent` entitlement → ledger balance; **super-admins skip the entitlement + balance gates** (still bound by the kill switch). Usage is debited once per turn via the ① ledger (`recordUsageAndDebit`, idempotent on the request id). **Confirm-flow is LIVE (slice 4, #136):** the 4 `confirm`-tier playbook-authoring tools (activate/create/edit/pause workflow) are READY — a confirm-tier call PAUSES the turn, persists a pending action, and emits a `confirm` card for the owner to approve/decline via a resume request (detailed in the `rossChat` table row below). The loop auto-runs only the READY read/run tools; confirm-tier tools always route through the pause/resume gate. The owner-facing **Ask Ross ⌘K client (slice 5, #139)** is the live consumer. See `docs/plans/2026-05-31-askross-agent-design.md`.

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `rossChat` | HTTP (v2 onRequest, **SSE**) | `verifyRossAgentAccess` — admin OR `features.rossAgent` (legacy `rossBasic`/`rossAdvanced` still admitted) | One streaming agent turn OR a confirm **resume**. Body `{ message, threadId?, clientToday? }` for a turn, or `{ resumeTurnId, decision: 'approve'\|'decline' }` to resolve a paused confirm-tier action. Streams `text` / `action` / `confirm` / `terminal` / `error` / `done` SSE events. A confirm-tier tool (activate/create/edit/pause workflow) PAUSES the turn → persists a pending action at `ross/agentPending/{uid}/{turnId}` (10-min expiry, server-keyed, uid-scoped) + emits a `confirm` card; the owner's resume executes it (audited `confirmed:<uid>`, one-time-consume) or declines (pause + resume billed separately). Secret `ANTHROPIC_API_KEY` (Sonnet 4.6). Persists turns to `ross/agentChats/{uid}/{threadId}`, audits every executed tool to `ross/agentAudit/{uid}/{turnId}` |
| `rossAgentPrune` | Scheduled (daily 03:30) | N/A (server-side) | Prunes stale agent nodes (RTDB has no TTL): nulls expired pending confirm-actions at `ross/agentPending/{uid}/{turnId}` (past expiry + 1-day grace; also sweeps malformed nodes) and stale debit guards at `billing/debitGuard/{uid}/{requestId}` (older than 7 days). Multi-path delete, batch-capped at 5000/run (remainder logged + cleared next run). The `ross/agent*` nodes are `.read:false/.write:false` (server-only Admin SDK; owner reads via CFs — slice 7) |

---

### Authentication & User Management

| Function | Trigger | Auth | Purpose |
|----------|---------|------|---------|
| `registerUser` | onCall (v2) | Authenticated | Creates user profile, subscription, initial location during registration |
| `setAdminClaim` | HTTP POST (v2) | Admin | Sets/removes admin custom claim and `admin-claims` DB entry |
| `verifyAdminStatus` | HTTP GET (v2) | Authenticated | Returns `{ isAdmin: true/false }` via dual claim + DB check |
| `createUserAccount` | HTTP POST (v2) | Admin | Creates Firebase Auth user, profile, subscription, location assignments |
| `setupInitialAdmin` | HTTP POST (v2) | Setup Secret | One-time bootstrap for first admin user |

**`registerUser` Details:**
- Input: `{ firstName, lastName, businessName, businessAddress, businessPhone, businessType, isFranchise, franchiseName, brandName, tier, selectedTier?, tierData? }`
  - `tier` is the canonical tier ID; `selectedTier` is accepted as a legacy alias when `tier` is absent
  - `tierData` is accepted but ignored — the CF re-fetches tier features/limits from `subscriptionTiers/{tierId}` so a client cannot inflate its own subscription
- Validation: rejects with `invalid-argument` when `tier` is missing, when `tier` does not exist in `subscriptionTiers/{tierId}`, or when `businessName` / `franchiseName` / `brandName` exceed 200 chars
- Creates / updates atomically (single multi-path `update`):
  - `users/{uid}` — includes `tier`, `isFranchise`, `franchiseName`, `brandName`
  - `subscriptions/{uid}` — `tier` (canonical) AND `tierId` (legacy compat); `features` / `limits` populated from server-fetched tier data
  - `onboarding-progress/{uid}` — initialised with `{ completed: false, helloSeen: false }` only when absent (idempotent re-entry)
- Creates separately (needs push key): `locations/{pushId}`, `userLocations/{uid}/{locationId}`
- Trial: 14-day trial period
- Protection: Merges instead of overwriting existing data on `users` / `subscriptions` (preserves phone numbers; preserves wizard progress)

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
| `clearScanningData` | Callable (v2 onCall) | Admin (custom claim + `admin-claims/{uid}`) | Chunked delete of `/scanningData`. Returns `{ deleted, batches, done, durationMs }`; client loops until `done: true` if the per-call cap (100K records) is hit. |
| `submitWifiLogin` | Callable (v2 onCall) | Anonymous Firebase Auth | Server-side write path for guest captive-portal login. Validates name/email/phone/MAC, 5s/UID rate-limit, atomic multi-path write to `wifiLogins/{sessionID}` + `activeUsers/{client_mac\|sessionID}` + `rateLimitsWifi/{uid}`. Accepts: `{ name, email, phoneNumber, table, marketingConsent: bool, client_mac, node_mac, client_ip }`. Replaced the prior direct-client RTDB writes that required `.write:true` (public-internet exposure). Returns `{ success, sessionID }`. |
| `getGoogleConfig` | HTTP (v2 onRequest) | Admin (`Bearer <idToken>`) | Returns Google Places API key and place ID from config |

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
| `addGuestToQueue` | HTTP POST (v1) | Admin (`Bearer <idToken>`) | Adds guest to location queue |
| `removeGuestFromQueue` | HTTP POST (v1) | Admin (`Bearer <idToken>`) | Removes guest from queue |
| `updateQueueEntryStatus` | HTTP POST (v1) | Admin (`Bearer <idToken>`) | Updates queue entry status |
| `getQueueStatus` | HTTP GET (v1) | CORS (no auth — guest position checks) | Returns queue status for location |
| `bulkQueueOperations` | HTTP POST (v1) | Admin | Bulk queue operations |
| `getGuestQueuePosition` | HTTP GET (v1) | CORS | Returns guest's position in queue |
| `processQueueMessage` | HTTP POST (v1) | Admin (`Bearer <idToken>`) | Processes WhatsApp queue messages |
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
| `getQMSTierInfo` | onCall (v2) | Authenticated | Returns user's QMS tier info and limits |
| `getQMSUsageStats` | onCall (v2) | Authenticated | Returns QMS usage statistics with tier checking |
| `validateQMSFeatureAccess` | onCall (v2) | Authenticated | Validates access to specific QMS features |
| `validateQMSWhatsAppIntegration` | onCall (v2) | Authenticated | Validates WhatsApp integration access for QMS |

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
| `performanceTest` | onCall (v2) | Admin | Tests function response time, memory, cold starts |
| `performanceTestHTTP` | HTTP (v1) | Admin | Same as above, HTTP endpoint for direct fetch |
| `runSystemOptimization` | onCall (v2) | Admin | Cleans old logs, clears caches, runs GC |
| `getSystemMetrics` | onCall (v2) | Admin | Comprehensive system metrics (node, memory, DB, cache) |

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

### ROSS Functions

All 22 ROSS functions live in `functions/ross.js`. Full catalog with auth, descriptions, response shapes, and **allowed-fields per mutator** is in **`public/kb/features/ROSS.md#cloud-functions`** — that is the canonical source. Summary by category:

| Category | Functions |
|----------|-----------|
| Workflows | `rossGetWorkflows`, `rossCreateWorkflow`, `rossUpdateWorkflow`, `rossDeleteWorkflow`, `rossActivateWorkflow`, `rossSeedFirstWorkflow` |
| Templates | `rossGetTemplates`, `rossCreateTemplate`, `rossUpdateTemplate`, `rossDeleteTemplate` |
| Tasks | `rossManageTask`, `rossCompleteTask` |
| Runs | `rossCreateRun`, `rossSubmitResponse`, `rossGetRun`, `rossGetRunHistory` |
| Reports | `rossGetReports` |
| Staff | `rossManageStaff`, `rossGetStaff` |
| Home / UX | `rossGetHomeWorkflowDigest`, `rossV2Snooze` |
| Scheduled | `rossScheduledReminder` (cron `0 5 * * *`) |

> **Field-verify rule.** Before reading any ROSS field from a CF response or RTDB on the client, grep the corresponding `set()` / `update()` / `res.json(...)` call in `functions/ross.js` and confirm the field is actually written there. Server's `locData.status` is `'active'` forever; the home digest derives overdue state from `nextDueDate < today`. Use the client helper at `public/js/modules/ross/v2/workflow-status.js` (shipped in PR #86).

---

## Source File Map

| File | Functions |
|------|----------|
| `functions/index.js` | All exports (entry point) |
| `functions/ross.js` | All 22 ROSS functions — see `public/kb/features/ROSS.md#cloud-functions` for catalog |
| `functions/ross-tier.js` | Tier-gating helpers (`readUserTier`, `filterTemplatesByTier`, audit logger) |
| `functions/ross-workflow-builder.js` | `buildWorkflowRecord`, `buildLocationsFromTemplate`, `buildTaskFromSubtask` |
| `functions/agent/*` | askRoss agent (Phase 7 ②) — `rossChat.js` reactive SSE engine + engine-agnostic core (`llm-client.js`, `tools.js`, `execute.js`, `policy.js`, `prompt.js`, `constants.js`) |
| `functions/billing/*` | Credit ledger (Phase 7 ①) — `ledger.js` + `cloud-functions.js` (`billingGrantCredit`/`billingGetBalance`/`billingGetUsage`) |
| `functions/entitlements/*` | Entitlement resolver (Phase 7 ④a) — `resolver.js` + `cloud-functions.js` (`entitlement*` CFs) |
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

### Callable Functions (onCall — v2)
```javascript
const { onCall, HttpsError } = require('firebase-functions/v2/https');

exports.myCallable = onCall(async (request) => {
    const { data, auth } = request;
    if (!auth) {
        throw new HttpsError('unauthenticated', '...');
    }
    const userId = auth.uid;
    // ...
});
```
> Note: `firebase-functions@7` deploys handlers as Gen 2 regardless of whether you use the v1 namespace (`functions.https.onCall`) or the explicit v2 import. **Use the v2 import** — the v1 signature `(data, context)` receives a single `CallableRequest` as `data` and an undefined `context`, so `context.auth` is always missing and every call throws `unauthenticated`. See PR #67.

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
