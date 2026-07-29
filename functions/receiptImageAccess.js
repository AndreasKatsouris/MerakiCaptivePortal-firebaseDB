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

const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // ≤15 min per spec fork F2

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

/**
 * Mint a signed read URL for a receipt's privately-archived image.
 * @param {object} deps
 * @param {object} deps.rtdb - admin.database()-compatible instance (needs `.ref(path).once('value')`)
 * @param {object} deps.bucket - GCS bucket instance (needs `.file(path).getSignedUrl(...)`)
 * @param {string} deps.receiptId
 * @returns {Promise<{signedUrl: string, storagePath: string}|null>} null when
 *   the receipt has no storagePath (pre-PR-B record, archived only as a
 *   Twilio URL) or the storagePath is outside the expected prefix — caller
 *   falls back to the legacy `imageUrl` field either way.
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

    if (!storagePath.startsWith(EXPECTED_STORAGE_PREFIX)) {
        console.error(`[receiptImageAccess] refusing out-of-scope storagePath for receipt ${receiptId}: ${storagePath}`);
        return null;
    }

    const file = bucket.file(storagePath);
    const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + SIGNED_URL_TTL_MS,
    });

    return { signedUrl, storagePath };
}

module.exports = { getSignedReceiptImageUrl, SIGNED_URL_TTL_MS, EXPECTED_STORAGE_PREFIX };
