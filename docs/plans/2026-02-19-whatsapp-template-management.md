# WhatsApp Template Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move WhatsApp template ContentSids from `.env` files into Firebase RTDB, add admin Cloud Functions to manage them, and rebuild the admin UI with a 4-tab layout including a working Templates management tab.

**Architecture:** Template config is stored in `whatsapp-template-config/{templateType}` in RTDB. `whatsappClient.js` reads this node (5-minute in-memory cache) instead of `process.env`. Three new admin-only Cloud Functions handle read, write, and test-send. The admin UI is restructured into tabs (Numbers | Mappings | Templates | Analytics) with admin detection controlling the delete button visibility.

**Tech Stack:** Firebase RTDB, Firebase Cloud Functions (Node.js 22), Twilio Messages API, vanilla JS, Bootstrap 5.3.0, SweetAlert2

**Design doc:** `docs/plans/2026-02-19-whatsapp-system-design.md`

---

## Task 1: Add RTDB security rules for whatsapp-template-config

**Files:**
- Modify: `database.rules.json`

**Step 1: Add the rule node**

Open `database.rules.json`. Inside the `"rules"` object, add the following node (place it after the `"admin-claims"` block):

```json
"whatsapp-template-config": {
  ".read": "auth != null",
  ".write": "auth != null && auth.token.admin === true"
}
```

**Step 2: Validate the rules file**

```bash
firebase --project merakicaptiveportal-firebasedb database:rules:get
```

Or use the Firebase MCP tool `firebase_validate_security_rules` with `type: "rtdb"` and `source_file: "database.rules.json"`.

Expected: No syntax errors reported.

**Step 3: Commit**

```bash
git add database.rules.json
git commit -m "feat: add RTDB security rules for whatsapp-template-config"
```

---

## Task 2: Seed initial template config to RTDB

This is a one-time setup. We'll write a seed function that can be called from the Firebase console or a test.

**Files:**
- Create: `functions/utils/seedTemplateConfig.js`

**Step 1: Create the seed file**

```javascript
// functions/utils/seedTemplateConfig.js
const { rtdb, ref, set, get } = require('../config/firebase-admin');

const INITIAL_TEMPLATE_CONFIG = {
    booking_confirmation: {
        contentSid: process.env.TWILIO_CONTENT_SID_BOOKING_CONFIRMATION || '',
        enabled: !!(process.env.TWILIO_CONTENT_SID_BOOKING_CONFIRMATION &&
                   !process.env.TWILIO_CONTENT_SID_BOOKING_CONFIRMATION.includes('HXxxxxxxx')),
        label: 'Booking Confirmation',
        variableCount: 9
    },
    booking_status_update: {
        contentSid: '',
        enabled: false,
        label: 'Booking Status Update',
        variableCount: 10
    },
    booking_reminder: {
        contentSid: '',
        enabled: false,
        label: 'Booking Reminder',
        variableCount: 5
    },
    receipt_confirmation: {
        contentSid: '',
        enabled: false,
        label: 'Receipt Confirmation',
        variableCount: 3
    },
    welcome_message: {
        contentSid: '',
        enabled: false,
        label: 'Welcome Message',
        variableCount: 1
    },
    queue_manual_addition: {
        contentSid: '',
        enabled: false,
        label: 'Queue Manual Addition',
        variableCount: 6
    },
    admin_new_booking_notification: {
        contentSid: process.env.TWILIO_CONTENT_SID_ADMIN_NEW_BOOKING || '',
        enabled: !!(process.env.TWILIO_CONTENT_SID_ADMIN_NEW_BOOKING &&
                   !process.env.TWILIO_CONTENT_SID_ADMIN_NEW_BOOKING.includes('HXxxxxxxx')),
        label: 'Admin New Booking Notification',
        variableCount: 10
    }
};

async function seedTemplateConfig() {
    const configRef = ref(rtdb, 'whatsapp-template-config');
    const snapshot = await get(configRef);

    if (snapshot.exists()) {
        console.log('⏭️ whatsapp-template-config already exists, skipping seed');
        return { skipped: true };
    }

    await set(configRef, INITIAL_TEMPLATE_CONFIG);
    console.log('✅ whatsapp-template-config seeded successfully');
    return { seeded: true, config: INITIAL_TEMPLATE_CONFIG };
}

module.exports = { seedTemplateConfig, INITIAL_TEMPLATE_CONFIG };
```

**Step 2: Verify the file loads without errors**

```bash
cd functions && node -e "require('./utils/seedTemplateConfig'); console.log('OK')"
```

Expected: `OK`

**Step 3: Commit**

```bash
git add functions/utils/seedTemplateConfig.js
git commit -m "feat: add RTDB template config seed utility"
```

---

## Task 3: Modify whatsappClient.js to read RTDB cache

**Files:**
- Modify: `functions/utils/whatsappClient.js`

This is the core backend change. Replace env-var-based template config with an RTDB read with 5-minute in-memory cache.

**Step 1: Add cache variables and `getTemplateConfig()` at the top of the file**

After the existing `require` statements (around line 14), add:

