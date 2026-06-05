import { describe, it, expect } from 'vitest'
import { summarize, formatLine } from '../scorecard.js'

describe('scorecard', () => {
  it('summarize counts passes and fails', () => {
    const results = [
      { id: 'a', pass: true, checks: [{ name: 'tools', pass: true, detail: '' }] },
      { id: 'b', pass: false, checks: [{ name: 'refused', pass: false, detail: 'tools ran' }] },
    ]
    const s = summarize(results)
    expect(s.total).toBe(2); expect(s.passed).toBe(1); expect(s.failed).toBe(1)
  })
  it('formatLine marks pass/fail', () => {
    expect(formatLine({ id: 'a', pass: true, checks: [] })).toContain('a')
  })
})
