import { describe, it, expect, vi } from 'vitest';

const {
    DEFAULT_PREFIXES,
    PAGE_SIZE,
    parseArgs,
    isNotFound,
    sweepPrefix,
    sweepBucket,
    checkBucketPublicAccess,
    verifyRevoked,
    formatSummary,
    objectUrl,
    probeHead,
    run,
} = require('../revoke-public-receipt-acls');

function notFoundError() {
    // Shape verified against vendored @google-cloud/storage@7.21.0 ApiError:
    // numeric HTTP status on `.code` (build/cjs/src/nodejs-common/util.js:106).
    const err = new Error('No such object ACL');
    err.code = 404;
    return err;
}

/** Fake GCS File whose allUsers ACL state drives get/delete behaviour. */
function fakeFile(name, { isPublic }) {
    const state = { isPublic };
    return {
        name,
        _state: state,
        acl: {
            get: vi.fn(async ({ entity }) => {
                expect(entity).toBe('allUsers');
                if (!state.isPublic) throw notFoundError();
                return [{ entity: 'allUsers', role: 'READER' }];
            }),
            delete: vi.fn(async ({ entity }) => {
                expect(entity).toBe('allUsers');
                if (!state.isPublic) throw notFoundError();
                state.isPublic = false; // revocation sticks, as in real GCS
                return [{}];
            }),
        },
    };
}

/**
 * Fake bucket with PAGED getFiles (mirrors autoPaginate:false → [files, nextQuery]),
 * a file() lookup for the verify pass, and IAM/metadata surfaces.
 */
function fakeBucket(filesByPrefix, { publicBindings = [], ubla = false, pap = 'inherited' } = {}) {
    const allFiles = Object.values(filesByPrefix).flat();
    return {
        name: 'test-bucket',
        getFiles: vi.fn(async (query) => {
            expect(query.autoPaginate).toBe(false);
            const files = filesByPrefix[query.prefix] || [];
            const start = query.__offset || 0;
            const page = files.slice(start, start + query.maxResults);
            const nextOffset = start + query.maxResults;
            const nextQuery = nextOffset < files.length ? { ...query, __offset: nextOffset } : null;
            return [page, nextQuery];
        }),
        file: vi.fn((name) => allFiles.find((f) => f.name === name)),
        iam: {
            getPolicy: vi.fn(async ({ requestedPolicyVersion }) => {
                expect(requestedPolicyVersion).toBe(3);
                return [{ bindings: publicBindings }];
            }),
        },
        getMetadata: vi.fn(async () => [
            { iamConfiguration: { uniformBucketLevelAccess: { enabled: ubla }, publicAccessPrevention: pap } },
        ]),
    };
}

function manyFiles(prefix, count, { isPublic }) {
    return Array.from({ length: count }, (_, i) => fakeFile(`${prefix}${i}_receipt.jpg`, { isPublic }));
}

describe('parseArgs', () => {
    it('defaults to dry-run (execute: false)', () => {
        expect(parseArgs([]).execute).toBe(false);
    });

    it('requires the explicit --execute flag to mutate', () => {
        expect(parseArgs(['--execute']).execute).toBe(true);
    });

    it('uses the two spec prefixes by default', () => {
        expect(parseArgs([]).prefixes).toEqual(DEFAULT_PREFIXES);
        expect(DEFAULT_PREFIXES).toEqual(['receipts/', 'receipt-templates/']);
    });

    it('accepts prefix overrides', () => {
        expect(parseArgs(['--prefix=foo/']).prefixes).toEqual(['foo/']);
    });
});

describe('isNotFound', () => {
    it('classifies GCS 404 ApiErrors', () => {
        expect(isNotFound(notFoundError())).toBe(true);
        expect(isNotFound(new Error('boom'))).toBe(false);
    });
});

describe('sweepPrefix — explicit pagination', () => {
    it('follows nextQuery to exhaustion instead of trusting one page', async () => {
        const files = manyFiles('receipts/', PAGE_SIZE + 3, { isPublic: false });
        const bucket = fakeBucket({ 'receipts/': files });

        const r = await sweepPrefix({ bucket, prefix: 'receipts/', execute: false, log: () => {} });

        expect(r.scanned).toBe(PAGE_SIZE + 3);
        expect(r.alreadyPrivate).toBe(PAGE_SIZE + 3);
        expect(bucket.getFiles).toHaveBeenCalledTimes(2); // two pages, processed per-page
    });
});

