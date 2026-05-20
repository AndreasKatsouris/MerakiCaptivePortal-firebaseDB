// Shared workflow-status computation used by the home concierge card
// (via detectors.js) AND by the Playbook + Activity stat counters.
//
// Background (PR #72 reflect): the server's `locData.status` field is
// set to 'active' on rossActivateWorkflow and is NEVER updated to
// 'overdue'. The home digest CF derives overdue state authoritatively
// from `nextDueDate < today`. Playbook + Activity stores were using
// `w.status === 'overdue'` — which always returned 0 — so the operator
// saw "Overdue: 0" alongside a home card warning about missed
// workflows. This module is the client-side mirror of the server's
// derivation so all three surfaces stay consistent.
//
// PR #72 LESSON applied: `nextDueDate` may arrive as either a number
// (epoch ms, server's canonical form per functions/ross.js:703 etc) or
// a string (ISO date, operator-edited values via Firebase Console). The
// normaliser accepts both.

// Workflows ≥ this many days late get the stronger "Missed" framing.
// Per operator design call on PR #72 — "Overdue" implies acknowledgement;
// "Missed" implies the workflow has gone untouched and warrants
// stronger attention.
export const MISSED_DAYS_THRESHOLD = 4

const MS_PER_DAY = 86_400_000

/**
 * Normalise `nextDueDate` to a UTC midnight Date. Accepts:
 *   - number (epoch ms — server's canonical form)
 *   - ISO date string ('YYYY-MM-DD') or full ISO timestamp
 *   - null / undefined → null
 *
 * Returns null on unparseable input so callers can opt out cleanly
 * (a workflow with no nextDueDate is neither overdue nor missed).
 */
export function normalizeNextDueDate(value) {
  if (value === null || value === undefined || value === '') return null
  // Number path — already an epoch ms timestamp.
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : _atUtcMidnight(d)
  }
  // String path — try ISO date first, then full ISO timestamp.
  if (typeof value === 'string') {
    // 'YYYY-MM-DD' → treat as UTC midnight to avoid TZ slip.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const ms = Date.parse(`${value}T00:00:00Z`)
      return Number.isFinite(ms) ? new Date(ms) : null
    }
    const ms = Date.parse(value)
    if (!Number.isFinite(ms)) return null
    return _atUtcMidnight(new Date(ms))
  }
  return null
}

function _atUtcMidnight(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Days late = days(nowAtUtcMidnight - nextDueDateAtUtcMidnight).
 *   nextDueDate in the past → positive
 *   nextDueDate today        → 0
 *   nextDueDate in the future → negative
 *
 * Returns null if nextDueDate is null / unparseable.
 */
export function computeDaysLate(nextDueDate, now = Date.now()) {
  const due = normalizeNextDueDate(nextDueDate)
  if (!due) return null
  const today = _atUtcMidnight(new Date(now))
  return Math.floor((today.getTime() - due.getTime()) / MS_PER_DAY)
}

/**
 * A workflow / row is "overdue" when daysLate >= 1 (strictly past due).
 * Same threshold as the server digest's `normalizedNextDueDate < today`
 * test (functions/ross.js:329).
 *
 * `row` may be a playbook-store workflow OR an activity-store report
 * row — both expose `nextDueDate` and `status`. Paused or archived
 * workflows are excluded because the operator has explicitly disabled
 * them; counting them would inflate the warning number.
 */
export function isOverdue(row, now = Date.now()) {
  if (!row) return false
  if (row.status === 'paused' || row.status === 'archived') return false
  const dl = computeDaysLate(row.nextDueDate, now)
  return dl !== null && dl >= 1
}

/**
 * A workflow / row is "missed" when daysLate >= MISSED_DAYS_THRESHOLD.
 * Strict superset of `isOverdue`.
 */
export function isMissed(row, now = Date.now()) {
  if (!row) return false
  if (row.status === 'paused' || row.status === 'archived') return false
  const dl = computeDaysLate(row.nextDueDate, now)
  return dl !== null && dl >= MISSED_DAYS_THRESHOLD
}
