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