```javascript
const { rtdb, ref, get } = require('../config/firebase-admin');

// In-memory cache for template config
let _templateConfigCache = null;
let _templateConfigCacheTime = 0;
const TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getTemplateConfig(templateType) {
    const now = Date.now();
    if (!_templateConfigCache || (now - _templateConfigCacheTime) > TEMPLATE_CACHE_TTL_MS) {
        const configRef = ref(rtdb, 'whatsapp-template-config');
        const snapshot = await get(configRef);
        _templateConfigCache = snapshot.exists() ? snapshot.val() : {};
        _templateConfigCacheTime = now;
    }
    return _templateConfigCache[templateType] || null;
}
```

**Step 2: Replace the body of `sendWhatsAppTemplate()`**

Find the function starting at line 49. Replace the block that reads `TWILIO_TEMPLATE_CONFIG.USE_TEMPLATES` with RTDB-based logic:

```javascript
async function sendWhatsAppTemplate(to, templateType, contentVariables, options = {}) {
    try {
        if (!to) {
            throw new Error('Phone number is required');
        }

        const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

        // Load config from RTDB cache
        const config = await getTemplateConfig(templateType);

        if (!config || !config.enabled) {
            console.log(`📋 FALLBACK: ${templateType} ${config ? 'disabled' : 'not configured in RTDB'}`);
            const fallbackMessage = buildFallbackMessage(templateType, Object.values(contentVariables));
            return await client.messages.create({
                body: fallbackMessage,
                from: `whatsapp:${twilioPhone}`,
                to: whatsappTo
            });
        }

        if (!config.contentSid || config.contentSid.includes('HXxxxxxxx') || config.contentSid.trim() === '') {
            console.log(`📋 FALLBACK: ${templateType} contentSid not set`);
            const fallbackMessage = buildFallbackMessage(templateType, Object.values(contentVariables));
            return await client.messages.create({
                body: fallbackMessage,
                from: `whatsapp:${twilioPhone}`,
                to: whatsappTo
            });
        }

        try {
            console.log(`📋 Sending Twilio template ${templateType} (${config.contentSid}) to ${to}`);
            const message = await client.messages.create({
                contentSid: config.contentSid,
                contentVariables: JSON.stringify(contentVariables),
                from: `whatsapp:${twilioPhone}`,
                to: whatsappTo
            });
            console.log(`✅ Template sent: ${templateType} sid=${message.sid}`);
            return message;
        } catch (templateError) {
            console.error(`❌ FALLBACK USED: ${templateType} — Twilio error code=${templateError.code} msg="${templateError.message}"`);
            const fallbackMessage = buildFallbackMessage(templateType, Object.values(contentVariables));
            return await client.messages.create({
                body: fallbackMessage,
                from: `whatsapp:${twilioPhone}`,
                to: whatsappTo
            });
        }

    } catch (error) {
        console.error('Error sending WhatsApp template:', error);
        if (options.fallbackMessage) {
            return await sendWhatsAppMessage(to, options.fallbackMessage);
        }
        throw error;
    }
}
```

**Step 3: Verify the file loads without errors**

```bash
cd functions && node -e "require('./utils/whatsappClient'); console.log('OK')"
```

Expected: `OK`

**Step 4: Commit**

```bash
git add functions/utils/whatsappClient.js
git commit -m "feat: read WhatsApp template config from RTDB cache instead of env vars"
```

---

## Task 4: Clean up whatsappTemplates.js

**Files:**
- Modify: `functions/utils/whatsappTemplates.js`

Remove the `TWILIO_TEMPLATE_CONFIG` object (lines 28–43) and all `contentSid` fields from `TWILIO_TEMPLATES` entries since ContentSids now live in RTDB. The `TWILIO_TEMPLATES` object still provides variable names and fallback bodies.

**Step 1: Remove `TWILIO_TEMPLATE_CONFIG`**

Delete the entire block from line 28 to 43:

```javascript
// DELETE THIS BLOCK:
const TWILIO_TEMPLATE_CONFIG = {
    CONTENT_SIDS: { ... },
    MESSAGING_SERVICE_SID: ...,
    USE_TEMPLATES: ...
};
```

**Step 2: Remove `contentSid` from each template entry**

In each entry in `TWILIO_TEMPLATES`, remove the `contentSid:` line. For example, `booking_confirmation` becomes:

```javascript
[TEMPLATE_TYPES.BOOKING_CONFIRMATION]: {
    name: 'booking_confirmation',
    category: TEMPLATE_CATEGORIES.UTILITY,
    language: 'en',
    body: '🎉 *Booking Confirmed!* ...',
    variables: ['guestName', 'bookingId', ...]
},
```

**Step 3: Update the `module.exports`**

Remove `TWILIO_TEMPLATE_CONFIG` from the exports list at the bottom of the file.

**Step 4: Verify**

```bash
cd functions && node -e "const t = require('./utils/whatsappTemplates'); console.log(Object.keys(t))"
```

Expected output should NOT include `TWILIO_TEMPLATE_CONFIG`.

