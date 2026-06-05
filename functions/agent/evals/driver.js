'use strict';
const { makeFakeRtdb } = require('../__tests__/helpers/fake-rtdb');
const { baselineFixture } = require('./fixtures');
const rossChat = require('../rossChat');
const tools = require('../tools');
const llm = require('../llm-client');
const ledger = require('../../billing/ledger'); // for the balance-gate db seam

// Apply preflight overrides onto a freshly-built tree.
//  - killSwitch  -> ross/config/agentKillSwitch       (runGates gate a)
//  - enabled     -> ross/agentConfig/{uid}/enabled     (runGates gate b)
//  - entitled    -> subscriptions/{uid}/features/rossAgent (runGates gate c)
//  - balanceCents-> billing/credits/{uid}/balanceCents (runGates gate d, via ledger)
// Paths field-verified 2026-06-05 against functions/agent/constants.js + rossChat.runGates.
function applyPreflight(tree, pf, uid) {
  if (!pf) return tree;
  if (pf.killSwitch !== undefined) tree.ross.config.agentKillSwitch = pf.killSwitch;
  if (pf.enabled === false) tree.ross.agentConfig[uid] = { ...(tree.ross.agentConfig[uid] || {}), enabled: false };
  if (pf.entitled === false) tree.subscriptions[uid] = { features: { rossAgent: false } };
  if (pf.balanceCents !== undefined) tree.billing.credits[uid] = { ...(tree.billing.credits[uid] || {}), balanceCents: pf.balanceCents };
  return tree;
}

/**
 * Run a single eval case → Transcript. opts.client (optional) is injected as the LLM
 * client; run.js passes the real one. Drives the loop directly (no ledger debit / no
 * RTDB persistence) so evals have no side effects.
 */
async function runEvalCase(c, opts = {}) {
  const uid = c.seed.asUid;
  const tree = applyPreflight(baselineFixture(), c.seed.preflight, uid);
  const db = makeFakeRtdb(tree);
  rossChat.__setDbForTests(db);
  tools.__setDbForTests(db);
  if (typeof ledger.__setDbForTests === 'function') ledger.__setDbForTests(db); // balance gate reads via ledger's own db
  if ('client' in opts) llm.__setClientForTests(opts.client || null);

  const transcript = { terminal: null, toolsCalled: [], confirms: [], text: '', error: null, toolResults: [] };

  // 1. Pre-flight gates (no LLM spend if any fail).
  const gates = await rossChat.runGates({ uid, isSuperAdmin: c.seed.isSuperAdmin });
  if (!gates.ok) { transcript.terminal = gates.terminal; return transcript; }

  // 2. Owner context + bounded history.
  const ctx = { uid, isSuperAdmin: c.seed.isSuperAdmin, email: `${uid}@eval.test`, turnId: `eval-${c.id}`, turnSource: 'chat', now: 1_700_000_000_000 };
  const system = await rossChat.buildSystemForOwner(ctx, c.seed.clientToday);
  const messages = rossChat.buildHistoryMessages(null, c.prompt);

  const emit = (e) => {
    if (e.type === 'text') transcript.text += e.delta;
    else if (e.type === 'action') transcript.toolsCalled.push({ tool: e.tool, status: e.status });
    else if (e.type === 'confirm') transcript.confirms.push({ tool: e.tool, summary: e.summary, args: e.args });
    else if (e.type === 'error') transcript.error = e.code;
  };

  // 3. The agent loop (no debit, no persistence).
  const loop = await rossChat.runAgentLoop({
    ctx, system, tools: tools.toAnthropicTools(), messages,
    ownerConfig: tree.ross.agentConfig[uid] || null, emit, temperature: 0,
  });
  // runAgentLoop RETURNS (not emits) a paused confirm or a mid-loop error.
  if (loop && loop.paused && loop.pendingTool) {
    const pt = loop.pendingTool;
    transcript.confirms.push({ tool: pt.name, summary: rossChat.confirmSummary(pt.name, pt.args), args: pt.args });
  }
  if (loop && loop.error) transcript.error = 'agent_loop_failed';
  return transcript;
}

module.exports = { runEvalCase, applyPreflight };
