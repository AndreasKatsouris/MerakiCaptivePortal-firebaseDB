'use strict';
// Live eval runner: node functions/agent/evals/run.js  (needs ANTHROPIC_API_KEY)
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp(); // satisfy modules that touch admin at require-time
const { CASES } = require('./cases');
const { runEvalCase } = require('./driver');
const A = require('./assertions');
const { judge } = require('./judge');
const { summarize, formatLine } = require('./scorecard');
const llm = require('../llm-client');

async function evalOne(c) {
  const checks = [];
  const t = await runEvalCase(c); // uses the real client configured in main()
  const e = c.expect;
  if (e.terminal) checks.push({ name: 'terminal', ...A.terminalIs(t, e.terminal) });
  if (e.tools) checks.push({ name: 'tools', ...A.toolsCalled(t, e.tools) });
  if (e.noAutoConfirm) checks.push({ name: 'noAutoConfirm', ...A.noAutoConfirmExec(t) });
  if (e.refuse) checks.push({ name: 'refused', ...A.refused(t) });
  if (e.noForeignData) checks.push({ name: 'noForeignData', ...A.noForeignData(t, e.noForeignData.foreignIds) });
  if (e.judge) {
    const v = await judge({ prompt: c.prompt, toolResults: t.toolResults, answer: t.text });
    const wants = Object.entries(e.judge).filter(([, want]) => want).map(([k]) => k);
    const missing = wants.filter((k) => !v[k]);
    checks.push({ name: `judge(${wants.join('/')}) score=${v.score}`, pass: missing.length === 0 && v.score >= 3, detail: missing.length ? `failed: ${missing.join(', ')} — ${v.reasons}` : v.reasons });
  }
  return {
    id: c.id,
    checks,
    pass: checks.length > 0 && checks.every((x) => x.pass),
    // Diagnostics, surfaced by formatLine only when the case fails.
    observedTools: (t.toolsCalled || []).map((x) => x.tool),
    observedErrors: (t.toolResults || [])
      .filter((r) => r && r.output && r.output.error)
      .map((r) => `${r.tool}: ${r.output.error}`),
  };
}

/**
 * CLI flags.
 *   --only=<id>[,<id>]  run just these case ids (substring match on id)
 *   --repeat=<n>        run the selection n times
 *
 * `--repeat` exists because these are LIVE model calls and therefore
 * NON-DETERMINISTIC. A single failure does not distinguish "regression" from
 * "the model chose differently this time", and re-running the full 22-case
 * suite to interrogate one case is slow and costs real money. Repeating one
 * case answers it directly: 3/3 fail is a regression, 1/3 is flake.
 */
function parseArgs(argv) {
  const get = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const only = get('only');
  const repeat = parseInt(get('repeat') || '1', 10);
  return {
    only: only ? only.split(',').map((s) => s.trim()).filter(Boolean) : null,
    repeat: Number.isFinite(repeat) && repeat > 0 ? repeat : 1,
  };
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.error('Set ANTHROPIC_API_KEY to run live evals.'); process.exit(2); }
  const { only, repeat } = parseArgs(process.argv.slice(2));

  let selection = CASES;
  if (only) {
    selection = CASES.filter((c) => only.some((o) => c.id.includes(o)));
    if (!selection.length) {
      console.error(`No cases matched --only=${only.join(',')}. Known ids:\n  ${CASES.map((c) => c.id).join('\n  ')}`);
      process.exit(2);
    }
    console.log(`Running ${selection.length} of ${CASES.length} cases (--only=${only.join(',')})`);
  }
  if (repeat > 1) console.log(`Repeating ${repeat}x to separate regression from model non-determinism\n`);

  llm.ensureClient(key);
  const results = [];
  for (let pass = 1; pass <= repeat; pass += 1) {
    if (repeat > 1) console.log(`--- run ${pass}/${repeat} ---`);
    for (const c of selection) {
      try { results.push(await evalOne(c)); }
      catch (err) { results.push({ id: c.id, checks: [{ name: 'ERROR', pass: false, detail: err.message }], pass: false }); }
      console.log(formatLine(results[results.length - 1]));
    }
  }

  const s = summarize(results);
  console.log(`\n${s.passed}/${s.total} passed, ${s.failed} failed.`);

  // With --repeat, a per-case tally is what actually answers the question.
  if (repeat > 1) {
    const byId = new Map();
    for (const r of results) {
      const e = byId.get(r.id) || { pass: 0, total: 0 };
      e.total += 1; if (r.pass) e.pass += 1;
      byId.set(r.id, e);
    }
    console.log('\nper-case tally:');
    for (const [id, e] of byId) {
      const flaky = e.pass > 0 && e.pass < e.total;
      console.log(`  ${id}: ${e.pass}/${e.total}${flaky ? '  ← FLAKY (non-deterministic, not a hard regression)' : ''}`);
    }
  }
  process.exit(s.failed ? 1 : 0);
}
main();