**Step 5: Commit**

```bash
git add functions/utils/whatsappTemplates.js
git commit -m "refactor: remove env-var template config, ContentSids now in RTDB"
```

---

## Task 5: Delete templateManager.js

**Files:**
- Delete: `functions/utils/templateManager.js`

**Step 1: Confirm it has no callers**

```bash
cd functions && grep -r "templateManager" --include="*.js" --exclude-dir=node_modules .
```

Expected: No output (no callers).

**Step 2: Delete the file**

```bash
rm functions/utils/templateManager.js
```

**Step 3: Commit**

```bash
git commit -m "chore: remove dead templateManager.js (Meta Graph API, never used in Twilio path)"
```

---

## Task 6: Add getWhatsAppTemplateConfig and updateWhatsAppTemplateConfig Cloud Functions

**Files:**
- Modify: `functions/whatsappManagement.js` (add two new functions at the bottom)
- Modify: `functions/index.js` (register them)

**Step 1: Add `getWhatsAppTemplateConfigFunction` to whatsappManagement.js**

Append to the bottom of `functions/whatsappManagement.js` (before `module.exports`):

```javascript
/**
 * Cloud Function: Get WhatsApp Template Config
 * Admin-only. Returns all template config rows.
 */
async function getWhatsAppTemplateConfigFunction(req, res) {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const isAdmin = await validateAdminAccess(userId);
        if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

        const configRef = ref(rtdb, 'whatsapp-template-config');
        const snapshot = await get(configRef);

        res.json({
            success: true,
            config: snapshot.exists() ? snapshot.val() : {}
        });
    } catch (error) {
        console.error('❌ Error in getWhatsAppTemplateConfigFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Cloud Function: Update WhatsApp Template Config
 * Admin-only. Saves contentSid + enabled for one template key.
 */
async function updateWhatsAppTemplateConfigFunction(req, res) {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const isAdmin = await validateAdminAccess(userId);
        if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

        const { templateKey, contentSid, enabled } = req.body;

        if (!templateKey) {
            return res.status(400).json({ error: 'templateKey is required' });
        }

        // Validate ContentSid format if provided
        if (contentSid && contentSid.trim() !== '') {
            const sid = contentSid.trim();
            if (!sid.startsWith('HX') || sid.length !== 34) {
                return res.status(400).json({
                    error: 'Invalid ContentSid format. Must start with HX and be 34 characters.'
                });
            }
        }

        const configRef = ref(rtdb, `whatsapp-template-config/${templateKey}`);
        await update(configRef, {
            contentSid: contentSid ? contentSid.trim() : '',
            enabled: enabled === true
        });

        res.json({ success: true, message: 'Template config updated' });
    } catch (error) {
        console.error('❌ Error in updateWhatsAppTemplateConfigFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
```

**Step 2: Add both to module.exports in whatsappManagement.js**

```javascript
module.exports = {
    // ... existing exports ...
    getWhatsAppTemplateConfigFunction,
    updateWhatsAppTemplateConfigFunction
};
```

**Step 3: Register in index.js**

After the `exports.removeWhatsAppNumber` block (around line 2174), add:

```javascript
exports.getWhatsAppTemplateConfig = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ error: 'Authentication required' });
            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
            await getWhatsAppTemplateConfigFunction(req, res);
        } catch (error) {
            console.error('Error in getWhatsAppTemplateConfig:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

exports.updateWhatsAppTemplateConfig = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ error: 'Authentication required' });
            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
            await updateWhatsAppTemplateConfigFunction(req, res);
        } catch (error) {
            console.error('Error in updateWhatsAppTemplateConfig:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});
```

**Step 4: Add to the import in index.js**

Find the destructure import from `./whatsappManagement` (around line 65) and add the two new functions:

```javascript
const {
    // ... existing imports ...
    getWhatsAppTemplateConfigFunction,
    updateWhatsAppTemplateConfigFunction
} = require('./whatsappManagement');
```

**Step 5: Verify**

```bash
cd functions && node -e "require('./whatsappManagement'); console.log('OK')"
```

Expected: `OK`

**Step 6: Commit**

```bash
git add functions/whatsappManagement.js functions/index.js
git commit -m "feat: add getWhatsAppTemplateConfig and updateWhatsAppTemplateConfig Cloud Functions"
```

---

## Task 7: Add sendWhatsAppTestMessage Cloud Function

**Files:**
- Modify: `functions/whatsappManagement.js`
- Modify: `functions/index.js`

**Step 1: Add sample test variables for each template**

These are used by the test-send to populate template variables with plausible values. Append to `whatsappManagement.js` before `module.exports`:

