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

    it('does NOT re-grant a reference stuck in `processing` (write-before-effect, review #1)', async () => {
        // Simulate a crash between claim and grant: a 'processing' record already exists.
        const tree = TREE();
        tree.billing.paymentEvents = { ref_abc: { uid: 'u1', bundleId: 'usd20', status: 'processing', at: 1 } };
        const db = makeFakeRtdb(tree);
        const ledger = fakeLedger();
        const out = await processChargeSuccess({ db, ledger, event: chargeEvent() });
        expect(out.status).toBe('processing');
        expect(ledger.grantCredit).not.toHaveBeenCalled();
    });

    it('propagates a grantCredit failure (so the webhook 500s and Paystack retries)', async () => {
        const db = makeFakeRtdb(TREE());
        const ledger = { grantCredit: vi.fn().mockRejectedValue(new Error('RTDB unreachable')) };
        await expect(processChargeSuccess({ db, ledger, event: chargeEvent() })).rejects.toThrow('RTDB unreachable');
        // The claim record remains 'processing' so the retry is safe (no double-grant).
        const rec = (await db.ref('billing/paymentEvents/ref_abc').once('value')).val();
        expect(rec.status).toBe('processing');
    });

    it('fails terminally on a missing uid/bundleId/reference (no claim written)', async () => {
        const db = makeFakeRtdb(TREE());
        const ledger = fakeLedger();
        const out = await processChargeSuccess({ db, ledger, event: chargeEvent({ metadata: {} }) });
        expect(out.status).toBe('failed');
        expect(ledger.grantCredit).not.toHaveBeenCalled();
    });

    it('rejects an unsafe reference/bundleId before any RTDB path use (key injection)', async () => {
        const db = makeFakeRtdb(TREE());
        const ledger = fakeLedger();
        for (const bad of ['ref/evil', 'ref.evil', 'ref#1', 'ref$1', 'ref[1]']) {
            const out = await processChargeSuccess({ db, ledger, event: chargeEvent({ reference: bad }) });
            expect(out).toMatchObject({ status: 'failed', reason: 'unsafe reference/bundleId' });
        }
        const out2 = await processChargeSuccess({ db, ledger, event: chargeEvent({ metadata: { uid: 'u1', bundleId: 'usd20/active' } }) });
        expect(out2.status).toBe('failed');
        expect(ledger.grantCredit).not.toHaveBeenCalled();
    });

    it('rejects a non-success status or non-ZAR currency (terminal, no grant)', async () => {
        const db = makeFakeRtdb(TREE());
        const ledger = fakeLedger();
        const out1 = await processChargeSuccess({ db, ledger, event: chargeEvent({ status: 'failed' }) });
        expect(out1).toMatchObject({ status: 'failed', reason: 'unexpected charge status/currency' });
        const out2 = await processChargeSuccess({ db, ledger, event: chargeEvent({ currency: 'NGN', reference: 'ref_ngn' }) });
        expect(out2).toMatchObject({ status: 'failed', reason: 'unexpected charge status/currency' });
        expect(ledger.grantCredit).not.toHaveBeenCalled();
    });
});
