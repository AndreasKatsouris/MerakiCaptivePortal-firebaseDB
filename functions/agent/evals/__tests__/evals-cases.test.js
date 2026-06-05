import { describe, it, expect } from 'vitest'
import { CASES } from '../cases.js'

describe('eval cases', () => {
  it('has 21 well-formed cases with unique ids', () => {
    expect(CASES.length).toBe(21)
    const ids = CASES.map((c) => c.id)
    expect(new Set(ids).size).toBe(21)
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
})
