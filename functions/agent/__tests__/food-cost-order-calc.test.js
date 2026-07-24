'use strict';

/**
 * T3 (D2) — CJS port tests for functions/agent/food-cost/order-calc.js.
 *
 * Two layers (design docs/plans/2026-07-24-ross-foodcost-d2-calculator-design.md §7):
 *  1. Golden parity: the port's calculateOrderDetails / calculateCriticalityScore /
 *     calculateAdvancedOrderDetails outputs deep-equal the corresponding slices of
 *     fixtures/food-cost-golden.json (generated from the LIVE browser modules —
 *     see fixtures/food-cost-golden-generator.test.js). The historicalSummary
 *     input is produced by T2's stats.js port (calculateItemStatistics with the
 *     pinned now), so these tests ALSO transitively re-prove stats parity feeding
 *     calc parity. Comparison contract is exact deep JSON equality (§7.1) —
 *     outputs are serialized via JSON.parse(JSON.stringify(...)) exactly like the
 *     golden generator did (Dates → ISO strings).
 *  2. Named characterization tests pinning the design §6 quirk register Q1–Q14
 *     plus port deltas P7 (no input mutation) and P8 (SAST delivery-day weekday)
 *     — each cites its tag.
 */

const inputs = require('./fixtures/food-cost-golden-inputs.js');
const golden = require('./fixtures/food-cost-golden.json');
const { calculateItemStatistics } = require('../food-cost/stats.js');
const {
  calculateOrderDetails,
  calculateCriticalityScore,
  calculateTimeWeightedAverage,
  calculateHistoricalConfidence,
  calculateAdvancedOrderDetails,
} = require('../food-cost/order-calc.js');

const { PINNED_NOW_MS, scenarios } = inputs;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Serialize exactly like the golden generator did (Dates → ISO strings). */
const toJson = (v) => JSON.parse(JSON.stringify(v));

/** historicalSummary via T2's stats port — golden generator equivalent. */
function statsFor(scenario, itemCode) {
  return calculateItemStatistics(scenario.records, itemCode, {
    now: PINNED_NOW_MS,
  });
}

/** Advanced-calc params: scenario params + injected now (P2). */
function advParams(params) {
  return { ...params, now: PINNED_NOW_MS };
}

/** Recursively freeze an object graph (P7 no-mutation probe). */
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.getOwnPropertyNames(obj)) {
      deepFreeze(obj[key]);
    }
  }
  return obj;
}

/** Synthetic historicalSummary (GT10 shape) for characterization tests. */
function summary(over = {}) {
  return {
    itemCode: 'SYN1',
    dataPoints: 3,
    avgDailyUsage: 6,
    stdDevUsage: 0,
    volatility: 0,
    trend: { slope: 0, direction: 'stable' },
    dowPatterns: null,
    firstDate: '2026-06-29T08:00:00.000Z',
    lastDate: '2026-07-13T08:00:00.000Z',
    raw: [
      { date: '2026-06-29T08:00:00.000Z', usage: 42, usagePerDay: 6, periodDays: 7 },
      { date: '2026-07-06T08:00:00.000Z', usage: 42, usagePerDay: 6, periodDays: 7 },
      { date: '2026-07-13T08:00:00.000Z', usage: 42, usagePerDay: 6, periodDays: 7 },
    ],
    ...over,
  };
}

/** Synthetic stock item; usagePerDay 2 blends 50/50 with summary()'s 6 → 4. */
function synItem(over = {}) {
  return {
    itemCode: 'SYN1',
    description: 'Synthetic Item',
    category: 'Dry Goods',
    supplierName: 'Syn Foods',
    unit: 'ea',
    openingQty: 120,
    purchaseQty: 0,
    closingQty: 100,
    usage: 20,
    usagePerDay: 2,
    unitCost: 10,
    ...over,
  };
}

const SYN_PARAMS = {
  daysToNextDelivery: 3,
  safetyStockPercentage: 20,
  criticalItemBuffer: 30,
  coveringDays: 2,
  now: PINNED_NOW_MS,
};

const scenarioNames = Object.keys(scenarios);

