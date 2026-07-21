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
    // locA food-cost history for the getFoodCostSummary reader (Deliverable 1).
    // Two records so trend is defined; latest shows cost rising + one item out of stock.
    locations: {
      locA: {
        ownerId: 'ownerA',
        stockUsage: {
          fcA1: { timestamp: BASE_2026 - 8 * DAY, costPercentage: 28, salesAmount: 42000, totalCostOfUsage: 11760, stockItems: [] },
          fcA2: { timestamp: BASE_2026 - 1 * DAY, costPercentage: 33, salesAmount: 45000, totalCostOfUsage: 14850, stockItems: [
            { itemCode: '10127', description: 'water sparkling large', closingQty: 0, usagePerDay: 9 },
            { itemCode: '11413', description: 'coffee espresso beans', closingQty: 2, usagePerDay: 2 },
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
