'use strict';
const { TRIAL_CENTS, trialGrantedPath } = require('./constants');

/**
 * One-time free-trial credit grant. Idempotent per uid via billing/trialGranted/{uid}.
 * CLAIM-FIRST (review #10): claim the marker via an RTDB transaction (create-if-absent)
 * so two concurrent first-access events (double-click / two tabs) can't both grant — only
 * the transaction winner proceeds to grant. A crash between claim and grant leaves the
 * marker set without the $1 grant (a visible, low-stakes stuck state — never a double).
 *
 * OPERATOR RECONCILIATION of a uid stuck at status 'claiming': check billing/grants/{uid}
 * for a row with reason 'first-run-trial' FIRST. If it exists, the credit landed and only
 * the marker update was lost — set the marker to status 'granted' (do NOT clear it;
 * clearing re-opens the claim and double-grants). If no grants row exists, the grant was
 * lost — clear the marker and the user can re-claim.
 * @returns {Promise<{granted:true, amountCents:number}|{granted:false, alreadyClaimed:true}>}
 */
async function claimTrial({ db, ledger, uid }) {
    const markRef = db.ref(trialGrantedPath(uid));
    const claim = await markRef.transaction((current) =>
        (current === null ? { status: 'claiming', at: Date.now() } : undefined),
    );
    if (!claim.committed) {
        return { granted: false, alreadyClaimed: true };
    }
    await ledger.grantCredit({ uid, amountCents: TRIAL_CENTS, grantedBy: 'trial', reason: 'first-run-trial' });
    await markRef.update({ status: 'granted', amountCents: TRIAL_CENTS, grantedAt: Date.now() });
    return { granted: true, amountCents: TRIAL_CENTS };
}

module.exports = { claimTrial };
