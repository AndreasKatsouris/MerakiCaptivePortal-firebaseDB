'use strict';
const { makeFakeRtdb } = require('../__tests__/helpers/fake-rtdb');
const { baselineFixture, FIXTURE_CONSTANTS } = require('./fixtures');
const rossChat = require('../rossChat');
const tools = require('../tools');
const execute = require('../execute'); // executeTool has its OWN getDb seam (audit-write + no-undo capture)
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
  // executeTool (execute.js) writes an audit record + captures no-undo prev values via
  // its OWN getDb seam — without this every tool execution throws "Can't determine
  // Firebase Database URL" at the audit write, even pure reads, and Ross honestly
  // reports the error (looked like "Ross won't call tools" but he does — harness bug).
  if (typeof execute.__setDbForTests === 'function') execute.__setDbForTests(db);
  if (typeof ledger.__setDbForTests === 'function') ledger.__setDbForTests(db); // balance gate reads via ledger's own db
  if ('client' in opts) llm.__setClientForTests(opts.client || null);

  const transcript = { terminal: null, toolsCalled: [], confirms: [], text: '', error: null, toolResults: [] };

  // 1. Pre-flight gates (no LLM spend if any fail).
  const gates = await rossChat.runGates({ uid, isSuperAdmin: c.seed.isSuperAdmin });
  if (!gates.ok) { transcript.terminal = gates.terminal; return transcript; }

  // 2. Owner context + bounded history.
  // ctx.now = 2026-06-05T00:00:00Z in ms — aligns with the clientToday used in cases.js
  // ('2026-06-05') so formatSADate in the system prompt shows the correct eval date.
  // The digest bucketing uses clientToday (not ctx.now) when provided, so these two
  // must be consistent: NEXT_DUE_OVERDUE = 2026-05-25 is 11 days before this date.
  // Derived from the fixtures so it can't silently drift if BASE_2026 moves.
  const EVAL_NOW = FIXTURE_CONSTANTS.BASE_2026 + 4 * FIXTURE_CONSTANTS.DAY; // 2026-06-05T00:00:00Z
  const ctx = { uid, isSuperAdmin: c.seed.isSuperAdmin, email: `${uid}@eval.test`, turnId: `eval-${c.id}`, turnSource: 'chat', now: EVAL_NOW };
  const system = await rossChat.buildSystemForOwner(ctx, c.seed.clientToday);
  const messages = rossChat.buildHistoryMessages(null, c.prompt);

  // 3a. Inject preloaded system context as a synthetic toolResult so the judge can
  // verify grounding for cases where `buildSystemForOwner` pre-loads the digest into
  // the system prompt (q-compliance / q-overdue / q-today). Without this the judge
  // only sees `toolResults: []` and incorrectly flags Ross as fabricating when it
  // correctly answers from the system context without calling `getWorkflowDigest`.
  // system[1].text is the owner-context block (digest + tier + locations + date).
  if (Array.isArray(system) && system[1] && typeof system[1].text === 'string') {
    transcript.toolResults.push({ tool: '__systemContext__', output: system[1].text });
  }

  const emit = (e) => {
    if (e.type === 'text') transcript.text += e.delta;
    else if (e.type === 'action') transcript.toolsCalled.push({ tool: e.tool, status: e.status });
    else if (e.type === 'confirm') transcript.confirms.push({ tool: e.tool, summary: e.summary, args: e.args });
    else if (e.type === 'error') transcript.error = e.code;
  };

  // 3b. The agent loop (no debit, no persistence).
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

  // 4. Capture tool outputs from the returned loop.messages into transcript.toolResults.
  // runAgentLoop folds tool_result blocks into convo as { role:'user', content:[...] }.
  // Extracting them here gives the judge concrete grounding data without modifying the
  // loop itself (CRITICAL LESSON #142: runAgentLoop RETURNS {paused,pendingTool}/{error},
  // signalling splits across emit AND return).
  if (loop && Array.isArray(loop.messages)) {
    // Build a tool_use_id -> tool name map from the assistant turns so each captured
    // tool_result carries its tool name (the judge shouldn't have to reverse-map by id).
    // The `action` events on transcript.toolsCalled carry NO toolUseId (rossChat emits
    // only {tool, status}), so we pair from the assistant tool_use blocks which DO have
    // both `id` and `name` — field-verified against rossChat.runAgentLoop.
    const toolNameById = {};
    for (const msg of loop.messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block && block.type === 'tool_use' && block.id) toolNameById[block.id] = block.name;
        }
      }
    }
    for (const msg of loop.messages) {
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block && block.type === 'tool_result' && block.tool_use_id) {
            let parsedOutput;
            try { parsedOutput = JSON.parse(block.content); } catch { parsedOutput = block.content; }
            transcript.toolResults.push({
              tool: toolNameById[block.tool_use_id] || null,
              toolUseId: block.tool_use_id,
              output: parsedOutput,
            });
          }
        }
      }
    }
  }

  return transcript;
}

module.exports = { runEvalCase, applyPreflight };
