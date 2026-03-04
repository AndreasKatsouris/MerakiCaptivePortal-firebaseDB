# Database Rules Guide

> Detailed breakdown of `database.rules.json`: what each rule protects, how access control works, and how to extend it.

---

## Table of Contents

1. [How Firebase RTDB Rules Work](#how-firebase-rtdb-rules-work)
2. [Global Root Rules](#global-root-rules)
3. [Node-by-Node Breakdown](#node-by-node-breakdown)
4. [Security Rule Patterns](#security-rule-patterns)
5. [Extending the Rules](#extending-the-rules)
6. [Testing Rules](#testing-rules)
7. [Common Pitfalls](#common-pitfalls)

---

## How Firebase RTDB Rules Work

### Cascading Model

Firebase RTDB rules **cascade downward**. If a parent node grants access, all child nodes inherit that access regardless of their own rules. Rules can only **grant** access at deeper levels, never revoke it.

```
/root           -> .read: "auth != null"      (all auth users)
  /child        -> .read: false               (IGNORED -- parent already granted)
```

This is critical to understand: a permissive parent rule cannot be overridden by a restrictive child rule.

### Rule Types

| Rule | Purpose |
|------|---------|
| `.read` | Who can read data at this path |
| `.write` | Who can write data at this path |
| `.validate` | Data structure and type validation (only applies on writes) |
| `.indexOn` | Fields to index for efficient querying |

### Available Variables

| Variable | Description |
|----------|-------------|
| `auth` | The authenticated user's token (null if unauthenticated) |
| `auth.uid` | User's Firebase Auth UID |
| `auth.token.admin` | Custom claim (true for admin users) |
| `auth.token.phone_number` | User's verified phone number |
| `auth.token.email` | User's email address |
| `data` | Current data at this path (before write) |
| `newData` | Incoming data (during write) |
| `root` | Reference to the database root (for cross-node lookups) |
| `$variable` | Wildcard path segment (captures the key name) |

---

## Global Root Rules

**Location:** `database.rules.json:3-4`

```json
".read": "auth != null",
".write": "auth != null && auth.token.admin === true"
```

| Rule | Access | Notes |
|------|--------|-------|
| `.read` | Any authenticated user | Cascades to ALL child nodes. Any logged-in user can read any data unless a more specific rule is evaluated first. |
| `.write` | Admin only | Only users with the `admin` custom claim can write at the root level. Child nodes can grant additional write access. |

**Impact:** Because `.read: "auth != null"` is set at the root, every authenticated user can read every node in the database. Child `.read` rules are effectively decorative (they cannot restrict what the root already grants). To fix this, the root `.read` should be `false`, with each node defining its own read access.

---

## Node-by-Node Breakdown

### `subscriptionTiers`

**Lines:** 5-8 | **Purpose:** Stores available subscription tier definitions

```json
".read": true,
".write": "auth != null && auth.token.admin === true"
```

| Access | Who | Notes |
|--------|-----|-------|
| Read | Everyone (including unauthenticated) | Public data -- tier names and limits |
| Write | Admin only | Only admins can modify tier definitions |

**Assessment:** Appropriate. Tier definitions are public metadata.

---

### `guests`

**Lines:** 9-17 | **Purpose:** Guest records keyed by phone number

```json
".read": "auth != null",
".write": "auth != null && auth.token.admin === true",
".indexOn": ["phoneNumber", "locationId", "createdAt", "email", "nameCollectedAt", "name"],
"$phoneNumber": {
    ".read": "auth != null && (auth.token.phone_number === $phoneNumber || auth.token.admin === true)",
    ".write": "auth != null && (auth.token.phone_number === $phoneNumber || auth.token.admin === true)"
}
```

| Access | Who | Notes |
|--------|-----|-------|
| Collection read | Any authenticated user | Can list all guests |
| Collection write | Admin only | Batch operations require admin |
| Individual read | Own phone match OR admin | Guest can read own record |
| Individual write | Own phone match OR admin | Guest can update own record |

**Assessment:** The child-level rules add phone-based access, but the collection-level read already grants broad access. No `.validate` rule on guest records -- any fields can be written.

---

### `users`

**Lines:** 18-23 | **Purpose:** User profile records keyed by UID

```json
"$uid": {
    ".read": "auth != null",
    ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
}
```

| Access | Who | Notes |
|--------|-----|-------|
| Read | Any authenticated user | Any user can read any user's profile |
| Write | Self or admin | Users can only write to their own profile |

**Assessment:** Read is overly permissive -- users should only read their own profile or profiles of users in their organization.

---

### `subscriptions`

**Lines:** 24-30 | **Purpose:** User subscription data keyed by UID

```json
".indexOn": ["userId", "tier", "status", "expirationDate"],
"$uid": {
    ".read": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
    ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
}
```

| Access | Who | Notes |
|--------|-----|-------|
| Read | Self or admin | Properly scoped |
| Write | Self or admin | **Risk:** Users can modify their own tier |

**Assessment:** Read is good. Write should restrict `tierId` changes to admin-only to prevent self-escalation. See Security Overview for recommended fix.

---

### `locations`

**Lines:** 31-39 | **Purpose:** Restaurant location records

```json
".read": "auth != null",
".write": "auth != null",
"$locationId": {
    ".write": "auth != null && (auth.uid === data.child('ownerId').val() || auth.token.admin === true || !data.exists())"
}
```

| Access | Who | Notes |
|--------|-----|-------|
| Collection read | Any authenticated user | Can list all locations |
| Collection write | Any authenticated user | **Issue:** Collection-level write is too broad |
| Individual write | Owner, admin, or new record | Proper ownership check for existing records |

**Assessment:** The collection-level `.write: "auth != null"` is concerning. While the child rule adds ownership checks, the parent rule takes precedence for writes to the collection path itself. The `!data.exists()` clause correctly allows creating new locations.

---

### `userLocations`

**Lines:** 40-45 | **Purpose:** Maps users to their accessible locations

```json
"$uid": {
    ".read": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
    ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
}
```

**Assessment:** Good. Properly scoped to self or admin.

---

### `onboarding-progress`

**Lines:** 46-51 | **Purpose:** User onboarding wizard state

**Assessment:** Good. Same self-or-admin pattern as `userLocations`.

---

### `admin-claims`

**Lines:** 52-55 | **Purpose:** Tracks which users have admin privileges

```json
".read": "auth != null",
".write": "auth != null"
```

| Access | Who | Notes |
|--------|-----|-------|
| Read | Any authenticated user | |
| Write | Any authenticated user | **CRITICAL** |

**Assessment:** **CRITICAL VULNERABILITY.** Any authenticated user can write to `admin-claims`, adding their own UID. This node is referenced in campaign rules (`:101-102`) and booking rules (`:209-210`) as a secondary admin check: `root.child('admin-claims').child(auth.uid).exists()`. Writing to this node grants access to campaigns, bookings, and any other resource that checks `admin-claims`.

**Fix:** Change `.write` to `"auth != null && auth.token.admin === true"`.

---

### `rewards`

**Lines:** 56-64 | **Purpose:** Guest reward records

```json
".read": "auth != null",
".write": "auth != null",
"$rewardId": {
    ".write": "auth != null && (auth.token.admin === true || !data.exists() || (data.exists() && data.child('status').val() !== 'approved' && data.child('guestPhone').val() === auth.token.phone_number))",
    ".validate": "newData.hasChildren(['metadata', 'status', 'value', 'expiresAt']) && (...)"
}
```

| Access | Who | Notes |
|--------|-----|-------|
| Read | Any authenticated user | |
| Write (new) | Any authenticated user | Can create new rewards |
| Write (existing) | Admin, or own phone AND not approved | Guests can modify non-approved rewards |

**Assessment:** Good validation and nuanced write rules. The status check prevents guests from modifying approved rewards. The `.validate` rule ensures required fields.

---

### `guest-rewards`

**Lines:** 65-71 | **Purpose:** Rewards indexed by guest phone number

**Assessment:** Good. Phone-based access control with admin fallback.

---

### `campaign-rewards`

**Lines:** 72-80 | **Purpose:** Rewards linked to campaigns

**Assessment:** Good. Admin-only write with proper nesting.

---

### `guest-receipts`

**Lines:** 81-87 | **Purpose:** Guest receipt records indexed by phone

```json
"$phoneNumber": {
    ".read": "auth != null && (auth.token.admin === true || auth.token.phone_number === $phoneNumber || auth.token.phone_number === '+' + $phoneNumber)",
    ".write": "auth != null && (auth.token.admin === true || auth.token.phone_number === $phoneNumber || auth.token.phone_number === '+' + $phoneNumber)"
}
```

**Assessment:** Good. Handles the phone number format variation (with/without `+` prefix), which is a real-world issue with Twilio phone numbers.

---

### `scanningData`

**Lines:** 88-94 | **Purpose:** Meraki WiFi scanning data

```json
".read": "auth != null",
".write": "auth != null"
```

**Assessment:** Overly permissive write. Any authenticated user can modify scanning data. Should be admin-only or function-only.

---

### `customization`

**Lines:** 95-98 | **Purpose:** Portal customization settings

```json
".read": true,
".write": "auth != null && auth.token.admin === true"
```

**Assessment:** Good. Public read (needed for captive portal), admin-only write.

---

### `campaigns`

**Lines:** 99-106 | **Purpose:** Marketing campaigns

```json
".read": "auth != null && (auth.token.admin === true || root.child('admin-claims').child(auth.uid).exists())",
".write": "auth != null && (auth.token.admin === true || root.child('admin-claims').child(auth.uid).exists())"
```

**Assessment:** Proper admin/claims check, but compromised by the `admin-claims` vulnerability. Good `.validate` rule requiring `name` and `status`.

---

### `receipts`

**Lines:** 112-116 | **Purpose:** All receipt records

```json
".read": "auth != null",
".write": "auth != null"
```

**Assessment:** Overly permissive. Any authenticated user can read/write any receipt. Should be scoped to owner or admin.

---

### `admins`

**Lines:** 124-132 | **Purpose:** Admin user records

```json
".read": "auth != null && auth.token.admin === true",
".write": "auth != null && auth.token.admin === true"
```

**Assessment:** Excellent. Admin-only with validation requiring `superAdmin` field.

---

### `admin/projects`

**Lines:** 133-168 | **Purpose:** Internal project management (admin)

**Assessment:** Excellent. Full admin-only access with comprehensive validation: required fields, status regex validation, typed fields (`createdAt` as number), nested task/milestone rules.

---

### `wifiLogins`, `activeUsers`, `userPreferences`

**Lines:** 187-198 | **Purpose:** WiFi login tracking, active user status, user preferences

```json
".write": true
```

**Assessment:** **CRITICAL.** No authentication required to write. Anyone on the internet can write to these nodes. This appears intentional for the captive portal (unauthenticated WiFi users), but should be restricted to specific fields and validated.

---

### `stockUsage`

**Lines:** 199-207 | **Purpose:** Stock/ingredient usage tracking

```json
"$recordId": {
    ".write": "auth != null && (auth.token.admin === true || (newData.child('userId').val() === auth.uid && newData.child('selectedLocationId').exists() && root.child('userLocations').child(auth.uid).child(newData.child('selectedLocationId').val()).exists()))",
    ".validate": "newData.hasChildren(['timestamp', 'userId', 'selectedLocationId'])"
}
```

**Assessment:** Excellent. Verifies:
1. User ID matches auth
2. Location ID is provided
3. User has access to the location (cross-reference to `userLocations`)
4. Required fields are present

This is the gold standard for rules in this project.

---

### `bookings`

**Lines:** 208-217 | **Purpose:** Table reservation bookings

**Assessment:** Good. Complex rules that verify location ownership through `userLocations` cross-reference. Comprehensive `.validate` with 8 required fields. Read/write rules handle both admin-claims check and location ownership.

---

### `whatsapp-numbers`, `location-whatsapp-mapping`

**Lines:** 218-237 | **Purpose:** WhatsApp number management and location assignment

**Assessment:** Good. Owner-based access with validation for required fields. The `!data.exists()` clause allows creating new records.

---

### `whatsapp-message-history`

**Lines:** 242-251 | **Purpose:** WhatsApp message logs

```json
".write": "auth != null",
"$messageId": {
    ".write": "auth != null",
    ".validate": "newData.hasChildren(['locationId', 'messageType', 'direction', 'timestamp', 'phoneNumber'])"
}
```

**Assessment:** Write is too permissive. Any authenticated user can write message history. The validation is good though.

---

### `queue`

**Lines:** 252-273 | **Purpose:** Queue management with location-based entries

```json
"$locationId": {
    ".read": "auth != null",
    ".write": "auth != null",
    "entries": {
        "$entryId": {
            ".validate": "newData.hasChildren(['phoneNumber', 'status', 'createdAt'])"
        }
    }
}
```

**Assessment:** Overly permissive. Any authenticated user can modify any location's queue. Should verify location ownership via `userLocations` cross-reference. Validation is minimal but present.

---

### `receiptTemplates`

**Lines:** 274-283 | **Purpose:** OCR receipt parsing templates

**Assessment:** Good. Admin-only write with comprehensive validation (7 required fields).

---

### `receiptPatternLogs`, `debug/ocr-logs`

**Lines:** 284-304 | **Purpose:** Receipt pattern matching logs and OCR debug logs

```json
".write": true
```

**Assessment:** **World-writable.** Intended for Cloud Functions to write logs without auth context, but allows anyone to write. Consider using the Admin SDK in functions (which bypasses rules) and restricting these to admin-only.

---

### `salesData`, `salesDataIndex`

**Lines:** 305-326 | **Purpose:** Sales data records and location/user indexes

```json
"$recordId": {
    ".write": "auth != null && (auth.token.admin === true || data.child('userId').val() === auth.uid || (!data.exists() && newData.child('userId').val() === auth.uid && newData.child('locationId').exists() && root.child('userLocations').child(auth.uid).child(newData.child('locationId').val()).exists()))",
    ".validate": "newData.hasChildren(['userId', 'locationId', 'uploadedAt'])"
}
```

**Assessment:** Excellent. Same pattern as `stockUsage`:
- Admin can write anything
- Owner can update existing records
- New records require matching userId, valid locationId, and userLocations cross-reference
- Index nodes scoped to users who have access to the location

---

### `forecasts`, `forecastIndex`, `forecastActuals`, `forecastAnalytics`

**Lines:** 327-368 | **Purpose:** Sales forecasting data, indexes, actual results, and analytics

**Assessment:** Excellent. Same robust pattern as salesData with location-based access control and validation.

---

## Security Rule Patterns

### Pattern 1: Self-or-Admin

```json
"$uid": {
    ".read": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
    ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
}
```

Used by: `users`, `subscriptions`, `userLocations`, `onboarding-progress`

### Pattern 2: Phone-Based Access

```json
"$phoneNumber": {
    ".read": "auth != null && (auth.token.phone_number === $phoneNumber || auth.token.admin === true)",
    ".write": "auth != null && (auth.token.phone_number === $phoneNumber || auth.token.admin === true)"
}
```

Used by: `guests/$phoneNumber`, `guest-rewards`, `guest-receipts`

### Pattern 3: Location-Ownership Cross-Reference

```json
".write": "auth != null && (...newData.child('locationId').exists() && root.child('userLocations').child(auth.uid).child(newData.child('locationId').val()).exists())"
```

Used by: `stockUsage`, `salesData`, `forecasts`, `forecastActuals`, `bookings`

This is the strongest pattern -- it verifies through cross-reference that the user actually has access to the specified location.

### Pattern 4: Admin-Only

```json
".read": "auth != null && auth.token.admin === true",
".write": "auth != null && auth.token.admin === true"
```

Used by: `admins`, `admin/projects`, `campaign-rewards`, `rewardTypes`, `receiptTemplates`

### Pattern 5: Open Write (for Captive Portal / Functions)

```json
".write": true
```

Used by: `wifiLogins`, `activeUsers`, `userPreferences`, `receiptPatternLogs`, `debug`

This pattern is problematic and should be replaced with more targeted approaches.

---

## Extending the Rules

### Adding a New Node

When adding a new data node, follow these steps:

#### 1. Define the Rule

```json
"myNewNode": {
    ".indexOn": ["userId", "locationId", "createdAt"],
    "$recordId": {
        ".read": "auth != null && (auth.token.admin === true || data.child('userId').val() === auth.uid)",
        ".write": "auth != null && (auth.token.admin === true || (!data.exists() && newData.child('userId').val() === auth.uid && root.child('userLocations').child(auth.uid).child(newData.child('locationId').val()).exists()))",
        ".validate": "newData.hasChildren(['userId', 'locationId', 'createdAt'])"
    }
}
```

#### 2. Checklist for New Rules

- [ ] Read access scoped to owner/admin (not collection-level broadcast)
- [ ] Write access verifies ownership for existing records
- [ ] New record creation validates userId matches auth.uid
- [ ] Location-based data cross-references `userLocations`
- [ ] `.validate` requires all mandatory fields
- [ ] `.indexOn` covers queried fields
- [ ] No `.write: true` unless absolutely necessary
- [ ] No collection-level permissive `.write`

#### 3. Add Index Node (if needed)

For data that needs to be queried by location or user:

```json
"myNewNodeIndex": {
    "byLocation": {
        "$locationId": {
            ".read": "auth != null && root.child('userLocations').child(auth.uid).child($locationId).exists()",
            ".write": "auth != null && root.child('userLocations').child(auth.uid).child($locationId).exists()"
        }
    },
    "byUser": {
        "$uid": {
            ".read": "auth != null && auth.uid === $uid",
            ".write": "auth != null && auth.uid === $uid"
        }
    }
}
```

### Adding Validation

#### Type Validation

```json
"createdAt": { ".validate": "newData.isNumber()" },
"name": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length < 200" },
"status": { ".validate": "newData.val().matches(/^(active|inactive|deleted)$/)" },
"email": { ".validate": "newData.isString() && newData.val().matches(/^[^@]+@[^@]+$/)" }
```

#### Required Children

```json
".validate": "newData.hasChildren(['field1', 'field2', 'field3'])"
```

#### Preventing Specific Field Updates

```json
"sensitiveField": {
    ".validate": "!data.exists() || data.val() === newData.val() || auth.token.admin === true"
}
```

This allows the field to be set on creation, but only admins can change it afterward.

---

## Testing Rules

### Using Firebase Emulators

Security rules are automatically applied in the RTDB emulator:

```bash
npm run emulators
```

Then test writes with different auth states:
- No auth (should be rejected for most nodes)
- Regular user auth (should be scoped to own data)
- Admin auth (should have full access)

### Rules Playground

The Firebase Console includes a Rules Playground:

1. Go to Firebase Console > Realtime Database > Rules
2. Click "Rules Playground" tab
3. Select read/write, set the path, and simulate with different auth payloads

### Programmatic Testing

Use the `@firebase/rules-unit-testing` package:

```javascript
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const testEnv = await initializeTestEnvironment({
    projectId: 'merakicaptiveportal-firebasedb',
    database: {
        rules: fs.readFileSync('database.rules.json', 'utf8'),
        host: 'localhost',
        port: 9000
    }
});

// Test as unauthenticated user
const unauth = testEnv.unauthenticatedContext();
await assertFails(unauth.database().ref('guests').get());

// Test as regular user
const user = testEnv.authenticatedContext('user123', { phone_number: '+27821234567' });
await assertSucceeds(user.database().ref('guests/+27821234567').get());

// Test as admin
const admin = testEnv.authenticatedContext('admin1', { admin: true });
await assertSucceeds(admin.database().ref('guests').get());
```

---

## Common Pitfalls

### 1. Parent Rules Override Children

```json
"locations": {
    ".write": "auth != null",       // This grants access to ALL children
    "$locationId": {
        ".write": "auth.uid === data.child('ownerId').val()"  // This is ADDITIVE, not restrictive
    }
}
```

A write to `/locations` (the collection) succeeds if `auth != null`, regardless of the child rule. The child rule only applies to writes specifically targeting `/locations/{locationId}`.

### 2. `data` vs `newData`

- `data` = current data at the path (before the write)
- `newData` = what the data will be after the write

For ownership checks on existing records, use `data.child('userId')`. For new records, use `newData.child('userId')`.

### 3. Cross-Reference Timing

```json
"root.child('userLocations').child(auth.uid).child($locationId).exists()"
```

This checks the current state of `userLocations` at read time. If a multi-path update simultaneously creates the `userLocations` entry and the data, the cross-reference might fail because `userLocations` does not exist yet. Write the `userLocations` entry first, or use a Cloud Function for atomic operations.

### 4. String vs Number Types

RTDB rules are strict about types:
- `newData.isNumber()` -- Must be a JavaScript number
- `newData.isString()` -- Must be a JavaScript string
- `newData.val() === true` -- Boolean check

A timestamp stored as a string will fail `newData.isNumber()`, even if it looks like a number.

### 5. Phone Number Format Consistency

The rules handle two phone formats:
```json
"auth.token.phone_number === $phoneNumber || auth.token.phone_number === '+' + $phoneNumber"
```

Ensure all code paths normalize phone numbers before writing to the database. The `guardRail.js:normalizePhoneNumber()` function handles this for the backend, but client-side code must be consistent too.