describe('food-cost order-calc port — golden parity (design §7.1)', () => {
  it.each(scenarioNames)(
    'calculateOrderDetails matches committed golden: %s',
    (name) => {
      const scenario = scenarios[name];
      const details = calculateOrderDetails(scenario.item, scenario.params);
      expect(toJson(details)).toEqual(golden[name].orderDetails);
    }
  );

  it.each(scenarioNames)(
    'calculateCriticalityScore matches committed golden: %s',
    (name) => {
      const scenario = scenarios[name];
      const stats = statsFor(scenario, scenario.item.itemCode);
      const criticality = calculateCriticalityScore(
        scenario.item,
        stats,
        scenario.params
      );
      expect(toJson(criticality)).toEqual(golden[name].criticality);
    }
  );

  it.each(scenarioNames)(
    'calculateAdvancedOrderDetails matches committed golden: %s',
    (name) => {
      const scenario = scenarios[name];
      const stats = statsFor(scenario, scenario.item.itemCode);
      const advanced = calculateAdvancedOrderDetails(
        scenario.item,
        stats,
        advParams(scenario.params)
      );
      expect(toJson(advanced)).toEqual(golden[name].advanced);
    }
  );

  it('full chain matches golden for the NO-unitCost-field item (GT1, missingCost.noCostFieldItem)', () => {
    const scenario = scenarios.missingCost;
    const item = scenario.itemNoCost;
    const stats = statsFor(scenario, item.itemCode);
    expect(toJson(calculateOrderDetails(item, scenario.params))).toEqual(
      golden.missingCost.noCostFieldItem.orderDetails
    );
    expect(
      toJson(calculateCriticalityScore(item, stats, scenario.params))
    ).toEqual(golden.missingCost.noCostFieldItem.criticality);
    expect(
      toJson(calculateAdvancedOrderDetails(item, stats, advParams(scenario.params)))
    ).toEqual(golden.missingCost.noCostFieldItem.advanced);
  });
});

