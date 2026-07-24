import { describe, it, expect } from 'vitest'
import { CASES } from '../cases.js'

describe('eval cases', () => {
  it('has 23 well-formed cases with unique ids', () => {
    expect(CASES.length).toBe(23)
    const ids = CASES.map((c) => c.id)
    expect(new Set(ids).size).toBe(23)
    for (const c of CASES) {
      expect(typeof c.prompt === 'string' && c.prompt.length).toBeTruthy()
      expect(c.seed && typeof c.seed.asUid === 'string').toBeTruthy()
      expect(c.expect && typeof c.expect === 'object').toBeTruthy()
    }
  })

  it('covers every category from the spec', () => {
    const cats = new Set(CASES.map((c) => c.category))
    for (const need of ['grounded', 'confirm', 'refusal', 'preflight', 'security']) {
      expect(cats.has(need)).toBe(true)
    }
  })

  it('the security case carries a noForeignData expectation', () => {
    const sec = CASES.find((c) => c.category === 'security')
    expect(sec.expect.noForeignData).toBeTruthy()
  })

  it('q-compliance / q-overdue / q-today do NOT assert tools:getWorkflowDigest (preloaded in system prompt)', () => {
    // Guard: buildSystemForOwner runs getWorkflowDigest at prompt-build time and
    // injects the result into the system prompt. Asserting the tool must be called
    // again is a false expectation that causes false-fail on valid Ross behaviour.
    for (const id of ['q-compliance', 'q-overdue', 'q-today']) {
      const c = CASES.find((x) => x.id === id)
      expect(c).toBeTruthy()
      expect(c.expect.tools).toBeUndefined()
    }
  })

  it('q-staff / q-staff-runs still assert tool calls (Group B — real product signal)', () => {
    // These are NOT touching the harness — they represent genuine failures (Ross not
    // proactively calling tools). The assertions must remain to keep the honest signal.
    const qStaff = CASES.find((c) => c.id === 'q-staff')
    expect(qStaff.expect.tools).toEqual(['getStaff'])
  })

  it('snooze guards the REFUSAL — snoozing is a user action, not an agent capability', () => {
    // Inverted 2026-07-21 with the removal of the snoozeCard tool. The old
    // expectation (tools: ['snoozeCard']) rewarded the model for inventing a
    // cardId, because nothing in the agent's context ever supplied one.
    const snooze = CASES.find((c) => c.id === 'snooze')
    expect(snooze.expect.tools).toBeUndefined()
    expect(snooze.expect.refuse).toBe(true)
    expect(snooze.expect.judge.honest).toBe(true)
  })
})
