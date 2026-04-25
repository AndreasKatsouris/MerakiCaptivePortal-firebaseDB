# Security Remediation — OWASP Audit Fixes

You are implementing security fixes identified in an OWASP Top 10 audit of this Firebase multi-tenant restaurant platform. Work through each phase in order. Commit after each phase with a descriptive message. Push all commits to branch `claude/sleepy-einstein-5mKke` when done.

Do NOT ask for confirmation between phases. Implement every fix described below exactly as specified. If a file does not exist at the path given, skip that step and note it.

---

## Phase 1 — Database Security Rules (`database.rules.json`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/database.rules.json`

Make the following targeted changes:

**Fix 1.1 — `admin-claims` self-writeable (CRITICAL)**
Change:
```json
"admin-claims": {
  ".read": "auth != null",
  ".write": "auth != null"
},
```
To:
```json
"admin-claims": {
  ".read": "auth != null && auth.token.admin === true",
  ".write": "auth != null && auth.token.admin === true"
},
```

**Fix 1.2 — Anonymous writes on `wifiLogins`, `activeUsers`, `userPreferences` (CRITICAL)**
Change all three nodes from `".write": true` to `".write": "auth != null"`:
```json
"wifiLogins": {
  ".read": "auth != null",
  ".write": "auth != null"
},
"activeUsers": {
  ".read": "auth != null",
  ".write": "auth != null"
},
"userPreferences": {
  ".read": "auth != null",
  ".write": "auth != null"
},
```

**Fix 1.3 — `guests` collection-level read leaks all guest PII cross-tenant (HIGH)**
Change:
```json
"guests": {
  ".read": "auth != null",
  ".write": "auth != null && auth.token.admin === true",
```
To (remove collection-level read; child rule already scopes it correctly):
```json
"guests": {
  ".write": "auth != null && auth.token.admin === true",
```

**Fix 1.4 — `users` collection-level read leaks all user profiles cross-tenant (MEDIUM)**
Change:
```json
"users": {
  ".read": "auth != null",
  "$uid": {
    ".read": "auth != null",
```
To (remove collection-level read; keep child-level read):
```json
"users": {
  "$uid": {
    ".read": "auth != null",
```

**Fix 1.5 — `subscriptions` collection-level read leaks billing data cross-tenant (MEDIUM)**
Change:
```json
"subscriptions": {
  ".read": "auth != null",
  ".indexOn": ["userId", "tier", "status", "expirationDate"],
```
To:
```json
"subscriptions": {
  ".indexOn": ["userId", "tier", "status", "expirationDate"],
```

**Fix 1.6 — `locations` collection-level write allows any authenticated user to create locations (HIGH)**
Change:
```json
"locations": {
  ".read": "auth != null",
  ".write": "auth != null",
```
To:
```json
"locations": {
  ".read": "auth != null",
  ".write": "auth != null && auth.token.admin === true",
```

**Fix 1.7 — `receipts` no ownership check, any authenticated user can write any receipt (HIGH)**
Change:
```json
"receipts": {
  ".indexOn": ["phoneNumber", "guestPhoneNumber", "locationId", "status", "processedAt", "createdAt"],
  ".read": "auth != null",
  ".write": "auth != null"
},
```
To:
```json
"receipts": {
  ".indexOn": ["phoneNumber", "guestPhoneNumber", "locationId", "status", "processedAt", "createdAt"],
  ".read": "auth != null",
  "$receiptId": {
    ".write": "auth != null && (auth.token.admin === true || (newData.child('locationId').exists() && root.child('userLocations').child(auth.uid).child(newData.child('locationId').val()).exists()) || (!newData.exists() && data.child('locationId').exists() && root.child('userLocations').child(auth.uid).child(data.child('locationId').val()).exists()))"
  }
},
```

After all changes, commit:
```
git add database.rules.json
git commit -m "fix(security): tighten RTDB rules — remove cross-tenant reads and anon writes"
```

---

## Phase 2 — Firebase Storage Rules (`storage.rules`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/storage.rules`

**Fix 2.1 — `receipts/` path allows unauthenticated writes (HIGH)**
Change:
```
match /receipts/{receiptFile} {
  allow read: if request.auth != null; // All authenticated users can read
  allow write: if true; // Allow functions to write (no auth context)
}
```
To:
```
match /receipts/{receiptFile} {
  allow read: if request.auth != null;
  allow write: if false; // Cloud Functions use Admin SDK and bypass rules
}
```

Commit:
```
git add storage.rules
git commit -m "fix(security): disallow unauthenticated writes to receipts storage path"
```

---

## Phase 3 — Firebase Hosting Security Headers (`firebase.json`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/firebase.json`

