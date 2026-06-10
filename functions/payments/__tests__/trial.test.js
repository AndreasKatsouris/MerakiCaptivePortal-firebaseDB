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

    it('does not re-grant a uid stuck in `claiming` (crash between claim and grant)', async () => {
        const db = makeFakeRtdb({ billing: { trialGranted: { u1: { status: 'claiming', at: 1 } } } });
        const ledger = fakeLedger();
        const out = await claimTrial({ db, ledger, uid: 'u1' });
        expect(out).toEqual({ granted: false, alreadyClaimed: true });
        expect(ledger.grantCredit).not.toHaveBeenCalled();
    });
});
