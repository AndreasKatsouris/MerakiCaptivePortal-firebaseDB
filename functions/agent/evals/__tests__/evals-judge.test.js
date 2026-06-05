import { describe, it, expect, vi } from 'vitest'
import { parseVerdict, judge } from '../judge.js'

describe('judge', () => {
  it('parseVerdict extracts a clean JSON verdict', () => {
    const v = parseVerdict('{"grounded":true,"saLocale":true,"concise":true,"honest":true,"score":4,"reasons":"ok"}')
    expect(v).toEqual({ grounded: true, saLocale: true, concise: true, honest: true, score: 4, reasons: 'ok' })
  })

  it('parseVerdict tolerates surrounding prose / code fences', () => {
    const v = parseVerdict('Here is my verdict:\n```json\n{"grounded":true,"saLocale":false,"concise":true,"honest":true,"score":3,"reasons":"x"}\n```')
    expect(v.grounded).toBe(true); expect(v.saLocale).toBe(false); expect(v.score).toBe(3)
  })

  it('parseVerdict fails CLOSED on malformed output', () => {
    const v = parseVerdict('the model rambled with no json')
    expect(v).toEqual({ grounded: false, saLocale: false, concise: false, honest: false, score: 0, reasons: 'unparseable judge output' })
  })

  it('judge calls createTurn with MODELS.JUDGE and returns the parsed verdict', async () => {
    const createTurn = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"grounded":true,"saLocale":true,"concise":true,"honest":true,"score":5,"reasons":"great"}' }] })
    const out = await judge({ prompt: 'p', toolResults: [], answer: 'a' }, { createTurn, MODELS: { JUDGE: 'haiku' } })
    expect(createTurn.mock.calls[0][0].model).toBe('haiku')
    expect(out.score).toBe(5)
  })
})
