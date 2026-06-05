import { describe, it, expect } from 'vitest'
import { baselineFixture } from '../fixtures.js'

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
})