describe('sweepPrefix — dry-run', () => {
    it('counts public and already-private objects without mutating', async () => {
        const pub = fakeFile('receipts/1_receipt.jpg', { isPublic: true });
        const priv = fakeFile('receipts/2_receipt.jpg', { isPublic: false });
        const bucket = fakeBucket({ 'receipts/': [pub, priv] });

        const r = await sweepPrefix({ bucket, prefix: 'receipts/', execute: false, log: () => {} });

        expect(r).toMatchObject({ scanned: 2, publicFound: 1, alreadyPrivate: 1, revoked: 0 });
        expect(r.samplePublicName).toBe('receipts/1_receipt.jpg');
        expect(pub.acl.delete).not.toHaveBeenCalled();
        expect(priv.acl.delete).not.toHaveBeenCalled();
    });
});

describe('sweepPrefix — execute', () => {
    it('revokes allUsers on public objects and tolerates already-private (404) idempotently', async () => {
        const pub = fakeFile('receipts/1_receipt.jpg', { isPublic: true });
        const priv = fakeFile('receipts/2_receipt.jpg', { isPublic: false });
        const bucket = fakeBucket({ 'receipts/': [pub, priv] });

        const r = await sweepPrefix({ bucket, prefix: 'receipts/', execute: true, log: () => {} });

        expect(r).toMatchObject({ scanned: 2, revoked: 1, alreadyPrivate: 1 });
        expect(r.errors).toEqual([]);
        expect(r.revokedNames).toEqual(['receipts/1_receipt.jpg']);
        expect(pub.acl.delete).toHaveBeenCalledWith({ entity: 'allUsers' });
    });

    it('captures non-404 failures per object and continues the sweep', async () => {
        const bad = fakeFile('receipts/3_receipt.jpg', { isPublic: true });
        bad.acl.delete = vi.fn(async () => {
            throw new Error('backend unavailable');
        });
        const pub = fakeFile('receipts/4_receipt.jpg', { isPublic: true });
        const bucket = fakeBucket({ 'receipts/': [bad, pub] });

        const r = await sweepPrefix({ bucket, prefix: 'receipts/', execute: true, log: () => {} });

        expect(r.revoked).toBe(1);
        expect(r.errors).toEqual(['receipts/3_receipt.jpg']);
    });
});

describe('sweepBucket', () => {
    it('aggregates totals across both spec prefixes', async () => {
        const bucket = fakeBucket({
            'receipts/': [fakeFile('receipts/1.jpg', { isPublic: true })],
            'receipt-templates/': [
                fakeFile('receipt-templates/t/1.png', { isPublic: true }),
                fakeFile('receipt-templates/t/2.png', { isPublic: false }),
            ],
        });

        const r = await sweepBucket({ bucket, prefixes: DEFAULT_PREFIXES, execute: false, log: () => {} });

        expect(r.totals).toMatchObject({ scanned: 3, publicFound: 2, alreadyPrivate: 1, revoked: 0 });
        expect(Object.keys(r.perPrefix)).toEqual(DEFAULT_PREFIXES);
    });
});

describe('checkBucketPublicAccess', () => {
    it('surfaces public IAM bindings and iam config', async () => {
        const bucket = fakeBucket(
            {},
            {
                publicBindings: [
                    { role: 'roles/storage.objectViewer', members: ['allUsers', 'user:x@y.z'] },
                    { role: 'roles/storage.admin', members: ['user:x@y.z'] },
                ],
                ubla: false,
                pap: 'inherited',
            }
        );

        const r = await checkBucketPublicAccess(bucket);

        expect(r.publicBindings).toEqual([{ role: 'roles/storage.objectViewer', members: ['allUsers'] }]);
        expect(r.uniformBucketLevelAccess).toBe(false);
        expect(r.publicAccessPrevention).toBe('inherited');
    });
});

describe('verifyRevoked', () => {
    it('fails closed: reports objects whose ACL read does not 404', async () => {
        const stuck = fakeFile('receipts/stuck.jpg', { isPublic: true }); // delete never ran
        const clean = fakeFile('receipts/clean.jpg', { isPublic: false });
        const bucket = fakeBucket({ 'receipts/': [stuck, clean] });

        const stillPublic = await verifyRevoked({ bucket, names: ['receipts/stuck.jpg', 'receipts/clean.jpg'] });

        expect(stillPublic).toEqual(['receipts/stuck.jpg']);
    });
});

describe('objectUrl', () => {
    it('percent-encodes path segments without eating the slashes', () => {
        expect(objectUrl('b', 'receipts/1 x.jpg')).toBe('https://storage.googleapis.com/b/receipts/1%20x.jpg');
    });
});

