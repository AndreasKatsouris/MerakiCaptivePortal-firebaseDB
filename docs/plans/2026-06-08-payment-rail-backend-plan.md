# Payment Rail Spec 1 — Backend Money-Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side `functions/payments/` module that turns a Paystack `charge.success` webhook into an idempotent USD credit grant to the ledger, plus a one-time free-trial grant — so an owner can buy credit and have it land safely.

**Architecture:** New `functions/payments/` module mirroring `functions/billing/` (pure cores + thin `onRequest`+Bearer CF shells + own `getDb()` seam + lazy/injectable Paystack client). The **webhook is the sole source of truth** for grants: signature-verified (HMAC-SHA512 over the raw body), idempotent on the Paystack `reference`, grant amount re-derived server-side from `bundleId`. Reuses `ledger.grantCredit({ uid, amountCents, grantedBy, reason })`.

**Tech Stack:** Firebase Cloud Functions v2 (`onRequest`), Node 22 global `fetch` (no new dep), built-in `crypto` (HMAC), vitest + per-module `fake-rtdb` helper.

**Spec:** `docs/plans/2026-06-07-payment-rail-paystack-topups-design.md` (PR #155).

**⚠️ Ships DORMANT:** ROSS is not launched. This code lands on master but the **`rossAgent`→Free flip, the trial-grant activation, and the live Paystack keys are NOT deployed/flipped until launch** (gated on the two wheels — see spec §1.1). Build everything; flip nothing live.

**Scope of THIS plan:** the backend money-core (Tasks 1–11). The **top-up UI** (replace `/upgrade.html` stub + Ask Ross low-balance affordance, spec §8) is a **dependent follow-on plan** — it consumes these CFs and the backend is the prerequisite + the risky part.

**Conventions to follow (verified against `functions/billing/`):**
- CFs: `onRequest` + `cors(corsOptions)` + `verifyAuthToken(req)` Bearer auth, POST-only, `res.json({ result: { success, ... } })`, `badRequest`/`statusFor` error mapping (NOT `onCall` — the spec's "onCall" note is reconciled to the house pattern).
- Tests: vitest, inject a `fake-rtdb` (copy `functions/billing/__tests__/helpers/fake-rtdb.js`) via `module.__setDbForTests(fake)`; inject a fake Paystack client via `__setClientForTests`.
- Server-shape mocks copied verbatim from a real Paystack payload (server-shape-mock lesson).
- `billing/*` rules are already `.read/.write:false` → the new `billing/creditBundles`, `billing/paymentEvents`, `billing/trialGranted` nodes need **no rules change**.

---

### Task 1: Module constants

**Files:**
- Create: `functions/payments/constants.js`

- [ ] **Step 1: Write the constants module**

```javascript
'use strict';

// Payment Rail constants. USD is the unit of account (grants 1:1 to the ledger);
// ZAR is the forced Paystack charge currency (Paystack-SA cannot charge USD).

const PAYSTACK_API_BASE = 'https://api.paystack.co';

// One-time free-trial grant (USD cents). 100¢ = $1 ≈ 50–100 Ross turns above the
// ledger's 50¢ balance floor. Bounded cost; idempotent per uid.
const TRIAL_CENTS = 100;

// RTDB paths — all under billing/ (already .read/.write:false → server-only).
const creditBundlesPath = () => 'billing/creditBundles';
const bundlePath = (bundleId) => `billing/creditBundles/${bundleId}`;
const paymentEventPath = (reference) => `billing/paymentEvents/${reference}`;
const trialGrantedPath = (uid) => `billing/trialGranted/${uid}`;

module.exports = {
    PAYSTACK_API_BASE,
    TRIAL_CENTS,
    creditBundlesPath,
    bundlePath,
    paymentEventPath,
    trialGrantedPath,
};
```

- [ ] **Step 2: Commit**

```bash
git add functions/payments/constants.js
git commit -m "feat(payments): module constants (paths, TRIAL_CENTS, Paystack base)"
```

---

### Task 2: Webhook signature verification (pure)

**Files:**
- Create: `functions/payments/webhook-verify.js`
- Test: `functions/payments/__tests__/webhook-verify.test.js`

- [ ] **Step 1: Copy the fake-rtdb helper for this module** (used by later tasks)

```bash
mkdir -p functions/payments/__tests__/helpers
cp functions/billing/__tests__/helpers/fake-rtdb.js functions/payments/__tests__/helpers/fake-rtdb.js
```

- [ ] **Step 2: Write the failing test**

```javascript
// functions/payments/__tests__/webhook-verify.test.js
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
const { verifyPaystackSignature } = require('../webhook-verify');

const SECRET = 'sk_test_example';
const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_1' } });
const validSig = crypto.createHmac('sha512', SECRET).update(rawBody).digest('hex');

describe('verifyPaystackSignature', () => {
    it('accepts a correctly signed body', () => {
        expect(verifyPaystackSignature(rawBody, validSig, SECRET)).toBe(true);
    });
    it('rejects a tampered body', () => {
        expect(verifyPaystackSignature(rawBody + 'x', validSig, SECRET)).toBe(false);
    });
    it('rejects a wrong secret', () => {
        expect(verifyPaystackSignature(rawBody, validSig, 'sk_test_wrong')).toBe(false);
    });
    it('rejects a missing/empty signature', () => {
        expect(verifyPaystackSignature(rawBody, '', SECRET)).toBe(false);
        expect(verifyPaystackSignature(rawBody, undefined, SECRET)).toBe(false);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run functions/payments/__tests__/webhook-verify.test.js`
Expected: FAIL — `Cannot find module '../webhook-verify'`.

- [ ] **Step 4: Write the implementation**

```javascript
// functions/payments/webhook-verify.js
'use strict';
const crypto = require('node:crypto');

/**
 * Verify a Paystack webhook signature. Paystack signs the RAW request body with
 * HMAC-SHA512 using your secret key and sends it as `x-paystack-signature` (hex).
 * Constant-time compare to avoid timing leaks.
 * @param {string|Buffer} rawBody  the unparsed request body (use req.rawBody)
 * @param {string} signature       the x-paystack-signature header (hex)
 * @param {string} secret          PAYSTACK_SECRET_KEY
 * @returns {boolean}
 */
function verifyPaystackSignature(rawBody, signature, secret) {
    if (!signature || typeof signature !== 'string' || !secret) return false;
    const expected = crypto.createHmac('sha512', secret)
        .update(rawBody)
        .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

module.exports = { verifyPaystackSignature };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run functions/payments/__tests__/webhook-verify.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add functions/payments/webhook-verify.js functions/payments/__tests__/webhook-verify.test.js functions/payments/__tests__/helpers/fake-rtdb.js
git commit -m "feat(payments): HMAC-SHA512 webhook signature verification + tests"
```

---

### Task 3: Bundle resolution (pure, db-seamed)

**Files:**
- Create: `functions/payments/bundles.js`
- Test: `functions/payments/__tests__/bundles.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// functions/payments/__tests__/bundles.test.js
import { describe, it, expect } from 'vitest';
const { makeFakeRtdb } = require('./helpers/fake-rtdb');
const bundles = require('../bundles');

const TREE = { billing: { creditBundles: {
    usd20:  { usdGrantCents: 2000,  zarChargeCents: 36000,  label: '$20 credit',  active: true,  sort: 1 },
    usd99:  { usdGrantCents: 9900,  zarChargeCents: 178200, label: '$99 credit',  active: true,  sort: 2 },
    usd200: { usdGrantCents: 20000, zarChargeCents: 360000, label: '$200 credit', active: false, sort: 3 },
} } };

describe('resolveBundle', () => {
    it('returns an active bundle by id', async () => {
        const db = makeFakeRtdb(TREE);
        const b = await bundles.resolveBundle(db, 'usd20');
        expect(b).toEqual({ usdGrantCents: 2000, zarChargeCents: 36000, label: '$20 credit' });
    });
    it('throws on an unknown bundle', async () => {
        const db = makeFakeRtdb(TREE);
        await expect(bundles.resolveBundle(db, 'nope')).rejects.toThrow('Unknown bundle');
    });
    it('throws on an inactive bundle', async () => {
        const db = makeFakeRtdb(TREE);
        await expect(bundles.resolveBundle(db, 'usd200')).rejects.toThrow('inactive');
    });
});

describe('listActiveBundles', () => {
    it('returns only active bundles, sorted', async () => {
        const db = makeFakeRtdb(TREE);
        const list = await bundles.listActiveBundles(db);
        expect(list.map((b) => b.id)).toEqual(['usd20', 'usd99']);
        expect(list[0]).toMatchObject({ id: 'usd20', zarChargeCents: 36000, label: '$20 credit' });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/payments/__tests__/bundles.test.js`
Expected: FAIL — `Cannot find module '../bundles'`.

- [ ] **Step 3: Write the implementation**

```javascript
// functions/payments/bundles.js
'use strict';
const { bundlePath, creditBundlesPath } = require('./constants');

/**
 * Resolve a single ACTIVE bundle by id. THROWS on unknown/inactive — the grant
 * amount must always come from here (server-side), never from the client.
 * @returns {Promise<{usdGrantCents:number, zarChargeCents:number, label:string}>}
 */
async function resolveBundle(db, bundleId) {
    const snap = await db.ref(bundlePath(bundleId)).once('value');
    const b = snap.val();
    if (!b) throw new Error(`Unknown bundle: ${bundleId}`);
    if (b.active !== true) throw new Error(`Bundle inactive: ${bundleId}`);
    return { usdGrantCents: b.usdGrantCents, zarChargeCents: b.zarChargeCents, label: b.label };
}

/** Active bundles for the UI, sorted by `sort` then id. */
async function listActiveBundles(db) {
    const snap = await db.ref(creditBundlesPath()).once('value');
    const all = snap.val() || {};
    return Object.keys(all)
        .filter((id) => all[id] && all[id].active === true)
        .map((id) => ({
            id,
            usdGrantCents: all[id].usdGrantCents,
            zarChargeCents: all[id].zarChargeCents,
            label: all[id].label,
            sort: all[id].sort || 0,
        }))
        .sort((x, y) => (x.sort - y.sort) || x.id.localeCompare(y.id));
}

module.exports = { resolveBundle, listActiveBundles };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run functions/payments/__tests__/bundles.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/payments/bundles.js functions/payments/__tests__/bundles.test.js
git commit -m "feat(payments): bundle resolution (resolveBundle/listActiveBundles) + tests"
```

---

### Task 4: Paystack client (lazy/injectable seam)

**Files:**
- Create: `functions/payments/paystack-client.js`
- Test: `functions/payments/__tests__/paystack-client.test.js`

- [ ] **Step 1: Write the failing test** (covers the seam, not the network)

```javascript
// functions/payments/__tests__/paystack-client.test.js
import { describe, it, expect, vi } from 'vitest';
const client = require('../paystack-client');

describe('paystack-client seam', () => {
    it('initializeTransaction posts amount+metadata and returns the auth url', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: true, data: { authorization_url: 'https://paystack/x', reference: 'ref_1' } }),
        });
        client.__setFetchForTests(fetchSpy);
        const out = await client.initializeTransaction({
            secret: 'sk_test', email: 'a@b.c', amountZarCents: 36000, metadata: { uid: 'u1', bundleId: 'usd20' },
        });
        expect(out).toEqual({ authorizationUrl: 'https://paystack/x', reference: 'ref_1' });
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://api.paystack.co/transaction/initialize');
        const body = JSON.parse(opts.body);
        expect(body).toMatchObject({ email: 'a@b.c', amount: 36000, currency: 'ZAR', metadata: { uid: 'u1', bundleId: 'usd20' } });
        expect(opts.headers.Authorization).toBe('Bearer sk_test');
    });

    it('throws when Paystack returns status:false', async () => {
        client.__setFetchForTests(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: false, message: 'bad' }) }));
        await expect(client.initializeTransaction({ secret: 's', email: 'a@b.c', amountZarCents: 1, metadata: {} }))
            .rejects.toThrow('Paystack initialize failed');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/payments/__tests__/paystack-client.test.js`
Expected: FAIL — `Cannot find module '../paystack-client'`.

- [ ] **Step 3: Write the implementation**

```javascript
// functions/payments/paystack-client.js
'use strict';
// Thin wrapper over the Paystack REST API using Node 22 global fetch (no SDK dep).
// Currency is ZAR (Paystack-SA base). `amount` is in the minor unit (ZAR cents).
const { PAYSTACK_API_BASE } = require('./constants');

let _fetch = null;
function getFetch() { return _fetch || globalThis.fetch; }
/** Test-only: inject a fake fetch. */
function __setFetchForTests(fn) { _fetch = fn; }

/**
 * Create a Paystack transaction. Returns the hosted checkout URL + reference.
 * @param {{secret:string, email:string, amountZarCents:number, metadata:object}} args
 * @returns {Promise<{authorizationUrl:string, reference:string}>}
 */
async function initializeTransaction({ secret, email, amountZarCents, metadata }) {
    const res = await getFetch()(`${PAYSTACK_API_BASE}/transaction/initialize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, amount: amountZarCents, currency: 'ZAR', metadata }),
    });
    const json = await res.json();
    if (!json || json.status !== true || !json.data) {
        throw new Error(`Paystack initialize failed: ${(json && json.message) || res.status}`);
    }
    return { authorizationUrl: json.data.authorization_url, reference: json.data.reference };
}

