# Testing Guide

> How tests are structured, how to run them, and what to test in the Sparks Hospitality platform.

---

## Table of Contents

1. [Test Architecture](#test-architecture)
2. [Running Tests](#running-tests)
3. [Test File Structure](#test-file-structure)
4. [Test Patterns](#test-patterns)
5. [Writing New Tests](#writing-new-tests)
6. [Test Data Management](#test-data-management)
7. [What to Test](#what-to-test)
8. [CI/CD Testing](#cicd-testing)
9. [Limitations and Known Issues](#limitations-and-known-issues)

---

## Test Architecture

### Overview

The project uses **standalone Node.js test scripts** (`.cjs` files) in the project root. These are not framework-based tests (no Jest, Mocha, or Vitest). Each test file:

1. Initializes the Firebase Admin SDK directly
2. Performs operations against the **production** Firebase RTDB (or emulators)
3. Verifies results with manual assertions
4. Cleans up test data in a `finally` block
5. Exits with code 0 (pass) or 1 (fail)

### Why `.cjs` Extension?

The root `package.json` has `"type": "module"`, making `.js` files ES modules by default. Test files use the `.cjs` extension to force CommonJS mode, which is needed for:
- `require('firebase-admin')` (CommonJS-only in Node.js)
- Synchronous module resolution
- Compatibility with the Firebase Admin SDK

### Test Files Inventory

| File | Feature | What It Tests |
|------|---------|---------------|
| `test-feature-12-login.cjs` | Login | User auth, RTDB user record, subscription check |
| `test-feature-20.cjs` | Feature #20 | (Specific feature verification) |
| `test-feature-22-trial.cjs` | Trial subscription | Trial period logic |
| `test-feature-29-subscription-status.cjs` | Subscription status | Status update on expiration |
| `test-feature-29-with-function.cjs` | Subscription function | Cloud function trigger for status |
| `test-feature-32-guest-creation.cjs` | Guest creation | Create guest in RTDB |
| `test-feature-33-queue-persistence.cjs` | Queue persistence | Queue data survives restart |
| `test-feature-34-receipt-persistence.cjs` | Receipt persistence | Receipt data survives restart |
| `test-feature-35-campaign-persistence.cjs` | Campaign persistence | Campaign data survives restart |
| `test-feature-36-37-guest-edit-delete.cjs` | Guest edit/delete | Guest update and removal |
| `test-feature-38-location-persistence.cjs` | Location persistence | Location data survives restart |
| `test-feature-39-whatsapp-persistence.cjs` | WhatsApp persistence | WhatsApp config data survives restart |
| `test-feature-40-reward-persistence.cjs` | Reward persistence | Reward data survives restart |
| `test-feature-41-guest-crud.cjs` | Guest CRUD | Full Create/Read/Update/Delete cycle |
| `test-feature-42-queue-workflow.cjs` | Queue workflow | End-to-end queue operations |
| `test-feature-43-booking-workflow.cjs` | Booking workflow | End-to-end booking flow |
| `test-feature-44-receipt-workflow.cjs` | Receipt workflow | End-to-end receipt processing |
| `test-feature-45-campaign-workflow.cjs` | Campaign workflow | Campaign lifecycle |
| `test-feature-46-voucher-redemption.cjs` | Voucher redemption | Voucher use and validation |
| `test-feature-47-location-workflow.cjs` | Location workflow | Location CRUD operations |
| `test-feature-48-whatsapp-workflow.cjs` | WhatsApp workflow | WhatsApp number management |
| `test-feature-49-consent-workflow.cjs` | Consent workflow | Guest consent management |
| `test-feature-50-onboarding-wizard.cjs` | Onboarding | User onboarding flow |
| `test-feature-53-duplicate-phone.cjs` | Duplicate phone | Duplicate phone number handling |
| `test-feature-78-back-resubmit.cjs` | Back/resubmit | Form resubmission prevention |
| `test-feature-79-api-idempotency.cjs` | API idempotency | Idempotent API operations |
| `test-feature-81-location-cascade-delete.cjs` | Cascade delete | Location deletion cascades |
| `test-feature-82-campaign-cleanup.cjs` | Campaign cleanup | Campaign data cleanup |
| `test-feature-83-create-guest.cjs` | Guest creation | Guest creation verification |
| `test-feature-83-delete-guest.cjs` | Guest deletion | Guest deletion verification |

---

## Running Tests

### Prerequisites

Tests that run against production Firebase require authentication:

```bash
# Option A: Application Default Credentials
export GOOGLE_CLOUD_PROJECT=merakicaptiveportal-firebasedb
gcloud auth application-default login

# Option B: Service account credentials
export FIREBASE_PROJECT_ID=merakicaptiveportal-firebasedb
export FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@merakicaptiveportal-firebasedb.iam.gserviceaccount.com
export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Running a Single Test

```bash
node test-feature-41-guest-crud.cjs
```

### Running Multiple Tests

```bash
# Run all tests (no built-in runner, use a simple loop)
for f in test-feature-*.cjs; do echo "=== $f ==="; node "$f"; done

# Run specific tests
node test-feature-12-login.cjs && node test-feature-41-guest-crud.cjs
```

### Expected Output

Successful tests print structured output with checkmarks:

```
============================================================
Feature #41: Complete Guest CRUD Workflow Test
============================================================

STEP 1: CREATE Guest
Creating guest: +27800TESTCRUD, name: "CRUD Test"
Guest created successfully

STEP 2: READ - Verify guest in database
Guest found: {...}
Guest read successfully - all fields match

...

FEATURE #41 TEST PASSED - ALL STEPS SUCCESSFUL
```

Failed tests exit with code 1 and print the error:

```
TEST FAILED
Error: Guest not found in database after creation
```

---

## Test File Structure

### Standard Template

Every test file follows this structure:

```javascript
/**
 * Feature #XX: Description
 * Tests: what specifically is verified
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
process.env.GOOGLE_CLOUD_PROJECT = 'merakicaptiveportal-firebasedb';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com',
        projectId: 'merakicaptiveportal-firebasedb'
    });
}

const rtdb = admin.database();

async function testFeatureXX() {
    console.log('='.repeat(60));
    console.log('Feature #XX: Description');
    console.log('='.repeat(60));

    try {
        // STEP 1: Setup
        console.log('STEP 1: ...');
        // ... operations and assertions ...

        // STEP 2: Verify
        console.log('STEP 2: ...');
        // ... verify with snapshot.exists(), value checks, etc.

        // SUCCESS
        console.log('FEATURE #XX TEST PASSED');

    } catch (error) {
        console.error('TEST FAILED');
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        // CLEANUP: Always remove test data
        try {
            await rtdb.ref('test/path').remove();
            console.log('Cleanup: Test data removed');
        } catch (cleanupError) {
            console.warn('Cleanup warning:', cleanupError.message);
        }
        // Close Firebase connection
        await admin.app().delete();
    }
}

// Run
testFeatureXX()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
```

### Two Authentication Patterns

Tests use one of two authentication methods:

**Pattern A: Application Default Credentials** (most tests)
```javascript
process.env.GOOGLE_CLOUD_PROJECT = 'merakicaptiveportal-firebasedb';
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: '...'
});
```

**Pattern B: Service Account Certificate** (test-feature-12-login.cjs)
```javascript
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
};
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: '...'
});
```

---

## Test Patterns

### CRUD Verification

Tests that verify data persistence follow this pattern:

```javascript
// 1. CREATE
await ref.set(data);

// 2. Small delay for consistency
await new Promise(resolve => setTimeout(resolve, 500));

// 3. READ and verify
const snapshot = await ref.once('value');
if (!snapshot.exists()) throw new Error('Data not found');
const readData = snapshot.val();
if (readData.field !== expectedValue) throw new Error('Field mismatch');

// 4. UPDATE
await ref.update({ field: newValue });

// 5. Verify update
const updated = await ref.once('value');
if (updated.val().field !== newValue) throw new Error('Update failed');

// 6. DELETE
await ref.remove();

// 7. Verify deletion
const deleted = await ref.once('value');
if (deleted.exists()) throw new Error('Deletion failed');
```

### Workflow Verification

End-to-end workflow tests simulate the full lifecycle:

```javascript
// 1. Create prerequisite data (location, user, etc.)
// 2. Perform the workflow action (add to queue, create booking)
// 3. Verify intermediate state (status = pending)
// 4. Perform status change (confirm booking, seat guest)
// 5. Verify final state (status = confirmed)
// 6. Cleanup all created data
```

### Assertion Pattern

Since there is no test framework, assertions are manual `throw`:

```javascript
// Manual assertion
if (actual !== expected) {
    throw new Error(`Expected "${expected}", got "${actual}"`);
}
```

---

## Writing New Tests

### 1. Create the File

```bash
# Convention: test-feature-{number}-{short-description}.cjs
touch test-feature-84-my-feature.cjs
```

### 2. Follow the Template

Use the standard template above, replacing:
- Feature number and description
- Test steps specific to your feature
- Test data specific to your feature
- Cleanup paths

### 3. Test Data Conventions

| Data Type | Test Value Pattern | Example |
|-----------|-------------------|---------|
| Phone numbers | `+27800TEST...` | `+27800TESTCRUD` |
| Guest names | Descriptive test names | `'CRUD Test'`, `'Queue Test Guest'` |
| Location IDs | Prefixed with `test-` | `test-location-001` |
| Timestamps | `Date.now()` or ISO strings | `new Date().toISOString()` |

### 4. Cleanup Requirements

Every test MUST clean up its data in a `finally` block, even if the test fails. This prevents test data from polluting the production database.

---

## Test Data Management

### Production Database Impact

**Important:** Most tests run against the **production** Firebase RTDB, not emulators. This means:

- Test data is written to the real database
- Cleanup is critical to avoid data pollution
- Tests should use obviously fake data (e.g., `+27800TESTCRUD`)
- Never use real customer phone numbers or data

### Running Against Emulators

To run tests against emulators instead:

1. Start emulators: `npm run emulators`
2. Set the emulator environment:
   ```bash
   export FIREBASE_DATABASE_EMULATOR_HOST=localhost:9000
   export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
   ```
3. Run the test: `node test-feature-41-guest-crud.cjs`

The Admin SDK automatically detects these environment variables and routes operations to the emulator.

---

## What to Test

### Priority Areas

1. **Data Persistence** -- Verify that data written to RTDB survives and can be read back
2. **CRUD Operations** -- Full create/read/update/delete cycles for each entity
3. **Cascade Operations** -- Deleting a location removes related data (queues, forecasts, etc.)
4. **Subscription Logic** -- Trial expiration, status transitions, tier validation
5. **Workflow Integrity** -- End-to-end flows (guest signup -> receipt -> reward)
6. **Security Rules** -- Verify that unauthenticated or unauthorized users are rejected

### What Each Test Should Verify

| Step | Verification |
|------|-------------|
| CREATE | Data exists at expected path, all fields correct |
| READ | Retrieved data matches what was written |
| UPDATE | Changed fields are updated, unchanged fields preserved |
| DELETE | Node no longer exists, related index nodes cleaned up |
| WORKFLOW | State transitions happen correctly (pending -> active -> completed) |

### Edge Cases to Cover

- Duplicate phone numbers
- Missing required fields
- Invalid subscription tiers
- Expired trial periods
- Concurrent updates to same data
- Phone number format variations (+27 vs 027 vs whatsapp:+27)

---

## CI/CD Testing

### Current State

There is no CI/CD pipeline configured for automated testing. Tests are run manually.

### Recommended Pipeline

If integrating tests into CI/CD:

```yaml
# Example GitHub Actions workflow
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: cd functions && npm ci && cd ..
      - name: Start emulators and run tests
        run: |
          npx firebase emulators:exec \
            --only database,auth \
            "node test-feature-41-guest-crud.cjs && node test-feature-12-login.cjs"
        env:
          FIREBASE_PROJECT_ID: merakicaptiveportal-firebasedb
```

The `firebase emulators:exec` command starts emulators, runs the test command, and shuts down emulators afterward.

---

## Limitations and Known Issues

### No Test Framework

Tests use manual assertions (`throw new Error`) instead of a framework like Jest or Vitest. This means:
- No test grouping or suite management
- No built-in mocking
- No coverage reporting
- No parallel test execution
- No watch mode

### Production Database Risk

Most tests run against the production database by default. While they clean up after themselves, a failed cleanup could leave stale data. Mitigation: use emulators for regular testing.

### No Frontend Tests

There are no browser-based or DOM tests. All tests operate at the database/backend level. Frontend behavior (UI rendering, user interactions) is verified manually.

### Test Isolation

Tests are not isolated from each other. Running multiple tests that operate on the same data paths concurrently could cause conflicts. Run tests sequentially.

### E2E Testing Infrastructure

Playwright is installed (`devDependencies` in `package.json`) but no E2E test files exist yet. This could be used for browser-based testing of the full application.
