/**
 * Firebase Service for Food Cost Module — STRIPPED (D4, 2026-07-25).
 *
 * This file once carried the module's full root-`stockUsage` CRUD (the GHOST
 * path — the live save path has written `locations/{locId}/stockUsage` since
 * v2.x, parent design G2/G3). The census (docs/plans/
 * 2026-07-25-ross-foodcost-d4-strip-design.md §2) found every export except
 * `getRecentStoreContext` importer-free once the dead consumers
 * (react-adapter.js, migration-helpers.js) were deleted, and prod root
 * `stockUsage` EMPTY — so the write path and the other readers are gone.
 *
 * `getRecentStoreContext` is kept byte-identical (sole live importer:
 * refactored-app-component.js:58): it queries the empty root node, always
 * takes the defaults branch in prod, and its consumer null-guards. It retires
 * together with the v1 surface (post-soak sweep).
 */

import {
    rtdb,
    ref,
    get,
    query,
    orderByChild,
    limitToLast
} from '../../../config/firebase-config.js';

// Base reference for stock usage data (LEGACY root path — read-only, empty in prod)
const STOCK_USAGE_REF = "stockUsage";

/**
 * Get the most recent store context (store name + order parameters) from the
 * legacy root stockUsage node. Returns defaults when the node is empty (always,
 * in prod) or on any error.
 *
 * @returns {Promise<Object>} - Store context with defaults as fallback
 */
export async function getRecentStoreContext() {
    try {
        const stockUsageRef = ref(rtdb, STOCK_USAGE_REF);
        const recentQuery = query(
            stockUsageRef,
            orderByChild('timestamp'),
            limitToLast(1)
        );
        const snapshot = await get(recentQuery);

        if (!snapshot.exists()) {
            console.log('No historical records found for store context, returning defaults');
            return {
                storeName: 'Main Store',
                daysToNextDelivery: 3,
                safetyStockPercentage: 20,
                criticalItemBuffer: 5
            };
        }

        const data = snapshot.val();
        const mostRecent = Object.values(data)[0];

        return {
            storeName: mostRecent.storeName || 'Main Store',
            daysToNextDelivery: mostRecent.daysToNextDelivery || 3,
            safetyStockPercentage: mostRecent.safetyStockPercentage || 20,
            criticalItemBuffer: mostRecent.criticalItemBuffer || 5
        };
    } catch (error) {
        console.error('Error getting recent store context:', error);
        return {
            storeName: 'Main Store',
            daysToNextDelivery: 3,
            safetyStockPercentage: 20,
            criticalItemBuffer: 5
        };
    }
}
