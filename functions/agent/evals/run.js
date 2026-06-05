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
  return { id: c.id, checks, pass: checks.every((x) => x.pass) };
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.error('Set ANTHROPIC_API_KEY to run live evals.'); process.exit(2); }
  llm.ensureClient(key);
  const results = [];
  for (const c of CASES) {
    try { results.push(await evalOne(c)); }
    catch (err) { results.push({ id: c.id, checks: [{ name: 'ERROR', pass: false, detail: err.message }], pass: false }); }
    console.log(formatLine(results[results.length - 1]));
  }
  const s = summarize(results);
  console.log(`\n${s.passed}/${s.total} passed, ${s.failed} failed.`);
  process.exit(s.failed ? 1 : 0);
}
main();
