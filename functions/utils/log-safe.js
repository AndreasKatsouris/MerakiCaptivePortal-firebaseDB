'use strict';

/**
 * Log-safe interpolation of untrusted values.
 *
 * Extracted from whatsappStatusCallback.js (#194) so that every surface which
 * interpolates attacker-controlled data into a log line shares ONE
 * implementation — two copies of a security primitive is how they diverge
 * (same reasoning as the shared-auth-helper backlog item).
 *
 * The threat (LESSONS 2026-07-26, observability/alert-as-attack-surface): an
 * unsanitized newline inside an attacker-controlled field splits the entry on
 * Cloud Run, letting the attacker emit byte-perfect forged records into the
 * very log stream an operator alerts on — or bury real ones under volume. The
 * signal built to DETECT a problem becomes the tool to manufacture and mask it.
 */

/**
 * Collapse an untrusted value to a short, single-line, log-safe token.
 * Anything outside the whitelist becomes `invalid` — never partially-stripped
 * attacker text, which would still let fragments through. Objects short-circuit
 * before `String()` because a crafted `{toString:1,valueOf:2}` throws on
 * coercion, which is itself a remotely-triggerable 500 (corollary (b)).
 *
 * @param {*} value - the untrusted value
 * @param {RegExp} pattern - anchored whitelist the stringified value must match
 * @param {string} [fallback] - substituted for null/undefined
 * @returns {string}
 */
function safeToken(value, pattern, fallback = 'unknown') {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return 'invalid'; // objects can throw on coercion
    const s = String(value);
    return pattern.test(s) ? s : 'invalid';
}

module.exports = { safeToken };
