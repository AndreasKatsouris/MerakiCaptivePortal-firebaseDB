// public/js/receipt-management/receipt-image-url.js
//
// CRIT-09 spec fork F2 (queue card Q7): resolve the src for an admin-viewed
// receipt image. Records archived by receiptProcessor.js's
// downloadAndStoreImage() carry a private `storagePath` — those must be
// served via a short-TTL signed URL minted server-side (never persisted).
// Pre-PR-B records have no `storagePath` and fall back to the legacy
// (Twilio-hosted) `imageUrl` field.

const FUNCTIONS_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net';

/**
 * @param {object} receipt - the receipts/{id} record (needs imageUrl and/or storagePath)
 * @param {string} receiptId
 * @param {string} idToken - caller's Firebase Auth ID token (admin-only CF)
 * @returns {Promise<string|null>} an image src, or null if none is available
 */
export async function resolveReceiptImageSrc(receipt, receiptId, idToken) {
    if (!receipt?.storagePath) {
        return receipt?.imageUrl || null;
    }

    try {
        const response = await fetch(`${FUNCTIONS_URL}/getReceiptImageUrl`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ receiptId })
        });

        if (!response.ok) {
            throw new Error(`getReceiptImageUrl failed: ${response.status}`);
        }

        const { signedUrl } = await response.json();
        return signedUrl || receipt.imageUrl || null;
    } catch (error) {
        console.error('[receipt-image-url] falling back to imageUrl:', error);
        return receipt.imageUrl || null;
    }
}
