'use strict';
const { resolveBundle } = require('./bundles');
const { paymentEventPath } = require('./constants');

/**
 * Process a verified Paystack `charge.success` event into a one-time USD credit grant.
 * SOURCE OF TRUTH for grants. The grant amount is ALWAYS re-derived server-side from the
 * bundle (never the event amount).
 *
 * WRITE-BEFORE-EFFECT idempotency (review #1): we CLAIM the reference via an RTDB
 * transaction FIRST (atomic "create if absent"), then grant, then mark 'granted'. A
 * webhook retry that finds a 'granted' record acks-and-stops; one that finds a
 * 'processing' record (a crash between claim and grant) does NOT re-grant — it returns
 * 'processing' for manual review. This favours never-double-grant over never-under-grant
 * (an under-grant is a visible stuck 'processing' record an operator can reconcile; a
 * double-grant is silent money loss). The `uid` is trusted because paymentsInitTopup
 * wrote it from the verified Firebase Auth token — Paystack only echoes it back.
 *
 * On a grantCredit FAILURE we throw (the webhook returns 500 → Paystack retries; the
 * 'processing' claim makes the retry safe). Validation failures (bad bundle / amount)
 * are terminal — we mark 'failed' and return (200, no retry).
 *
 * @param {{db:object, ledger:object, event:object}} args  ledger = functions/billing/ledger
 * @returns {Promise<{status:'granted'|'ignored'|'processing'|'failed', reason?:string}>}
 */
async function processChargeSuccess({ db, ledger, event }) {
    const data = (event && event.data) || {};
    const { reference, amount, metadata } = data;
    const uid = metadata && metadata.uid;
    const bundleId = metadata && metadata.bundleId;

    if (!reference || !uid || !bundleId) {
        return { status: 'failed', reason: 'missing reference/uid/bundleId' };
    }

    const eventRef = db.ref(paymentEventPath(reference));

    // 1. CLAIM the reference atomically (create-if-absent). transaction() returning
    //    undefined ABORTS the write — so a second concurrent/retried webhook never
    //    overwrites an existing record.
    const claim = await eventRef.transaction((current) =>
        (current === null ? { uid, bundleId, status: 'processing', event: 'charge.success', at: Date.now() } : undefined),
    );
    if (!claim.committed) {
        const prior = claim.snapshot.val() || {};
        if (prior.status === 'granted') return { status: 'ignored', reason: 'already granted' };
        return { status: 'processing', reason: 'reference already claimed — manual review' };
    }

    // 2. Validate the bundle + the amount actually paid (terminal failures — mark + stop).
    let bundle;
    try {
        bundle = await resolveBundle(db, bundleId);
    } catch (e) {
        await eventRef.update({ status: 'failed', reason: e.message });
        return { status: 'failed', reason: e.message };
    }
    if (Number(amount) !== Number(bundle.zarChargeCents)) {
        await eventRef.update({ status: 'failed', reason: 'amount mismatch', paidZarCents: amount, expectedZarCents: bundle.zarChargeCents });
        return { status: 'failed', reason: 'amount mismatch' };
    }

    // 3. Grant (a throw here propagates → webhook 500 → safe retry against the claim).
    await ledger.grantCredit({ uid, amountCents: bundle.usdGrantCents, grantedBy: 'paystack', reason: `topup:${reference}` });

    // 4. Mark granted.
    await eventRef.update({ status: 'granted', usdGrantCents: bundle.usdGrantCents, zarChargeCents: bundle.zarChargeCents, grantedAt: Date.now() });
    return { status: 'granted' };
}

module.exports = { processChargeSuccess };