/** Defensive re-check of a transaction by reference (status 'success' = paid). */
async function verifyTransaction({ secret, reference }) {
    const res = await getFetch()(`${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secret}` },
    });
    const json = await res.json();
    if (!json || json.status !== true || !json.data) {
        throw new Error(`Paystack verify failed: ${(json && json.message) || res.status}`);
    }
    return json.data; // { status, amount, currency, reference, metadata, ... }
}

module.exports = { initializeTransaction, verifyTransaction, __setFetchForTests };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run functions/payments/__tests__/paystack-client.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/payments/paystack-client.js functions/payments/__tests__/paystack-client.test.js
git commit -m "feat(payments): Paystack REST client (init/verify) with injectable fetch seam"
```

---

### Task 5: Charge processing core (idempotent grant)

**Files:**
- Create: `functions/payments/process-charge.js`
- Test: `functions/payments/__tests__/process-charge.test.js`

- [ ] **Step 1: Write the failing test** (use a verbatim Paystack `charge.success` shape)

```javascript
// functions/payments/__tests__/process-charge.test.js
import { describe, it, expect, vi } from 'vitest';
const { makeFakeRtdb } = require('./helpers/fake-rtdb');
const { processChargeSuccess } = require('../process-charge');

// Verbatim-shaped Paystack charge.success event (trimmed to fields we read).
// Source: Paystack webhook docs — event.data.{reference,amount,currency,metadata}.
function chargeEvent(over = {}) {
    return {
        event: 'charge.success',
        data: {
            reference: 'ref_abc', amount: 36000, currency: 'ZAR', status: 'success',
            metadata: { uid: 'u1', bundleId: 'usd20' },
            ...over,
        },
    };
}
const TREE = () => ({ billing: { creditBundles: {
    usd20: { usdGrantCents: 2000, zarChargeCents: 36000, label: '$20 credit', active: true },
} } });

