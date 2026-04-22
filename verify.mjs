import * as m from './public/js/modules/food-cost/services/flag-service.js';

const exports = Object.keys(m);
console.log('✓ Exports:', exports.join(', '));

const t = m.DEFAULT_THRESHOLDS;
const fields = Object.keys(t);
console.log('✓ DEFAULT_THRESHOLDS fields (count=' + fields.length + '):', fields.join(', '));

console.log('✓ Frozen:', Object.isFrozen(t));

// Check exact field names and values
const expected = {
  foodCostPctWarning: 35,
  foodCostPctCritical: 40,
  unitCostSpikePct: 15,
  unitCostSpikeCriticalPct: 30,
  usageVarianceStdDev: 2,
  usageVarianceCriticalStdDev: 3,
  deadStockDaysThreshold: 28,
  missingItemLookbackWeeks: 4,
  highFcPctCulpritMinScore: 50
};

const allMatch = Object.entries(expected).every(([k, v]) => t[k] === v);
console.log('✓ All exact values match:', allMatch);

// Check stub functions throw
const stubs = ['applyManualFlag', 'removeManualFlag', 'resolveFlag', 'writeAutoFlags', 'runAutoClear'];
stubs.forEach(fn => {
  try {
    m[fn]();
    console.error('✗', fn, 'did not throw');
  } catch (e) {
    if (e.message === 'not implemented') {
      console.log('✓', fn, 'throws');
    }
  }
});
