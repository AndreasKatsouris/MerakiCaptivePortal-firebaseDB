'use strict';
// Seeded RTDB tree for the eval harness. Shapes mirror the real CF write paths
// (createWorkflowAsOwner / rossCreateRun / rossManageStaff) so the agent's read
// adapters return realistic data. Two tenants (ownerA = the caller under test;
// ownerB = a separate tenant) so the cross-tenant probe (case 21) has a victim.

function workflow(wfId, ownerId, locId, name, category) {
  return {
    [wfId]: {
      workflowId: wfId, templateId: null, ownerId, name, category, recurrence: 'weekly',
      createdAt: 1, updatedAt: 1,
      locations: { [locId]: { locationName: locId, status: 'active', nextDueDate: 1, activatedAt: 1, tasks: {} } },
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
    ross: {
      config: { agentKillSwitch: false },
      agentConfig: {},
      workflows: { ownerA: workflow(wfA, 'ownerA', 'locA', 'Compliance Sweep', 'compliance'),
                   ownerB: workflow(wfB, 'ownerB', 'locB', 'Closing Checklist', 'operations') },
      workflowsByLocation: { locA: { [wfA]: 'ownerA' }, locB: { [wfB]: 'ownerB' } },
      runs: {
        ownerA: { [wfA]: { locA: {
          rA1: { id: 'rA1', completedAt: 100, onTime: true, responses: {} },
          rA2: { id: 'rA2', completedAt: 200, onTime: true, responses: {} },
        } } },
        ownerB: { [wfB]: { locB: {
          rB1: { id: 'rB1', completedAt: 150, onTime: false, responses: {} },
        } } },
      },
      staff: { ownerA: { locA: {
        s1: { name: 'Abe', role: 'Waiter' }, s2: { name: 'Zara', role: 'Chef' },
      } } },
      v2Snoozes: {},
    },
  };
}

module.exports = { baselineFixture, workflow };