Find the `**/*.html` headers source block and add the five missing security headers. The existing block looks like:
```json
{
  "source": "**/*.html",
  "headers": [
    {
      "key": "Cache-Control",
      "value": "no-cache"
    }
  ]
}
```

Replace it with:
```json
{
  "source": "**/*.html",
  "headers": [
    {
      "key": "Cache-Control",
      "value": "no-cache"
    },
    {
      "key": "X-Frame-Options",
      "value": "DENY"
    },
    {
      "key": "X-Content-Type-Options",
      "value": "nosniff"
    },
    {
      "key": "Referrer-Policy",
      "value": "strict-origin-when-cross-origin"
    },
    {
      "key": "Permissions-Policy",
      "value": "camera=(), microphone=(), geolocation=()"
    },
    {
      "key": "Content-Security-Policy",
      "value": "default-src 'self' https://*.googleapis.com https://*.gstatic.com https://apis.google.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net; frame-ancestors 'none'"
    }
  ]
}
```

Commit:
```
git add firebase.json
git commit -m "fix(security): add CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy headers"
```

---

## Phase 4 — Cloud Functions: Operator Precedence Bug (`functions/index.js`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/functions/index.js`

**Fix 4.1 — 12 instances of broken admin check (CRITICAL)**

The expression `!decodedToken.admin === true` is evaluated as `(!decodedToken.admin) === true` due to JS operator precedence. This is logically inverted from the intended check.

Use a bulk find-and-replace across the entire file:
- Find: `!decodedToken.admin === true`
- Replace with: `decodedToken.admin !== true`

There are 12 occurrences at lines: 1046, 1097, 1147, 1194, 1236, 1401, 1511, 1584, 1679, 1723, 1808, 1855.

Replace every single occurrence. Do not leave any unchanged.

---

## Phase 5 — Cloud Functions: Remove Dangerous Endpoints (`functions/index.js`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/functions/index.js`

**Fix 5.1 — Delete `setupInitialAdmin` (CRITICAL)**

Find the entire `exports.setupInitialAdmin = onRequest(...)` function block starting at the line containing `exports.setupInitialAdmin = onRequest(async (req, res) => {` and ending at the matching closing `});`. Delete the entire block including the export declaration.

**Fix 5.2 — Delete `tempClearData` (CRITICAL)**

Find the entire `exports.tempClearData = onRequest(...)` function block starting at `exports.tempClearData = onRequest(async (req, res) => {` and delete the entire block to its matching closing `});`.

**Fix 5.3 — Delete `createTestData` (MEDIUM)**

Find and delete the entire `exports.createTestData = onRequest(async (req, res) => {` block.

After deleting all three blocks, commit:
```
git add functions/index.js
git commit -m "fix(security): remove setupInitialAdmin, tempClearData, createTestData endpoints"
```

---

## Phase 6 — Cloud Functions: Move Hardcoded Secret to Environment Variable (`functions/index.js`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/functions/index.js`

**Fix 6.1 — Replace hardcoded Meraki shared secret**

Find:
```javascript
const sharedSecret = 'Giulietta!16'; // Replace with your shared secret
```
Replace with:
```javascript
const sharedSecret = process.env.MERAKI_SHARED_SECRET || functions.config()?.meraki?.secret;
if (!sharedSecret) {
    console.error('[merakiWebhook] MERAKI_SHARED_SECRET environment variable not set');
    return res.status(500).send('Server configuration error');
}
```

Note: Add a comment at the top of the file (near other env var references) documenting that `MERAKI_SHARED_SECRET` must be set via `firebase functions:secrets:set MERAKI_SHARED_SECRET`.

Commit:
```
git add functions/index.js
git commit -m "fix(security): replace hardcoded Meraki secret with environment variable"
```

---

## Phase 7 — Cloud Functions: Fix `req.headers` Logging (`functions/index.js`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/functions/index.js`

**Fix 7.1 — Remove full header dumps that expose Bearer tokens in logs**

Find and replace each of the following log statements that dump `req.headers`:

Pattern to find:
```javascript
headers: req.headers,
origin: req.headers.origin || 'No origin'
```
Replace with:
```javascript
hasAuth: !!req.headers.authorization,
origin: req.headers.origin || 'No origin'
```

Also find standalone:
```javascript
headers: req.headers
```
(where it appears as a solo log property without the `origin` line following it)
Replace with:
```javascript
hasAuth: !!req.headers.authorization
```

Do this replacement for all 4 occurrences (approximately at lines 593–594, 666–667, 754, and 906–907).

Commit:
```
git add functions/index.js
git commit -m "fix(security): stop logging req.headers to prevent Bearer token exposure in Cloud Logging"
```

---

## Phase 8 — Cloud Functions: Fix CORS (`functions/ross.js`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/functions/ross.js`

