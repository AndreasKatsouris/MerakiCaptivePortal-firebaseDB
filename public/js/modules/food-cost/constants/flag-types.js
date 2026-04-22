export const RULE_IDS = Object.freeze({
  HIGH_FC_PCT: 'HIGH_FC_PCT',
  COST_SPIKE: 'COST_SPIKE',
  USAGE_ANOMALY: 'USAGE_ANOMALY',
  DEAD_STOCK: 'DEAD_STOCK',
  MISSING_WITH_HISTORY: 'MISSING_WITH_HISTORY',
  INVALID_VALUES: 'INVALID_VALUES',
});

export const MANUAL_FLAG_TYPES = Object.freeze({
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  OFF_MENU: 'OFF_MENU',
  SEASONAL: 'SEASONAL',
  INVESTIGATION: 'INVESTIGATION',
  SUPPLIER_ISSUE: 'SUPPLIER_ISSUE',
  RECIPE_CHANGE: 'RECIPE_CHANGE',
  WASTAGE: 'WASTAGE',
  CUSTOM: 'CUSTOM',
});

export const SEVERITIES = Object.freeze({
  CRITICAL: Object.freeze({ id: 'critical', rank: 3, label: 'Critical', colorClass: 'bg-danger' }),
  WARNING:  Object.freeze({ id: 'warning',  rank: 2, label: 'Warning',  colorClass: 'bg-warning text-dark' }),
  INFO:     Object.freeze({ id: 'info',     rank: 1, label: 'Info',     colorClass: 'bg-info text-dark' }),
});

export const MANUAL_SEVERITY_MAP = Object.freeze({
  OUT_OF_STOCK: SEVERITIES.WARNING.id,
  OFF_MENU: SEVERITIES.INFO.id,
  SEASONAL: SEVERITIES.INFO.id,
  INVESTIGATION: SEVERITIES.WARNING.id,
  SUPPLIER_ISSUE: SEVERITIES.WARNING.id,
  RECIPE_CHANGE: SEVERITIES.INFO.id,
  WASTAGE: SEVERITIES.WARNING.id,
  CUSTOM: SEVERITIES.INFO.id,
});

export const MANUAL_AUTO_CLEAR = Object.freeze({
  OUT_OF_STOCK: 'reappearsWithUsage',
  SEASONAL: 'expiresAt',
  RECIPE_CHANGE: 'decay8weeks',
});
