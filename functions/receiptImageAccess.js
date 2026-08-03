'use strict';

/**
 * CRIT-09 spec fork F2 (docs/plans/2026-07-22-crit09-receipts-remediation-design.md) —
 * serve admin-viewed receipt images via a short-TTL signed URL instead of the
 * Twilio media URL (unbounded durability) or a public GCS ACL (the original
 * CRIT-09 exposure). Pure core, deps injected — mirrors the bucket-as-param
 * shape in functions/scripts/revoke-public-receipt-acls.js — so it is
 * unit-testable without a live Firebase project.
 *
 * WIRING CONTRACT (mirrors receiptTemplateManager.js's uploadTemplateImage
 * docstring): callers PERSIST `storagePath`, never the signed URL — the URL
 * expires; a stored copy becomes a dead link with no regeneration path.
 */

const { safeToken } = require('./utils/log-safe');

const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // ≤15 min per spec fork F2

// V4 is pinned explicitly: @google-cloud/storage's DEFAULT_SIGNING_VERSION is
// still the deprecated 'v2' (signer.js:63 in 7.21.0), so omitting this silently
// downgrades the scheme the spec asked for. Same class as the predefinedAcl pin
// in receiptProcessor.js — never let a security property ride a library default.
const SIGNING_VERSION = 'v4';

// Every storagePath downloadAndStoreImage() (receiptProcessor.js) ever writes
// starts with this prefix. `receipts` root `.write` is currently `auth != null`
// with no child validation (live Critical bug-triage row, 2026-07-28), so a
// non-admin tenant CAN plant an arbitrary storagePath on their own receipt
// record. Without this check, an admin merely VIEWING that poisoned receipt
// would have this admin-only CF mint a signed URL for ANY object in the
// bucket — turning an admin-gated endpoint into an arbitrary-object-read
// primitive. Refusing anything outside the expected prefix keeps the blast
// radius to "receipts objects only", independent of the rules fix.
const EXPECTED_STORAGE_PREFIX = 'receipts/';

// The SAME tenant-writability that motivates the prefix check makes storagePath
// unsafe to interpolate into a log line or to call string methods on:
//   (a) a `\n` inside it splits the Cloud Run entry, so the attacker forges
//       arbitrary log records — and because this line only fires on the
//       refusal branch, the attacker also chooses WHEN it fires
//       (LESSONS 2026-07-26, observability/alert-as-attack-surface);
//   (b) a non-string value (`storagePath: 12345`, or an object) makes
//       .startsWith() throw a TypeError, which the CF turns into a 500 that
//       echoes error.message — a remotely-triggerable error channel.
// Both are closed below: shape-check before any string method, safeToken before
// any interpolation. Object-store keys are ASCII paths, so this is strict.
const STORAGE_PATH_RE = /^[A-Za-z0-9._/-]{1,256}$/;
const RECEIPT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Mint a signed read URL for a receipt's privately-archived image.
 * @param {object} deps
 * @param {object} deps.rtdb - admin.database()-compatible instance (needs `.ref(path).once('value')`)
 * @param {object} deps.bucket - GCS bucket instance (needs `.file(path).getSignedUrl(...)`)
 * @param {string} deps.receiptId
 * @returns {Promise<{signedUrl: string, storagePath: string}|null>} null when
 *   the receipt has no storagePath (pre-PR-B record, archived only as a
 *   Twilio URL), or the storagePath is not a string, or it is outside the
 *   expected prefix — caller falls back to the legacy `imageUrl` in every case.
 */
async function getSignedReceiptImageUrl({ rtdb, bucket, receiptId }) {
    if (!receiptId) {
        throw new Error('receiptId is required');
    }

    const snapshot = await rtdb.ref(`receipts/${receiptId}/storagePath`).once('value');
    const storagePath = snapshot.val();
    if (!storagePath) {
        return null;
    }

    // Shape-check BEFORE any string method — see STORAGE_PATH_RE's comment.
    if (typeof storagePath !== 'string' || !storagePath.startsWith(EXPECTED_STORAGE_PREFIX)) {
        console.error('[receiptImageAccess] refusing out-of-scope storagePath', {
            receiptId: safeToken(receiptId, RECEIPT_ID_RE),
            storagePath: safeToken(storagePath, STORAGE_PATH_RE),
        });
        return null;
    }

    const file = bucket.file(storagePath);
    const [signedUrl] = await file.getSignedUrl({
        version: SIGNING_VERSION,
        action: 'read',
        expires: Date.now() + SIGNED_URL_TTL_MS,
    });

    return { signedUrl, storagePath };
}

module.exports = {
    getSignedReceiptImageUrl,
    SIGNED_URL_TTL_MS,
    EXPECTED_STORAGE_PREFIX,
    SIGNING_VERSION,
};