**Fix 8.1 — Replace `origin: true` with explicit allowlist**

Find:
```javascript
const cors = require('cors')({ origin: true });
```
Replace with:
```javascript
const ALLOWED_ORIGINS = [
    'https://merakicaptiveportal-firebasedb.web.app',
    'https://merakicaptiveportal-firebasedb.firebaseapp.com',
    'http://localhost:5000',
    'http://localhost:5001',
    'http://127.0.0.1:5000',
];
const cors = require('cors')({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
});
```

Commit:
```
git add functions/ross.js
git commit -m "fix(security): replace CORS origin:true with explicit allowlist in ross.js"
```

---

## Phase 9 — Cloud Functions: Add Auth to Queue Endpoints (`functions/index.js`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/functions/index.js`

**Fix 9.1 — Add token verification to the five unauthenticated queue functions**

The five functions that need auth added are: `addGuestToQueue`, `removeGuestFromQueue`, `updateQueueEntryStatus`, `getQueueStatus`, and `processQueueMessage`.

For each function, find the pattern where the function body begins with CORS wrapping and immediately calls the underlying queue service, then add token verification at the start of the CORS callback. Use the same pattern as other authenticated functions in the file that call `admin.auth().verifyIdToken()`.

The auth guard to insert at the top of each function's CORS callback body:
```javascript
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: missing token' });
}
const idToken = authHeader.split('Bearer ')[1];
let decodedToken;
try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
} catch (error) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
}
```

Insert this block at the very start of the async handler body inside the CORS callback for all five functions.

Commit:
```
git add functions/index.js
git commit -m "fix(security): add Bearer token auth to addGuestToQueue, removeGuestFromQueue, updateQueueEntryStatus, getQueueStatus, processQueueMessage"
```

---

## Phase 10 — Cloud Functions: Twilio Webhook Signature Validation (`functions/receiveWhatsappMessageEnhanced.js`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/functions/receiveWhatsappMessageEnhanced.js`

**Fix 10.1 — Add Twilio request signature validation**

First, find the existing `validateRequest` function (around line 295) that only checks field presence. Replace the body of that function to add real Twilio signature validation:

Find:
```javascript
function validateRequest(req) {
```

The entire function validates only field presence. Replace its body with:
```javascript
function validateRequest(req) {
    const twilioSignature = req.headers['x-twilio-signature'];
    const authToken = process.env.TWILIO_TOKEN;
    const webhookUrl = process.env.TWILIO_WEBHOOK_URL;

    if (!twilioSignature) {
        console.warn('[validateRequest] Missing X-Twilio-Signature header');
        return { isValid: false, error: 'Missing Twilio signature' };
    }

    if (authToken && webhookUrl) {
        const twilio = require('twilio');
        const isValid = twilio.validateRequest(authToken, twilioSignature, webhookUrl, req.body);
        if (!isValid) {
            console.warn('[validateRequest] Invalid Twilio signature');
            return { isValid: false, error: 'Invalid Twilio signature' };
        }
    } else {
        console.warn('[validateRequest] TWILIO_TOKEN or TWILIO_WEBHOOK_URL not set — skipping signature check');
    }

    const { From, To } = req.body;
    if (!From || !To) {
        return { isValid: false, error: 'Missing required fields: From, To' };
    }
    return { isValid: true };
}
```

Note: `TWILIO_WEBHOOK_URL` must be set to the full public URL of the `receiveWhatsAppMessage` Cloud Function endpoint. Document this in a comment above the function.

Commit:
```
git add functions/receiveWhatsappMessageEnhanced.js
git commit -m "fix(security): add Twilio X-Twilio-Signature validation to webhook handler"
```

---

## Phase 11 — XSS Fixes in Frontend (`public/js/googleReviews.js`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/public/js/googleReviews.js`

**Fix 11.1 — Escape all user-controlled fields rendered into innerHTML**

The file renders `review.text`, `review.language`, `review.reviewerName`, `review.relativeTimeDescription`, `review.response`, and `review.authorUrl` directly into `innerHTML` without sanitization.

First verify that `escapeHtml` is already defined or imported in this file. If it is not, add this function near the top of the file:
```javascript
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

Then in the `tableBody.innerHTML` template (around line 231), wrap every interpolated review field:

- `${review.formattedDate}` → `${escapeHtml(review.formattedDate)}`
- `${review.reviewerName}` (both occurrences — the `alt` attribute and the link text) → `${escapeHtml(review.reviewerName)}`
- `${review.authorUrl}` in the `href` attribute → `${escapeHtml(review.authorUrl)}` (also validate it starts with `https://` to prevent `javascript:` URIs: use `review.authorUrl && review.authorUrl.startsWith('https://') ? escapeHtml(review.authorUrl) : '#'`)
- `${review.relativeTimeDescription || ''}` → `${escapeHtml(review.relativeTimeDescription || '')}`
- `${review.text}` → `${escapeHtml(review.text)}`
- `${review.language}` → `${escapeHtml(review.language)}`
- `${review.response}` (inside the response div) → `${escapeHtml(review.response)}`

