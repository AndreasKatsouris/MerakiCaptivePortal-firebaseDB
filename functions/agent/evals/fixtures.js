'use strict';
// Seeded RTDB tree for the eval harness. Shapes mirror the real CF write paths
// (createWorkflowAsOwner / rossCreateRun / rossManageStaff) so the agent's read
// adapters return realistic data. Two tenants (ownerA = the caller under test;
// ownerB = a separate tenant) so the cross-tenant probe (case 21) has a victim.

// Fixed 2026 ms constants — harness forbids Date.now()/new Date() in script contexts.
// BASE_2026 = 2026-06-01T00:00:00Z (1780272000000 ms). All offsets are multiples of
// one day (86_400_000 ms). Computed once so the harness is deterministic and the judge
// never sees degenerate "1970-01-01" dates that produce fabrication false-positives.
const BASE_2026 = 1780272000000; // 2026-06-01T00:00:00Z
const DAY = 86400000;

// Plausible recent timestamps relative to BASE_2026 (2026-06-01):
//   CREATED_AT  = 2026-04-01 — workflow was created 2 months ago
//   ACTIVATED_AT = 2026-04-15 — activated ~6 weeks ago
//   NEXT_DUE_OVERDUE = 2026-05-25 — 7 days before BASE; renders as "7 days overdue" on 2026-06-01
//   NEXT_DUE_TODAY   = 2026-06-01 — due the same day as BASE
//   NEXT_DUE_UPCOMING = 2026-06-08 — 7 days after BASE
//   RUN_COMPLETED_1  = 2026-05-11 — 3 weeks before BASE
//   RUN_COMPLETED_2  = 2026-05-18 — 2 weeks before BASE
const CREATED_AT      = BASE_2026 - 61 * DAY; // 2026-04-01
const ACTIVATED_AT    = BASE_2026 - 47 * DAY; // 2026-04-15
const NEXT_DUE_OVERDUE   = BASE_2026 - 7 * DAY;  // 2026-05-25 — 7 days before eval date
const NEXT_DUE_UPCOMING  = BASE_2026 + 7 * DAY;  // 2026-06-08
const RUN_COMPLETED_1    = BASE_2026 - 21 * DAY; // 2026-05-11
const RUN_COMPLETED_2    = BASE_2026 - 14 * DAY; // 2026-05-18

function workflow(wfId, ownerId, locId, name, category) {
  return {
    [wfId]: {
      workflowId: wfId, templateId: null, ownerId, name, category, recurrence: 'weekly',
      createdAt: CREATED_AT, updatedAt: CREATED_AT,
      locations: { [locId]: { locationName: locId, status: 'active', nextDueDate: NEXT_DUE_OVERDUE, activatedAt: ACTIVATED_AT, tasks: {} } },
    },
  };
}