```javascript
const TEST_VARIABLE_SAMPLES = {
    booking_confirmation: { "1":"Test Guest","2":"BK-TEST001","3":"2026-02-25","4":"19:00","5":"Test Restaurant","6":"Main","7":"2","8":"None","9":"confirmed" },
    booking_status_update: { "1":"✅","2":"Test Guest","3":"Your booking has been confirmed.","4":"BK-TEST001","5":"2026-02-25","6":"19:00","7":"Test Restaurant","8":"Main","9":"2","10":"None" },
    booking_reminder: { "1":"Test Guest","2":"2026-02-25","3":"19:00","4":"Test Restaurant","5":"2" },
    receipt_confirmation: { "1":"Test Guest","2":"• 50 points earned","3":"150" },
    welcome_message: { "1":"Test Guest" },
    queue_manual_addition: { "1":"Test Guest","2":"Test Restaurant","3":"3","4":"2","5":"15","6":"None" },
    admin_new_booking_notification: { "1":"Admin","2":"Test Guest","3":"BK-TEST001","4":"2026-02-25","5":"19:00","6":"Test Restaurant","7":"Main","8":"2","9":"+27000000000","10":"None" }
};

/**
 * Cloud Function: Send WhatsApp Test Message
 * Admin-only. Fires a real template send with sample variables.
 */
async function sendWhatsAppTestMessageFunction(req, res) {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const isAdmin = await validateAdminAccess(userId);
        if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

        const { templateKey, toPhone } = req.body;

        if (!templateKey || !toPhone) {
            return res.status(400).json({ error: 'templateKey and toPhone are required' });
        }

        // Load current config from RTDB
        const configRef = ref(rtdb, `whatsapp-template-config/${templateKey}`);
        const snapshot = await get(configRef);

        if (!snapshot.exists() || !snapshot.val().contentSid) {
            return res.status(400).json({ error: 'Template has no ContentSid configured' });
        }

        const config = snapshot.val();
        const contentVariables = TEST_VARIABLE_SAMPLES[templateKey] || { "1": "Test" };
        const { client, twilioPhone } = require('./twilioClient');

        const whatsappTo = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;

        try {
            const message = await client.messages.create({
                contentSid: config.contentSid,
                contentVariables: JSON.stringify(contentVariables),
                from: `whatsapp:${twilioPhone}`,
                to: whatsappTo
            });

            res.json({
                success: true,
                messageSid: message.sid,
                status: message.status
            });
        } catch (twilioError) {
            // Return full Twilio error — do NOT swallow
            res.status(200).json({
                success: false,
                twilioError: {
                    code: twilioError.code,
                    message: twilioError.message,
                    moreInfo: twilioError.moreInfo || null,
                    status: twilioError.status || null
                }
            });
        }

    } catch (error) {
        console.error('❌ Error in sendWhatsAppTestMessageFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
```

**Step 2: Add to module.exports**

```javascript
module.exports = {
    // ... existing + Task 6 exports ...
    sendWhatsAppTestMessageFunction
};
```

**Step 3: Register in index.js** (after the `updateWhatsAppTemplateConfig` export):

```javascript
exports.sendWhatsAppTestMessage = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ error: 'Authentication required' });
            const token = authHeader.replace('Bearer ', '');
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
            await sendWhatsAppTestMessageFunction(req, res);
        } catch (error) {
            console.error('Error in sendWhatsAppTestMessage:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});
```

**Step 4: Add to the import in index.js**

```javascript
const {
    // ... existing imports ...
    sendWhatsAppTestMessageFunction
} = require('./whatsappManagement');
```

**Step 5: Verify**

```bash
cd functions && node -e "require('./whatsappManagement'); console.log('OK')"
```

**Step 6: Commit**

```bash
git add functions/whatsappManagement.js functions/index.js
git commit -m "feat: add sendWhatsAppTestMessage Cloud Function with full Twilio error passthrough"
```

---

## Task 8: Tighten removeWhatsAppNumberFunction to admin-only

**Files:**
- Modify: `functions/whatsappManagement.js`

**Step 1: Find the authorization check in `removeWhatsAppNumberFunction`**

Around line 517–521 in `whatsappManagement.js`:

```javascript
// CURRENT (allows owner to delete):
if (!isAdmin && whatsappNumberData.userId !== userId) {
    return res.status(403).json({ error: 'Access denied to this WhatsApp number' });
}
```

**Step 2: Replace with admin-only check**

```javascript
// NEW (admin-only):
if (!isAdmin) {
    return res.status(403).json({ error: 'Only administrators can delete WhatsApp numbers' });
}
```

**Step 3: Verify**

```bash
cd functions && node -e "require('./whatsappManagement'); console.log('OK')"
```

**Step 4: Commit**

```bash
git add functions/whatsappManagement.js
git commit -m "security: restrict WhatsApp number deletion to admin users only"
```

---

## Task 9: Clean up .env and run seed

**Files:**
- Modify: `functions/.env`
- Modify: `functions/.env.template`

**Step 1: Remove template-related env vars from `functions/.env`**

Delete or comment out these lines:
- `USE_TWILIO_TEMPLATES=true`
- `TWILIO_CONTENT_SID_BOOKING_CONFIRMATION=...`
- `TWILIO_CONTENT_SID_BOOKING_STATUS=...` (commented or not)
- `TWILIO_CONTENT_SID_BOOKING_REMINDER=...`
- `TWILIO_CONTENT_SID_RECEIPT=...`
- `TWILIO_CONTENT_SID_WELCOME=...`
- `TWILIO_CONTENT_SID_QUEUE_MANUAL_ADDITION=...`
- `TWILIO_CONTENT_SID_ADMIN_NEW_BOOKING=...`
- `TWILIO_MESSAGING_SERVICE_SID=...` (if only used for templates)

