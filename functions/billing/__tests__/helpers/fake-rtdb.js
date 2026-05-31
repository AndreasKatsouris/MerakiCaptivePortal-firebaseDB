'use strict';

/**
 * Minimal in-memory Firebase RTDB fake for ledger unit tests.
 *
 * Supports exactly the surface ledger.js uses:
 *   ref(path).once('value')               → snapshot {val, exists, key, forEach}
 *   ref(path).push()                       → ref with a generated, ascending .key
 *   ref(path).set(value) / update(obj)
 *   ref(path).transaction(fn)              → atomic read-modify-write
 *   ref(path).orderByKey().endBefore(k).limitToLast(n).once('value')
 *
 * Push keys are zero-padded counters (`k000001`, …) so lexicographic key order
 * equals insertion order — matching RTDB's time-ordered push keys, which makes
 * orderByKey()/pagination deterministic in tests.
 *
 * NOTE: transaction() here is a synchronous read-modify-write — faithful for
 * sequential/await-serialised debits, but it does NOT reproduce real RTDB
 * transaction retry/abort under genuine concurrent writers. True concurrency
 * fidelity requires the RTDB emulator (documented in the build plan).
 */

function makeFakeRtdb(seed = {}) {
    const store = JSON.parse(JSON.stringify(seed));
    let counter = 0;
    const pushKey = () => `k${String(++counter).padStart(6, '0')}`;

    const segs = (path) => path.split('/').filter(Boolean);

    function getNode(path) {
        let node = store;
        for (const s of segs(path)) {
            if (node == null || typeof node !== 'object') return undefined;
            node = node[s];
        }
        return node;
    }

    function setNode(path, val) {
        const parts = segs(path);
        let node = store;
        for (let i = 0; i < parts.length - 1; i++) {
            const s = parts[i];
            if (node[s] == null || typeof node[s] !== 'object') node[s] = {};
            node = node[s];
        }
        if (val === null || val === undefined) {
            delete node[parts[parts.length - 1]];
        } else {
            node[parts[parts.length - 1]] = val;
        }
    }

    function applyQuery(val, q) {
        if (!val || typeof val !== 'object') return val;
        let keys = Object.keys(val).sort();
        if (q.endBefore != null) keys = keys.filter((k) => k < q.endBefore);
        if (q.limitToLast != null) keys = keys.slice(-q.limitToLast);
        const out = {};
        keys.forEach((k) => { out[k] = val[k]; });
        return out;
    }

    function snapshotOf(val, key) {
        return {
            key,
            val: () => (val === undefined ? null : val),
            exists: () => val !== undefined && val !== null,
            forEach: (cb) => {
                if (val && typeof val === 'object') {
                    Object.keys(val).sort().forEach((k) => cb(snapshotOf(val[k], k)));
                }
            },
        };
    }

    function makeRef(path, query) {
        const key = segs(path).pop();
        const ref = {
            key,
            async once() {
                let val = getNode(path);
                if (query) val = applyQuery(val, query);
                return snapshotOf(val, key);
            },
            push() {
                return makeRef(`${path}/${pushKey()}`);
            },
            async set(value) {
                setNode(path, value === undefined ? null : value);
            },
            async update(obj) {
                const cur = getNode(path);
                setNode(path, { ...(cur && typeof cur === 'object' ? cur : {}), ...obj });
            },
            async transaction(fn) {
                const current = getNode(path);
                const next = fn(current === undefined ? null : current);
                setNode(path, next);
                return { committed: true, snapshot: snapshotOf(next, key) };
            },
            orderByKey() { return makeRef(path, { ...(query || {}) }); },
            endBefore(k) { return makeRef(path, { ...(query || {}), endBefore: k }); },
            limitToLast(n) { return makeRef(path, { ...(query || {}), limitToLast: n }); },
        };
        return ref;
    }

    return {
        ref: (path) => makeRef(path),
        _dump: () => JSON.parse(JSON.stringify(store)),
    };
}

module.exports = { makeFakeRtdb };
