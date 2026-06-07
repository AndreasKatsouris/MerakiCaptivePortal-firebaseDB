import { describe, it, expect } from 'vitest'
import { baselineFixture, FIXTURE_CONSTANTS } from '../fixtures.js'

const { BASE_2026, DAY, NEXT_DUE_OVERDUE } = FIXTURE_CONSTANTS

// Smallest plausible 2026 epoch-ms (2026-01-01T00:00:00Z).
const MIN_2026_MS = new Date('2026-01-01T00:00:00Z').getTime()

describe('baselineFixture', () => {
  it('seeds two tenants with isolated workflows/runs and userLocations', () => {
    const t = baselineFixture()
    expect(t.ross.workflows.ownerA).toBeTruthy()
    expect(t.userLocations.ownerA.locA).toBe(true)
    expect(t.ross.workflows.ownerB).toBeTruthy()
    expect(t.userLocations.ownerB.locB).toBe(true)
    expect(t.userLocations.ownerA.locB).toBeUndefined()
    const [wfA] = Object.keys(t.ross.workflows.ownerA)
    expect(t.ross.workflowsByLocation.locA[wfA]).toBe('ownerA')
    const runsA = t.ross.runs.ownerA[wfA].locA
    expect(Object.values(runsA)[0]).toHaveProperty('completedAt')
    // isolation holds both directions
    expect(t.userLocations.ownerB.locA).toBeUndefined()
    // balance path is the load-bearing one the real gate reads (ledger.js creditsPath)
    expect(t.billing.credits.ownerA.balanceCents).toBe(5000)
  })

  it('uses plausible 2026 timestamps — no degenerate 1970 epoch seeds', () => {
    // Guard: ensures the "20,609 days overdue" false-positive never re-appears.
    // Every timestamp in the fixture must be >= 2026-01-01 so the digest never
    // computes absurdly large overdue values that trip the judge's fabrication check.
    const t = baselineFixture()
    const [wfA] = Object.keys(t.ross.workflows.ownerA)
    const wf = t.ross.workflows.ownerA[wfA]

    // Workflow metadata timestamps
    expect(wf.createdAt).toBeGreaterThanOrEqual(MIN_2026_MS)
    expect(wf.updatedAt).toBeGreaterThanOrEqual(MIN_2026_MS)

    // Location nextDueDate is a 2026 epoch-ms number
    const locA = wf.locations.locA
    expect(typeof locA.nextDueDate).toBe('number')
    expect(locA.nextDueDate).toBeGreaterThanOrEqual(MIN_2026_MS)
    expect(locA.activatedAt).toBeGreaterThanOrEqual(MIN_2026_MS)

    // Run completedAt timestamps are 2026 values
    const runsA = t.ross.runs.ownerA[wfA].locA
    for (const run of Object.values(runsA)) {
      expect(run.completedAt).toBeGreaterThanOrEqual(MIN_2026_MS)
    }
  })

  it('NEXT_DUE_OVERDUE is before BASE_2026 so the workflow appears overdue on 2026-06-01', () => {
    // The fixture's overdue workflow must be in the past relative to the eval date
    // so buildHomeWorkflowDigest puts it in the `overdue` bucket (not `upcoming`).
    expect(NEXT_DUE_OVERDUE).toBeLessThan(BASE_2026)
    // Specifically 7 days before BASE_2026 (2026-05-25)
    expect(NEXT_DUE_OVERDUE).toBe(BASE_2026 - 7 * DAY)
  })
})