Keep: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.

**Step 2: Update `.env.template`** with a comment explaining ContentSids are now in RTDB:

```
# NOTE: WhatsApp template ContentSids are managed in Firebase RTDB
# at whatsapp-template-config/ — use the admin UI to configure them.
# No TWILIO_CONTENT_SID_* env vars needed.
```

**Step 3: Run seed via Firebase Functions emulator or deploy**

If running locally with emulator:
```bash
cd functions && node -e "
  require('dotenv').config();
  const { seedTemplateConfig } = require('./utils/seedTemplateConfig');
  seedTemplateConfig().then(r => console.log(r)).catch(console.error);
"
```

Or add a one-time admin-callable function (see note below) and call it from the Firebase Console.

> **Note:** The seed will be skipped if the node already exists, so it's safe to run multiple times.

**Step 4: Commit**

```bash
git add functions/.env.template
git commit -m "chore: remove TWILIO_CONTENT_SID_* env vars, ContentSids now in RTDB"
```

> `.env` is in `.gitignore` — do not commit it.

---

## Task 10: Rebuild whatsapp-management.html

**Files:**
- Modify: `public/tools/admin/whatsapp-management.html`

**Step 1: Replace Bootstrap CDN with 5.3.0**

Change line 7:
```html
<!-- FROM: -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
<!-- TO: -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
```

Change the JS CDN at the bottom:
```html
<!-- FROM: -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
<!-- TO: -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
```

**Step 2: Replace the main content area with 4-tab structure**

Replace everything inside `<div class="col-md-9 col-lg-10 main-content">` with:

```html
<div class="col-md-9 col-lg-10 main-content">
    <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
        <h1 class="h2">
            <i class="fab fa-whatsapp text-success"></i> WhatsApp Management
        </h1>
        <div class="btn-toolbar mb-2 mb-md-0">
            <button type="button" class="btn btn-success" onclick="showAddNumberModal()">
                <i class="fas fa-plus"></i> Add Number
            </button>
            <button type="button" class="btn btn-outline-secondary ms-2" onclick="refreshData()">
                <i class="fas fa-sync"></i>
            </button>
        </div>
    </div>

    <!-- Loading Indicator -->
    <div id="loadingIndicator" class="text-center py-5">
        <div class="spinner-border text-success" role="status"></div>
        <div class="mt-3">Loading...</div>
    </div>

    <!-- Tier Info Bar -->
    <div id="tierInfo" class="card mb-3" style="display: none;">
        <div class="card-body py-2">
            <div class="row align-items-center">
                <div class="col-auto">
                    <span id="currentTier" class="badge">Loading...</span>
                </div>
                <div class="col-md-3">
                    <small class="text-muted d-block">WhatsApp Numbers</small>
                    <div class="progress usage-progress">
                        <div id="numbersProgress" class="progress-bar bg-success" role="progressbar"></div>
                    </div>
                    <small id="numbersUsage" class="text-muted">0 of 0 used</small>
                </div>
                <div class="col-md-3">
                    <small class="text-muted d-block">Locations</small>
                    <small id="locationsUsage" class="text-muted">0 configured</small>
                </div>
                <div class="col-auto">
                    <small class="text-muted d-block">Analytics</small>
                    <span id="analyticsAccess" class="badge bg-secondary">Checking...</span>
                </div>
            </div>
        </div>
    </div>

    <!-- 4-Tab Nav -->
    <ul class="nav nav-tabs mb-3" id="whatsappTabs">
        <li class="nav-item">
            <a class="nav-link active" href="#" onclick="switchTab('numbers'); return false;">
                <i class="fab fa-whatsapp"></i> Numbers
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link" href="#" onclick="switchTab('mappings'); return false;">
                <i class="fas fa-map-marker-alt"></i> Mappings
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link" href="#" onclick="switchTab('templates'); return false;">
                <i class="fas fa-file-alt"></i> Templates
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link" href="#" onclick="switchTab('analytics'); return false;">
                <i class="fas fa-chart-bar"></i> Analytics
            </a>
        </li>
    </ul>

    <!-- Numbers Tab -->
    <div id="tab-numbers">
        <div id="numbersContainer"></div>
        <!-- Advanced / Migration (collapsed) -->
        <div class="mt-4">
            <button class="btn btn-sm btn-outline-secondary" type="button"
                    data-bs-toggle="collapse" data-bs-target="#advancedSection">
                <i class="fas fa-cog"></i> Advanced
            </button>
            <div class="collapse mt-2" id="advancedSection">
                <div class="card card-body">
                    <p class="text-muted mb-2">Import an existing Twilio WhatsApp number into the multi-location system.</p>
                    <button type="button" class="btn btn-outline-warning btn-sm" onclick="showMigrationModal()">
                        <i class="fas fa-database"></i> Migrate Existing Number
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Mappings Tab -->
    <div id="tab-mappings" style="display: none;">
        <div id="mappingsContainer"></div>
    </div>

    <!-- Templates Tab -->
    <div id="tab-templates" style="display: none;">
        <p class="text-muted mb-3">Manage Twilio ContentSids for each message template. Get ContentSids from
            <a href="https://console.twilio.com/us1/develop/sms/content-template-builder" target="_blank">
                Twilio Console → Content Template Builder
            </a>.
        </p>
        <div id="templatesContainer"></div>
    </div>

    <!-- Analytics Tab -->
    <div id="tab-analytics" style="display: none;">
        <div class="row">
            <div class="col-md-4">
                <div class="analytics-widget">
                    <h5><i class="fas fa-comments"></i> Total Messages</h5>
                    <h2 id="totalMessages">0</h2>
                    <small>All time</small>
                </div>
            </div>
            <div class="col-md-4">
                <div class="analytics-widget">
                    <h5><i class="fas fa-location-arrow"></i> Active Locations</h5>
                    <h2 id="activeLocations">0</h2>
                    <small>With WhatsApp enabled</small>
                </div>
            </div>
        </div>
    </div>

    <!-- Upgrade Prompt -->
    <div id="upgradePrompt" style="display: none;">
        <!-- keep existing upgrade prompt HTML unchanged -->
    </div>
</div>
```

