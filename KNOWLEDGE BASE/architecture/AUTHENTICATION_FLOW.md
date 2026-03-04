# Sparks Hospitality -- Authentication & Authorization Flow

## Overview

The platform uses **Firebase Authentication** with email/password sign-in as the primary authentication method. Authorization is layered through three mechanisms:

1. **Firebase Auth Custom Claims** -- Admin flag set on the JWT token
2. **RTDB `admin-claims` node** -- Dual verification for admin status
3. **RTDB Security Rules** -- Declarative access control at the database level
4. **Application-Layer Checks** -- Tier-based and role-based gating in client code and Cloud Functions

## Authentication Architecture

```
User Browser
     |
     |  1. Email/Password login
     v
Firebase Auth Service
     |
     |  2. Returns ID Token (JWT)
     v
Client App (firebase-config.js)
     |
     |  3. Token attached to requests
     v
Cloud Functions (Bearer token in Authorization header)
     |
     |  4. admin.auth().verifyIdToken(token)
     v
Firebase Admin SDK
     |
     |  5. Decoded token with custom claims
     v
Authorization Logic
```

## Sign-In Flow

### Client-Side (`firebase-config.js`)

```javascript
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
```

The client imports Firebase Auth methods and exports them for use throughout the app. The `auth` instance is initialized with the Firebase app and auto-detects emulator mode on localhost.

### Auth State Management

`onAuthStateChanged` is the primary listener for authentication state changes. When the auth state changes:
1. If user is signed in, their ID token is available for API calls
2. The token is refreshed automatically by Firebase SDK
3. Custom claims (including `admin: true`) are available on the decoded token

## User Registration Flow

### Cloud Function: `registerUser` (onCall)

**Trigger:** Called from the registration form after Firebase Auth account creation.

**Input:**
```javascript
{
  firstName, lastName,
  businessName, businessAddress, businessPhone, businessType,
  selectedTier, tierData
}
```

**Process:**
1. Verify the caller is authenticated (`context.auth` exists)
2. Create/merge user record at `users/{uid}` with business info
3. Create/merge subscription record at `subscriptions/{uid}` with:
   - 14-day trial period
   - Selected tier features and limits
4. Create initial location at `locations/{pushId}`
5. Link user to location at `userLocations/{uid}/{locationId}`

**Overwrite Protection:** If `users/{uid}` already exists, the function merges data rather than overwriting, explicitly preserving phone numbers.

## Admin Authentication

### Dual Verification Pattern

Admin status requires BOTH:
1. **Firebase Auth Custom Claim:** `auth.token.admin === true`
2. **RTDB Database Entry:** `admin-claims/{uid}` equals `true`

This dual check is used consistently across Cloud Functions:

```javascript
// Standard admin verification pattern used in ~20+ functions
const decodedToken = await admin.auth().verifyIdToken(idToken);
const isAdminInDb = await admin.database()
    .ref(`admin-claims/${decodedToken.uid}`)
    .once('value')
    .then(snapshot => snapshot.val() === true);

if (!decodedToken.admin === true || !isAdminInDb) {
    return res.status(403).json({ error: 'Unauthorized - Admin access required' });
}
```

> **Note:** There is a bug in the code: `!decodedToken.admin === true` evaluates as `(!decodedToken.admin) === true`, which works by coincidence when `admin` is `undefined` or `false`, but the correct expression should be `decodedToken.admin !== true`. [TODO: verify if this causes issues in production]

### Setting Admin Claims

#### Cloud Function: `setAdminClaim` (HTTP POST)

**Auth Required:** Caller must already be an admin.

**Process:**
1. Verify caller's token
2. Check caller is admin (custom claim)
3. Set target user's custom claim: `admin.auth().setCustomUserClaims(uid, { admin: !!isAdmin })`
4. Update `admin-claims/{uid}` in RTDB (set to `true` or remove)

#### Cloud Function: `setupInitialAdmin` (HTTP POST)

**Purpose:** One-time bootstrap for the first admin user.

**Auth Required:** Setup secret (`MerakiAdmin2024!`) instead of admin token.

**Process:**
1. Verify setup secret
2. Look up user by email
3. Set custom claims
4. Add to `admin-claims/{uid}`

