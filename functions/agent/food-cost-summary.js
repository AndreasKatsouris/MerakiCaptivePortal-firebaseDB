'use strict';

/**
 * Pure food-cost summariser for the askRoss reader (Deliverable 1).
 *
 * Data-in / data-out — NO Firebase, NO Vue, NO I/O. The adapter
 * (tools.js getFoodCostSummary) reads `locations/{loc}/stockUsage` and passes the
 * record values here. Reads the DENORMALISED summary the food-cost module already
 * persists (database-operations.js:89-119) — deliberately no recompute / calculator
 * (that is Deliverable 2). Low-stock is a light days-of-cover heuristic, not the
 * advanced reorder calculation.
 */

const DAY_MS = 86400000;

function num(v) { return Number(v) || 0; }

/**
 * @param {object[]} records  raw stockUsage records (Object.values of the node)
 * @param {{now?:number, lowCoverDays?:number, topN?:number}} [opts]
 * @returns {object} summary (hasData:false when empty)
 */
function summariseFoodCost(records, opts = {}) {
  const now = num(opts.now);
  const lowCoverDays = opts.lowCoverDays || 7;
  const topN = opts.topN || 5;

  const recs = (records || [])
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({ ...r, ts: num(r.timestamp) }))
    .sort((a, b) => a.ts - b.ts);

  if (!recs.length) return { hasData: false };

  const latest = recs[recs.length - 1];
  const prev = recs.length > 1 ? recs[recs.length - 2] : null;

  const foodCostPct = num(latest.costPercentage);
  const previousFoodCostPct = prev ? num(prev.costPercentage) : null;
  const trend = previousFoodCostPct === null ? null
    : foodCostPct > previousFoodCostPct ? 'up'
      : foodCostPct < previousFoodCostPct ? 'down' : 'flat';

  const items = Array.isArray(latest.stockItems) ? latest.stockItems : [];
  const low = items
    .map((it) => {
      const closingQty = num(it.closingQty);
      const usagePerDay = num(it.usagePerDay);
      const daysOfCover = usagePerDay > 0 ? closingQty / usagePerDay : Infinity;
      return { itemCode: it.itemCode, description: it.description, closingQty, daysOfCover };
    })
    .filter((it) => it.closingQty <= 0 || it.daysOfCover < lowCoverDays)
    .sort((a, b) => a.daysOfCover - b.daysOfCover);

  return {
    hasData: true,
    period: { openingDate: latest.openingDate || null, closingDate: latest.closingDate || null, asOf: latest.ts },
    dataAgeDays: now ? Math.floor((now - latest.ts) / DAY_MS) : null,
    foodCostPct,
    previousFoodCostPct,
    trend,
    salesAmount: num(latest.salesAmount),
    totalCostOfUsage: num(latest.totalCostOfUsage),
    itemsAnalysed: items.length,
    lowStockCount: low.length,
    lowStockItems: low.slice(0, topN).map((it) => ({
      itemCode: it.itemCode,
      description: it.description,
      closingQty: it.closingQty,
      daysOfCover: it.daysOfCover === Infinity ? null : Math.round(it.daysOfCover * 10) / 10,
    })),
  };
}

module.exports = { summariseFoodCost };
