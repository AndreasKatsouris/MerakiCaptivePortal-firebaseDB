import { describe, it, expect, vi } from 'vitest';

const {
    getSignedReceiptImageUrl,
    SIGNED_URL_TTL_MS,
    SIGNING_VERSION,
} = require('../receiptImageAccess');

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

    // V4 is pinned explicitly because @google-cloud/storage still defaults to
    // the deprecated v2 scheme — a security property must never ride a library
    // default (same class as receiptProcessor.js's predefinedAcl pin).
    it('pins the v4 signing scheme rather than inheriting the library default (v2)', async () => {
        const rtdb = fakeRtdb({ 'receipt-1': 'receipts/uuid-1.jpg' });
        const bucket = fakeBucket({});

        await getSignedReceiptImageUrl({ rtdb, bucket, receiptId: 'receipt-1' });

        const fileHandle = bucket.file.mock.results[0].value;
        expect(fileHandle.getSignedUrl.mock.calls[0][0].version).toBe('v4');
        expect(SIGNING_VERSION).toBe('v4');
    });

    // Both of the following exploit the SAME tenant-writability as the test
    // above: `receipts` root .write is `auth != null` with no child rules, so
    // the value of storagePath is fully attacker-chosen — including its TYPE.
    it('SECURITY: a non-string storagePath returns null instead of throwing (a TypeError would surface as a 500 echoing error.message)', async () => {
        const bucket = fakeBucket({});

        for (const planted of [12345, true, { toString: 1, valueOf: 2 }, ['receipts/x.jpg']]) {
            const rtdb = fakeRtdb({ 'poisoned-receipt': planted });
            const result = await getSignedReceiptImageUrl({ rtdb, bucket, receiptId: 'poisoned-receipt' });
            expect(result).toBeNull();
        }
        expect(bucket.file).not.toHaveBeenCalled();
    });

    it('SECURITY: never interpolates a raw attacker-controlled storagePath into the refusal log line (newline → forged Cloud Run entries)', async () => {
        const forged = 'evil/x.jpg\n[receiptImageAccess] refusing out-of-scope storagePath receipt=all-clear';
        const rtdb = fakeRtdb({ 'poisoned-receipt': forged });
        const bucket = fakeBucket({});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const result = await getSignedReceiptImageUrl({ rtdb, bucket, receiptId: 'poisoned-receipt' });
            expect(result).toBeNull();

            expect(errorSpy).toHaveBeenCalledTimes(1);
            const logged = JSON.stringify(errorSpy.mock.calls[0]);
            expect(logged).not.toContain('all-clear');   // no attacker text at all
            expect(logged).not.toContain('\\n');         // no line split
            expect(errorSpy.mock.calls[0][1]).toMatchObject({ storagePath: 'invalid' });
        } finally {
            errorSpy.mockRestore();
        }
    });
});
