'use strict';

/**
 * In-memory Firebase RTDB fake for entitlement resolver tests.
 *
 * Based on functions/billing/__tests__/helpers/fake-rtdb.js, with one extension:
 * `update(obj)` models RTDB MULTI-PATH update — keys may be slash-paths relative
 * to the ref, and each is written/replaced independently (siblings preserved).
 * This is what recomputeEntitlements relies on:
 *   db.ref().update({ 'subscriptions/uid/features': {...}, 'subscriptions/uid/limits': {...} })
 *
 * NOTE: transaction() here is a synchronous read-modify-write — faithful for
 * sequential/awaited writes, NOT real concurrent retry/abort (emulator-only).
 */

function makeFakeRtdb(seed = {}) {
    const store = JSON.parse(JSON.stringify(seed));
    let counter = 0;
    const pushKey = () => `k${String(++counter).padStart(6, '0')}`;
    const segs = (path) => String(path).split('/').filter(Boolean);

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
        const last = parts[parts.length - 1];
        if (val === null || val === undefined) delete node[last];
        else node[last] = val;
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
            push() { return makeRef(`${path}/${pushKey()}`); },
            async set(value) { setNode(path, value === undefined ? null : value); },
            // Multi-path-aware update: each key is a (possibly slash-) path relative
            // to this ref; each is written independently (RTDB merge-at-key semantics).
            async update(obj) {
                for (const k of Object.keys(obj)) {
                    const childPath = path ? `${path}/${k}` : k;
                    setNode(childPath, obj[k]);
                }
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
        ref: (path = '') => makeRef(path),
        _dump: () => JSON.parse(JSON.stringify(store)),
    };
}

module.exports = { makeFakeRtdb };
