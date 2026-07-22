/**
 * CRIT-09 PR-A — one-off sweep revoking the `allUsers` READ ACL from receipt
 * image objects made public by `receiptProcessor.js`'s (former) `makePublic()`
 * call. Spec: docs/plans/2026-07-22-crit09-receipts-remediation-design.md §3.
 *
 * These objects are ORPHANED (nothing in RTDB references them — the stored
 * `imageUrl` is the Twilio MediaUrl0), but they are world-readable and their
 * names are enumerable millisecond epochs. Revoking the ACL is what closes the
 * live exposure; per fork F1 (ratified 2026-07-22) objects are KEPT, not
 * deleted — they may be the only durable copies of the images.
 *
 * Usage (operator-run, needs ADC with storage admin on the bucket — e.g.
 * `gcloud auth application-default login`):
 *
 *   node revoke-public-receipt-acls.js                 # DRY-RUN (default): count + list, no mutation
 *   node revoke-public-receipt-acls.js --execute       # revoke allUsers on every public object
 *   node revoke-public-receipt-acls.js --prefix=x/     # override the swept prefixes (repeatable)
 *   node revoke-public-receipt-acls.js --bucket=name   # override the bucket
 *
 * CLOSURE CONTRACT (adversarial review 2026-07-22 — the exit code is the
 * closure evidence, so every way the sweep can silently fail must gate it):
 *   exit 0  = scanned > 0 AND no per-object errors AND (execute) every revoked
 *             object re-read as private (cache-immune `acl.get` 404) AND the
 *             bucket has NO public IAM binding (the vector an object sweep
 *             structurally cannot fix).
 *   exit 1  = any of the above failed — including `scanned === 0` (an empty
 *             listing is indistinguishable from wrong bucket/prefix or a
 *             credential that cannot list; it must never read as "clean").
 *   exit 2  = crash / auth failure.
 * The unauthenticated HTTP HEAD probes are CORROBORATION ONLY and never gate:
 * public objects are served with `Cache-Control: public, max-age=3600`, so a
 * 200 within the TTL after revocation is expected — the authoritative check is
 * the per-object ACL read. (LESSONS: gcs/public-acl-vs-rules,
 * security/cve-closure-verification.)
 *
 * Pagination: explicit `autoPaginate:false` + nextQuery loop. Verified against
 * vendored @google-cloud/storage@7.21.0 that autoPaginate defaults to true
 * (full set), but the explicit loop is default-independent and memory-bounded.
 * Logging is PII-free: object names and counts only.
 */

'use strict';

const https = require('https');

const DEFAULT_BUCKET = 'merakicaptiveportal-firebasedb.appspot.com';
const DEFAULT_PREFIXES = ['receipts/', 'receipt-templates/'];
const ALL_USERS = 'allUsers';
const PUBLIC_IAM_MEMBERS = ['allUsers', 'allAuthenticatedUsers'];
const PAGE_SIZE = 500;

function parseArgs(argv) {
    const prefixes = argv.filter((a) => a.startsWith('--prefix=')).map((a) => a.slice('--prefix='.length));
    const bucketArg = argv.find((a) => a.startsWith('--bucket='));
    return {
        execute: argv.includes('--execute'),
        prefixes: prefixes.length > 0 ? prefixes : DEFAULT_PREFIXES,
        bucketName: bucketArg ? bucketArg.slice('--bucket='.length) : DEFAULT_BUCKET,
    };
}

/** GCS ApiError carries the numeric HTTP status on `.code` (verified v7.21.0). */
function isNotFound(err) {
    return err && err.code === 404;
}

/** Iterate every object under a prefix via explicit pagination (default-independent). */
async function listAllFiles(bucket, prefix) {
    const all = [];
    let query = { prefix, autoPaginate: false, maxResults: PAGE_SIZE };
    while (query) {
        // With autoPaginate:false the promise resolves [files, nextQuery, apiResponse];
        // nextQuery is null on the last page.
        const [files, nextQuery] = await bucket.getFiles(query);
        all.push(...files);
        query = nextQuery || null;
    }
    return all;
}

/**
 * Sweep one prefix. Dry-run probes the ACL (`acl.get`); execute deletes it
 * (`acl.delete`) — both treat 404 as "already private" so re-runs are idempotent.
 * Captures the first public object name as the prefix's probe sample.
 */
