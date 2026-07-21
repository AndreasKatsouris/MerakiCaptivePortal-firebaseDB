'use strict';
function summarize(results) {
  const passed = results.filter((r) => r.pass).length;
  return { total: results.length, passed, failed: results.length - passed };
}
function formatLine(r) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  const checks = r.checks.map((c) => `${c.pass ? '✓' : '✗'} ${c.name}`).join(', ');
  const fails = r.checks.filter((c) => !c.pass).map((c) => `      - ${c.name}: ${c.detail}`).join('\n');

  // On failure, ALWAYS show what the agent actually did.
  //
  // The 2026-06-07 session burned an afternoon diagnosing "Ross won't call his
  // tools / confabulates a technical error" from Ross's PROSE, when the truth
  // sat in the tool results — the harness had broken the tools and Ross was
  // honestly reporting it. The lesson was "read transcript.toolResults, never
  // the model's prose." This mechanizes it: a failing case prints the observed
  // tools and any tool errors, so nobody writes a throwaway repro to see them.
  let observed = '';
  if (!r.pass) {
    const tools = (r.observedTools && r.observedTools.length) ? r.observedTools.join(', ') : '(none)';
    observed = `\n      → tools actually called: ${tools}`;
    if (r.observedErrors && r.observedErrors.length) {
      observed += `\n      → tool errors: ${r.observedErrors.join(' | ')}`;
    }
  }
  return `[${mark}] ${r.id} — ${checks}${fails ? '\n' + fails : ''}${observed}`;
}
module.exports = { summarize, formatLine };
