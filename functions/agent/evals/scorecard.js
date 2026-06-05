'use strict';
function summarize(results) {
  const passed = results.filter((r) => r.pass).length;
  return { total: results.length, passed, failed: results.length - passed };
}
function formatLine(r) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  const checks = r.checks.map((c) => `${c.pass ? '✓' : '✗'} ${c.name}`).join(', ');
  const fails = r.checks.filter((c) => !c.pass).map((c) => `      - ${c.name}: ${c.detail}`).join('\n');
  return `[${mark}] ${r.id} — ${checks}${fails ? '\n' + fails : ''}`;
}
module.exports = { summarize, formatLine };
