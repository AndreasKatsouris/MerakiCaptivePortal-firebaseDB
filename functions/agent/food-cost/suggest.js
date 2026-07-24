'use strict';

/**
 * D2 pure order-suggestion orchestrator (data-in / data-out) — T4.
 *
 * Reimplements the ORCHESTRATION SEMANTICS of the live entry point
 * generateAdvancedPurchaseOrder
 * (public/js/modules/food-cost/order-calculator-advanced.js:432-606):
 * supplier filter → criticality → advanced-vs-basic branch on
 * dataPoints >= minimumHistoryRequired (2, live :453/:541) → orderQty > 0
 * inclusion — WITHOUT the entry point's I/O. The live RTDB read + fuzzy
 * multi-location history search (design GT4/GT6, the DO-NOT-PORT list) is
 * replaced by location-scoped records passed in by the tools.js adapter (P3).
 *
 * Output is the MODEL-FACING contract of design §5.2
 * (docs/plans/2026-07-24-ross-foodcost-d2-calculator-design.md) — a new,
 * bounded shape, not a port of the live return value.
 *
 * Building blocks (all pure, golden-parity-proven in T2/T3):
 *   calculateItemStatistics        ./stats.js
 *   calculateOrderDetails,
 *   calculateCriticalityScore,
 *   calculateAdvancedOrderDetails,
 *   calculateHistoricalConfidence  ./order-calc.js
 *
 * Security envelope (design §8):
 *   P5 — input caps: max 2,000 stockItems per record, 10,000 across all
 *        ARRAY-shaped records (attacker-controlled dimension, security F3).
 *        Object-shaped stockItems bypass the budget — they are only ever
 *        O(1) keyed lookups in stats.js, never iterated, so they are not a
 *        work bound (T4 spec review, judgment call 8). The budget is
 *        allocated NEWEST-first so truncation removes the OLDEST history —
 *        the current items list is the last thing to be cut.
 *   P6 — EVERY tenant string reaching output (itemCode, description,
 *        supplierName, criticalityReason) control-stripped + truncated to
 *        120 chars before it can enter the model conversation (security F4;
 *        itemCode added by the T4 spec review — it is a CSV field too).
 *   F2 — supplierFilter is case-insensitive SUBSTRING matching via
 *        String.prototype.includes — never new RegExp (ReDoS).
 *   Output capped at 30 items + truncation marker; empty/no-data input
 *   returns bare { hasData: false }, deep-equal to the adapter's no-access
 *   return (anti-enumeration).
 */

const { calculateItemStatistics } = require('./stats.js');
const {
  calculateOrderDetails,
  calculateCriticalityScore,
  calculateAdvancedOrderDetails,
  calculateHistoricalConfidence,
} = require('./order-calc.js');

const DAY_MS = 86400000;
const MAX_ITEMS_PER_RECORD = 2000; // P5
const MAX_ITEMS_TOTAL = 10000; // P5
const MAX_OUTPUT_ITEMS = 30; // §5.2 output cap
const MAX_STRING_LEN = 120; // P6
const MINIMUM_HISTORY_REQUIRED = 2; // live advanced:453 minimumHistoryRequired
const CONFIDENCE_MIN_DATA_POINTS = 5; // Q14 — confidence only exists on the >=5 branch

function num(v) {
  return Number(v) || 0;
}

/** P6: strip control chars FIRST, then truncate — output is always <= 120 visible chars. */
function sanitizeText(v) {
  // eslint-disable-next-line no-control-regex
  return String(v == null ? '' : v).replace(/[\x00-\x1F\x7F]/g, '').slice(0, MAX_STRING_LEN);
}

/**
 * Pure order suggestion over one location's stockUsage records.
 *
 * @param {object[]} records raw stockUsage records (Object.values of
 *   locations/{locId}/stockUsage — unsorted; the adapter's bounded read)
 * @param {{now: number, daysToNextDelivery?: number, supplierFilter?: string}} opts
 *   now (epoch ms) REQUIRED — P2 injected clock (the adapter passes ctx.now).
 *   daysToNextDelivery: caller override, Zod-bounded 1-30 at the adapter.
 *   supplierFilter: case-insensitive substring on supplierName; an empty
 *   string is treated as "no filter" (matching everything while excluding
 *   supplier-less items would be a surprising reading of an empty query).
 * @returns {object} design §5.2 shape, or bare { hasData: false }
 */