**Step 3: Update sidebar** to match `admin-dashboard.html` sidebar links (copy the full `<ul class="nav flex-column">` from `public/admin-dashboard.html`, keeping the WhatsApp item as active).

**Step 4: Verify page loads in browser** — open the file via Firebase local emulator or a local server. Check that 4 tabs are visible and clicking them doesn't throw JS errors (JS not yet updated — tabs won't function yet).

**Step 5: Commit**

```bash
git add public/tools/admin/whatsapp-management.html
git commit -m "feat: rebuild whatsapp-management.html with 4-tab layout and Bootstrap 5.3.0"
```

---

## Task 11: Rebuild whatsapp-management.js — core + tab system + admin detection

**Files:**
- Modify: `public/tools/admin/whatsapp-management.js`

**Step 1: Add `currentUserIsAdmin` variable and `checkAdminStatus()`**

After the existing global variables (around line 18), add:

```javascript
let currentUserIsAdmin = false;

async function checkAdminStatus() {
    try {
        const adminClaimsRef = ref(rtdb, `admin-claims/${currentUser.uid}`);
        const snapshot = await get(adminClaimsRef);
        currentUserIsAdmin = snapshot.exists();
    } catch (e) {
        currentUserIsAdmin = false;
    }
}
```

**Step 2: Add `switchTab()` function**

```javascript
function switchTab(tabName) {
    const tabs = ['numbers', 'mappings', 'templates', 'analytics'];
    tabs.forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (el) el.style.display = t === tabName ? 'block' : 'none';
    });
    document.querySelectorAll('#whatsappTabs .nav-link').forEach((link, i) => {
        link.classList.toggle('active', tabs[i] === tabName);
    });
    if (tabName === 'templates') loadTemplateTab();
}
window.switchTab = switchTab;
```

**Step 3: Call `checkAdminStatus()` in `init()`**

In `loadInitialData()`, add a call to `checkAdminStatus()` before `renderWhatsAppNumbers()`:

```javascript
await checkAdminStatus();
```

**Step 4: Fix the tier info bug in `updateTierInformation()`**

Find line 244: `const tierName = getTierDisplayName(usage.tierLimits);`

The `usage` object passed in has `numbersUsed`, `numbersLimit`, `locationsWithWhatsApp` — not `tierLimits`. Fix:

```javascript
// BEFORE (broken):
const tierName = getTierDisplayName(usage.tierLimits);
currentTier.className = `badge tier-badge ${getTierBadgeClass(tierName)}`;

// AFTER:
const tierName = getTierDisplayName(userTierLimits);
currentTier.className = `badge tier-badge ${getTierBadgeClass(tierName)}`;
```

**Step 5: Add endpoints for new functions**

In the `ENDPOINTS` object (around line 22), add:

```javascript
getTemplateConfig: `${API_BASE_URL}/getWhatsAppTemplateConfig`,
updateTemplateConfig: `${API_BASE_URL}/updateWhatsAppTemplateConfig`,
testTemplateSend: `${API_BASE_URL}/sendWhatsAppTestMessage`,
```

**Step 6: Commit**

```bash
git add public/tools/admin/whatsapp-management.js
git commit -m "feat: add tab system, admin detection, and tier display bug fix to whatsapp-management.js"
```

---

## Task 12: Build the Templates tab

**Files:**
- Modify: `public/tools/admin/whatsapp-management.js`

**Step 1: Add `loadTemplateTab()`**