function fakeLedger() {
    return { grantCredit: vi.fn().mockResolvedValue({ balanceAfterCents: 2000 }) };
}

describe('processChargeSuccess', () => {
    it('grants the bundle USD once and records the event', async () => {
        const db = makeFakeRtdb(TREE());
        const ledger = fakeLedger();
        const out = await processChargeSuccess({ db, ledger, event: chargeEvent() });
        expect(out.status).toBe('granted');
        expect(ledger.grantCredit).toHaveBeenCalledWith({
            uid: 'u1', amountCents: 2000, grantedBy: 'paystack', reason: 'topup:ref_abc',
        });
        const rec = (await db.ref('billing/paymentEvents/ref_abc').once('value')).val();
        expect(rec).toMatchObject({ uid: 'u1', bundleId: 'usd20', usdGrantCents: 2000, status: 'granted' });
    });

    it('is idempotent — a duplicate reference grants only once', async () => {
        const db = makeFakeRtdb(TREE());
        const ledger = fakeLedger();
        await processChargeSuccess({ db, ledger, event: chargeEvent() });
        const out2 = await processChargeSuccess({ db, ledger, event: chargeEvent() });
        expect(out2.status).toBe('ignored');
        expect(ledger.grantCredit).toHaveBeenCalledTimes(1);
    });

    it('does NOT grant on an unknown bundle', async () => {
        const db = makeFakeRtdb(TREE());
        const ledger = fakeLedger();
        const out = await processChargeSuccess({ db, ledger, event: chargeEvent({ metadata: { uid: 'u1', bundleId: 'nope' } }) });
        expect(out.status).toBe('failed');
        expect(ledger.grantCredit).not.toHaveBeenCalled();
    });

    it('does NOT grant when paid ZAR != bundle zarChargeCents (tamper guard)', async () => {
        const db = makeFakeRtdb(TREE());
        const ledger = fakeLedger();
        const out = await processChargeSuccess({ db, ledger, event: chargeEvent({ amount: 100 }) });
        expect(out.status).toBe('failed');
        expect(ledger.grantCredit).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/payments/__tests__/process-charge.test.js`
Expected: FAIL — `Cannot find module '../process-charge'`.

- [ ] **Step 3: Write the implementation**

```javascript
// functions/payments/process-charge.js
'use strict';
const { resolveBundle } = require('./bundles');
const { paymentEventPath } = require('./constants');

/**
 * Process a verified Paystack `charge.success` event into a one-time USD credit grant.
 * SOURCE OF TRUTH for grants. Idempotent on the Paystack `reference`. The grant amount
 * is ALWAYS re-derived server-side from the bundle (never the event amount).
 *
 * @param {{db:object, ledger:object, event:object}} args  ledger = functions/billing/ledger
 * @returns {Promise<{status:'granted'|'ignored'|'failed', reason?:string}>}
 */
async function processChargeSuccess({ db, ledger, event }) {
    const data = (event && event.data) || {};
    const { reference, amount, metadata } = data;
    const uid = metadata && metadata.uid;
    const bundleId = metadata && metadata.bundleId;

    if (!reference || !uid || !bundleId) {
        return { status: 'failed', reason: 'missing reference/uid/bundleId' };
    }

    // Idempotency: one record per Paystack reference. Webhook retries land here again.
    const eventRef = db.ref(paymentEventPath(reference));
    if ((await eventRef.once('value')).exists()) {
        return { status: 'ignored', reason: 'duplicate reference' };
    }

    let bundle;
    try {
        bundle = await resolveBundle(db, bundleId);
    } catch (e) {
        await eventRef.set({ uid, bundleId, status: 'failed', reason: e.message, event: 'charge.success', at: Date.now() });
        return { status: 'failed', reason: e.message };
    }

    // Tamper guard: the ZAR actually paid must equal the bundle's configured price.
    if (Number(amount) !== Number(bundle.zarChargeCents)) {
        await eventRef.set({ uid, bundleId, status: 'failed', reason: 'amount mismatch', paidZarCents: amount, expectedZarCents: bundle.zarChargeCents, event: 'charge.success', at: Date.now() });
        return { status: 'failed', reason: 'amount mismatch' };
    }

    await ledger.grantCredit({ uid, amountCents: bundle.usdGrantCents, grantedBy: 'paystack', reason: `topup:${reference}` });
    await eventRef.set({
        uid, bundleId, usdGrantCents: bundle.usdGrantCents, zarChargeCents: bundle.zarChargeCents,
        status: 'granted', event: 'charge.success', at: Date.now(),
    });
    return { status: 'granted' };
}

module.exports = { processChargeSuccess };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run functions/payments/__tests__/process-charge.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/payments/process-charge.js functions/payments/__tests__/process-charge.test.js
git commit -m "feat(payments): idempotent charge.success → ledger grant core + tamper guard"
```

---

### Task 6: Free-trial grant (one-time, idempotent)

**Files:**
- Create: `functions/payments/trial.js`
- Test: `functions/payments/__tests__/trial.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// functions/payments/__tests__/trial.test.js
import { describe, it, expect, vi } from 'vitest';
const { makeFakeRtdb } = require('./helpers/fake-rtdb');
const { claimTrial } = require('../trial');

function fakeLedger() { return { grantCredit: vi.fn().mockResolvedValue({ balanceAfterCents: 100 }) }; }

describe('claimTrial', () => {
    it('grants TRIAL_CENTS once and marks the uid', async () => {
        const db = makeFakeRtdb({});
        const ledger = fakeLedger();
        const out = await claimTrial({ db, ledger, uid: 'u1' });
        expect(out).toEqual({ granted: true, amountCents: 100 });
        expect(ledger.grantCredit).toHaveBeenCalledWith({ uid: 'u1', amountCents: 100, grantedBy: 'trial', reason: 'first-run-trial' });
        const mark = (await db.ref('billing/trialGranted/u1').once('value')).val();
        expect(mark).toMatchObject({ amountCents: 100 });
    });

    it('is a no-op on a second call (already claimed)', async () => {
        const db = makeFakeRtdb({});
        const ledger = fakeLedger();
        await claimTrial({ db, ledger, uid: 'u1' });
        const out2 = await claimTrial({ db, ledger, uid: 'u1' });
        expect(out2).toEqual({ granted: false, alreadyClaimed: true });
        expect(ledger.grantCredit).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/payments/__tests__/trial.test.js`
Expected: FAIL — `Cannot find module '../trial'`.

- [ ] **Step 3: Write the implementation**

```javascript
// functions/payments/trial.js
'use strict';
const { TRIAL_CENTS, trialGrantedPath } = require('./constants');

/**
 * One-time free-trial credit grant. Idempotent per uid via billing/trialGranted/{uid}.
 * NOTE: the pre-check is not transactional — a double-click could double-grant in a
 * race; the bounded amount (TRIAL_CENTS) makes this low-value. Tighten with a
 * transaction on the marker if abuse appears (mirrors the rossSeedFirstWorkflow note).
 * @returns {Promise<{granted:true, amountCents:number}|{granted:false, alreadyClaimed:true}>}
 */
async function claimTrial({ db, ledger, uid }) {
    const markRef = db.ref(trialGrantedPath(uid));
    if ((await markRef.once('value')).exists()) {
        return { granted: false, alreadyClaimed: true };
    }
    await ledger.grantCredit({ uid, amountCents: TRIAL_CENTS, grantedBy: 'trial', reason: 'first-run-trial' });
    await markRef.set({ amountCents: TRIAL_CENTS, at: Date.now() });
    return { granted: true, amountCents: TRIAL_CENTS };
}

module.exports = { claimTrial };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run functions/payments/__tests__/trial.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/payments/trial.js functions/payments/__tests__/trial.test.js
git commit -m "feat(payments): one-time idempotent free-trial credit grant + tests"
```

---

### Task 7: Cloud Function shells (`onRequest` + Bearer)

**Files:**
- Create: `functions/payments/cloud-functions.js`

These are thin wrappers over the fully-tested cores (mirrors `billing/cloud-functions.js`: `onRequest` + `cors` + `verifyAuthToken`, POST-only, `res.json({ result })`, `badRequest`/`statusFor`). The cores are unit-tested; the wrappers are deploy-smoke-only — no new unit test (consistent with billing). The webhook gets its db seam via a `__setDbForTests` export for the smoke path.

- [ ] **Step 1: Write the module**

```javascript
'use strict';
/**
 * Payment Rail — public Cloud Functions (thin wrappers over the payments cores).
 * Pattern mirrors billing/cloud-functions.js: onRequest + CORS + Bearer auth.
 *   - paymentsListBundles  (auth'd)  → active bundles for the UI
 *   - paymentsInitTopup    (auth'd)  → create a Paystack txn, return authorization_url
 *   - paymentsClaimTrial   (auth'd)  → one-time free-trial grant
 *   - paystackWebhook      (unauth, SIGNATURE-gated) → charge.success → grant
 *
 * ⚠️ DORMANT until launch: deploy needs PAYSTACK_SECRET_KEY (secret-first); the live
 * keys + the rossAgent→Free flip are NOT enabled until the two wheels land.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { corsOptions } = require('../cors-allowlist');
const cors = require('cors')(corsOptions);

const ledger = require('../billing/ledger');
const { verifyAuthToken } = require('../billing/auth');
const { listActiveBundles, resolveBundle } = require('./bundles');
const { claimTrial } = require('./trial');
const { processChargeSuccess } = require('./process-charge');
const { verifyPaystackSignature } = require('./webhook-verify');
const paystack = require('./paystack-client');

const PAYSTACK_SECRET_KEY = defineSecret('PAYSTACK_SECRET_KEY');

// DB seam (so the webhook + handlers can be smoke-tested with a fake).
let _db = null;
function getDb() { if (!_db) _db = admin.database(); return _db; }
function __setDbForTests(fake) { _db = fake; }

function badRequest(message) { const e = new Error(message); e.statusCode = 400; return e; }
function statusFor(err) { return (err && Number.isInteger(err.statusCode)) ? err.statusCode : 500; }

exports.paymentsListBundles = onRequest(async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        await verifyAuthToken(req); // any signed-in owner may list bundles
        const bundles = await listActiveBundles(getDb());
        res.json({ result: { success: true, bundles } });
    } catch (error) {
        console.error('[paymentsListBundles] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));

exports.paymentsInitTopup = onRequest({ secrets: [PAYSTACK_SECRET_KEY] }, async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const decoded = await verifyAuthToken(req);
        const uid = decoded.uid;
        const email = decoded.email || `${uid}@noemail.local`;
        const data = req.body.data || req.body || {};
        const { bundleId } = data;
        if (!bundleId || typeof bundleId !== 'string') throw badRequest('Invalid request: bundleId is required');

        const bundle = await resolveBundle(getDb(), bundleId); // server-derived price; throws if unknown/inactive
        const { authorizationUrl, reference } = await paystack.initializeTransaction({
            secret: PAYSTACK_SECRET_KEY.value(), email, amountZarCents: bundle.zarChargeCents,
            metadata: { uid, bundleId },
        });
        res.json({ result: { success: true, authorizationUrl, reference } });
    } catch (error) {
        console.error('[paymentsInitTopup] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));

exports.paymentsClaimTrial = onRequest(async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const decoded = await verifyAuthToken(req);
        const out = await claimTrial({ db: getDb(), ledger, uid: decoded.uid });
        res.json({ result: { success: true, ...out } });
    } catch (error) {
        console.error('[paymentsClaimTrial] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));

// Webhook: NO Bearer auth — gated by the HMAC signature over the RAW body instead.
exports.paystackWebhook = onRequest({ secrets: [PAYSTACK_SECRET_KEY] }, async (req, res) => {
    try {
        const raw = req.rawBody; // Firebase provides the unparsed body Buffer
        const sig = req.get('x-paystack-signature');
        if (!verifyPaystackSignature(raw, sig, PAYSTACK_SECRET_KEY.value())) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        const event = req.body; // already parsed JSON
        if (event && event.event === 'charge.success') {
            await processChargeSuccess({ db: getDb(), ledger, event });
        }
        // Always 200 a verified event so Paystack stops retrying (idempotency handles dupes).
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('[paystackWebhook] Error:', error.message);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

exports.__setDbForTests = __setDbForTests;
```

- [ ] **Step 2: Sanity — module loads + lints**

Run: `node -e "require('./functions/payments/cloud-functions.js'); console.log('ok')"`
Expected: prints `ok` (no throw at require-time).

- [ ] **Step 3: Commit**

```bash
git add functions/payments/cloud-functions.js
git commit -m "feat(payments): onRequest CF shells — initTopup/listBundles/claimTrial/webhook"
```

---

### Task 8: Seed script for the credit bundles

**Files:**
- Create: `functions/seeds/seed-credit-bundles.js`

Mirrors `functions/billing/seed-price-table.js` / `functions/seeds/ross-templates-seed.js` (idempotent, run with `GOOGLE_APPLICATION_CREDENTIALS` or via the firebase CLI). **`zarChargeCents` are placeholders the operator confirms before running** — USD grants are fixed at $20/$99/$200.

- [ ] **Step 1: Write the seed**

```javascript
'use strict';
/**
 * Seed billing/creditBundles. USD grants are FIXED ($20/$99/$200); the ZAR charge
 * price per bundle is operator-set — confirm the zarChargeCents below against the
 * current rand rate + desired margin BEFORE running. Idempotent (overwrites by id).
 * Run: GOOGLE_APPLICATION_CREDENTIALS=... node functions/seeds/seed-credit-bundles.js
 */
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

const BUNDLES = {
    usd20:  { usdGrantCents: 2000,  zarChargeCents: 36000,  label: '$20 of Ross credit',  active: true, sort: 1 },
    usd99:  { usdGrantCents: 9900,  zarChargeCents: 178200, label: '$99 of Ross credit',  active: true, sort: 2 },
    usd200: { usdGrantCents: 20000, zarChargeCents: 360000, label: '$200 of Ross credit', active: true, sort: 3 },
};

async function main() {
    await admin.database().ref('billing/creditBundles').update(BUNDLES);
    console.log('Seeded credit bundles:', Object.keys(BUNDLES).join(', '));
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Sanity — module parses**

Run: `node -c functions/seeds/seed-credit-bundles.js && echo ok`
Expected: `ok`. (Do NOT run the seed — it writes prod; that's a launch-time op.)

- [ ] **Step 3: Commit**

```bash
git add functions/seeds/seed-credit-bundles.js
git commit -m "feat(payments): credit-bundles seed (\$20/\$99/\$200; ZAR price operator-set)"
```

---

### Task 9: Wire the CFs into `functions/index.js`

**Files:**
- Modify: `functions/index.js` (near the billing exports, ~line 3714)

- [ ] **Step 1: Add the exports** after the existing `billing` export block

```javascript
// Payment Rail (③) — Paystack credit top-ups + free trial. DORMANT until launch.
const payments = require('./payments/cloud-functions');
exports.paymentsListBundles = payments.paymentsListBundles;
exports.paymentsInitTopup = payments.paymentsInitTopup;
exports.paymentsClaimTrial = payments.paymentsClaimTrial;
exports.paystackWebhook = payments.paystackWebhook;
```

- [ ] **Step 2: Verify the whole functions entry still loads**

Run: `cd functions && node -e "require('./index.js'); console.log('index ok')"`
Expected: `index ok` (no require-time throw). _Note: this requires `functions/node_modules` — run `npm install` in `functions/` first if needed (worktree gotcha)._

- [ ] **Step 3: Commit**

```bash
git add functions/index.js
git commit -m "feat(payments): export the 4 payment-rail CFs from index.js"
```

---

### Task 10: Dormant `rossAgent → Free` prep (built, NOT run)

**Files:**
- Create: `functions/seeds/set-rossagent-free.js`

The PAYG-for-all flip = add `rossAgent:true` to the Free tier's features + recompute entitlements. This is a **launch-time op** — the script is committed but **explicitly not run** until the two wheels land (running it opens Ross to all owners).

- [ ] **Step 1: Write the (un-run) launch script**

```javascript
'use strict';
/**
 * LAUNCH-ONLY — DO NOT RUN until ROSS launch (the two wheels are on). Flips Ross to
 * PAYG-for-all by making rossAgent a Free-tier feature, then recomputes entitlements
 * so existing accounts materialize features.rossAgent. Until this runs, Ross stays
 * gated to whoever has rossAgent today (admin-granted) — i.e. the rail is dormant.
 * Run (at launch): GOOGLE_APPLICATION_CREDENTIALS=... node functions/seeds/set-rossagent-free.js
 */
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

const { recomputeEntitlements } = require('../entitlements/resolver'); // per-uid resolver (verified)

async function main() {
    const db = admin.database();
    // 1. Free tier gains rossAgent. (Tier id 'free' per subscriptionTiers.)
    await db.ref('subscriptionTiers/free/features/rossAgent').set(true);
    // 2. Recompute every account so live owners materialize features.rossAgent.
    //    There is no all-accounts helper — iterate subscriptions and call the per-uid
    //    resolver (the same call the daily recomputeExpiringEntitlements sweep makes).
    const subs = (await db.ref('subscriptions').once('value')).val() || {};
    const uids = Object.keys(subs);
    for (const uid of uids) {
        await recomputeEntitlements(uid);
    }
    console.log(`rossAgent is now a Free feature; recomputed ${uids.length} accounts.`);
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> This script is **NOT executed** in this plan — it is the launch-time op, committed for readiness.

- [ ] **Step 2: Sanity — parses**

Run: `node -c functions/seeds/set-rossagent-free.js && echo ok`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add functions/seeds/set-rossagent-free.js
git commit -m "chore(payments): launch-only rossAgent->Free flip script (DORMANT, do not run)"
```

---

### Task 11: Catalog + docs

**Files:**
- Modify: `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md` and `public/kb/api/CLOUD_FUNCTIONS_CATALOG.md` (both copies)

- [ ] **Step 1: Add a "Payments (③ Payment Rail)" section to both catalog copies**

Document the 4 CFs: `paymentsListBundles` (auth'd, lists active bundles), `paymentsInitTopup` (auth'd, creates a Paystack txn → authorization_url), `paymentsClaimTrial` (auth'd, one-time trial grant), `paystackWebhook` (signature-gated, `charge.success` → idempotent ledger grant). Note: webhook is the sole grant source of truth; DORMANT until launch.

- [ ] **Step 2: Verify both copies match**

Run: `diff <(grep -A6 "Payment Rail" "KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md") <(grep -A6 "Payment Rail" public/kb/api/CLOUD_FUNCTIONS_CATALOG.md) && echo "in sync"`
Expected: `in sync`.

- [ ] **Step 3: Commit**

```bash
git add "KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md" public/kb/api/CLOUD_FUNCTIONS_CATALOG.md
git commit -m "docs(payments): catalog the 4 payment-rail CFs (both copies)"
```

---

## Final verification

- [ ] **Run the full payments suite:** `npx vitest run functions/payments` → all green (webhook-verify 4, bundles 4, paystack-client 2, process-charge 4, trial 2 = 16 tests).
- [ ] **Build:** `npm run build` → green.
- [ ] **Functions load:** `cd functions && node -e "require('./index.js')"` → no throw.

## Deploy notes (NOT part of this plan — launch-time, operator-gated)

1. `firebase functions:secrets:set PAYSTACK_SECRET_KEY` (test key first) — **secret-first**, before any deploy (an unprovisioned `defineSecret` blocks ALL deploys).
2. Deploy the 4 CFs; configure the Paystack dashboard webhook URL → the deployed `paystackWebhook`.
3. Run `seed-credit-bundles.js` (operator confirms ZAR prices first).
4. **DO NOT** run `set-rossagent-free.js` or flip live Paystack keys until launch (two wheels on).
5. Test-mode smoke: real init → Paystack test card → webhook → balance rises.

## Out of scope → follow-on plans
- **Top-up UI** (spec §8): replace `/upgrade.html` stub + Ask Ross low-balance affordance — depends on these CFs.
- **Spec 2:** recurring All-in subscription; refunds/chargebacks; live FX; VAT/invoicing.