> **Security Note:** This endpoint uses a hardcoded secret and should be disabled after initial setup.

### Verifying Admin Status

#### Cloud Function: `verifyAdminStatus` (HTTP GET)

Returns `{ isAdmin: true/false }` after checking both custom claim and database entry.

## User Account Creation (Admin)

### Cloud Function: `createUserAccount` (HTTP POST)

**Auth Required:** Admin only.

**Process:**
1. Verify admin token (dual check)
2. Validate input (email, password, name, tier)
3. Validate tier exists in RTDB `subscriptionTiers/{tier}`
4. Validate location count against tier limits
5. Create Firebase Auth user: `admin.auth().createUser(...)`
6. Optionally set admin claims
7. Create `users/{uid}` record
8. Create `subscriptions/{uid}` with tier data and locationIds
9. Create `userLocations/{uid}/{locationId}` entries for each assigned location

## Security Rules Authorization

### Rule Patterns

**1. Authenticated Access:**
```json
".read": "auth != null"
```
Most nodes require authentication for read access.

**2. Owner-Only Write:**
```json
".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
```
Users can only write to their own data. Admins can write anywhere.

**3. Location-Scoped Access:**
```json
".read": "auth != null && root.child('userLocations').child(auth.uid).child($locationId).exists()"
```
Used for sales data, forecasts, and other location-specific data. Verifies the user has been granted access to the location.

**4. Ownership-Based Write:**
```json
".write": "auth != null && (auth.uid === data.child('ownerId').val() || auth.token.admin === true || !data.exists())"
```
Location owners or admins can write. New records (non-existent data) can be created by any authenticated user.

**5. Phone-Number Identity:**
```json
".read": "auth != null && (auth.token.phone_number === $phoneNumber || auth.token.admin === true)"
```
Used for guest-specific data. Guests can access their own data by phone number match.

**6. Admin-Only Write with Public Read:**
```json
".read": true,
".write": "auth != null && auth.token.admin === true"
```
Used for `subscriptionTiers` and `customization` (portal branding).

### Publicly Writable Nodes

The following nodes allow unauthenticated or broadly authenticated writes:

| Node | Write Rule | Reason |
|------|-----------|--------|
| `wifiLogins` | `true` | Meraki captive portal writes without auth |
| `activeUsers` | `true` | WiFi connection tracking |
| `userPreferences` | `true` | Guest preference capture |
| `receiptPatternLogs` | `true` | OCR processing logs |
| `debug/ocr-logs` | `true` | Debug logging from processing pipeline |

> **Security Note:** These open-write nodes are intentional for external integrations but represent potential abuse vectors.

## Token Flow for API Calls

### HTTP Functions (onRequest)

```
Client --> Authorization: Bearer <idToken> --> Cloud Function
                                                    |
                                       admin.auth().verifyIdToken(idToken)
                                                    |
                                            Decoded token with claims
```

### Callable Functions (onCall)

```
Client --> httpsCallable(functions, 'functionName')(data) --> Cloud Function
                                                                   |
                                                        context.auth (auto-populated)
                                                                   |
                                                           context.auth.uid
                                                           context.auth.token.admin
```

## Role-Based Access Control (Application Layer)

**File:** `public/js/modules/access-control/services/role-access-control.js`

Roles are stored in user profiles and checked client-side:

| Role | Financial Access | Guest Data | Campaigns | Subscription Mgmt |
|------|-----------------|------------|-----------|-------------------|
| `restaurant_owner` | Yes | Yes | Yes | Yes |
| `general_manager` | Yes | Yes | Yes | No |
| `kitchen_manager` | Yes | No | No | No |
| `floor_manager` | No | Yes | No | No |
| `platform_admin` | Yes | Yes | Yes | Yes |

Role checks are purely client-side. Server-side security rules do not enforce role-based restrictions -- they only check authentication, ownership, and admin status.

## Emulator Mode

When running on localhost, the client automatically connects to local emulators:

```javascript
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    connectDatabaseEmulator(rtdb, 'localhost', 9000);
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

Emulator ports:
- Auth: 9099
- Functions: 5001
- Firestore: 8080
- RTDB: 9000
- Hosting: 5000
- Storage: 9199
