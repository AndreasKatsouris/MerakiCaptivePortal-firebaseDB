# Coding Standards

> Patterns, conventions, and standards used in the Sparks Hospitality codebase.

---

## Table of Contents

1. [Code Style Configuration](#code-style-configuration)
2. [JavaScript Conventions](#javascript-conventions)
3. [Firebase Patterns](#firebase-patterns)
4. [UI Patterns](#ui-patterns)
5. [Error Handling](#error-handling)
6. [Security Patterns](#security-patterns)
7. [Module Organization](#module-organization)
8. [Naming Conventions](#naming-conventions)

---

## Code Style Configuration

### ESLint

The project uses ESLint 9 with flat config (`eslint.config.js`):

| Rule | Setting | Purpose |
|------|---------|---------|
| `indent` | 2 spaces | Consistent indentation |
| `quotes` | Single quotes | `'string'` not `"string"` |
| `semi` | Always | Semicolons required |
| `comma-dangle` | Never | No trailing commas |
| `no-var` | Error | Use `const`/`let` only |
| `prefer-const` | Error | Use `const` when not reassigned |
| `eqeqeq` | Always | Strict equality only (`===`) |
| `camelcase` | Warn | camelCase naming |
| `max-lines` | 500 (warn) | File size limit |
| `max-lines-per-function` | 100 (warn) | Function size limit |
| `complexity` | 15 (warn) | Cyclomatic complexity limit |

Run linting:
```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
```

### Prettier

Prettier is configured for auto-formatting:

```bash
npm run format        # Format all files
npm run format:check  # Check formatting without changes
```

Targets: `**/*.{js,vue,css,md,json}`

### Pre-commit Hooks

Husky + lint-staged runs linting and formatting on staged files before each commit. This means edits to JS files trigger automatic formatting.

---

## JavaScript Conventions

### Module System

The codebase uses two module systems:

| Context | Module System | Extension |
|---------|---------------|-----------|
| Frontend (browser) | ES Modules (`import`/`export`) | `.js` |
| Backend (Cloud Functions) | CommonJS (`require`/`module.exports`) | `.js` |
| Tests | CommonJS | `.cjs` |

The root `package.json` has `"type": "module"`, making `.js` files ES modules by default. Test files use `.cjs` extension to force CommonJS mode.

### Frontend Module Pattern

Feature modules follow this pattern (`public/js/modules/sales-forecasting/index.js`):

```javascript
// Named imports from Firebase config
import { rtdb, ref, get, set, update, push, query, ... } from '../../config/firebase-config.js';

// Named imports from peer modules
import { ForecastEngine } from './forecast-engine.js';
import { SalesDataService } from './sales-data-service.js';

// Class-based module with init/destroy lifecycle
export class SalesForecastingModule {
    constructor() { /* state initialization */ }
    async init() { /* DOM binding, data loading */ }
    destroy() { /* cleanup listeners */ }
}
```

### Backend Function Pattern

Cloud Functions use the following patterns:

```javascript
// Firebase Functions v2 (preferred for new functions)
const { onRequest } = require('firebase-functions/v2/https');

exports.myFunction = onRequest(async (req, res) => {
    // CORS handling
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
        // Business logic
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Firebase Functions v1 (legacy, still used for onCall and triggers)
const functions = require('firebase-functions');

exports.myCallable = functions.https.onCall(async (data, context) => {
    // Auth checking
    if (!context.auth) { throw new functions.https.HttpsError('unauthenticated', '...'); }
    // Business logic
    return { success: true };
});
```

### Immutability

Prefer creating new objects over mutation:

```javascript
// Preferred: Spread to create new object
const updated = { ...existing, name: newName, updatedAt: Date.now() };

// Avoid: Direct mutation
existing.name = newName; // Do not do this
```

This pattern is used throughout the codebase, particularly in:
- `guardRail.js` (creates `cleanCampaign` copy before validation)
- `subscription-validation.js` (creates `cleaned` copy before processing)
- `phone-number-protection.js` (returns `{ ...updateData, ...preservedFields }`)

---

## Firebase Patterns

### Realtime Database (RTDB)

#### Reading Data

```javascript
// Client-side (ES module)
import { rtdb, ref, get } from '../config/firebase-config.js';

const snapshot = await get(ref(rtdb, `guests/${phoneNumber}`));
if (snapshot.exists()) {
    const data = snapshot.val();
}

// Server-side (Admin SDK)
const admin = require('firebase-admin');
const db = admin.database();
const snapshot = await db.ref(`guests/${phoneNumber}`).once('value');
```

#### Writing Data

```javascript
// Set (overwrite entire node)
await set(ref(rtdb, `guests/${phone}`), guestData);

// Update (merge fields)
await update(ref(rtdb, `guests/${phone}`), { name: 'New Name', updatedAt: Date.now() });

// Push (generate unique key)
const newRef = push(ref(rtdb, 'receipts'));
await set(newRef, receiptData);
```

#### Atomic Multi-Path Updates

Used for operations that must update multiple nodes atomically:

```javascript
// Delete a location and all its references
const updates = {
    [`locations/${locationId}`]: null,
    [`userLocations/${userId}/${locationId}`]: null,
    [`salesDataIndex/byLocation/${locationId}`]: null
};
await update(ref(rtdb), updates);
```

This pattern is documented in memory as the canonical way to do cascade deletes.

#### Index Nodes

The project uses index nodes for efficient lookups:

```
salesDataIndex/
  byLocation/{locationId}/{dataId}: true
  byUser/{uid}/{dataId}: true

forecastIndex/
  byLocation/{locationId}/{forecastId}: true
  byUser/{uid}/{forecastId}: true
```

These allow querying data by location or user without scanning the entire `salesData` or `forecasts` collection.

### Real-time Listeners

```javascript
// Subscribe to changes
const unsubscribe = onValue(ref(rtdb, `queue/${locationId}`), (snapshot) => {
    const data = snapshot.val();
    // Update UI
});

// Cleanup (important to prevent memory leaks)
off(ref(rtdb, `queue/${locationId}`));
```

### Firebase Auth Patterns

Client-side auth state management:

```javascript
import { auth, onAuthStateChanged } from '../config/firebase-config.js';

onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        // user.uid, user.email, user.getIdTokenResult() for claims
    } else {
        // User is signed out, redirect to login
        window.location.href = '/index.html';
    }
});
```

---

## UI Patterns

### SweetAlert2 for Notifications

All user-facing notifications use SweetAlert2 (globally available as `Swal`):

```javascript
// Toast notification (via toast.js utility)
import { showToast } from '../utils/toast.js';
showToast('Guest saved successfully', 'success');
showToast('Failed to save', 'error');
showToast('Processing...', 'info');

// Confirmation dialog
const result = await Swal.fire({
    title: 'Delete Guest?',
    text: 'This action cannot be undone.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    confirmButtonText: 'Yes, delete'
});
if (result.isConfirmed) { /* proceed */ }

// Input dialog
const { value: name } = await Swal.fire({
    title: 'Enter Guest Name',
    input: 'text',
    inputPlaceholder: 'Full name'
});
```

**Never use native `alert()`, `confirm()`, or `prompt()`.** Always use SweetAlert2.

### Tab Switching

Multi-tab pages use the `switchTab()` pattern with `display: none/block`:

```javascript
function switchTab(tabName) {
    // Hide all tab content
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    // Show selected tab
    document.getElementById(`${tabName}-tab`).style.display = 'block';

    // Update tab button active state
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}
```

This avoids full DOM re-renders and is used across dashboard, queue management, and other multi-section pages.

### XSS Prevention

Always sanitize user input before inserting into the DOM:

```javascript
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Usage in innerHTML
container.innerHTML = `<span>${escapeHtml(userName)}</span>`;
```

**Never insert unsanitized user data into `innerHTML`.** Use `textContent` when possible, or `escapeHtml()` when HTML structure is needed.

### Bootstrap 5 Framework

The UI is built with Bootstrap 5.3.0:
- Grid system for responsive layouts
- Cards for content containers
- Modals for dialogs (supplemented by SweetAlert2)
- Tables for data display
- Badges for status indicators
- Toast container for notifications

### Chart.js

Charts use Chart.js with `CategoryScale` (not `TimeScale`) to avoid ESM dual-package hazard:

```javascript
import { Chart, CategoryScale, LinearScale, ... } from 'chart.js';
Chart.register(CategoryScale, LinearScale, ...);

// X-axis uses string labels, not Date objects
const labels = data.map(d => formatDate(d.date)); // Returns "DD/MM/YYYY" strings
```

---

## Error Handling

### Global Error Handler

`public/js/utils/error-handler.js` provides a singleton `ErrorHandler` class that:

1. Catches uncaught exceptions via `window.addEventListener('error', ...)`
2. Catches unhandled promise rejections via `window.addEventListener('unhandledrejection', ...)`
3. Monitors online/offline status
4. Classifies errors: network, Firebase, validation, timeout, API, generic
5. Shows user-friendly messages via SweetAlert2 or Bootstrap toasts
6. Provides `fetchWithErrorHandling(url, options, timeout)` with automatic timeout and retry

Usage:

```javascript
import { errorHandler } from '../utils/error-handler.js';

// Wrap async operations
await errorHandler.wrapAsync(async () => {
    const data = await fetchData();
    processData(data);
}, 'Loading guest data');

// Use enhanced fetch
const response = await errorHandler.fetchWithErrorHandling(
    '/api/endpoint',
    { method: 'POST', body: JSON.stringify(data) },
    30000  // 30s timeout
);
```

### Backend Error Pattern

```javascript
try {
    // Operation
    res.status(200).json({ success: true, data: result });
} catch (error) {
    console.error('Context:', error);
    res.status(500).json({ success: false, error: error.message });
}
```

Cloud Functions log errors to Google Cloud Logging via `console.error()`. The `guardRail.js` file shows extensive structured logging:

```javascript
console.log('Starting validation for campaign:', {
    campaignName: cleanCampaign.name,
    campaignId: cleanCampaign.id,
    receipt: { date: receiptData.date, store: receiptData.storeName }
});
```

---

## Security Patterns

### Phone Number Protection

`public/js/utils/phone-number-protection.js` prevents accidental deletion of phone numbers during user updates:

```javascript
import { validatePhoneNumberPreservation, preventPhoneNumberDeletion } from '../utils/phone-number-protection.js';

// Validate that phone fields are preserved
const safeUpdate = validatePhoneNumberPreservation(existingData, updateData, userId);

// Throw if phone would be deleted
preventPhoneNumberDeletion(existingData, updateData);
```

### Subscription Validation

`public/js/utils/subscription-validation.js` prevents tier/tierId field conflicts:

```javascript
import { validateSubscriptionData, safeSubscriptionUpdate } from '../utils/subscription-validation.js';

// Validates and cleans subscription data
const result = validateSubscriptionData(subscriptionData, userId);
// result.cleanedData has tierId (not tier), valid status, validation metadata

// Safe update with automatic validation
await safeSubscriptionUpdate(userId, { tierId: 'professional', status: 'active' });
```

### Admin Activity Monitoring

`public/js/utils/admin-activity-monitor.js` tracks admin user changes, phone number modifications, and admin claim changes in real-time.

---

## Module Organization

### Feature Module Structure

Each major feature is organized as an ES module directory:

```
public/js/modules/sales-forecasting/
  index.js               # Module entry point, orchestrator
  forecast-engine.js     # Core prediction algorithms
  sales-data-service.js  # Firebase data access layer
  forecast-analytics.js  # Analytics and metrics
  chart-config.js        # Chart.js configuration
```

### Shared Utilities

Cross-cutting concerns live in `public/js/utils/`:

| File | Purpose |
|------|---------|
| `error-handler.js` | Global error handling and classification |
| `toast.js` | SweetAlert2 toast notifications |
| `subscription-validation.js` | Subscription data integrity |
| `phone-number-protection.js` | Phone number preservation |
| `phone-number-monitoring.js` | Phone number change detection |
| `phone-number-alerts.js` | Phone number alert system |
| `admin-activity-monitor.js` | Admin activity tracking |
| `database-paginator.js` | RTDB query pagination |
| `subscription-tier-fix.js` | Subscription tier repair utility |

### Backend Organization

Cloud Functions are organized by feature area:

| Area | Files |
|------|-------|
| WhatsApp | `receiveWhatsappMessage.js`, `receiveWhatsappMessageEnhanced.js`, `whatsappManagement.js`, `whatsappMigration.js` |
| Queue | `queueManagement.js`, `queueWhatsAppIntegration.js`, `queueAnalytics.js`, `queueCache.js`, `queueService.js` |
| Receipts | `receiptProcessor.js`, `templateBasedExtraction.js`, `receiptTemplateManager.js` |
| Rewards | `guardRail.js` (receipt-to-campaign matching), `rewardsProcessor.js`, `voucherService.js` |
| Subscriptions | `subscriptionStatusManager.js` |
| Data | `dataManagement.js`, `guestSync.js` |
| Admin | `projectManagement.js` |
| Config | `config/firebase-admin.js`, `constants/campaign.constants.js`, `utils/whatsappClient.js` |

---

## Naming Conventions

### Files

| Type | Convention | Example |
|------|-----------|---------|
| Frontend modules | kebab-case | `sales-data-service.js` |
| Backend functions | camelCase | `queueManagement.js` |
| HTML pages | kebab-case | `sales-forecasting.html` |
| CSS files | kebab-case | `sales-forecasting.css` |
| Test files | `test-feature-{number}-{name}.cjs` | `test-feature-41-guest-crud.cjs` |
| Config files | kebab-case | `firebase-config.js` |

### Variables and Functions

| Type | Convention | Example |
|------|-----------|---------|
| Variables | camelCase | `guestPhoneNumber` |
| Functions | camelCase | `validateBasicCriteria()` |
| Classes | PascalCase | `SalesForecastingModule` |
| Constants | SCREAMING_SNAKE_CASE | `REWARD_TYPE_VALIDATION` |
| Firebase paths | kebab-case | `admin-claims`, `guest-receipts` |
| Database node keys | camelCase | `phoneNumber`, `createdAt` |

### South African Conventions

- Date format: DD/MM/YYYY (not US MM/DD/YYYY)
- Phone numbers: +27 prefix (e.g., `+27821234567`)
- Timezone: `Africa/Johannesburg` (UTC+2)
- Currency: ZAR (South African Rand)
- Public holidays: SA calendar with Easter calculation (Anonymous Gregorian algorithm in `forecast-engine.js`)