Commit:
```
git add public/js/googleReviews.js
git commit -m "fix(security): escape all user-controlled fields in Google Reviews innerHTML (XSS)"
```

---

## Phase 12 — XSS Fixes in Frontend (`public/js/dashboard.js`)

File: `/home/user/MerakiCaptivePortal-firebaseDB/public/js/dashboard.js`

**Fix 12.1 — Escape receipt fields rendered into innerHTML**

Find the `tableBody.innerHTML` block around line 156 that renders `receipt.guestPhoneNumber` and `receipt.status`.

First verify that `escapeHtml` is defined in this file. If not, add the same `escapeHtml` function as in Phase 11.

Then make these replacements in the template:
- `${receipt.guestPhoneNumber || 'Unknown'}` → `${escapeHtml(receipt.guestPhoneNumber || 'Unknown')}`
- `${receipt.status || 'pending'}` → `${escapeHtml(receipt.status || 'pending')}`
- `${getStatusBadgeClass(receipt.status)}` → this is used only as a CSS class name; wrap it: `${escapeHtml(getStatusBadgeClass(receipt.status))}`

Commit:
```
git add public/js/dashboard.js
git commit -m "fix(security): escape receipt fields in dashboard innerHTML (XSS)"
```

---

## Phase 13 — Git Ignore: Prevent RTDB Export Recommit

File: `/home/user/MerakiCaptivePortal-firebaseDB/.gitignore`

**Fix 13.1 — Add patterns to prevent database exports being committed**

Open `.gitignore` and append these lines if they are not already present:
```
# Database exports (contain PII — never commit)
*-rtdb.json
*-export.json
*-backup.json
firebase-debug.log
```

Then untrack the already-committed RTDB file:
```bash
git rm --cached merakicaptiveportal-firebasedb-default-rtdb.json
```

Commit:
```
git add .gitignore
git commit -m "fix(security): gitignore RTDB export files and untrack committed export with PII"
```

Note: To fully purge it from git history, BFG Repo-Cleaner must be run manually and requires a force-push coordinated with the team. That step is out of scope here but should be scheduled.

---

## Phase 14 — Dependency Updates

Run the following in sequence and commit any `package.json` / `package-lock.json` changes:

```bash
# Update functions dependencies
cd /home/user/MerakiCaptivePortal-firebaseDB/functions
npm audit fix
npm install express@latest

# Update root dependencies
cd /home/user/MerakiCaptivePortal-firebaseDB
npm audit fix
npm install express@latest axios@latest
```

After running, check `npm audit` output in both directories. If critical or high vulnerabilities remain that require `--force` to fix, list them in the commit message but do NOT run `npm audit fix --force` without noting which packages are being downgraded.

Commit any changes:
```
git add functions/package.json functions/package-lock.json package.json package-lock.json
git commit -m "fix(security): npm audit fix — update express, axios and transitive CVEs"
```

---

## Phase 15 — Final Push

After all phases are committed, push to the feature branch:

```bash
git push -u origin claude/sleepy-einstein-5mKke
```

If the push fails due to network errors, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s between retries).

---

## Out-of-Scope Items (manual action required by the developer)

These cannot be resolved by code changes alone and must be actioned manually:

1. **Rotate Meraki shared secret** — Change `Giulietta!16` in the Meraki dashboard and set the new value via `firebase functions:secrets:set MERAKI_SHARED_SECRET`.
2. **Rotate `MerakiAdmin2024!` and `MerakiSetup2024!`** — These are compromised. Even after deleting the functions, treat any systems that used these secrets as potentially compromised.
3. **Set `TWILIO_WEBHOOK_URL`** — Run `firebase functions:config:set twilio.webhook_url="https://..."` with the full Cloud Function URL.
4. **Purge RTDB export from git history** — Run BFG Repo-Cleaner: `bfg --delete-files merakicaptiveportal-firebasedb-default-rtdb.json`, then `git reflog expire --expire=now --all && git gc --prune=now --aggressive`, then coordinate a force-push with the team.
5. **Enable Firebase App Check** — Restricts Firebase SDK usage to your specific app builds, preventing API key abuse.
6. **Review Cloud Logging** — Check logs for any captured `Authorization: Bearer` tokens from before the Phase 7 fix and invalidate affected sessions via Firebase Auth's `revokeRefreshTokens(uid)`.