async function sweepPrefix({ bucket, prefix, execute, log }) {
    const files = await listAllFiles(bucket, prefix);
    const result = {
        prefix,
        scanned: 0,
        publicFound: 0,
        revoked: 0,
        alreadyPrivate: 0,
        errors: [],
        revokedNames: [],
        samplePublicName: null,
    };

    for (const file of files) {
        result.scanned += 1;
        try {
            if (execute) {
                await file.acl.delete({ entity: ALL_USERS });
                result.revoked += 1;
                result.revokedNames.push(file.name);
                if (!result.samplePublicName) result.samplePublicName = file.name;
                log(`  revoked  ${file.name}`);
            } else {
                await file.acl.get({ entity: ALL_USERS });
                result.publicFound += 1;
                if (!result.samplePublicName) result.samplePublicName = file.name;
                log(`  PUBLIC   ${file.name}`);
            }
        } catch (err) {
            if (isNotFound(err)) {
                result.alreadyPrivate += 1;
            } else {
                result.errors.push(file.name);
                log(`  ERROR    ${file.name}: ${err.message}`);
            }
        }
    }
    return result;
}

async function sweepBucket({ bucket, prefixes, execute, log }) {
    const perPrefix = {};
    const totals = { scanned: 0, publicFound: 0, revoked: 0, alreadyPrivate: 0, errors: [] };
    for (const prefix of prefixes) {
        log(`Sweeping gs://${bucket.name}/${prefix} (${execute ? 'EXECUTE' : 'DRY-RUN'})`);
        const r = await sweepPrefix({ bucket, prefix, execute, log });
        perPrefix[prefix] = r;
        totals.scanned += r.scanned;
        totals.publicFound += r.publicFound;
        totals.revoked += r.revoked;
        totals.alreadyPrivate += r.alreadyPrivate;
        totals.errors = totals.errors.concat(r.errors);
    }
    return { perPrefix, totals };
}

/**
 * The bucket-level vector the object sweep cannot fix: a public IAM binding
 * makes every object fetchable regardless of object ACLs. Returns the members
 * found so the caller can GATE closure on it. Also surfaces UBLA/PAP metadata
 * as closure evidence (fine-grained ACL mode is implied by makePublic() having
 * worked, but print it rather than assume it).
 */
async function checkBucketPublicAccess(bucket) {
    const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });
    const publicBindings = (policy.bindings || [])
        .map((b) => ({ role: b.role, members: (b.members || []).filter((m) => PUBLIC_IAM_MEMBERS.includes(m)) }))
        .filter((b) => b.members.length > 0);
    const [metadata] = await bucket.getMetadata();
    const iamConfig = metadata.iamConfiguration || {};
    return {
        publicBindings,
        uniformBucketLevelAccess: Boolean(iamConfig.uniformBucketLevelAccess && iamConfig.uniformBucketLevelAccess.enabled),
        publicAccessPrevention: iamConfig.publicAccessPrevention || 'unspecified',
    };
}

/**
 * Cache-immune post-revocation verification: re-read the allUsers ACL on every
 * revoked object and require a 404. Returns names that are STILL public.
 */
async function verifyRevoked({ bucket, names }) {
    const stillPublic = [];
    for (const name of names) {
        try {
            await bucket.file(name).acl.get({ entity: ALL_USERS });
            stillPublic.push(name); // ACL still present — revocation did not stick
        } catch (err) {
            if (!isNotFound(err)) stillPublic.push(name); // can't prove private → fail closed
        }
    }
    return stillPublic;
}

function formatSummary({ totals }, { execute }) {
    const mode = execute ? 'EXECUTE' : 'DRY-RUN';
    return [
        `[${mode}] sweep complete — scanned: ${totals.scanned}, public: ${totals.publicFound}, ` +
            `revoked: ${totals.revoked}, already-private: ${totals.alreadyPrivate}, errors: ${totals.errors.length}`,
        totals.errors.length > 0 ? `  failed objects (re-run to retry): ${totals.errors.join(', ')}` : null,
    ]
        .filter(Boolean)
        .join('\n');
}

function objectUrl(bucketName, name) {
    const encodedPath = name.split('/').map(encodeURIComponent).join('/');
    return `https://storage.googleapis.com/${bucketName}/${encodedPath}`;
}

