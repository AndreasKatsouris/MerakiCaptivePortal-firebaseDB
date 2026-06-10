'use strict';
const { bundlePath, creditBundlesPath } = require('./constants');

/**
 * Resolve a single ACTIVE bundle by id. THROWS on unknown/inactive — the grant
 * amount must always come from here (server-side), never from the client.
 * @returns {Promise<{usdGrantCents:number, zarChargeCents:number, label:string}>}
 */
async function resolveBundle(db, bundleId) {
    const snap = await db.ref(bundlePath(bundleId)).once('value');
    const b = snap.val();
    if (!b) throw new Error(`Unknown bundle: ${bundleId}`);
    if (b.active !== true) throw new Error(`Bundle inactive: ${bundleId}`);
    return { usdGrantCents: b.usdGrantCents, zarChargeCents: b.zarChargeCents, label: b.label };
}

/** Active bundles for the UI, sorted by `sort` then id. */
async function listActiveBundles(db) {
    const snap = await db.ref(creditBundlesPath()).once('value');
    const all = snap.val() || {};
    return Object.keys(all)
        .filter((id) => all[id] && all[id].active === true)
        .map((id) => ({
            id,
            usdGrantCents: all[id].usdGrantCents,
            zarChargeCents: all[id].zarChargeCents,
            label: all[id].label,
            sort: all[id].sort || 0,
        }))
        .sort((x, y) => (x.sort - y.sort) || x.id.localeCompare(y.id));
}

module.exports = { resolveBundle, listActiveBundles };