```javascript
let _templateConfig = {};

async function loadTemplateTab() {
    const container = document.getElementById('templatesContainer');
    container.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-success"></div> Loading templates...</div>';

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(ENDPOINTS.getTemplateConfig, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        _templateConfig = data.config || {};
        renderTemplateCards();
    } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">Failed to load template config: ${escapeHtml(err.message)}</div>`;
    }
}

function renderTemplateCards() {
    const container = document.getElementById('templatesContainer');
    const entries = Object.entries(_templateConfig);

    if (entries.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">No template config found in RTDB. Run the seed function first.</div>';
        return;
    }

    container.innerHTML = entries.map(([key, cfg]) => {
        const status = cfg.enabled && cfg.contentSid && !cfg.contentSid.includes('HXxxxxxxx')
            ? '<span class="badge bg-success">Configured</span>'
            : cfg.enabled === false
                ? '<span class="badge bg-secondary">Disabled</span>'
                : '<span class="badge bg-warning text-dark">Fallback</span>';

        const maskedSid = cfg.contentSid
            ? cfg.contentSid.substring(0, 8) + '...' + cfg.contentSid.slice(-4)
            : '';

        return `
        <div class="card mb-3" id="template-card-${key}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <h6 class="mb-0">${escapeHtml(cfg.label || key)}</h6>
                        <small class="text-muted">${cfg.variableCount || 0} variables · Utility</small>
                    </div>
                    <div>${status}</div>
                </div>
                <div class="row g-2 align-items-center">
                    <div class="col">
                        <input type="text" class="form-control form-control-sm font-monospace"
                               id="sid-input-${key}"
                               value="${escapeHtml(cfg.contentSid || '')}"
                               placeholder="HX________________________________"
                               maxlength="34">
                    </div>
                    <div class="col-auto">
                        <div class="form-check form-switch mb-0">
                            <input class="form-check-input" type="checkbox" id="enabled-${key}"
                                   ${cfg.enabled ? 'checked' : ''}>
                            <label class="form-check-label" for="enabled-${key}">Enabled</label>
                        </div>
                    </div>
                    <div class="col-auto">
                        <button class="btn btn-sm btn-outline-secondary" onclick="testTemplateSend('${key}')">
                            <i class="fas fa-paper-plane"></i> Test
                        </button>
                        <button class="btn btn-sm btn-success" onclick="saveTemplateConfig('${key}')">
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}
window.loadTemplateTab = loadTemplateTab;
window.renderTemplateCards = renderTemplateCards;
```

**Step 2: Add `saveTemplateConfig()`**

```javascript
async function saveTemplateConfig(templateKey) {
    const sidInput = document.getElementById(`sid-input-${templateKey}`);
    const enabledInput = document.getElementById(`enabled-${templateKey}`);
    const contentSid = sidInput.value.trim();
    const enabled = enabledInput.checked;

    if (contentSid && (!contentSid.startsWith('HX') || contentSid.length !== 34)) {
        Swal.fire({ icon: 'error', title: 'Invalid ContentSid', text: 'Must start with HX and be exactly 34 characters.' });
        return;
    }

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(ENDPOINTS.updateTemplateConfig, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateKey, contentSid, enabled })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        // Update local cache and re-render
        _templateConfig[templateKey] = { ..._templateConfig[templateKey], contentSid, enabled };
        renderTemplateCards();
        Swal.fire({ icon: 'success', title: 'Saved', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Save failed', text: err.message });
    }
}
window.saveTemplateConfig = saveTemplateConfig;
```

**Step 3: Add `testTemplateSend()`**

```javascript
async function testTemplateSend(templateKey) {
    const { value: phone } = await Swal.fire({
        title: 'Test Send',
        input: 'tel',
        inputLabel: 'Send test to phone number (E.164 format)',
        inputPlaceholder: '+27123456789',
        showCancelButton: true
    });
    if (!phone) return;

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(ENDPOINTS.testTemplateSend, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateKey, toPhone: phone })
        });
        const data = await response.json();

        if (data.success) {
            Swal.fire({ icon: 'success', title: 'Sent!', text: `Message SID: ${data.messageSid}` });
        } else if (data.twilioError) {
            Swal.fire({
                icon: 'error',
                title: `Twilio Error ${data.twilioError.code}`,
                text: data.twilioError.message,
                footer: data.twilioError.moreInfo ? `<a href="${data.twilioError.moreInfo}" target="_blank">More info</a>` : ''
            });
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Test failed', text: err.message });
    }
}
window.testTemplateSend = testTemplateSend;
```

**Step 4: Add `escapeHtml()` if not already present**

```javascript
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
```

**Step 5: Commit**

```bash
git add public/tools/admin/whatsapp-management.js
git commit -m "feat: add Templates tab with ContentSid management and test-send to WhatsApp admin UI"
```

---

## Task 13: Fix Numbers tab — admin delete gate + editWhatsAppNumber

**Files:**
- Modify: `public/tools/admin/whatsapp-management.js`

**Step 1: Add delete button conditional in `renderWhatsAppNumbers()`**

Find the dropdown `<ul>` inside `renderWhatsAppNumbers()` (around line 316). Change:

```javascript
// BEFORE:
<li><hr class="dropdown-divider"></li>
<li>
    <a class="dropdown-item text-danger" href="#" onclick="removeWhatsAppNumber('${number.id}')">
        <i class="fas fa-trash"></i> Remove
    </a>
</li>

// AFTER (conditional):
${currentUserIsAdmin ? `
    <li><hr class="dropdown-divider"></li>
    <li>
        <a class="dropdown-item text-danger" href="#" onclick="removeWhatsAppNumber('${number.id}')">
            <i class="fas fa-trash"></i> Remove
        </a>
    </li>` : ''}
```

**Step 2: Add `editWhatsAppNumber()`**

This function was called in the dropdown but never defined. Add a simple display-name edit:

```javascript
async function editWhatsAppNumber(whatsappNumberId) {
    const number = whatsappNumbers.find(n => n.id === whatsappNumberId);
    if (!number) return;

    const { value: newName } = await Swal.fire({
        title: 'Edit Display Name',
        input: 'text',
        inputValue: number.displayName,
        showCancelButton: true,
        inputValidator: v => !v && 'Display name cannot be empty'
    });
    if (!newName) return;

    try {
        const numberRef = ref(rtdb, `whatsapp-numbers/${whatsappNumberId}`);
        await update(numberRef, { displayName: newName });
        number.displayName = newName;
        renderWhatsAppNumbers();
        Swal.fire({ icon: 'success', title: 'Updated', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Update failed', text: err.message });
    }
}
window.editWhatsAppNumber = editWhatsAppNumber;
```

**Step 3: Verify**

Load the page. Open browser console. Confirm no `editWhatsAppNumber is not defined` errors. Confirm delete button is absent for non-admin accounts.

**Step 4: Commit**

```bash
git add public/tools/admin/whatsapp-management.js
git commit -m "fix: hide delete button for non-admins, implement editWhatsAppNumber"
```

---

## Task 14: Deploy and smoke test

**Step 1: Deploy Cloud Functions**

```bash
firebase deploy --only functions --project merakicaptiveportal-firebasedb
```

Expected: All new functions appear in the deployment output (`getWhatsAppTemplateConfig`, `updateWhatsAppTemplateConfig`, `sendWhatsAppTestMessage`).

**Step 2: Seed the RTDB config**

Call the seed directly (via a temporary script or Firebase Console):

```bash
cd functions && node -e "
  require('dotenv').config();
  const admin = require('./config/firebase-admin');
  const { seedTemplateConfig } = require('./utils/seedTemplateConfig');
  seedTemplateConfig().then(console.log).catch(console.error).finally(() => process.exit());
"
```

Expected: `{ seeded: true, config: { booking_confirmation: {...}, ... } }`

**Step 3: Deploy hosting**

```bash
firebase deploy --only hosting --project merakicaptiveportal-firebasedb
```

**Step 4: Test the Templates tab**

1. Open the WhatsApp Management page in the browser
2. Click the **Templates** tab
3. Confirm all 7 template cards render with correct status badges:
   - `booking_confirmation` → `Configured` (has real HX SID)
   - `admin_new_booking_notification` → `Configured`
   - All others → `Fallback`
4. Click **Test** on `booking_confirmation`, enter your phone number
5. Expected: Swal shows message SID, or a detailed Twilio error code (not a generic failure)

**Step 5: Test fallback logging**

1. In the Templates tab, set `booking_confirmation` to `enabled: false` and Save
2. Trigger a booking confirmation from the booking system
3. Check Firebase Function logs:
   ```bash
   firebase functions:log --only receiveWhatsAppMessageEnhanced
   ```
   Expected: `📋 FALLBACK: booking_confirmation disabled`
4. Re-enable the template

**Step 6: Verify admin-only delete**

1. Log in as a non-admin user
2. Open WhatsApp Management → Numbers tab
3. Confirm no "Remove" option in the Actions dropdown

**Step 7: Final commit**

```bash
git add .
git commit -m "feat: complete WhatsApp template management system - RTDB config, admin UI, template tab"
```

---

## Summary of all changed files

| File | Change |
|---|---|
| `database.rules.json` | Added `whatsapp-template-config` read/write rules |
| `functions/utils/seedTemplateConfig.js` | **New** — one-time RTDB seed |
| `functions/utils/whatsappClient.js` | Read template config from RTDB cache |
| `functions/utils/whatsappTemplates.js` | Removed `TWILIO_TEMPLATE_CONFIG` env-var block |
| `functions/utils/templateManager.js` | **Deleted** |
| `functions/whatsappManagement.js` | Added 3 new functions, tightened delete to admin-only |
| `functions/index.js` | Registered 3 new Cloud Functions |
| `functions/.env` | Removed `TWILIO_CONTENT_SID_*` and `USE_TWILIO_TEMPLATES` |
| `functions/.env.template` | Updated with RTDB note |
| `public/tools/admin/whatsapp-management.html` | 4-tab layout, Bootstrap 5.3.0, sidebar fix |
| `public/tools/admin/whatsapp-management.js` | Tab system, Templates tab, admin detection, bug fixes |
