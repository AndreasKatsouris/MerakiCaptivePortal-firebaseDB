'use strict';

/**
 * CF auth-posture guard — lesson #18 (auth-vs-authz, PRs #89/#91).
 *
 * Lesson: a token-only gate (verifyAuthToken alone) leaks admin data to any
 * signed-in non-admin operator. The entitlements CFs layer a second check
 * (verifyAdmin / verifySuperAdmin) on top of verifyAuthToken. This file asserts
 * that second layer is present and structurally correct in the auth module:
 *
 *   - verifyAdmin: custom claim check (decodedToken.admin) + RTDB check (admins/{uid})
 *   - verifySuperAdmin: RTDB check (admins/{uid}.superAdmin === true)
 *
 * SHAPE: source-scan + structural read of the auth module source.
 *
 * WHY source-scan over live invocation:
 *   - The auth functions use firebase-admin directly with no DI seam (intentional,
 *     they're stable infra). Mocking firebase-admin from a CJS vitest context does
 *     not intercept require() calls inside CJS modules — the module cache is separate
 *     from vitest's ESM mock registry. Emulator invocation is out-of-scope.
 *   - Source-scan is cheap, deterministic, and reliable. It asserts the STRUCTURE of
 *     the guard rather than requiring a mock-server round-trip.
 *
 * SECURITY FINDING PROTOCOL:
 *   If any assertion here fails, the dual-factor check has been removed or bypassed.
 *   Report to the operator immediately; do NOT auto-fix.
 *
 * Guard demotes the prose lesson to a code comment.
 * Template: functions/agent/__tests__/tools.test.js:128-153.
 */

const fs = require('fs');
const path = require('path');

const AUTH_JS = path.resolve(__dirname, '../auth');
const CLOUD_FUNCTIONS_JS = path.resolve(__dirname, '../cloud-functions');

let authSource;
let cfSource;

beforeAll(() => {
    authSource = fs.readFileSync(require.resolve(AUTH_JS), 'utf8');
    cfSource = fs.readFileSync(require.resolve(CLOUD_FUNCTIONS_JS), 'utf8');
});

// ─── verifyAdmin structural assertions ────────────────────────────────────────

describe('verifyAdmin — dual-factor auth structure (auth ≠ authz, lesson #18)', () => {
    it('verifyAdmin checks the custom claim (decodedToken.admin !== true) as first factor', () => {
        // If this fails, the first-factor check was removed — a token-only gate would
        // pass ANY authenticated caller who hasn't had their admin claim stripped.
        expect(authSource).toMatch(/decodedToken\.admin !== true/);
    });

    it('verifyAdmin checks the RTDB admins/{uid} record as second factor', () => {
        // The second factor: even a valid admin claim is rejected if the RTDB record
        // disagrees (handles revoked/stale claims). Without this, a forged or stale
        // custom claim is sufficient to gain admin access.
        expect(authSource).toMatch(/admins\/\$\{uid\}/);
    });

    it('verifyAdmin throws with statusCode 403 on failure (not a generic error)', () => {
        // The authError factory sets statusCode: 403 so the CF mapper returns HTTP 403.
        // A generic error would return 500, hiding the auth failure type.
        expect(authSource).toMatch(/statusCode.*403|403.*statusCode/s);
        expect(authSource).toMatch(/authError|Auth.*required|Admin.*required/i);
    });

    it('verifyAdmin is exported for use by the entitlements CFs', () => {
        expect(authSource).toMatch(/module\.exports.*verifyAdmin/);
    });
});

// ─── verifySuperAdmin structural assertions ────────────────────────────────────

describe('verifySuperAdmin — super-admin check structure (auth ≠ authz, lesson #18)', () => {
    it('verifySuperAdmin checks the RTDB admins/{uid}.superAdmin field', () => {
        // verifySuperAdmin relies exclusively on the RTDB record (no custom claim check)
        // because superAdmin is not a Firebase Auth custom claim.
        expect(authSource).toMatch(/superAdmin/);
        expect(authSource).toMatch(/admins\/\$\{uid\}/);
    });

    it('verifySuperAdmin throws with statusCode 403 on failure', () => {
        expect(authSource).toMatch(/Super Admin access required/i);
    });

    it('verifySuperAdmin is exported for use by the entitlements CFs', () => {
        expect(authSource).toMatch(/module\.exports.*verifySuperAdmin/);
    });
});

// ─── entitlements CF usage of the auth guards ─────────────────────────────────

describe('entitlements CFs — auth guard call-sites', () => {
    it('entitlementSetTier calls verifyAdmin (admin-gated tier mutation)', () => {
        // entitlementSetTier allows any admin to change a user's tier (not just superAdmin).
        // If verifyAdmin is missing, ANY authenticated caller can mutate tiers.
        // Strategy: extract the CF block from the source and verify verifyAdmin appears in it.
        const match = cfSource.match(/exports\.entitlementSetTier\s*=[\s\S]*?(?=exports\.\w+\s*=|$)/);
        expect(match, 'Could not locate exports.entitlementSetTier in cloud-functions.js').not.toBeNull();
        expect(match[0], 'SECURITY FINDING: entitlementSetTier does NOT call verifyAdmin — any authenticated caller can mutate tiers')
            .toMatch(/verifyAdmin/);
    });

    it('entitlementGrantAddOn calls verifySuperAdmin (superAdmin-only add-on grant)', () => {
        // Grant is superAdmin-only (add-on grant is a financial operation in the billable system).
        const match = cfSource.match(/exports\.entitlementGrantAddOn\s*=[\s\S]*?(?=exports\.\w+\s*=|$)/);
        expect(match, 'Could not locate exports.entitlementGrantAddOn in cloud-functions.js').not.toBeNull();
        expect(match[0], 'SECURITY FINDING: entitlementGrantAddOn does NOT call verifySuperAdmin — any authenticated caller can grant add-ons')
            .toMatch(/verifySuperAdmin/);
    });

    it('entitlementCancelAddOn calls verifySuperAdmin (superAdmin-only add-on cancel)', () => {
        // Cancel is symmetric with grant — also superAdmin-only.
        const match = cfSource.match(/exports\.entitlementCancelAddOn\s*=[\s\S]*?(?=exports\.\w+\s*=|$)/);
        expect(match, 'Could not locate exports.entitlementCancelAddOn in cloud-functions.js').not.toBeNull();
        expect(match[0], 'SECURITY FINDING: entitlementCancelAddOn does NOT call verifySuperAdmin — any authenticated caller can cancel add-ons')
            .toMatch(/verifySuperAdmin/);
    });

    it('all four CFs call verifyAuthToken (authentication before authorization)', () => {
        // verifyAuthToken is the first layer; verifyAdmin/verifySuperAdmin is the second.
        // Both must be present. If verifyAuthToken is removed, unauthenticated callers reach the authz check.
        //
        // Anchor on the CALL form (`await verifyAuthToken(`), NOT a bare `verifyAuthToken`
        // substring — the latter also matches the `require('./auth')` import line, which
        // inflates the count and lets the floor slip (a CF could drop its call and stay green).
        const verifyAuthTokenCalls = (cfSource.match(/await verifyAuthToken\(/g) || []).length;
        // Exactly one call-site per CF: SetTier + GrantAddOn + CancelAddOn + GetEffective.
        expect(verifyAuthTokenCalls).toBeGreaterThanOrEqual(4);
    });
});
