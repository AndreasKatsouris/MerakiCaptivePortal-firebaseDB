'use strict';

/**
 * Tests for the rossAgent-aware auth helper (askRoss slice 3 phase 2).
 *
 * verifyRossAgentAccess admits admins + any Ross-entitled user (rossAgent OR the
 * legacy rossBasic/rossAdvanced flags), and denies the un-entitled. It is the auth
 * gate for the new rossChat CF — the existing verifyUserOrAdmin does NOT recognise
 * `features.rossAgent`, so a rossAgent-only user would be wrongly denied (spec
 * review #4). Uses the in-memory RTDB fake injected via ross.__setDbForTests.
 */

const ross = require('../ross');
const { makeFakeRtdb } = require('../agent/__tests__/helpers/fake-rtdb');

function seed(extra = {}) {
    return makeFakeRtdb(extra);
}

afterEach(() => {
    // Reset the seam so a leaked fake can't bleed into other suites.
    ross.__setDbForTests(null);
});

describe('verifyRossAgentAccess', () => {
    it('admits a super-admin (admins/{uid}.superAdmin === true)', async () => {
        ross.__setDbForTests(seed({ admins: { u1: { superAdmin: true } } }));
        await expect(ross.verifyRossAgentAccess({ uid: 'u1' }))
            .resolves.toEqual({ uid: 'u1', isAdmin: true, isSuperAdmin: true });
    });

    it('admits a non-super admin (admins/{uid} exists, no superAdmin flag)', async () => {
        ross.__setDbForTests(seed({ admins: { u1: { role: 'ops' } } }));
        await expect(ross.verifyRossAgentAccess({ uid: 'u1' }))
            .resolves.toEqual({ uid: 'u1', isAdmin: true, isSuperAdmin: false });
    });

    it('admits a rossAgent-entitled owner (the new entitlement)', async () => {
        ross.__setDbForTests(seed({ subscriptions: { u1: { features: { rossAgent: true } } } }));
        await expect(ross.verifyRossAgentAccess({ uid: 'u1' }))
            .resolves.toEqual({ uid: 'u1', isAdmin: false, isSuperAdmin: false });
    });

    it('admits a legacy rossBasic owner (continuity — pre-rossAgent flag)', async () => {
        ross.__setDbForTests(seed({ subscriptions: { u1: { features: { rossBasic: true } } } }));
        await expect(ross.verifyRossAgentAccess({ uid: 'u1' }))
            .resolves.toEqual({ uid: 'u1', isAdmin: false, isSuperAdmin: false });
    });

    it('admits a legacy rossAdvanced owner', async () => {
        ross.__setDbForTests(seed({ subscriptions: { u1: { features: { rossAdvanced: true } } } }));
        await expect(ross.verifyRossAgentAccess({ uid: 'u1' }))
            .resolves.toEqual({ uid: 'u1', isAdmin: false, isSuperAdmin: false });
    });

    it('denies an authenticated user with no admin record and no Ross feature', async () => {
        ross.__setDbForTests(seed({ subscriptions: { u1: { features: { foodCost: true } } } }));
        await expect(ross.verifyRossAgentAccess({ uid: 'u1' })).rejects.toThrow(/Ross agent not available/);
    });

    it('denies a user with no subscription record at all', async () => {
        ross.__setDbForTests(seed({}));
        await expect(ross.verifyRossAgentAccess({ uid: 'nobody' })).rejects.toThrow(/Ross agent not available/);
    });
});
