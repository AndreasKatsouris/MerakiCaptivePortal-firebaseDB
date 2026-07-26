'use strict';

/**
 * ROSS recurrence advance — PURE core. No I/O, no admin SDK, no clock.
 *
 * Why this exists: a workflow's `nextDueDate` is written once and never moves,
 * so once any run starts on or after it, `runCoversCurrentPeriod`
 * (functions/ross.js:404-406) is permanently true and the workflow can never be
 * overdue or due-today again. It goes silent forever — on the W2 nudge AND on
 * Ross's home card, which then reports "all clear".
 *
 * LANDING RULE (design D1, and the whole point of the job): advance to the LAST
 * occurrence <= today, NOT the first occurrence >= today. The nudge selector
 * (agent/sweep/nudge-selector.js) consumes only `overdue` and `today` — it never
 * reads `upcoming`. Landing in the future therefore keeps Ross silent for
 * another whole period while the home card actively claims nothing is pending.
 * Landing on the current period's due date puts the item straight into
 * `overdue`, which is the symptom we are trying to restore.
 *
 * DATE CONTRACT (design D4): input and output are UTC-midnight epoch-ms, and all
 * day/month arithmetic uses UTC getters. Every existing writer produces UTC
 * midnight (`Date.parse('YYYY-MM-DD')`) and every reader slices UTC
 * (`ross.js:340`), so landing on SAST midnight would read back one day EARLY —
 * which for a daily workflow means instantly overdue, every day.
 *
 * TYPE REALITY: `nextDueDate` is NOT reliably a number. Two STATUS.READY agent
 * tools write an ISO date string (agent/tools.js:245-269, :291-293) and nothing
 * coerces it (ross.js:736, :803 only check truthiness). So parse defensively and
 * always emit a number — this job repairs the type as it goes.
 */

const MS_PER_DAY = 86400000;

/** Recurrences advanced by whole days. */
const DAY_PERIODS = { daily: 1, weekly: 7 };
/** Recurrences advanced by calendar months (day-of-month clamped). */
const MONTH_PERIODS = { monthly: 1, quarterly: 3, annually: 12 };

/** A one-off workflow has no next occurrence and must never be advanced. */
const NON_RECURRING = 'once';

/**
 * Loop guard. A corrupt 1970 date must not spin: 1,000 daily periods is ~2.7
 * years, far beyond any legitimate backlog, so hitting it means bad data.
 */
const MAX_PERIODS = 1000;

/**
 * Parse any `nextDueDate` shape seen in the wild to UTC-midnight epoch-ms.
 * Accepts epoch-ms number (with or without a time component — see
 * `rossSeedFirstWorkflow`, ross.js:968), 'YYYY-MM-DD', and full ISO timestamps.
 * @returns {number|null} null when unparseable — callers SKIP, never guess.
 */
function toUtcMidnightMs(value) {
    if (value === null || value === undefined || typeof value === 'boolean') return null;
    let ms;
    if (typeof value === 'number') {
        ms = value;
    } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        // Bare 'YYYY-MM-DD' parses as UTC midnight already; full ISO may carry a zone.
        ms = Date.parse(trimmed);
    } else {
        return null;
    }
    if (!Number.isFinite(ms)) return null;
    // Truncate any time-of-day component to UTC midnight.
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Add `count` calendar months in UTC, clamping day-of-month so 31 Jan + 1 month
 * lands on 28/29 Feb rather than spilling into March.
 */
function addUtcMonths(ms, count) {
    const d = new Date(ms);
    const day = d.getUTCDate();
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + count, 1));
    const daysInTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, daysInTarget));
}

/**
 * The occurrence immediately after `ms` for this recurrence.
 * @returns {number|null} null when the recurrence has no next occurrence.
 */
function nextOccurrence(ms, recurrence, customInterval) {
    // A positive customInterval overrides the named recurrence (ross.js:779).
    if (Number.isInteger(customInterval) && customInterval > 0) {
        return ms + (customInterval * MS_PER_DAY);
    }
    if (recurrence === NON_RECURRING) return null;
    if (DAY_PERIODS[recurrence]) return ms + (DAY_PERIODS[recurrence] * MS_PER_DAY);
    if (MONTH_PERIODS[recurrence]) return addUtcMonths(ms, MONTH_PERIODS[recurrence]);
    return null; // unknown recurrence — caller skips
}

/**
 * Roll a frozen due date forward to the CURRENT period.
 *
 * @param {{nextDueDate:*, recurrence:string, customInterval:*, todayMs:number}} input
 *   todayMs must already be UTC midnight for "today".
 * @returns {{newNextDueDate:number, missedCycles:number, deltaMs:number}|null}
 *   null when nothing should change (not due, non-recurring, unparseable,
 *   unknown recurrence, or the loop guard tripped).
 */
function advancePastDue({ nextDueDate, recurrence, customInterval, todayMs }) {
    const current = toUtcMidnightMs(nextDueDate);
    if (current === null) return null;
    if (!Number.isFinite(todayMs)) return null;
    if (recurrence === NON_RECURRING) return null;

    // Already current or in the future — the overwhelmingly common case.
    if (current >= todayMs) return null;

    let cursor = current;
    let missedCycles = 0;

    // Walk to the LAST occurrence <= today (D1): step while the NEXT one would
    // still not exceed today, so we stop ON the current period, not past it.
    for (;;) {
        const next = nextOccurrence(cursor, recurrence, customInterval);
        if (next === null) return null;          // unknown/non-recurring
        if (next > todayMs) break;               // cursor is the current period
        if (next === cursor) return null;        // defensive: zero-length period
        cursor = next;
        missedCycles += 1;
        if (missedCycles >= MAX_PERIODS) return null; // corrupt data — skip loudly upstream
    }

    if (cursor === current) return null; // nothing moved

    return {
        newNextDueDate: cursor,
        // Cycles fully skipped over. Landing ON the current period means the
        // current one is not itself "missed" — it is due now.
        missedCycles: Math.max(0, missedCycles - 1),
        deltaMs: cursor - current,
    };
}

module.exports = {
    advancePastDue,
    nextOccurrence,
    toUtcMidnightMs,
    addUtcMonths,
    MS_PER_DAY,
    MAX_PERIODS,
    NON_RECURRING,
};
