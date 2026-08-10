'use strict';

/**
 * In-memory Firebase RTDB fake for retentionPrune tests. Needed because none of the
 * existing fakes (payments/agent/entitlements copies) support a genuine child-VALUE
 * sort with startAt/endAt/limitToFirst — they only sort by key. retentionPrune's
 * wifiLogins/activeUsers pruning depends on orderByChild('timestamp') actually
 * ordering by the field's value (RTDB's null-before-any-string type ordering
 * included, so records missing the field are never matched by a String startAt).
 *
 * Supported surface: ref(path|'').once('value'), ref(path).update(multi-path),
 * ref(path).orderByKey()/orderByChild(field).startAt(v).endAt(v).limitToFirst(n).
 */

const TYPE_RANK = (v) => {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'boolean') return 1;
    if (typeof v === 'number') return 2;
    if (typeof v === 'string') return 3;
    return 4; // object/array — never used by retentionPrune's queries
};

function cmpOrderValue(a, b) {
    const ra = TYPE_RANK(a);
    const rb = TYPE_RANK(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return 0; // both null/missing
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

function makeFakeRtdb(seed = {}) {
    const store = JSON.parse(JSON.stringify(seed));
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
        if (parts.length === 0) return; // never used (no root set() in these tests)
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

    function orderValueOf(entry, q) {
        return q.orderByChild ? (entry && entry[q.orderByChild]) : undefined;
    }

    function applyQuery(val, q) {
        if (!val || typeof val !== 'object') return val;
        let entries = Object.entries(val);

        const keyOf = (k, v) => (q.orderByChild ? orderValueOf(v, q) : k);

        entries.sort((a, b) => {
            const va = keyOf(a[0], a[1]);
            const vb = keyOf(b[0], b[1]);
            const c = q.orderByChild ? cmpOrderValue(va, vb) : (va < vb ? -1 : va > vb ? 1 : 0);
            if (c !== 0) return c;
            return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; // stable tiebreak by key
        });

        if (q.startAt !== undefined) {
            entries = entries.filter(([k, v]) => {
                const ov = q.orderByChild ? orderValueOf(v, q) : k;
                return (q.orderByChild ? cmpOrderValue(ov, q.startAt) : (ov >= q.startAt ? 0 : -1)) >= 0;
            });
        }
        if (q.endAt !== undefined) {
            entries = entries.filter(([k, v]) => {
                const ov = q.orderByChild ? orderValueOf(v, q) : k;
                return (q.orderByChild ? cmpOrderValue(ov, q.endAt) : (ov <= q.endAt ? 0 : 1)) <= 0;
            });
        }
        if (q.limitToFirst != null) entries = entries.slice(0, q.limitToFirst);

        const out = {};
        entries.forEach(([k, v]) => { out[k] = v; });
        return out;
    }

    function snapshotOf(val, key) {
        return {
            key,
            val: () => (val === undefined ? null : val),
            exists: () => val !== undefined && val !== null,
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
            async update(obj) {
                for (const k of Object.keys(obj)) {
                    const childPath = path ? `${path}/${k}` : k;
                    setNode(childPath, obj[k]);
                }
            },
            orderByKey() { return makeRef(path, { ...(query || {}) }); },
            orderByChild(field) { return makeRef(path, { ...(query || {}), orderByChild: field }); },
            startAt(v) { return makeRef(path, { ...(query || {}), startAt: v }); },
            endAt(v) { return makeRef(path, { ...(query || {}), endAt: v }); },
            limitToFirst(n) { return makeRef(path, { ...(query || {}), limitToFirst: n }); },
        };
        return ref;
    }

    return {
        ref: (path = '') => makeRef(path),
        _dump: () => JSON.parse(JSON.stringify(store)),
    };
}

module.exports = { makeFakeRtdb };
