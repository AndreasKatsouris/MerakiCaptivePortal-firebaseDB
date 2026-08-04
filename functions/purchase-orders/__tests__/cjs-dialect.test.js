// Convention: import test globals from vitest (ESM), require everything else.
//
// This guard exists because vitest CANNOT catch the defect it guards. Vitest's
// loader transforms ESM, so an `export` statement in a functions/ module passes
// every test in this repo and then throws at deployed require() time
// (2026-06-22 LESSON — it shipped once already).
//
// THE BYTE REGEX IS THE LOAD-BEARING CHECK. functions/package.json declares
// node 22 and no "type", and Node >=22.12 supports require(esm) with module
// syntax detection — so an ESM file may load WITHOUT throwing here even though
// the deployed behaviour differs. The require() check below is a smoke test for
// unrelated load-time errors, not the ESM guard. An earlier version of this
// header claimed otherwise.
import { describe, it, expect } from 'vitest';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(path.join(dir, e.name));
    return e.name.endsWith('.js') ? [path.join(dir, e.name)] : [];
  });
}

describe('functions/purchase-orders is CommonJS', () => {
  const files = sourceFiles(DIR);

  it('finds the module files', () => expect(files.length).toBeGreaterThanOrEqual(5));

  it.each(files)('%s uses no ESM import/export statements', (file) => {
    const src = fs.readFileSync(file, 'utf8');
    // [\s{*] not \s: `export{x}` and `import{x}from'y'` have no space after
    // the keyword and slipped past the original pattern.
    expect(src).not.toMatch(/^\s*import[\s{*]/m);
    expect(src).not.toMatch(/^\s*export[\s{*]/m);
  });

  it.each(files)('%s is require()-able as CommonJS', (file) => {
    expect(() => require(file)).not.toThrow();
  });

  it.each(files)('%s assigns module.exports exactly once (#188 clobber trap)', (file) => {
    const src = fs.readFileSync(file, 'utf8');
    const assignments = (src.match(/^\s*module\.exports\s*=/gm) || []).length;
    expect(assignments).toBeLessThanOrEqual(1);
    if (assignments === 1) expect(src).not.toMatch(/^\s*exports\.\w+\s*=/m);
  });
});

describe('functions/index.js registers both CFs', () => {
  it('exports poCatalog and poSeedFromStock', () => {
    const src = fs.readFileSync(path.join(DIR, '..', 'index.js'), 'utf8');
    expect(src).toMatch(/exports\.poCatalog\s*=/);
    expect(src).toMatch(/exports\.poSeedFromStock\s*=/);
  });
});
