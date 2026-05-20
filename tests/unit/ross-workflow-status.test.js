import { describe, test, expect } from 'vitest'
import {
  MISSED_DAYS_THRESHOLD,
  normalizeNextDueDate,
  computeDaysLate,
  isOverdue,
  isMissed,
} from '../../public/js/modules/ross/v2/workflow-status.js'

const today = Date.parse('2026-05-20T12:00:00Z')

describe('MISSED_DAYS_THRESHOLD', () => {
  test('matches the PR #72 home concierge card threshold (4 days)', () => {
    expect(MISSED_DAYS_THRESHOLD).toBe(4)
  })
})

describe('normalizeNextDueDate', () => {
  test('null / undefined / empty string → null', () => {
    expect(normalizeNextDueDate(null)).toBeNull()
    expect(normalizeNextDueDate(undefined)).toBeNull()
    expect(normalizeNextDueDate('')).toBeNull()
  })

  test('epoch ms number → UTC-midnight Date', () => {
    // Server canonical form per functions/ross.js:703
    const d = normalizeNextDueDate(Date.parse('2026-05-20T18:30:00Z'))
    expect(d.toISOString()).toBe('2026-05-20T00:00:00.000Z')
  })

  test('YYYY-MM-DD string → UTC-midnight Date (no TZ slip)', () => {
    expect(normalizeNextDueDate('2026-05-20').toISOString()).toBe('2026-05-20T00:00:00.000Z')
  })

  test('full ISO timestamp string → UTC-midnight Date', () => {
    expect(normalizeNextDueDate('2026-05-20T08:00:00Z').toISOString()).toBe('2026-05-20T00:00:00.000Z')
  })

  test('garbage string → null', () => {
    expect(normalizeNextDueDate('not-a-date')).toBeNull()
  })

  test('NaN number → null', () => {
    expect(normalizeNextDueDate(NaN)).toBeNull()
  })
})

describe('computeDaysLate', () => {
  test('due today → 0', () => {
    expect(computeDaysLate('2026-05-20', today)).toBe(0)
  })
  test('due yesterday → 1', () => {
    expect(computeDaysLate('2026-05-19', today)).toBe(1)
  })
  test('due 10 days ago → 10', () => {
    expect(computeDaysLate('2026-05-10', today)).toBe(10)
  })
  test('due tomorrow → -1', () => {
    expect(computeDaysLate('2026-05-21', today)).toBe(-1)
  })
  test('null nextDueDate → null', () => {
    expect(computeDaysLate(null, today)).toBeNull()
  })
  test('handles epoch ms number input', () => {
    expect(computeDaysLate(Date.parse('2026-05-15T00:00:00Z'), today)).toBe(5)
  })
})

describe('isOverdue', () => {
  test('row 1 day late → true', () => {
    expect(isOverdue({ nextDueDate: '2026-05-19', status: 'active' }, today)).toBe(true)
  })
  test('row due today → false (not yet overdue)', () => {
    expect(isOverdue({ nextDueDate: '2026-05-20', status: 'active' }, today)).toBe(false)
  })
  test('row due in future → false', () => {
    expect(isOverdue({ nextDueDate: '2026-05-25', status: 'active' }, today)).toBe(false)
  })
  test('paused workflow is excluded even when past due', () => {
    expect(isOverdue({ nextDueDate: '2026-05-10', status: 'paused' }, today)).toBe(false)
  })
  test('archived workflow is excluded even when past due', () => {
    expect(isOverdue({ nextDueDate: '2026-05-10', status: 'archived' }, today)).toBe(false)
  })
  test('null nextDueDate → false', () => {
    expect(isOverdue({ nextDueDate: null, status: 'active' }, today)).toBe(false)
  })
  test('null row → false (defensive)', () => {
    expect(isOverdue(null, today)).toBe(false)
  })
})

describe('isMissed', () => {
  test('row exactly 4 days late → true (at threshold)', () => {
    expect(isMissed({ nextDueDate: '2026-05-16', status: 'active' }, today)).toBe(true)
  })
  test('row 3 days late → false (below threshold)', () => {
    expect(isMissed({ nextDueDate: '2026-05-17', status: 'active' }, today)).toBe(false)
  })
  test('row 10 days late → true', () => {
    expect(isMissed({ nextDueDate: '2026-05-10', status: 'active' }, today)).toBe(true)
  })
  test('paused workflow is excluded even when long past due', () => {
    expect(isMissed({ nextDueDate: '2026-04-01', status: 'paused' }, today)).toBe(false)
  })
})

describe('shape contract — the bug this PR fixes', () => {
  test('rows whose status:active is set by the server are correctly flagged overdue from nextDueDate alone', () => {
    // The operator's PR #72 bug: server writes locData.status:"active" and
    // never updates it. The previous filter `status === 'overdue'` always
    // returned 0. Verify the new derivation flags the row correctly.
    const realServerRow = {
      workflowId: 'wf_abc',
      locationId: 'loc_xyz',
      status: 'active',  // ← what the server ACTUALLY writes
      nextDueDate: '2026-05-10',  // 10 days ago
    }
    expect(isOverdue(realServerRow, today)).toBe(true)
    expect(isMissed(realServerRow, today)).toBe(true)
  })
})
