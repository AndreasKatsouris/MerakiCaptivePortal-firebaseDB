/**
 * Guard — ROSS recurrence advance, pure core.
 *
 * The bug: `nextDueDate` never moves, so once a run starts on or after it,
 * `runCoversCurrentPeriod` (ross.js:404-406) is permanently true and the
 * workflow can never be overdue again. Two live workflows had been frozen for
 * 50 and 39 days, which is why the W2 nudge reported "silent" every morning for
 * six weeks and Ross's home card said "all clear".
 *
 * The landing rule is the load-bearing decision and has its own test below:
 * advancing to the FIRST occurrence >= today would have left the nudge silent,
 * because agent/sweep/nudge-selector.js reads only `overdue` and `today` and
 * never `upcoming`.
 */
import { describe, it, expect } from 'vitest';

const {
    advancePastDue, nextOccurrence, toUtcMidnightMs, addUtcMonths, MAX_PERIODS,
} = require('../advance-core');

const utc = (s) => Date.parse(`${s}T00:00:00Z`);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

describe('toUtcMidnightMs', () => {
    it('accepts epoch-ms', () => {
        expect(toUtcMidnightMs(utc('2026-06-06'))).toBe(utc('2026-06-06'));
    });

    it('accepts the ISO date STRING that two READY agent tools actually write', () => {
        // agent/tools.js:291-293 defaultDueDate() returns 'YYYY-MM-DD'; nothing
        // coerces it, so string nextDueDate exists in production data.
        expect(toUtcMidnightMs('2026-06-06')).toBe(utc('2026-06-06'));
    });

    it('truncates a time-of-day component to UTC midnight', () => {
        // rossSeedFirstWorkflow (ross.js:968) writes `nextDueDate: now`.
        expect(toUtcMidnightMs(utc('2026-06-06') + 13 * 3600000)).toBe(utc('2026-06-06'));
        expect(toUtcMidnightMs('2026-06-06T13:45:12.000Z')).toBe(utc('2026-06-06'));
    });

    it('returns null for junk rather than guessing', () => {
        [null, undefined, '', '   ', 'not-a-date', {}, [], true, NaN].forEach((v) => {
            expect(toUtcMidnightMs(v)).toBeNull();
        });
    });
});

describe('addUtcMonths — day-of-month clamping', () => {
    it('clamps 31 Jan + 1 month to 28 Feb (non-leap)', () => {
        expect(iso(addUtcMonths(utc('2026-01-31'), 1))).toBe('2026-02-28');
    });

    it('clamps to 29 Feb in a leap year', () => {
        expect(iso(addUtcMonths(utc('2024-01-31'), 1))).toBe('2024-02-29');
    });

    it('handles quarter and year steps across a year boundary', () => {
        expect(iso(addUtcMonths(utc('2026-11-15'), 3))).toBe('2027-02-15');
        // 2024 IS a leap year (2026 is not — `utc('2026-02-29')` would silently
        // roll to 2026-03-01 and test nothing).
        expect(iso(addUtcMonths(utc('2024-02-29'), 12))).toBe('2025-02-28');
    });
});

describe('nextOccurrence', () => {
    it('steps each named recurrence', () => {
        expect(iso(nextOccurrence(utc('2026-06-06'), 'daily'))).toBe('2026-06-07');
        expect(iso(nextOccurrence(utc('2026-06-06'), 'weekly'))).toBe('2026-06-13');
        expect(iso(nextOccurrence(utc('2026-06-06'), 'monthly'))).toBe('2026-07-06');
        expect(iso(nextOccurrence(utc('2026-06-06'), 'quarterly'))).toBe('2026-09-06');
        expect(iso(nextOccurrence(utc('2026-06-06'), 'annually'))).toBe('2027-06-06');
    });

    it('lets a positive customInterval override the recurrence', () => {
        expect(iso(nextOccurrence(utc('2026-06-06'), 'monthly', 10))).toBe('2026-06-16');
    });

    it('ignores a non-positive or non-integer customInterval', () => {
        expect(iso(nextOccurrence(utc('2026-06-06'), 'weekly', 0))).toBe('2026-06-13');
        expect(iso(nextOccurrence(utc('2026-06-06'), 'weekly', -5))).toBe('2026-06-13');
        expect(iso(nextOccurrence(utc('2026-06-06'), 'weekly', 2.5))).toBe('2026-06-13');
    });

    it('returns null for "once" and for an unknown recurrence', () => {
        expect(nextOccurrence(utc('2026-06-06'), 'once')).toBeNull();
        expect(nextOccurrence(utc('2026-06-06'), 'fortnightly')).toBeNull();
    });
});

