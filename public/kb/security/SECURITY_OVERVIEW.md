# Security Overview

> Security posture analysis of the Sparks Hospitality platform: what is done well, what needs improvement, and actionable recommendations.

---

## Table of Contents

1. [Security Architecture](#security-architecture)
2. [Authentication](#authentication)
3. [Authorization and Access Control](#authorization-and-access-control)
4. [Database Security Rules](#database-security-rules)
5. [Storage Security Rules](#storage-security-rules)
6. [Cloud Functions Security](#cloud-functions-security)
7. [Client-Side Security](#client-side-security)
8. [Data Protection](#data-protection)
9. [Strengths](#strengths)
10. [Weaknesses and Risks](#weaknesses-and-risks)
11. [Recommendations](#recommendations)

---

## Security Architecture

### Authentication Layer
- Firebase Authentication with email/password
- Custom claims for admin roles (`auth.token.admin === true`)
- Client-side auth state management via `onAuthStateChanged`

### Authorization Layer
- Firebase RTDB security rules (`database.rules.json`)
- Cloud Storage security rules (`storage.rules`)
- Server-side admin verification in Cloud Functions
- Client-side subscription tier checking

### Data Flow
```
Client (Browser)
  -> Firebase Auth (identity verification)
  -> RTDB Security Rules (authorization check)
  -> Realtime Database (data access)

Client (Browser)
  -> Cloud Functions (API endpoints)
  -> Firebase Admin SDK (bypasses rules, uses service account)
  -> Realtime Database (data access)
```

---

## Authentication

### What Is Done Well

1. **Firebase Auth integration** -- Centralized authentication through Firebase Auth, which handles password hashing, session management, and token refresh automatically.

2. **Emulator-aware configuration** -- The client-side config (`public/js/config/firebase-config.js:29-38`) correctly detects localhost and routes to auth emulator, preventing accidental production auth calls during development.

3. **Custom claims for admin** -- Admin status is stored as a Firebase Auth custom claim (`auth.token.admin`), which cannot be forged by clients. This is the correct approach.

4. **Admin SDK initialization check** -- `functions/index.js:75-80` prevents double-initialization with `if (!admin.apps.length)`.

### What Needs Improvement

1. **No multi-factor authentication (MFA)** -- Admin accounts with elevated privileges should require MFA. Currently, email/password is the only factor.

2. **No password complexity enforcement** -- Firebase Auth does not enforce password policies beyond a 6-character minimum by default. The test file `test-feature-12-login.cjs:33` uses `Test1234!` suggesting there is awareness of complexity, but it is not enforced.

3. **No account lockout policy** -- Firebase Auth has built-in rate limiting (`auth/too-many-requests`) but the project does not implement additional lockout logic.

4. **`setupInitialAdmin` endpoint** -- `functions/index.js:903` exposes a function to set up the initial admin. This should be restricted or removed after initial setup to prevent abuse.

---

## Authorization and Access Control

### What Is Done Well

1. **Owner-based access control** -- Locations (`database.rules.json:37`), subscriptions (`:27-28`), user data (`:21`), and sales data (`:308-309`) all verify ownership via `auth.uid === data.child('ownerId').val()`.

2. **Admin fallback** -- Most rules allow admin access as a fallback: `auth.token.admin === true`.

3. **Phone-based guest access** -- Guest data and receipts use phone number matching (`auth.token.phone_number === $phoneNumber`) to allow guests to access only their own data.

4. **Cross-reference lookups** -- Bookings (`:213-214`) and stock usage (`:203`) rules verify access through cross-referencing `userLocations` to confirm the user has access to the location.

5. **Subscription node self-write** -- Users can write to their own subscription node (`:28`), which is required for the client-side subscription flow.

### What Needs Improvement

1. **`admin-claims` node is world-readable and world-writable** -- `database.rules.json:53-54`:
   ```json
   "admin-claims": {
     ".read": "auth != null",
     ".write": "auth != null"
   }
   ```
   **CRITICAL:** Any authenticated user can add themselves as an admin by writing to this node. The `admin-claims` node is used in campaign and booking rules (`root.child('admin-claims').child(auth.uid).exists()`) to grant elevated access. This means any logged-in user can grant themselves admin-level access to campaigns, bookings, and other resources.

2. **`subscriptions` self-write allows tier escalation** -- `database.rules.json:28`:
   ```json
   ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
   ```
   A user can write to their own subscription node, which means they could change their `tierId` from `free` to `enterprise`. While `subscription-validation.js` validates on the client side, security rules should enforce server-side tier validation.

3. **Several nodes allow any authenticated user to write** -- These nodes have overly permissive write rules:
   - `wifiLogins` (`:189`): `.write: true` (no auth required)
   - `activeUsers` (`:193`): `.write: true` (no auth required)
   - `userPreferences` (`:197`): `.write: true` (no auth required)
   - `receiptPatternLogs` (`:286`): `.write: true` (no auth required)
   - `debug/ocr-logs` (`:301`): `.write: true` (no auth required)
   - `receipts` (`:115`): `.write: "auth != null"` (any authenticated user)
   - `scanningData` (`:90`): `.write: "auth != null"` (any authenticated user)
   - `queue` (`:254-264`): `.write: "auth != null"` (any authenticated user)

4. **Locations collection-level write is permissive** -- `database.rules.json:33`:
   ```json
   ".write": "auth != null"
   ```
   While the child rule (`:37`) properly checks ownership, the collection-level rule allows any authenticated user to write. Firebase evaluates rules at the shallowest matching level, so a write to the `locations` path itself would succeed without ownership checks.

---

## Database Security Rules

See [DATABASE_RULES_GUIDE.md](./DATABASE_RULES_GUIDE.md) for a detailed breakdown of every rule.

### Rule Quality Summary

| Rating | Count | Description |
|--------|-------|-------------|
| Strong | 12 | Proper owner/admin checks with validation |
| Adequate | 8 | Basic auth checks, could be tighter |
| Weak | 5 | Overly permissive or world-writable |
| Critical | 2 | `admin-claims` world-writable, `wifiLogins` etc. no auth |

### Data Validation

Validation rules (`.validate`) are used for:
- Campaigns (`:104`): Must have `name` and `status`
- Rewards (`:62`): Must have `metadata`, `status`, `value`, `expiresAt`
- Bookings (`:215`): Must have 8 required fields
- WhatsApp numbers (`:225`): Must have 5 required fields
- Admin projects (`:143`): Must have `name`, `status`, `createdAt`
- Project status (`:145`): Regex validation for allowed values
- Stock usage (`:205`): Must have `timestamp`, `userId`, `selectedLocationId`
- Sales data (`:310`): Must have `userId`, `locationId`, `uploadedAt`
- Forecasts (`:332`): Must have `userId`, `locationId`, `createdAt`

Missing validation:
- Guest data has no `.validate` rule
- Queue entries have minimal validation
- Receipt data has no field validation
- User records have no validation

### Index Configuration

The rules include `.indexOn` for 30+ fields across nodes. This is well-done and covers the query patterns used in the codebase.

---

## Storage Security Rules

`storage.rules` defines three paths:

1. **Logos** (`/logos/{logoName}`): Read/write for any authenticated user -- Adequate
2. **Receipt templates** (`/receipt-templates/{templateFile}`): Read for auth users, write for admin -- Good
3. **Receipts** (`/receipts/{receiptFile}`): Read for auth users, **write for anyone** -- Problematic

The receipt write rule (`:17`):
```
allow write: if true; // Allow functions to write (no auth context)
```

This allows **unauthenticated** writes to the receipts storage bucket. The comment explains the intent (Cloud Functions writing receipts don't have a user auth context), but this creates an attack surface for storage abuse.

**Recommendation:** Use Firebase App Check or a signed URL approach instead of open writes.

---

## Cloud Functions Security

### CORS Configuration

`functions/index.js:4-15` defines an explicit origin whitelist:

```javascript
const cors = require('cors')({
    origin: [
        'http://localhost:3000',
        'http://localhost:5000',
        'http://localhost:8000',
        'https://merakicaptiveportal-bda0f.web.app',
        'https://merakicaptiveportal-bda0f.firebaseapp.com',
        'https://merakicaptiveportal-firebasedb.web.app',
        'https://merakicaptiveportal-firebasedb.firebaseapp.com'
    ],
    credentials: true
});
```

**Issue:** Some endpoints override this with `Access-Control-Allow-Origin: *` (e.g., `createTestData` at line 118, booking notifications at line 243). This bypasses the CORS whitelist.

### Authentication in Functions

- **`onCall` functions** automatically receive the caller's auth context via `context.auth`
- **`onRequest` functions** require manual auth verification (many do not implement this)
- The `registerUser` function (`index.js:439`) is an `onCall` function that properly checks context

### Test/Debug Endpoints in Production

Several functions should be removed or restricted in production:

- `createTestData` (`:115`) -- Open test data CRUD with `Access-Control-Allow-Origin: *`
- `tempClearData` (`:981`) -- Deletes data from the database
- `clearScanningData` (`:1025`) -- Deletes scanning data
- `performanceTest` (`:2348`) and `performanceTestHTTP` (`:2411`) -- Performance testing endpoints

### Input Validation

- `guardRail.js` performs thorough receipt validation with type checking and range validation
- `subscriptionStatusManager.js` validates subscription state before updates
- Many `onRequest` endpoints do basic `req.body` field checking but lack comprehensive validation

---

## Client-Side Security

### XSS Prevention

The codebase includes an `escapeHtml()` pattern used before `innerHTML` insertions. This is referenced in the project memory and used in several UI components.

**Concern:** The `admin-activity-monitor.js` file (lines 507-530, 605-633) constructs HTML with template literals and inserts via `innerHTML`. While the data comes from Firebase (not direct user input), any stored XSS in user displayNames or emails would execute.

### Firebase Config Exposure

The Firebase config in `public/js/config/firebase-config.js` includes the API key and project details. This is by design (Firebase client SDKs require it) and is not a security issue, as security is enforced through rules and auth, not API key secrecy.

### Global Window Exports

Firebase exports are attached to `window.firebaseExports` (`:76-102`) and `window.initializeFirebase` (`:105-107`). This allows non-module scripts to access Firebase. While necessary for the hybrid module/non-module approach, it means any injected script has full Firebase SDK access.

---

## Data Protection

### Phone Number Protection

The project has invested in phone number data integrity:

- `phone-number-protection.js` -- Validates updates preserve phone numbers
- `phone-number-monitoring.js` -- Detects phone number changes
- `phone-number-alerts.js` -- Alerts on suspicious phone changes
- `admin-activity-monitor.js` -- Tracks admin activity and phone changes

This is a strength -- it shows awareness of data integrity requirements specific to the business domain.

### Subscription Data Integrity

`subscription-validation.js` prevents:
- `tier`/`tierId` field conflicts
- Invalid tier values
- Missing status fields
- Data corruption during updates

It also logs validation errors to `_system/subscription-validation-errors` for monitoring.

### Secrets Management

- `.env` files are gitignored (confirmed in `.gitignore:66`)
- `functions/.env.template` provides structure without values
- Firebase client config (public) is correctly separated from server secrets (private)

---

## Strengths

1. **Custom claims for admin authorization** -- Using Firebase Auth custom claims is the correct, tamper-proof approach
2. **Owner-based access control** -- Rules correctly verify data ownership via `auth.uid === data.child('ownerId').val()`
3. **Data validation rules** -- Many nodes have `.validate` rules ensuring required fields and valid values
4. **Emulator detection** -- Client automatically routes to emulators in development
5. **Phone number protection** -- Multiple layers of protection for phone number data integrity
6. **Subscription validation** -- Client-side validation prevents data corruption
7. **Structured logging** -- `guardRail.js` and other backend files log structured data for debugging
8. **CORS whitelist** -- Explicit origin whitelist for Cloud Functions
9. **Index configuration** -- Comprehensive `.indexOn` for efficient queries
10. **Secrets in .env** -- Proper separation of secrets from code

---

## Weaknesses and Risks

### Critical

| Issue | Location | Risk | Impact |
|-------|----------|------|--------|
| `admin-claims` world-writable | `database.rules.json:53-54` | Any authenticated user can grant themselves admin access | Full privilege escalation |
| Open writes to `wifiLogins`, `activeUsers`, `userPreferences` | `database.rules.json:189,193,197` | No authentication required to write | Data pollution, potential abuse |
| Open storage writes for receipts | `storage.rules:17` | Unauthenticated file uploads | Storage abuse, cost escalation |

### High

| Issue | Location | Risk | Impact |
|-------|----------|------|--------|
| Subscription self-write allows tier escalation | `database.rules.json:28` | Users can upgrade their own tier | Feature access bypass |
| Test/debug endpoints in production | `functions/index.js:115,981,1025` | Data deletion, test data creation | Data loss, pollution |
| CORS wildcard on some endpoints | `functions/index.js:118` | Bypasses origin whitelist | CSRF potential |

### Medium

| Issue | Location | Risk | Impact |
|-------|----------|------|--------|
| No MFA for admin accounts | Auth configuration | Compromised password = full access | Account takeover |
| Missing validation on guest, queue, receipt data | `database.rules.json` | Malformed data writes | Data corruption |
| `locations` collection-level permissive write | `database.rules.json:33` | Any auth user can write at collection level | Data corruption |
| innerHTML with potentially unsanitized data | `admin-activity-monitor.js` | Stored XSS via displayName/email | Admin session hijacking |

---

## Recommendations

### Immediate (Critical Fixes)

1. **Lock down `admin-claims`** -- Change to admin-only write:
   ```json
   "admin-claims": {
     ".read": "auth != null",
     ".write": "auth != null && auth.token.admin === true"
   }
   ```

2. **Require auth for `wifiLogins`, `activeUsers`, `userPreferences`:**
   ```json
   "wifiLogins": {
     ".read": "auth != null",
     ".write": "auth != null"
   }
   ```

3. **Restrict receipt storage writes** -- Use a Cloud Function to generate signed upload URLs instead of allowing unauthenticated writes.

4. **Remove or protect test/debug endpoints** -- Delete `createTestData`, `tempClearData`, `clearScanningData` from production, or gate them behind admin auth.

### Short-Term (High Priority)

5. **Prevent subscription tier self-escalation** -- Add validation rules:
   ```json
   "subscriptions": {
     "$uid": {
       ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
       "tierId": {
         ".validate": "!data.exists() || data.val() === newData.val() || auth.token.admin === true"
       }
     }
   }
   ```

6. **Remove CORS wildcard overrides** -- Use the centralized CORS middleware for all endpoints.

7. **Add `.validate` rules** to guest data, queue entries, and receipt nodes.

### Medium-Term

8. **Enable Firebase App Check** -- Prevents API abuse from non-app clients
9. **Enable MFA for admin accounts** -- Use Firebase Auth MFA for accounts with admin custom claims
10. **Implement rate limiting** on Cloud Functions using middleware or Firebase Extensions
11. **Add Content Security Policy headers** to Firebase Hosting configuration
12. **Audit `innerHTML` usage** -- Replace with `textContent` or ensure `escapeHtml()` is consistently applied
13. **Implement server-side subscription enforcement** -- Move tier checking from client to Cloud Functions