/** Baseline two-tenant tree. ownerA has locA + a workflow with 2 completed runs + staff. */
function baselineFixture() {
  const wfA = 'wfA1', wfB = 'wfB1';
  return {
    users: { ownerA: { tier: 'all-in' }, ownerB: { tier: 'all-in' } },
    userLocations: { ownerA: { locA: true }, ownerB: { locB: true } },
    subscriptions: {
      ownerA: { features: { rossAgent: true } },
      ownerB: { features: { rossAgent: true } },
    },
    // GROUND TRUTH (verified 2026-06-05): the pre-flight balance gate reads
    // `billing/credits/{uid}/balanceCents`, NOT `billing/balances/...`.
    // Source: functions/billing/ledger.js:35 `creditsPath = billing/credits/${uid}`
    // -> getBalanceCents (ledger.js:114-116) reads `${creditsPath(uid)}/balanceCents`,
    // called from rossChat.js:94 runGates via ledger.checkBalance(uid).
    // Real balance path (ledger.js:35/114-116, read by runGates gate (d) via ledger.checkBalance).
    // Baseline is funded; a derived fixture/preflight override seeds balanceCents:0 to trip the no-credit gate.
    billing: { credits: { ownerA: { balanceCents: 5000 }, ownerB: { balanceCents: 5000 } } },
    // locA food-cost history for the getFoodCostSummary reader (Deliverable 1)
    // AND the getSuggestedOrder calculator (Deliverable 2, q-suggest-order).
    // Three chronological weekly records (periodDays 7, 2026 era) so the
    // advanced calculator path fires (dataPoints >= 2) for the headline items:
    //   '10127' water sparkling large — stockout in the latest record
    //     (closingQty 0, preserved), known unit cost;
    //   '11413' coffee espresso beans — low (closingQty 2, preserved) AND
    //     cost-unknown (hasMissingUnitCost flagged shape) so getSuggestedOrder
    //     returns itemsWithUnknownCost >= 1 + a costs-unavailable caveat and
    //     the judge can verify Ross never presents the order total as complete.
    // Item/record shape mirrors the persisted CF write path
    // (public/js/modules/food-cost/database-operations.js:89-119) via the
    // golden-inputs fixture (functions/agent/__tests__/fixtures/
    // food-cost-golden-inputs.js). Quantities reconcile per record:
    // closingQty = openingQty + purchaseQty - usage; usagePerDay = usage / 7.
    // Trend for the D1 summary stays 28 -> 33 rising (latest vs second-latest).
    locations: {
      locA: {
        ownerId: 'ownerA',
        stockUsage: {
          fcA0: { timestamp: BASE_2026 - 15 * DAY, periodDays: 7, stockPeriodDays: 7, costPercentage: 27, salesAmount: 41000, totalCostOfUsage: 11070, stockItems: [
            { itemCode: '10127', description: 'water sparkling large', category: 'Beverages', supplierName: 'Peninsula Beverages', unit: 'ea', openingQty: 20, purchaseQty: 39, closingQty: 10, usage: 49, usagePerDay: 7, unitCost: 6.5, costOfUsage: 318.5 },
            { itemCode: '11413', description: 'coffee espresso beans', category: 'Beverages', supplierName: 'Bean There Coffee', unit: 'kg', openingQty: 8, purchaseQty: 12, closingQty: 6, usage: 14, usagePerDay: 2, unitCost: 0, costOfUsage: 0, hasMissingUnitCost: true },
          ] },
          fcA1: { timestamp: BASE_2026 - 8 * DAY, periodDays: 7, stockPeriodDays: 7, costPercentage: 28, salesAmount: 42000, totalCostOfUsage: 11760, stockItems: [
            { itemCode: '10127', description: 'water sparkling large', category: 'Beverages', supplierName: 'Peninsula Beverages', unit: 'ea', openingQty: 10, purchaseQty: 58, closingQty: 12, usage: 56, usagePerDay: 8, unitCost: 6.5, costOfUsage: 364 },
            { itemCode: '11413', description: 'coffee espresso beans', category: 'Beverages', supplierName: 'Bean There Coffee', unit: 'kg', openingQty: 6, purchaseQty: 12, closingQty: 4, usage: 14, usagePerDay: 2, unitCost: 0, costOfUsage: 0, hasMissingUnitCost: true },
          ] },
          fcA2: { timestamp: BASE_2026 - 1 * DAY, periodDays: 7, stockPeriodDays: 7, costPercentage: 33, salesAmount: 45000, totalCostOfUsage: 14850, stockItems: [
            { itemCode: '10127', description: 'water sparkling large', category: 'Beverages', supplierName: 'Peninsula Beverages', unit: 'ea', openingQty: 12, purchaseQty: 51, closingQty: 0, usage: 63, usagePerDay: 9, unitCost: 6.5, costOfUsage: 409.5 },
            { itemCode: '11413', description: 'coffee espresso beans', category: 'Beverages', supplierName: 'Bean There Coffee', unit: 'kg', openingQty: 4, purchaseQty: 12, closingQty: 2, usage: 14, usagePerDay: 2, unitCost: 0, costOfUsage: 0, hasMissingUnitCost: true },
          ] },
        },
      },
    },
    ross: {
      config: { agentKillSwitch: false },
      agentConfig: {},
      workflows: { ownerA: workflow(wfA, 'ownerA', 'locA', 'Compliance Sweep', 'compliance'),
                   ownerB: workflow(wfB, 'ownerB', 'locB', 'Closing Checklist', 'operations') },
      workflowsByLocation: { locA: { [wfA]: 'ownerA' }, locB: { [wfB]: 'ownerB' } },
      runs: {
        ownerA: { [wfA]: { locA: {
          rA1: { id: 'rA1', completedAt: RUN_COMPLETED_1, onTime: true, responses: {} },
          rA2: { id: 'rA2', completedAt: RUN_COMPLETED_2, onTime: true, responses: {} },
        } } },
        ownerB: { [wfB]: { locB: {
          rB1: { id: 'rB1', completedAt: RUN_COMPLETED_1, onTime: false, responses: {} },
        } } },
      },
      staff: { ownerA: { locA: {
        s1: { name: 'Abe', role: 'Waiter' }, s2: { name: 'Zara', role: 'Chef' },
      } } },
      v2Snoozes: {},
    },
  };
}

module.exports = {
  baselineFixture,
  workflow,
  // Exported for use in tests that need date-aware assertions.
  FIXTURE_CONSTANTS: { BASE_2026, DAY, CREATED_AT, ACTIVATED_AT, NEXT_DUE_OVERDUE, NEXT_DUE_UPCOMING, RUN_COMPLETED_1, RUN_COMPLETED_2 },
};
