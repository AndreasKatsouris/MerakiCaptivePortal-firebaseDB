/**
 * Pure helpers that summarize historical stockUsage records by itemKey for the
 * flag detection engine. Kept separate from historical-usage-service.js so the
 * computation can be unit-tested without Firebase mocking.
 */

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;

function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(variance);
}

export function summarizeRecordsByItemKey(records, now = Date.now()) {
  const buckets = {};

  for (const rec of records || []) {
    const ts = Number(rec.timestamp) || 0;
    for (const item of rec.stockItems || []) {
      const key = item.itemKey;
      if (!key) continue;
      const b = (buckets[key] = buckets[key] || {
        itemCode: null,
        description: null,
        category: null,
        costCenter: null,
        unitCosts: [],
        usages: [],
        lastUsageAt: 0,
        lastSeenAt: 0,
        latestMetaTs: 0
      });

      const unitCost = Number(item.unitCost) || 0;
      const usage = Number(item.usage) || 0;
      if (unitCost > 0) b.unitCosts.push(unitCost);
      b.usages.push(usage);

      if (ts > b.lastSeenAt) b.lastSeenAt = ts;
      if (usage > 0 && ts > b.lastUsageAt) b.lastUsageAt = ts;

      if (ts >= b.latestMetaTs) {
        b.latestMetaTs = ts;
        b.itemCode = item.itemCode ?? b.itemCode;
        b.description = item.description ?? b.description;
        b.category = item.category ?? b.category;
        b.costCenter = item.costCenter ?? b.costCenter;
      }
    }
  }

  const out = {};
  for (const [key, b] of Object.entries(buckets)) {
    out[key] = {
      itemCode: b.itemCode,
      description: b.description,
      category: b.category,
      costCenter: b.costCenter,
      unitCostMean: mean(b.unitCosts),
      unitCostSamples: b.unitCosts.length,
      usageMean: mean(b.usages),
      usageStdDev: stdDev(b.usages),
      usageSamples: b.usages.length,
      daysSinceLastUsage: b.lastUsageAt
        ? Math.floor((now - b.lastUsageAt) / DAY_MS)
        : Infinity,
      weeksSinceLastSeen: b.lastSeenAt
        ? Math.floor((now - b.lastSeenAt) / WEEK_MS)
        : Infinity,
      historicalCostShare: 0,
      historicalCostShareStdDev: 0.02
    };
  }
  return out;
}
