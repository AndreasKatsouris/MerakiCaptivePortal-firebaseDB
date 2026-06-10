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