describe('food-cost order-calc port — characterizations (design §6)', () => {
  it('Q1: advanced volatility branch drops criticalStock from requiredStock — advanced qty < basic qty for a critical item', () => {
    // design §6 Q1 — advanced:319,332 vs order-calculator.js:186-189.
    // criticalItem golden: basic forecastedDemand INCLUDES criticalStock 23.55
    // → qty 145; the advanced branch's requiredStock = baseUsage + safety only
    // (criticalStock '23.56' sits in calculationDetails but is NOT added) → 97.
    const basic = golden.criticalItem.orderDetails;
    const adv = golden.criticalItem.advanced;
    expect(basic.calculationDetails.criticalStock).toBe('23.55');
    expect(basic.orderResults.recommendedOrderQty).toBe('145.00');
    expect(adv.calculationDetails.criticalStock).toBe('23.56'); // present…
    // …but requiredStock 96.25 = baseUsage 78.54 + enhancedSafetyStock 17.71
    // only — criticalStock omitted (78.54 + 17.71 + 23.56 would be ≈119.8).
    expect(adv.orderResults.requiredStock).toBe('96.25');
    expect(adv.orderResults.recommendedOrderQty).toBe('97.00');
    expect(parseFloat(adv.orderResults.recommendedOrderQty)).toBeLessThan(
      parseFloat(basic.orderResults.recommendedOrderQty)
    );
    // And the port reproduces exactly this (already covered by parity, pinned
    // here so the quirk has a named home).
    const stats = statsFor(scenarios.criticalItem, '60001');
    const ported = calculateAdvancedOrderDetails(
      scenarios.criticalItem.item,
      stats,
      advParams(scenarios.criticalItem.params)
    );
    expect(ported.orderResults.recommendedOrderQty).toBe('97.00');
  });

  it('Q2: dataPoints < 5 → fallback weighting is exactly 50/50 (max(dataPoints−7,0) is always 0)', () => {
    // design §6 Q2 — advanced:153-171. current 2, historical (TWA) 6 →
    // blended must be exactly 2*0.5 + 6*0.5 = 4 with 4 data points.
    const result = calculateAdvancedOrderDetails(
      synItem(),
      summary({ dataPoints: 4 }),
      SYN_PARAMS
    );
    // volatility 0 → else branch; its adjustments.blendedUsage is the final
    // usage (no dow, stable trend → unchanged) = the 50/50 blend.
    expect(result.historicalInsights.adjustments.blendedUsage).toBe(
      2 * 0.5 + 6 * 0.5
    );
  });

  it('Q3: needsReordering semantics — base couples fD > rOP with qty > 0; advanced is literally (recommendedOrderQty > 0)', () => {
    // design §6 Q3 — order-calculator.js:193 vs advanced:350-357.
    // Base: needsReordering ⇒ ceil(fD − rOP) ≥ 1, ¬needsReordering ⇒ qty '0.00'.
    const baseNo = calculateOrderDetails(
      synItem({ closingQty: 1000, usagePerDay: 1 }),
      SYN_PARAMS
    );
    expect(baseNo.orderResults.needsReordering).toBe(false);
    expect(baseNo.orderResults.recommendedOrderQty).toBe('0.00');
    // (positive coupling from golden: thinHistory2 needsReordering true, qty 31)
    expect(golden.thinHistory2.orderDetails.orderResults.needsReordering).toBe(true);
    expect(
      parseFloat(golden.thinHistory2.orderDetails.orderResults.recommendedOrderQty)
    ).toBeGreaterThan(0);
    // Advanced volatility branch: needsReordering is DEFINED as qty > 0 after
    // Math.max(0, requiredStock − clampedReorderPoint) — huge stock → 0 → false.
    const advNo = calculateAdvancedOrderDetails(
      synItem({ closingQty: 1000, usagePerDay: 1 }),
      summary({
        dataPoints: 3,
        avgDailyUsage: 1,
        stdDevUsage: 0.2,
        volatility: 0.2,
        raw: [
          { date: '2026-06-29T08:00:00.000Z', usage: 7, usagePerDay: 1, periodDays: 7 },
          { date: '2026-07-06T08:00:00.000Z', usage: 7, usagePerDay: 1, periodDays: 7 },
          { date: '2026-07-13T08:00:00.000Z', usage: 7, usagePerDay: 1, periodDays: 7 },
        ],
      }),
      SYN_PARAMS
    );
    expect(advNo.orderResults.recommendedOrderQty).toBe('0.00');
    expect(advNo.orderResults.needsReordering).toBe(
      parseFloat(advNo.orderResults.recommendedOrderQty) > 0
    );
    expect(advNo.orderResults.needsReordering).toBe(false);
  });

  it('Q4: trend adjustment asymmetric — increasing capped at +5%, decreasing capped at −2.5%', () => {
    // design §6 Q4 — advanced:245-258. trendFactor 2 would give 0.2 / 0.1
    // uncapped; the caps clamp to 0.05 / 0.025.
    const volSummary = (direction) =>
      summary({
        stdDevUsage: 1,
        volatility: 0.5,
        trend: { slope: direction === 'increasing' ? 1 : -1, direction },
      });
    const up = calculateAdvancedOrderDetails(
      synItem(),
      volSummary('increasing'),
      { ...SYN_PARAMS, trendFactor: 2 }
    );
    expect(up.historicalInsights.adjustments.trendAdjustment).toBe(0.05);
    expect(up.historicalInsights.adjustments.finalUsage).toBe(4 * (1 + 0.05));
    const down = calculateAdvancedOrderDetails(
      synItem(),
      volSummary('decreasing'),
      { ...SYN_PARAMS, trendFactor: 2 }
    );
    expect(down.historicalInsights.adjustments.trendAdjustment).toBe(-0.025);
    expect(down.historicalInsights.adjustments.finalUsage).toBe(4 * (1 - 0.025));
  });

  it('Q5: dowPatterns null under 14 points; delivery-day factor applied only when that day has > 2 data points', () => {
    // design §6 Q5 — hus:305; advanced:225-233.
    // (a) 13 daily records → stats.dowPatterns null (14-point threshold).
    const thirteen = Array.from({ length: 13 }, (_, i) => ({
      timestamp: Date.UTC(2026, 6, 1 + i, 8),
      periodDays: 1,
      stockItems: [{ itemCode: 'D13', usage: 5 }],
    }));
    expect(
      calculateItemStatistics(thirteen, 'D13', { now: PINNED_NOW_MS }).dowPatterns
    ).toBeNull();
    // (b) delivery lands Friday-SAST (pinned Monday + 4 days). friday index 2:
    // with dataPoints 3 (> 2) the factor applies → finalUsage 4 × 2 = 8;
    // with dataPoints 2 it does NOT → finalUsage stays 4.
    const dow = (fridayPoints) =>
      summary({
        dowPatterns: {
          friday: { average: 8, index: 2, dataPoints: fridayPoints },
        },
      });
    const applied = calculateAdvancedOrderDetails(synItem(), dow(3), {
      ...SYN_PARAMS,
      daysToNextDelivery: 4,
    });
    expect(applied.historicalInsights.adjustments.finalUsage).toBe(4 * 2);
    const skipped = calculateAdvancedOrderDetails(synItem(), dow(2), {
      ...SYN_PARAMS,
      daysToNextDelivery: 4,
    });
    expect(skipped.historicalInsights.adjustments.finalUsage).toBe(4);
  });

  it('Q6: dataPoints 2-4 run the advanced path with 50/50 weights (confidence branch does NOT fire); ≥ 5 shifts the blend', () => {
    // design §6 Q6 — advanced:132 (>= 5 confidence gate) vs the orchestrator's
    // minimumHistoryRequired 2. Observable: for 2-4 points the blend is the
    // exact 50/50 value; at 5 points confidence weighting moves it.
    for (const dataPoints of [2, 3, 4]) {
      const result = calculateAdvancedOrderDetails(
        synItem(),
        summary({ dataPoints }),
        SYN_PARAMS
      );
      // Advanced path DID run (insights present)…
      expect(result.historicalInsights).toBeDefined();
      // …with the Q2 fallback 50/50 blend.
      expect(result.historicalInsights.adjustments.blendedUsage).toBe(4);
    }
    const five = calculateAdvancedOrderDetails(
      synItem(),
      summary({ dataPoints: 5 }),
      SYN_PARAMS
    );
    // Confidence branch fired: weights are no longer 0.5/0.5 → blend ≠ 4.
    expect(five.historicalInsights.adjustments.blendedUsage).not.toBe(4);
  });

  it('Q7: stockout escalates coveringDays → max(2×,7) and safetyStock% → max(1.5×,30); near-stockout only flags', () => {
    // design §6 Q7 — advanced:280-290. Golden stockout: coveringDays 2 → 7,
    // safetyStock% 20 → 30 (visible in the escalated numbers), flags set.
    const stats = statsFor(scenarios.stockout, '10127');
    const adv = calculateAdvancedOrderDetails(
      scenarios.stockout.item,
      stats,
      advParams(scenarios.stockout.params)
    );
    expect(adv.stockStatus.isStockout).toBe(true);
    expect(adv.stockStatus.isNearStockout).toBe(true);
    expect(adv.stockDetails.coveringDays).toBe(7); // max(2×2, 7)
    // 30% safety: baseUsage '130.36' × 0.30 → '39.11'; + volatilityAdjustment
    // 2.5671260301009315 = 41.677126030100930 (golden literal).
    expect(toJson(adv).calculationDetails.safetyStock).toBe(41.67712603010093);
    // Near-stockout (stock < 2 days of blended usage) flags WITHOUT escalation:
    const near = calculateAdvancedOrderDetails(
      synItem({ closingQty: 3 }), // blended usage 4 → 3 < 8
      summary(),
      SYN_PARAMS
    );
    expect(near.stockStatus.isStockout).toBe(false);
    expect(near.stockStatus.isNearStockout).toBe(true);
    expect(near.stockDetails.coveringDays).toBe(2); // NOT escalated
  });

  it('Q8: volatility 0 → else-branch: base-calc numbers verbatim + insights bolted on (and no rawData key)', () => {
    // design §6 Q8 — advanced:302,396-421. volatilityOff: the advanced output's
    // calculationDetails/orderResults are the base calc's (blended usage equals
    // current here), with historicalInsights added. The else-branch insights
    // carry NO rawData key (only the volatility branch adds it, :378).
    const scenario = scenarios.volatilityOff;
    const stats = statsFor(scenario, '50010');
    const adv = calculateAdvancedOrderDetails(
      scenario.item,
      stats,
      advParams(scenario.params)
    );
    const basic = calculateOrderDetails(scenario.item, scenario.params);
    expect(toJson(adv).calculationDetails).toEqual(toJson(basic).calculationDetails);
    expect(toJson(adv).orderResults).toEqual(toJson(basic).orderResults);
    expect(adv.historicalInsights).toBeDefined();
    expect('rawData' in adv.historicalInsights).toBe(false);
  });

  it('Q9: time-weighted average ignores usagePerDay ≤ 0 records; all-≤0 raw falls back to the simple average', () => {
    // design §6 Q9 — advanced:29-38,176-180.
    const d = (day) => `2026-07-${String(day).padStart(2, '0')}T08:00:00.000Z`;
    // Mixed: the -2 record (newest) is skipped entirely → TWA is exactly 4.
    expect(
      calculateTimeWeightedAverage([
        { date: d(13), usagePerDay: -2 },
        { date: d(6), usagePerDay: 4 },
      ])
    ).toBe(4);
    // All ≤ 0 → TWA returns 0…
    expect(
      calculateTimeWeightedAverage([
        { date: d(13), usagePerDay: -1 },
        { date: d(6), usagePerDay: 0 },
      ])
    ).toBe(0);
    // …and calculateAdvancedOrderDetails then falls back to the summary's
    // SIMPLE average (avgDailyUsage 3): blended = 2×0.5 + 3×0.5 = 2.5
    // (were TWA 0 used, blended would be 1).
    const result = calculateAdvancedOrderDetails(
      synItem(),
      summary({
        avgDailyUsage: 3,
        raw: [
          { date: d(1), usage: -7, usagePerDay: -1, periodDays: 7 },
          { date: d(6), usage: 0, usagePerDay: 0, periodDays: 7 },
          { date: d(13), usage: -21, usagePerDay: -3, periodDays: 7 },
        ],
      }),
      SYN_PARAMS
    );
    expect(result.historicalInsights.adjustments.blendedUsage).toBe(
      2 * 0.5 + 3 * 0.5
    );
  });

  it('Q10: trendConfidence is a constant 0.6 — trend.strength is never produced, the 0.8 branch is dead', () => {
    // design §6 Q10 — advanced:61-62 reads trend?.strength which the stats
    // producer (hus:578 / stats.js calculateTrend) never emits → always 0.6.
    const strongTrend = calculateHistoricalConfidence(
      summary({
        dataPoints: 30,
        stdDevUsage: 1,
        avgDailyUsage: 10,
        trend: { slope: 9, direction: 'increasing' }, // strong trend, no strength
      }),
      10
    );
    expect(strongTrend.trend).toBe(0.6);
    const noTrend = calculateHistoricalConfidence(
      summary({
        dataPoints: 30,
        stdDevUsage: 1,
        avgDailyUsage: 10,
        trend: { slope: 0, direction: 'stable' },
      }),
      10
    );
    expect(noTrend.trend).toBe(0.6);
  });

  it('Q11: volatility branch calculationDetails.forecastedDemand is the concatenated STRING (display-only bug, preserved)', () => {
    // design §6 Q11 — advanced:316-320: origCalculation.baseUsage (string) +
    // enhancedSafetyStock (number) + origCalculation.criticalStock (string).
    const scenario = scenarios.thinHistory2;
    const stats = statsFor(scenario, '10245');
    const adv = calculateAdvancedOrderDetails(
      scenario.item,
      stats,
      advParams(scenario.params)
    );
    // Literal golden value: '22.56' + 5.01 + '0.00' → "22.565.010.00".
    expect(adv.calculationDetails.forecastedDemand).toBe('22.565.010.00');
  });

  it('Q12: base reOrderPoint is unclamped (can go negative); the advanced volatility branch clamps it to ≥ 0', () => {
    // design §6 Q12 — order-calculator.js:176 vs advanced:344.
    // Base: closingQty 0 − 10/day × 3 days = −30, published as-is.
    const base = calculateOrderDetails(
      synItem({ closingQty: 0, usagePerDay: 10 }),
      SYN_PARAMS
    );
    expect(base.calculationDetails.reOrderPoint).toBe('-30.00');
    // Advanced (criticalItem golden): displayed reOrderPoint is still the
    // unclamped base string '-27.12', but the ORDER MATH clamps to 0:
    // qty 97 = ceil(requiredStock 96.25 − 0). Unclamped it would be
    // ceil(96.25 + 27.12) = 124.
    const adv = golden.criticalItem.advanced;
    expect(adv.calculationDetails.reOrderPoint).toBe('-27.12');
    expect(adv.orderResults.requiredStock).toBe('96.25');
    expect(adv.orderResults.recommendedOrderQty).toBe('97.00');
    expect(Math.ceil(parseFloat(adv.orderResults.requiredStock))).toBe(
      parseFloat(adv.orderResults.recommendedOrderQty)
    );
  });

  it('Q13: adjustments.trendAdjustment is a signed NUMBER in the volatility branch but a BOOLEAN in the else-branch', () => {
    // design §6 Q13 — advanced:385 vs :410.
    // Volatility branch (stockout scenario, increasing trend) → number 0.05.
    const stats = statsFor(scenarios.stockout, '10127');
    const vol = calculateAdvancedOrderDetails(
      scenarios.stockout.item,
      stats,
      advParams(scenarios.stockout.params)
    );
    expect(vol.historicalInsights.adjustments.trendAdjustment).toBe(0.05);
    expect(typeof vol.historicalInsights.adjustments.trendAdjustment).toBe('number');
    // Else-branch (volatility 0) with a non-stable trend → boolean true.
    const els = calculateAdvancedOrderDetails(
      synItem(),
      summary({ trend: { slope: 1, direction: 'increasing' } }),
      SYN_PARAMS
    );
    expect(els.historicalInsights.adjustments.trendAdjustment).toBe(true);
    expect(typeof els.historicalInsights.adjustments.trendAdjustment).toBe('boolean');
  });

  it('Q14: dataPoints ∈ {2,3,4} → no confidence key anywhere in the returned object', () => {
    // design §6 Q14 — advanced:132,142-152: the confidence object only exists
    // in the ≥ 5 branch, and even then lives on the internal enhancedItem —
    // the RETURN of calculateAdvancedOrderDetails never carries it for < 5
    // points. (§5.2's optional confidence field is assembled at T4.)
    for (const dataPoints of [2, 3, 4]) {
      const result = calculateAdvancedOrderDetails(
        synItem(),
        summary({ dataPoints }),
        SYN_PARAMS
      );
      expect(JSON.stringify(result)).not.toContain('"confidence"');
    }
  });

  it('P7: deep-frozen item + historicalSummary + params — no argument is mutated, outputs still match the golden', () => {
    // design §5.3 P7 — the live code deep-copies item (advanced:105) and
    // assigns onto the copy; the port must behave identically WITHOUT touching
    // caller args. 'use strict' makes any write to a frozen object THROW, so a
    // green run here is proof of no mutation. criticalItem exercises the
    // volatility branch; stockout exercises the Q7 context-escalation path
    // (the classic accidental-params-mutation site).
    for (const name of ['criticalItem', 'stockout']) {
      const scenario = scenarios[name];
      const item = deepFreeze(structuredClone(scenario.item));
      const stats = deepFreeze(statsFor(scenario, scenario.item.itemCode));
      const params = deepFreeze(structuredClone(advParams(scenario.params)));
      const basic = calculateOrderDetails(item, params);
      const criticality = calculateCriticalityScore(item, stats, params);
      const advanced = calculateAdvancedOrderDetails(item, stats, params);
      expect(toJson(basic)).toEqual(golden[name].orderDetails);
      expect(toJson(criticality)).toEqual(golden[name].criticality);
      expect(toJson(advanced)).toEqual(golden[name].advanced);
    }
  });

  it('P8: delivery-day weekday is derived in SAST — a delivery epoch late-Friday-UTC buckets as Saturday-SAST', () => {
    // design §5.3 P8 — weekday = new Date(ts + 2*3600e3).getUTCDay(). With the
    // same daysToNextDelivery (4), shifting `now` from Monday 08:00 UTC to
    // Monday 22:00 UTC moves the delivery instant from Friday 10:00 SAST to
    // SATURDAY 00:00 SAST (still Friday 22:00 in UTC) — the dow factor flips.
    // Mirrors the T1 sensitivity probe.
    const dowSummary = summary({
      dowPatterns: {
        friday: { average: 8, index: 2, dataPoints: 3 },
        saturday: { average: 2, index: 0.5, dataPoints: 3 },
      },
    });
    const MONDAY_08_UTC = Date.UTC(2026, 6, 20, 8); // Fri 10:00 SAST delivery
    const MONDAY_22_UTC = Date.UTC(2026, 6, 20, 22); // Sat 00:00 SAST delivery
    const friday = calculateAdvancedOrderDetails(synItem(), dowSummary, {
      ...SYN_PARAMS,
      daysToNextDelivery: 4,
      now: MONDAY_08_UTC,
    });
    expect(friday.historicalInsights.adjustments.finalUsage).toBe(4 * 2);
    const saturday = calculateAdvancedOrderDetails(synItem(), dowSummary, {
      ...SYN_PARAMS,
      daysToNextDelivery: 4,
      now: MONDAY_22_UTC,
    });
    // Friday 22:00 UTC — a pure-UTC getUTCDay() would still say friday (index
    // 2 → 8); SAST says saturday (index 0.5 → 2).
    expect(saturday.historicalInsights.adjustments.finalUsage).toBe(4 * 0.5);
  });
});