describe('formatSummary', () => {
    it('names the mode and carries every counter', () => {
        const summary = formatSummary(
            { perPrefix: {}, totals: { scanned: 5, publicFound: 3, revoked: 0, alreadyPrivate: 2, errors: [] } },
            { execute: false }
        );
        expect(summary).toContain('DRY-RUN');
        expect(summary).toContain('scanned: 5');
        expect(summary).toContain('public: 3');
    });
});

describe('probeHead', () => {
    it('returns the status code from the injected requester', async () => {
        const requester = vi.fn(async () => ({ statusCode: 403 }));
        await expect(probeHead('https://storage.googleapis.com/b/receipts/x.jpg', requester)).resolves.toBe(403);
        expect(requester).toHaveBeenCalledWith('https://storage.googleapis.com/b/receipts/x.jpg');
    });
});

// ── The closure contract (review findings 1, 2, 4, 5, 6, 7) ─────────────────
describe('run — exit-code closure contract', () => {
    const okRequester = vi.fn(async () => ({ statusCode: 403 }));

    it('happy execute path exits 0: scanned>0, no errors, verify clean, no public IAM', async () => {
        const bucket = fakeBucket({
            'receipts/': [fakeFile('receipts/1.jpg', { isPublic: true })],
            'receipt-templates/': [fakeFile('receipt-templates/t/1.png', { isPublic: false })],
        });
        const code = await run({ argv: ['--execute'], bucket, bucketName: 'test-bucket', log: () => {}, requester: okRequester });
        expect(code).toBe(0);
    });

    it('exits 1 when the listing is empty — never reads nothing-listed as clean', async () => {
        const bucket = fakeBucket({});
        const code = await run({ argv: ['--execute'], bucket, bucketName: 'test-bucket', log: () => {}, requester: okRequester });
        expect(code).toBe(1);
    });

    it('exits 1 when a revoked object fails the cache-immune ACL re-read', async () => {
        const zombie = fakeFile('receipts/zombie.jpg', { isPublic: true });
        zombie.acl.delete = vi.fn(async ({ entity }) => {
            expect(entity).toBe('allUsers');
            return [{}]; // reports success but the ACL stays (state.isPublic remains true)
        });
        const bucket = fakeBucket({ 'receipts/': [zombie], 'receipt-templates/': [fakeFile('receipt-templates/x.png', { isPublic: false })] });
        const code = await run({ argv: ['--execute'], bucket, bucketName: 'test-bucket', log: () => {}, requester: okRequester });
        expect(code).toBe(1);
    });

    it('fast-fails (exit 1, no sweep) when uniformBucketLevelAccess is enabled — object ACLs do not apply', async () => {
        const bucket = fakeBucket({ 'receipts/': [fakeFile('receipts/1.jpg', { isPublic: true })] }, { ubla: true });
        const code = await run({ argv: ['--execute'], bucket, bucketName: 'test-bucket', log: () => {}, requester: okRequester });
        expect(code).toBe(1);
        expect(bucket.getFiles).not.toHaveBeenCalled(); // clear single message instead of a wall of per-object errors
    });

    it('exits 1 when the bucket carries a public IAM binding the sweep cannot fix', async () => {
        const bucket = fakeBucket(
            { 'receipts/': [fakeFile('receipts/1.jpg', { isPublic: true })], 'receipt-templates/': [] },
            { publicBindings: [{ role: 'roles/storage.objectViewer', members: ['allUsers'] }] }
        );
        const code = await run({ argv: ['--execute'], bucket, bucketName: 'test-bucket', log: () => {}, requester: okRequester });
        expect(code).toBe(1);
    });

    it('a 200 HEAD probe alone does NOT fail the run (cache-tolerant, non-gating)', async () => {
        const bucket = fakeBucket({
            'receipts/': [fakeFile('receipts/1.jpg', { isPublic: true })],
            'receipt-templates/': [],
        });
        const cachedRequester = vi.fn(async () => ({ statusCode: 200 }));
        const code = await run({ argv: ['--execute'], bucket, bucketName: 'test-bucket', log: () => {}, requester: cachedRequester });
        expect(code).toBe(0); // gate is the ACL re-read (clean here), not the cacheable HEAD
        expect(cachedRequester).toHaveBeenCalled();
    });

    it('dry-run with objects listed exits 0 and mutates nothing', async () => {
        const pub = fakeFile('receipts/1.jpg', { isPublic: true });
        const bucket = fakeBucket({ 'receipts/': [pub], 'receipt-templates/': [] });
        const code = await run({ argv: [], bucket, bucketName: 'test-bucket', log: () => {}, requester: okRequester });
        expect(code).toBe(0);
        expect(pub.acl.delete).not.toHaveBeenCalled();
    });
});
