// public/js/utils/html-escape.js
//
// Canonical shared HTML-escape helper for v1 (innerHTML-building) surfaces.
// Vue/Hi-Fi v2 surfaces do NOT need this — `{{ }}` auto-escapes; there the rule
// is "never v-html on server/tenant content" (LESSONS 2026-06-04, vue/escaping).
//
// There are ~10 near-identical copies of this function scattered across
// public/ (food-cost/utilities.js, modules/ross/index.js, googleReviews.js,
// whatsapp-message-history.js, several inline in HTML pages…). This file is the
// intended convergence point; existing copies are left alone deliberately —
// consolidating them is its own PR, not a rider on a receipts fix. New v1 code
// should import from here rather than adding an eleventh copy.
//
// DOM-free by design: `document.createElement`-based escapers (e.g.
// modules/compliance/utils/html-escape.js) throw under this repo's vitest
// config, which runs `environment: 'node'` — so they cannot be guard-tested.

/**
 * Escape a value for interpolation into innerHTML.
 *
 * Escapes all five of `& < > " '`, which makes the result safe in BOTH element
 * content and quoted-attribute position — callers don't have to pick a variant
 * per context, which is where this class of bug usually reappears.
 *
 * @param {*} value - anything coercible to string; null/undefined → ''
 * @returns {string}
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Allowlist a URL for use in a `src`/`href` attribute: ABSOLUTE http(s) only.
 *
 * Escaping alone stops attribute breakout but not scheme abuse, and the two
 * failure modes want different answers — a bad scheme should yield NO element,
 * not an escaped-but-still-live one.
 *
 * Parsed WITHOUT a base URL on purpose. Passing a base makes `new URL()`
 * resolve anything relative, so garbage like `'not a url'` comes back as
 * `https://<base>/not%20a%20url` and the protocol check passes — the guard
 * would allowlist exactly the inputs it exists to reject. (Caught by
 * tests/unit/receipt-details-html.test.js on the first run.) Every URL this
 * repo feeds it is absolute: GCS signed URLs and Twilio media URLs both are.
 *
 * @param {*} value
 * @returns {string|null} the original string if it is an absolute http(s) URL, else null
 */
export function safeHttpUrl(value) {
    if (typeof value !== 'string') return null;
    try {
        const { protocol } = new URL(value);
        return (protocol === 'http:' || protocol === 'https:') ? value : null;
    } catch {
        return null;
    }
}
