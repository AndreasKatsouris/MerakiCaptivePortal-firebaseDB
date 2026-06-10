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
    if (rawBody == null) return false; // e.g. non-POST probe with no body — reject, don't throw
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
