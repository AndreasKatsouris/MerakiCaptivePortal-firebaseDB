import { SEVERITIES, MANUAL_SEVERITY_MAP } from './constants/flag-types.js';

export function computeRowSeverity(flagEntry) {
  if (!flagEntry) return null;
  let maxRank = 0;
  let out = null;

  const consider = (sevId) => {
    if (!sevId) return;
    const s = Object.values(SEVERITIES).find((v) => v.id === sevId);
    if (s && s.rank > maxRank) {
      maxRank = s.rank;
      out = sevId;
    }
  };

  for (const type of Object.keys(flagEntry.manualFlags || {})) {
    consider(MANUAL_SEVERITY_MAP[type]);
  }
  for (const auto of Object.values(flagEntry.autoFlags || {})) {
    consider(auto?.severity);
  }
  return out;
}

export function mergeFlaggedHistoricalItems(currentItems, flagsByKey, { showHistorical }) {
  if (!showHistorical) return currentItems;
  if (!flagsByKey || typeof flagsByKey !== 'object') return currentItems;

  const currentKeys = new Set(currentItems.map((i) => i.itemKey));
  const historical = [];
  for (const [itemKey, entry] of Object.entries(flagsByKey)) {
    if (currentKeys.has(itemKey)) continue;
    if (!computeRowSeverity(entry)) continue;
    historical.push({
      itemKey,
      itemCode: entry.itemCode || '',
      description: entry.description || '',
      category: entry.category || '',
      costCenter: entry.costCenter || '',
      openingQty: 0,
      closingQty: 0,
      purchaseQty: 0,
      usage: 0,
      unitCost: 0,
      usageValue: 0,
      __isHistoricalPlaceholder: true
    });
  }
  return [...currentItems, ...historical];
}