function suggestOrder(records, opts = {}) {
  const now = num(opts.now);

  // Sort by numeric timestamp, latest record last (as D1's summariseFoodCost).
  const recs = (records || [])
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({ ...r, ts: num(r.timestamp) }))
    .sort((a, b) => a.ts - b.ts);

  if (!recs.length) return { hasData: false };

  const latest = recs[recs.length - 1];

  // ---- P5 input caps, BEFORE any stats/calc work --------------------------
  // Per-record cap 2,000; global cap 10,000. Budget is allocated newest-first
  // so any overflow truncates the OLDEST records' contributions; the current
  // (latest) items list is therefore only ever cut by the per-record cap.
  // Non-array stockItems (GT9 object shape) pass through untouched — stats.js
  // handles them with an O(1) keyed lookup, so they are not a work-bound risk.
  let capTruncated = false;
  const cappedItems = new Array(recs.length);
  let budget = MAX_ITEMS_TOTAL;
  for (let i = recs.length - 1; i >= 0; i--) {
    const si = recs[i].stockItems;
    if (!Array.isArray(si)) {
      cappedItems[i] = si;
      continue;
    }
    const allowed = Math.min(si.length, MAX_ITEMS_PER_RECORD, budget);
    if (allowed < si.length) capTruncated = true;
    cappedItems[i] = si.slice(0, allowed);
    budget -= allowed;
  }
  const statsRecords = recs.map((r, i) =>
    Array.isArray(r.stockItems) ? { ...r, stockItems: cappedItems[i] } : r
  );

  // Latest record's stockItems are the CURRENT stock; tolerate non-array →
  // treat as empty (GT9 — every live save path writes arrays).
  const currentItems = Array.isArray(latest.stockItems) ? cappedItems[recs.length - 1] : [];
  if (!currentItems.length) return { hasData: false };

  // ---- GT7 params resolution ----------------------------------------------
  // ||-falsy defaulting is MANDATED (0 → default) — it is what every live
  // calculator in the file does; coveringDays is never stored → always 2.
  // `source` describes daysToNextDelivery provenance.
  const callerDays = opts.daysToNextDelivery;
  const recordDays = Number(latest.daysToNextDelivery) || 0;
  const daysToNextDelivery = callerDays || recordDays || 7;
  const source = callerDays ? 'caller' : recordDays ? 'record' : 'default';
  const safetyStockPercentage = Number(latest.safetyStockPercentage) || 20;
  const criticalItemBuffer = Number(latest.criticalItemBuffer) || 30;

  // Calc params per the live orchestrator (advanced:484-494) + P2's now.
  const calcParams = {
    orderCycle: 7,
    daysToNextDelivery,
    coveringDays: 2,
    safetyStockPercentage,
    criticalItemBuffer,
    volatilityMultiplier: 1.0,
    trendFactor: 0.5,
    useDayOfWeekPatterns: true,
    now,
  };

  // F2: substring matching, never RegExp. Empty string → no filter.
  const filter =
    typeof opts.supplierFilter === 'string' && opts.supplierFilter !== ''
      ? opts.supplierFilter.toLowerCase()
      : null;

  let itemsWithHistory = 0;
  let advancedCalculations = 0;
  let basicCalculations = 0;
  const orderable = [];

  for (const item of currentItems) {
    if (!item || typeof item !== 'object') continue; // live :510 skips invalid items

    if (filter !== null) {
      // Live advanced:513-515 — when a filter is active, items with a
      // missing/empty supplierName are excluded.
      if (!item.supplierName) continue;
      if (!String(item.supplierName).toLowerCase().includes(filter)) continue;
    }

    const stats = calculateItemStatistics(statsRecords, item.itemCode, { now });
    if (stats.dataPoints > 0) itemsWithHistory++;

    // Live :530 passes historicalSummaries[itemCode], which is undefined when
    // the item has no history — mirrored exactly. Third arg mirrors the live
    // params pass-through; no criticality-read key collides with calcParams.
    const criticality = calculateCriticalityScore(
      item,
      stats.dataPoints > 0 ? stats : undefined,
      calcParams
    );
    const isCritical = criticality.isCritical;

    // Advanced path iff dataPoints >= minimumHistoryRequired (2) — live :541.
    const advancedPath = stats.dataPoints >= MINIMUM_HISTORY_REQUIRED;
    let orderDetails;
    if (advancedPath) {
      orderDetails = calculateAdvancedOrderDetails({ ...item, isCritical }, stats, calcParams);
      advancedCalculations++;
    } else {
      orderDetails = calculateOrderDetails({ ...item, isCritical }, calcParams);
      basicCalculations++;
    }

    // Q16: inclusion filter is orderQty > 0 — the live advanced orchestrator's
    // filter (advanced:574-577), provably equivalent to the base generator's
    // needsReordering for basic-path items (needsReordering ⇒ ceil >= 1).
    // Preserved — see design §6 Q16.
    const orderQty = parseInt(orderDetails.orderResults.recommendedOrderQty, 10) || 0;
    if (orderQty <= 0) continue;

    const currentStock = num(item.closingQty);
    // §5.2 choice: expose the item's PERSISTED usagePerDay — the final blended
    // value (current/historical weighting + dow + trend) is internal to the
    // calculation; the persisted rate is what the owner's upload actually said.
    const usagePerDay = num(item.usagePerDay);

    // stockStatus: advanced results carry a stockStatus object (both Q8
    // branches); basic results do not — derive with the SAME thresholds the
    // advanced path uses (advanced:272-274: <=0 stockout, < 2 days of stock
    // near-stockout), against the persisted usagePerDay (the basic path never
    // blends).
    let stockStatus;
    if (orderDetails.stockStatus) {
      stockStatus = orderDetails.stockStatus.isStockout
        ? 'stockout'
        : orderDetails.stockStatus.isNearStockout
          ? 'low'
          : 'ok';
    } else {
      stockStatus =
        currentStock <= 0 ? 'stockout' : currentStock < usagePerDay * 2 ? 'low' : 'ok';
    }

    // P4 defensive cost gate (GT1): the flag can be stale and legacy
    // round-tripped items can lack the field entirely — treat cost as unknown
    // when flagged OR absent OR non-numeric OR non-finite OR <= 0. Both
    // fields null together; never multiply by a garbage cost.
    const rawUnitCost = item.unitCost;
    const costKnown =
      item.hasMissingUnitCost !== true &&
      typeof rawUnitCost === 'number' &&
      isFinite(rawUnitCost) &&
      rawUnitCost > 0;

    const out = {
      itemCode: sanitizeText(item.itemCode), // P6 (spec-review SHOULD-FIX: CSV field too)
      description: sanitizeText(item.description), // P6
      supplierName: sanitizeText(item.supplierName), // P6
      currentStock,
      usagePerDay,
      orderQty,
      requiredStock: parseFloat(orderDetails.orderResults.requiredStock) || 0,
      isCritical,
      criticalityReason: sanitizeText(criticality.criticalityReason), // P6 (carries tenant category text)
      stockStatus,
      unitCost: costKnown ? rawUnitCost : null,
      estimatedCost: costKnown ? Math.round(orderQty * rawUnitCost * 100) / 100 : null,
      calculationType: advancedPath ? 'advanced' : 'basic',
    };

    // Q14: confidence only exists for advanced items with >= 5 data points
    // (the live calculator only builds it on that branch and never exposes
    // it in its return value — recomputed here with the same inputs the
    // calculator used: the summary + the persisted usagePerDay).
    if (advancedPath && stats.dataPoints >= CONFIDENCE_MIN_DATA_POINTS) {
      const confidence = calculateHistoricalConfidence(stats, parseFloat(item.usagePerDay) || 0);
      out.confidence = Math.round(confidence.overall * 100) / 100;
    }

    orderable.push(out);
  }

  // Sort: critical first, then estimatedCost desc with nulls last, then
  // itemCode asc (deterministic tiebreak). New array — no input mutation.
  const sorted = [...orderable].sort((a, b) => {
    if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
    const aNull = a.estimatedCost === null;
    const bNull = b.estimatedCost === null;
    if (aNull !== bNull) return aNull ? 1 : -1;
    if (!aNull && a.estimatedCost !== b.estimatedCost) return b.estimatedCost - a.estimatedCost;
    const aCode = String(a.itemCode);
    const bCode = String(b.itemCode);
    return aCode < bCode ? -1 : aCode > bCode ? 1 : 0;
  });

  // Totals cover ALL orderable items (the whole suggested order), not just
  // the 30 shown — itemsToOrder is the full count, so the money figures are
  // computed over the same population.
  const itemsToOrder = orderable.length;
  const itemsWithUnknownCost = orderable.reduce(
    (n, i) => n + (i.estimatedCost === null ? 1 : 0),
    0
  );
  const estimatedTotalCost =
    Math.round(orderable.reduce((sum, i) => sum + (i.estimatedCost || 0), 0) * 100) / 100;

  const caveats = [];
  if (capTruncated) caveats.push('items-truncated-for-size'); // P5, once
  if (itemsWithUnknownCost > 0) {
    caveats.push(`costs-unavailable-for-${itemsWithUnknownCost}-items`);
  }

  return {
    hasData: true,
    asOf: latest.ts,
    dataAgeDays: Math.floor((now - latest.ts) / DAY_MS),
    params: {
      daysToNextDelivery,
      coveringDays: 2,
      safetyStockPercentage,
      criticalItemBuffer,
      source,
    },
    historyDepth: {
      records: recs.length,
      // itemsWithHistory counts PROCESSED (post-filter) current items with any
      // usable history (dataPoints > 0); advanced/basic count the branch taken,
      // mirroring the live metrics object (advanced:499-505) semantics.
      itemsWithHistory,
      advancedCalculations,
      basicCalculations,
    },
    items: sorted.slice(0, MAX_OUTPUT_ITEMS),
    truncated: itemsToOrder > MAX_OUTPUT_ITEMS ? { itemCount: itemsToOrder } : null,
    totals: { itemsToOrder, estimatedTotalCost, itemsWithUnknownCost },
    caveats,
  };
}

module.exports = { suggestOrder };