describe('advancePastDue — the landing rule (design D1)', () => {
    const today = utc('2026-07-26');

    it('lands on the LAST occurrence <= today, not the first one after it', () => {
        // THE load-bearing case. The live monthly workflow: due 2026-06-06.
        // Correct  -> 2026-07-06 (in the past => digest bucket `overdue` => nudge fires)
        // Rejected -> 2026-08-06 (future => bucket `upcoming` => selector returns
        //             null => Ross stays silent another 11 days while the home
        //             card claims "all clear").
        const r = advancePastDue({ nextDueDate: utc('2026-06-06'), recurrence: 'monthly', todayMs: today });
        expect(iso(r.newNextDueDate)).toBe('2026-07-06');
        expect(r.newNextDueDate).toBeLessThan(today);
    });

    it('unfreezes the live weekly workflow into the past as well', () => {
        const r = advancePastDue({ nextDueDate: utc('2026-06-17'), recurrence: 'weekly', todayMs: today });
        expect(iso(r.newNextDueDate)).toBe('2026-07-22');
        expect(r.newNextDueDate).toBeLessThan(today);
    });

    it('keeps the result late, so onTime stays honest', () => {
        // ross.js:1678 computes onTime as `now <= nextDueDate`. Landing in the
        // past is what stops a six-week-late completion being stamped on-time.
        const r = advancePastDue({ nextDueDate: utc('2026-06-17'), recurrence: 'weekly', todayMs: today });
        expect(r.newNextDueDate).toBeLessThanOrEqual(today);
    });

    it('may land exactly on today', () => {
        const r = advancePastDue({ nextDueDate: utc('2026-07-19'), recurrence: 'weekly', todayMs: today });
        expect(iso(r.newNextDueDate)).toBe('2026-07-26');
    });

    it('reports cycles fully skipped, excluding the current one', () => {
        // 2026-06-06 -> 07-06 is one step; the current period is not "missed".
        const r = advancePastDue({ nextDueDate: utc('2026-06-06'), recurrence: 'monthly', todayMs: today });
        expect(r.missedCycles).toBe(0);
        // Daily frozen 10 days: steps to 07-26, 9 of which are fully skipped.
        const d = advancePastDue({ nextDueDate: utc('2026-07-16'), recurrence: 'daily', todayMs: today });
        expect(iso(d.newNextDueDate)).toBe('2026-07-26');
        expect(d.missedCycles).toBe(9);
    });

    it('reports the delta so task dueDates can be shifted in lockstep', () => {
        const r = advancePastDue({ nextDueDate: utc('2026-07-16'), recurrence: 'daily', todayMs: today });
        expect(r.deltaMs).toBe(utc('2026-07-26') - utc('2026-07-16'));
    });
});

describe('advancePastDue — cases that must NOT advance', () => {
    const today = utc('2026-07-26');

    it('leaves a future date alone', () => {
        expect(advancePastDue({ nextDueDate: utc('2026-08-01'), recurrence: 'daily', todayMs: today })).toBeNull();
    });

    it('leaves a date that is exactly today alone', () => {
        expect(advancePastDue({ nextDueDate: today, recurrence: 'daily', todayMs: today })).toBeNull();
    });

    it('never advances a one-off workflow', () => {
        expect(advancePastDue({ nextDueDate: utc('2026-01-01'), recurrence: 'once', todayMs: today })).toBeNull();
    });

    it('skips an unknown recurrence rather than inventing a period', () => {
        expect(advancePastDue({ nextDueDate: utc('2026-01-01'), recurrence: 'fortnightly', todayMs: today })).toBeNull();
    });

    it('skips an unparseable date rather than guessing', () => {
        expect(advancePastDue({ nextDueDate: 'garbage', recurrence: 'daily', todayMs: today })).toBeNull();
        expect(advancePastDue({ nextDueDate: null, recurrence: 'daily', todayMs: today })).toBeNull();
    });

    it('trips the loop guard on corrupt far-past data instead of spinning', () => {
        // Epoch 0 with a daily recurrence would need ~20k iterations.
        const r = advancePastDue({ nextDueDate: 0, recurrence: 'daily', todayMs: today });
        expect(r).toBeNull();
        expect(MAX_PERIODS).toBeLessThanOrEqual(1000);
    });

    it('still advances a far-past date when the period is coarse enough to fit the guard', () => {
        const r = advancePastDue({ nextDueDate: utc('2015-01-01'), recurrence: 'annually', todayMs: utc('2026-07-26') });
        expect(iso(r.newNextDueDate)).toBe('2026-01-01');
    });
});

describe('advancePastDue — string input repairs the type', () => {
    it('accepts a string nextDueDate and emits a number', () => {
        const r = advancePastDue({ nextDueDate: '2026-06-06', recurrence: 'monthly', todayMs: utc('2026-07-26') });
        expect(typeof r.newNextDueDate).toBe('number');
        expect(iso(r.newNextDueDate)).toBe('2026-07-06');
    });
});
