import { describe, it, expect, vi } from 'vitest';

const { getSignedReceiptImageUrl, SIGNED_URL_TTL_MS } = require('../receiptImageAccess');

function fakeRtdbSnapshot(storagePath) {
    return {
        val: () => storagePath ?? null,
    };
}

function fakeRtdb(storagePathByReceiptId) {
    return {
        ref: vi.fn((path) => {
            const match = /^receipts\/([^/]+)\/storagePath$/.exec(path);
            expect(match, `unexpected rtdb path: ${path}`).not.toBeNull();
            const [, receiptId] = match;
            return {
                once: vi.fn(async (eventType) => {
                    expect(eventType).toBe('value');
                    return fakeRtdbSnapshot(storagePathByReceiptId[receiptId]);
                }),
            };
        }),
    };
}

function fakeBucket(signedUrlByPath) {
    return {
        file: vi.fn((path) => ({
            getSignedUrl: vi.fn(async (opts) => {
                expect(opts.action).toBe('read');
                expect(typeof opts.expires).toBe('number');
                return [signedUrlByPath[path] || `https://signed.example/${path}`];
            }),
        })),
    };
}

describe('getSignedReceiptImageUrl', () => {
    it('throws when receiptId is missing', async () => {
        const rtdb = fakeRtdb({});
        const bucket = fakeBucket({});
        await expect(getSignedReceiptImageUrl({ rtdb, bucket, receiptId: '' }))
            .rejects.toThrow('receiptId is required');
    });

    it('returns null when the receipt has no storagePath (pre-PR-B record)', async () => {
        const rtdb = fakeRtdb({ 'legacy-receipt': null });
        const bucket = fakeBucket({});
        const result = await getSignedReceiptImageUrl({ rtdb, bucket, receiptId: 'legacy-receipt' });
        expect(result).toBeNull();
        expect(bucket.file).not.toHaveBeenCalled();
    });

    it('mints a signed URL for a receipt with a storagePath (happy path)', async () => {
        const rtdb = fakeRtdb({ 'receipt-1': 'receipts/uuid-1.jpg' });
        const bucket = fakeBucket({ 'receipts/uuid-1.jpg': 'https://signed.example/receipts/uuid-1.jpg?sig=abc' });

        const before = Date.now();
        const result = await getSignedReceiptImageUrl({ rtdb, bucket, receiptId: 'receipt-1' });
        const after = Date.now();

        expect(result).toEqual({
            signedUrl: 'https://signed.example/receipts/uuid-1.jpg?sig=abc',
            storagePath: 'receipts/uuid-1.jpg',
        });
        expect(bucket.file).toHaveBeenCalledWith('receipts/uuid-1.jpg');

        // TTL bound: the expires timestamp passed to getSignedUrl is ≤15 min out (spec fork F2).
        const fileHandle = bucket.file.mock.results[0].value;
        const expiresArg = fileHandle.getSignedUrl.mock.calls[0][0].expires;
        expect(expiresArg).toBeGreaterThanOrEqual(before + SIGNED_URL_TTL_MS - 1000);
        expect(expiresArg).toBeLessThanOrEqual(after + SIGNED_URL_TTL_MS);
    });

    it('exposes a TTL of at most 15 minutes', () => {
        expect(SIGNED_URL_TTL_MS).toBeLessThanOrEqual(15 * 60 * 1000);
    });

    it('SECURITY: refuses to sign a storagePath outside receipts/ — the receipts root .write is auth!=null with no child validation, so a non-admin can plant an arbitrary storagePath on their own record', async () => {
        const rtdb = fakeRtdb({ 'poisoned-receipt': 'receipt-templates/some-other-tenant-secret.jpg' });
        const bucket = fakeBucket({});
        const result = await getSignedReceiptImageUrl({ rtdb, bucket, receiptId: 'poisoned-receipt' });
        expect(result).toBeNull();
        expect(bucket.file).not.toHaveBeenCalled();
    });
});