function defaultHeadRequester(url) {
    return new Promise((resolvePromise, reject) => {
        const req = https.request(url, { method: 'HEAD' }, (res) => {
            res.resume();
            resolvePromise({ statusCode: res.statusCode });
        });
        req.on('error', reject);
        req.end();
    });
}

/** Unauthenticated HEAD probe — corroboration only (cacheable; see header). */
async function probeHead(url, requester = defaultHeadRequester) {
    const res = await requester(url);
    return res.statusCode;
}

/**
 * Orchestration, extracted for testability. Returns the process exit code per
 * the CLOSURE CONTRACT in the header.
 */
async function run({ argv, bucket, bucketName, log, requester }) {
    const { execute, prefixes } = parseArgs(argv);

    const iam = await checkBucketPublicAccess(bucket);
    log(
        `Bucket access config — uniformBucketLevelAccess: ${iam.uniformBucketLevelAccess}, ` +
            `publicAccessPrevention: ${iam.publicAccessPrevention}, public IAM bindings: ${iam.publicBindings.length}`
    );
    if (iam.publicBindings.length > 0) {
        for (const b of iam.publicBindings) log(`  ⚠ PUBLIC IAM BINDING: ${b.role} -> ${b.members.join(', ')}`);
        log('An object-ACL sweep CANNOT close bucket-level public access — remove these bindings first.');
    }

    const result = await sweepBucket({ bucket, prefixes, execute, log });
    log(formatSummary(result, { execute }));

    let failed = false;

    if (result.totals.scanned === 0) {
        log('FAIL: listed 0 objects — wrong bucket/prefix, or credentials cannot list. Not treating as clean.');
        failed = true;
    }
    if (result.totals.errors.length > 0) failed = true;
    if (iam.publicBindings.length > 0) failed = true;

    if (execute) {
        const revokedNames = Object.values(result.perPrefix).flatMap((r) => r.revokedNames);
        const stillPublic = await verifyRevoked({ bucket, names: revokedNames });
        if (stillPublic.length > 0) {
            log(`FAIL: ${stillPublic.length} object(s) still carry (or could not be proven free of) the allUsers ACL:`);
            for (const name of stillPublic) log(`  STILL PUBLIC: ${name}`);
            failed = true;
        } else if (revokedNames.length > 0) {
            log(`Verified: allUsers ACL absent on all ${revokedNames.length} revoked object(s) (cache-immune ACL read).`);
        }

        for (const [prefix, r] of Object.entries(result.perPrefix)) {
            if (!r.samplePublicName) continue;
            const url = objectUrl(bucketName, r.samplePublicName);
            const status = await probeHead(url, requester);
            log(
                `Corroborating HEAD probe (${prefix}) ${url} -> HTTP ${status} ` +
                    '(non-gating: a 200 within the ~1h public-cache TTL is expected after revocation)'
            );
        }
    }

    if (!execute && !failed) log('Dry-run only — re-run with --execute to revoke the ACLs listed above.');
    if (execute) {
        log(
            failed
                ? 'CRIT-09 NOT CLOSED — resolve the failures above and re-run (idempotent).'
                : 'Closure evidence: scanned>0, zero errors, per-object ACL verification clean, no public IAM bindings.'
        );
    }
    return failed ? 1 : 0;
}

async function main() {
    const { bucketName } = parseArgs(process.argv.slice(2));
    // Lazy require so the pure helpers stay unit-testable without firebase-admin creds.
    const admin = require('firebase-admin');
    if (admin.apps.length === 0) {
        admin.initializeApp({ credential: admin.credential.applicationDefault(), storageBucket: bucketName });
    }
    const bucket = admin.storage().bucket(bucketName);
    process.exitCode = await run({ argv: process.argv.slice(2), bucket, bucketName, log: (l) => console.log(l) });
}

module.exports = {
    DEFAULT_BUCKET,
    DEFAULT_PREFIXES,
    PAGE_SIZE,
    parseArgs,
    isNotFound,
    listAllFiles,
    sweepPrefix,
    sweepBucket,
    checkBucketPublicAccess,
    verifyRevoked,
    formatSummary,
    objectUrl,
    probeHead,
    run,
};

if (require.main === module) {
    main().catch((err) => {
        console.error('Sweep failed:', err.message);
        process.exit(2);
    });
}
