'use strict';

/**
 * D2 golden-master lattice inputs (design §7.1) — consumed by BOTH sides:
 *  - food-cost-golden-generator.test.js (runs the LIVE browser modules under
 *    public/js/modules/food-cost/ and writes/asserts food-cost-golden.json)
 *  - the CJS port's parity tests (T2/T3) which deep-equal the same JSON.
 *
 * Records are shaped like the real persisted stockUsage records — see the
 * writing CF ground truth at
 * public/js/modules/food-cost/database-operations.js:89-119.
 *
 * All timestamps are 08:00 UTC (= 10:00 SAST) and strictly BEFORE the pinned
 * now of 2026-07-20T10:00:00+02:00 (a Monday). 08:00 UTC is chosen so the
 * calendar day is identical in UTC and SAST — the live dow bucketing uses
 * local-timezone getDay() (design P8).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const PINNED_NOW_ISO = '2026-07-20T10:00:00+02:00';
const PINNED_NOW_MS = Date.parse(PINNED_NOW_ISO); // 2026-07-20T08:00:00.000Z

/** Epoch ms for 10:00 SAST (08:00 UTC) on the given calendar day. */
function ts(year, month, day) {
    return Date.UTC(year, month - 1, day, 8, 0, 0);
}

function isoDate(epochMs) {
    return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * Build one historical stockItems entry. Quantities reconcile:
 * closingQty = openingQty + purchaseQty - usage (negative usage therefore
 * INCREASES closing stock, matching how a stock-adjustment round-trips).
 * Pass includeUnitCost:false to omit the unitCost/costOfUsage fields entirely
 * (GT1 legacy round-trip shape).
 */
function stockItem({
    itemCode,
    description,
    category,
    supplierName,
    usage,
    periodDays,
    unitCost,
    unit,
    includeUnitCost,
    hasMissingUnitCost
}) {
    const openingQty = Math.max(usage, 0) + 10;
    const purchaseQty = Math.max(usage, 0);
    const closingQty = openingQty + purchaseQty - usage;
    const base = {
        itemCode,
        description,
        category,
        supplierName,
        unit: unit || 'ea',
        openingQty,
        purchaseQty,
        closingQty,
        usage,
        usagePerDay: periodDays > 0 ? usage / periodDays : 0
    };
    if (includeUnitCost === false) {
        return base; // NO unitCost field at all (GT1)
    }
    if (hasMissingUnitCost) {
        return {
            ...base,
            unitCost: 0,
            costOfUsage: 0,
            hasMissingUnitCost: true,
            unitCostCalculationMethod: 'missing',
            needsAttention: true
        };
    }
    return {
        ...base,
        unitCost,
        costOfUsage: usage * unitCost
    };
}

/** Full persisted stockUsage record shape (database-operations.js:89-119). */
function record({ timestamp, periodDays, stockItems }) {
    const closingDate = isoDate(timestamp);
    const openingDate = isoDate(timestamp - (periodDays - 1) * DAY_MS);
    const totalUsage = stockItems.reduce((sum, i) => sum + (i.usage || 0), 0);
    const totalCostOfUsage = stockItems.reduce(
        (sum, i) => sum + (i.costOfUsage || 0),
        0
    );
    return {
        userId: 'golden-fixture-uid',
        timestamp,
        formattedTimestamp: new Date(timestamp).toISOString(),
        selectedLocationId: '-OGoldenLoc001',
        storeName: 'Golden Fixture Bistro',
        openingDate,
        closingDate,
        daysToNextDelivery: 3,
        stockPeriodDays: periodDays,
        periodDays,
        storeContext: {
            name: 'Golden Fixture Bistro',
            locationId: '-OGoldenLoc001',
            periodDays,
            openingDate,
            closingDate
        },
        safetyStockPercentage: 20,
        criticalItemBuffer: 30,
        totalItems: stockItems.length,
        totalOpeningValue: 0,
        totalPurchases: 0,
        totalClosingValue: 0,
        totalUsage,
        totalCostOfUsage,
        salesAmount: 0,
        costPercentage: 0,
        stockItems
    };
}

/** Filler line so records carry more than just the item under test. */
function filler(periodDays) {
    return stockItem({
        itemCode: '99999',
        description: 'Coarse Salt 1kg',
        category: 'Dry Goods',
        supplierName: 'Bidfood SA',
        usage: 3,
        periodDays,
        unitCost: 18.5
    });
}

/** Weekly records (Mondays, periodDays 7) for one item + filler. */
function weeklyRecords(itemSpec, usages, endTimestamps) {
    return usages.map((usage, i) =>
        record({
            timestamp: endTimestamps[i],
            periodDays: 7,
            stockItems: [stockItem({ ...itemSpec, usage, periodDays: 7 }), filler(7)]
        })
    );
}

// Monday closing timestamps, weekly, all before pinned now.
const MONDAYS = [
    ts(2026, 6, 8),
    ts(2026, 6, 15),
    ts(2026, 6, 22),
    ts(2026, 6, 29),
    ts(2026, 7, 6),
    ts(2026, 7, 13)
];

const DEFAULT_PARAMS = {
    daysToNextDelivery: 3,
    safetyStockPercentage: 20,
    criticalItemBuffer: 30,
    coveringDays: 2
};

// ---------------------------------------------------------------------------
// dow22daily: 22 DAILY records 2026-06-28 (Sunday) .. 2026-07-19 (Sunday),
// Friday-spike usage. Fridays covered: Jul 3, Jul 10, Jul 17 → 3 data points
// on the delivery day (> 2, Q5). 22 >= 14 so dowPatterns exist.
// daysToNextDelivery 4 → delivery Friday 2026-07-24 from the pinned Monday.
// ---------------------------------------------------------------------------
const USAGE_BY_DOW = [4, 5, 5, 6, 7, 20, 9]; // Sun..Sat, Friday spike
const dowItemSpec = {
    itemCode: '20031',
    description: 'Fresh Hake Fillet 1kg',
    category: 'Seafood',
    supplierName: 'Ocean Fresh SA',
    unitCost: 78.9,
    unit: 'kg'
};
const dowRecords = Array.from({ length: 22 }, (_, i) => {
    const timestamp = ts(2026, 6, 28) + i * DAY_MS;
    const usage = USAGE_BY_DOW[new Date(timestamp).getUTCDay()];
    return record({
        timestamp,
        periodDays: 1,
        stockItems: [
            stockItem({ ...dowItemSpec, usage, periodDays: 1 }),
            filler(1)
        ]
    });
});

// ---------------------------------------------------------------------------
// Scenario lattice (plan T1). Each: { records, item, params }.
// missingCost additionally carries itemNoCost (GT1's "NO unitCost field at
// all" item — same records, second chain run in the generator).
// ---------------------------------------------------------------------------
const scenarios = {
    // No history at all → _getEmptyStatistics → advanced falls back to basic.
    noHistory: {
        records: [],
        item: {
            itemCode: '10001',
            description: 'Tomato Sauce 5L',
            category: 'Dry Goods',
            supplierName: 'Bidfood SA',
            unit: 'ea',
            openingQty: 30,
            purchaseQty: 6.5,
            closingQty: 12,
            usage: 24.5,
            usagePerDay: 3.5,
            unitCost: 89.5
        },
        params: { ...DEFAULT_PARAMS }
    },

    // Exactly 2 data points: advanced path fires (>= minimumHistoryRequired 2)
    // with the Q2 fallback weights (dataPoints < 5 → always 50/50) — Q2/Q6.
    thinHistory2: {
        records: weeklyRecords(
            {
                itemCode: '10245',
                description: 'Chicken Wings 2kg',
                category: 'Frozen Foods',
                supplierName: 'Chilled Distributors',
                unitCost: 145.0
            },
            [28, 35],
            [MONDAYS[4], MONDAYS[5]]
        ),
        item: {
            itemCode: '10245',
            description: 'Chicken Wings 2kg',
            category: 'Frozen Foods',
            supplierName: 'Chilled Distributors',
            unit: 'ea',
            openingQty: 20,
            purchaseQty: 21.5,
            closingQty: 10,
            usage: 31.5,
            usagePerDay: 4.5,
            unitCost: 145.0
        },
        params: { ...DEFAULT_PARAMS }
    },

    // 6 data points (>= 5) → confidence-based weighting branch.
    confidence5plus: {
        records: weeklyRecords(
            {
                itemCode: '11413',
                description: 'Lager 330ml',
                category: 'Beverages',
                supplierName: 'SAB Distribution',
                unitCost: 12.5
            },
            [150, 168, 145, 172, 160, 155],
            MONDAYS
        ),
        item: {
            itemCode: '11413',
            description: 'Lager 330ml',
            category: 'Beverages',
            supplierName: 'SAB Distribution',
            unit: 'ea',
            openingQty: 120,
            purchaseQty: 101,
            closingQty: 60,
            usage: 161,
            usagePerDay: 23,
            unitCost: 12.5
        },
        params: { ...DEFAULT_PARAMS }
    },

    // 22 daily records, Friday spike; delivery lands on a Friday (Q5, P8).
    dow22daily: {
        records: dowRecords,
        item: {
            ...dowItemSpec,
            openingQty: 40,
            purchaseQty: 46,
            closingQty: 30,
            usage: 56,
            usagePerDay: 8
        },
        params: { ...DEFAULT_PARAMS, daysToNextDelivery: 4 }
    },

    // closingQty 0 → Q7 stockout escalation (coveringDays → max(2×,7),
    // safetyStock% → max(1.5×,30)); varied usage keeps volatility > 0 so the
    // Q8 volatility branch fires too.
    stockout: {
        records: weeklyRecords(
            {
                itemCode: '10127',
                description: 'Beef Burger Patty 150g',
                category: 'Frozen Foods',
                supplierName: 'Meat Wholesalers SA',
                unitCost: 22.4
            },
            [70, 95, 60, 110, 85, 105],
            MONDAYS
        ),
        item: {
            itemCode: '10127',
            description: 'Beef Burger Patty 150g',
            category: 'Frozen Foods',
            supplierName: 'Meat Wholesalers SA',
            unit: 'ea',
            openingQty: 70,
            purchaseQty: 14,
            closingQty: 0,
            usage: 84,
            usagePerDay: 12,
            unitCost: 22.4
        },
        params: { ...DEFAULT_PARAMS }
    },

    // GT1/P4 lattice point: item flagged hasMissingUnitCost:true (unitCost 0)
    // PLUS itemNoCost with NO unitCost field at all (legacy round-trip shape).
    missingCost: {
        records: [0, 1, 2].map(i =>
            record({
                timestamp: [MONDAYS[3], MONDAYS[4], MONDAYS[5]][i],
                periodDays: 7,
                stockItems: [
                    stockItem({
                        itemCode: '30017',
                        description: 'Truffle Oil 250ml',
                        category: 'Condiments',
                        supplierName: 'Gourmet Imports',
                        usage: [4, 5, 6][i],
                        periodDays: 7,
                        hasMissingUnitCost: true
                    }),
                    stockItem({
                        itemCode: '30022',
                        description: 'House Spice Blend 1kg',
                        category: 'Condiments',
                        supplierName: 'Internal Kitchen',
                        usage: [10, 12, 11][i],
                        periodDays: 7,
                        includeUnitCost: false
                    }),
                    filler(7)
                ]
            })
        ),
        item: {
            itemCode: '30017',
            description: 'Truffle Oil 250ml',
            category: 'Condiments',
            supplierName: 'Gourmet Imports',
            unit: 'ea',
            openingQty: 6,
            purchaseQty: 1,
            closingQty: 2,
            usage: 5,
            usagePerDay: 5 / 7,
            unitCost: 0,
            hasMissingUnitCost: true,
            unitCostCalculationMethod: 'missing',
            needsAttention: true
        },
        itemNoCost: {
            itemCode: '30022',
            description: 'House Spice Blend 1kg',
            category: 'Condiments',
            supplierName: 'Internal Kitchen',
            unit: 'ea',
            openingQty: 8,
            purchaseQty: 7,
            closingQty: 4,
            usage: 11,
            usagePerDay: 11 / 7
            // deliberately NO unitCost field (GT1)
        },
        params: { ...DEFAULT_PARAMS }
    },

    // Q15: negative persisted usage — simple average includes negatives, the
    // time-weighted average excludes them (Q9), recompute guard doesn't fire.
    negativeUsage: {
        records: weeklyRecords(
            {
                itemCode: '40088',
                description: 'Sunflower Oil 20L',
                category: 'Dry Goods',
                supplierName: 'Bulk Oils SA',
                unitCost: 620.0
            },
            [-12, 18, -6, 15, 9],
            MONDAYS.slice(1)
        ),
        item: {
            itemCode: '40088',
            description: 'Sunflower Oil 20L',
            category: 'Dry Goods',
            supplierName: 'Bulk Oils SA',
            unit: 'ea',
            openingQty: 12,
            purchaseQty: 6.6,
            closingQty: 6,
            usage: 12.6,
            usagePerDay: 1.8,
            unitCost: 620.0
        },
        params: { ...DEFAULT_PARAMS }
    },

    // Identical usage every record → stdDev 0 → volatility 0 → the Q8
    // else-branch (basic numbers + insights bolted on, boolean Q13
    // trendAdjustment).
    volatilityOff: {
        records: weeklyRecords(
            {
                itemCode: '50010',
                description: 'Serviettes 500pk',
                category: 'Packaging',
                supplierName: 'PaperCo SA',
                unitCost: 65.0
            },
            [21, 21, 21, 21],
            MONDAYS.slice(2)
        ),
        item: {
            itemCode: '50010',
            description: 'Serviettes 500pk',
            category: 'Packaging',
            supplierName: 'PaperCo SA',
            unit: 'pk',
            openingQty: 15,
            purchaseQty: 15,
            closingQty: 9,
            usage: 21,
            usagePerDay: 3,
            unitCost: 65.0
        },
        params: { ...DEFAULT_PARAMS }
    },

    // isCritical + critical category (Dairy) → Q1/Q12 divergence: basic calc
    // includes criticalStock in forecastedDemand, the advanced volatility
    // branch drops it from requiredStock and clamps reOrderPoint to >= 0.
    criticalItem: {
        records: weeklyRecords(
            {
                itemCode: '60001',
                description: 'Full Cream Milk 2L',
                category: 'Dairy',
                supplierName: 'Clover SA',
                unitCost: 28.99
            },
            [98, 120, 88, 130, 105, 115],
            MONDAYS
        ),
        item: {
            itemCode: '60001',
            description: 'Full Cream Milk 2L',
            category: 'Dairy',
            supplierName: 'Clover SA',
            unit: 'ea',
            openingQty: 70,
            purchaseQty: 60,
            closingQty: 20,
            usage: 110,
            usagePerDay: 15.7,
            unitCost: 28.99,
            isCritical: true
        },
        params: { ...DEFAULT_PARAMS }
    }
};

module.exports = { PINNED_NOW_ISO, PINNED_NOW_MS, scenarios };
