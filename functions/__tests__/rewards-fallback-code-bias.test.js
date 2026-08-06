/**
 * Guard — voucher fallback-code modulo bias (queue card Q14).
 *
 * `generateFallbackCode()` in `rewardsProcessor.js` drew a CSPRNG byte and
 * reduced it via `byte % 36`. Since 256 % 36 === 4, chars at charset indices
 * 0-3 ('0','1','2','3') were drawn from 8 of the 256 possible byte values
 * while every other char was drawn from only 7 — an ~12.5% over-representation
 * for those four chars in a security-relevant voucher code. The fix uses
 * rejection sampling: bytes >= 252 (the last incomplete group of 36) are
 * discarded and redrawn instead of reduced.
 *
 * `biasedFallbackCode()` below reimplements the pre-fix algorithm inline so
 * this suite proves the uniformity check actually discriminates: RED against
 * the old shape, GREEN against `generateFallbackCode()`.
 */
const crypto = require('crypto');
const { generateFallbackCode } = require('../rewardsProcessor');

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function biasedFallbackCode() {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += CHARS.charAt(bytes[i] % CHARS.length);
    }
    return code;
}

// Tallies per-character frequency across a large sample of codes and returns
// the largest fractional deviation from the uniform expectation (1/36).
function maxUniformDeviation(codeFn, sampleCodes) {
    const counts = new Map();
    for (const ch of CHARS) counts.set(ch, 0);

    for (let i = 0; i < sampleCodes; i++) {
        const code = codeFn();
        for (const ch of code) counts.set(ch, counts.get(ch) + 1);
    }

    const totalChars = sampleCodes * 6;
    const expected = totalChars / CHARS.length;
    let maxDeviation = 0;
    for (const count of counts.values()) {
        const deviation = Math.abs(count - expected) / expected;
        maxDeviation = Math.max(maxDeviation, deviation);
    }
    return maxDeviation;
}

// Sample size chosen so a true-uniform draw stays comfortably under 8%
// deviation (>10 standard deviations from expectation — astronomically
// unlikely to flake) while the ~12.5%-biased draw reliably exceeds it.
const SAMPLE_CODES = 100000;
const UNIFORM_DEVIATION_BOUND = 0.08;

describe('generateFallbackCode() character distribution', () => {
    it('produces a uniform character distribution over a large sample', () => {
        const deviation = maxUniformDeviation(generateFallbackCode, SAMPLE_CODES);
        expect(deviation).toBeLessThan(UNIFORM_DEVIATION_BOUND);
    });

    it('always returns a 6-character code drawn from the documented charset', () => {
        for (let i = 0; i < 200; i++) {
            const code = generateFallbackCode();
            expect(code).toHaveLength(6);
            expect(code).toMatch(new RegExp(`^[${CHARS}]{6}$`));
        }
    });

    // Regression anchor: proves the check above would have caught the bug.
    it('regression anchor — the pre-fix modulo-reduction shape fails the same uniformity check', () => {
        const deviation = maxUniformDeviation(biasedFallbackCode, SAMPLE_CODES);
        expect(deviation).toBeGreaterThan(UNIFORM_DEVIATION_BOUND);
    });
});
