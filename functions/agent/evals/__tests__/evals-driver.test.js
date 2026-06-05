import { describe, it, expect, vi } from 'vitest'
import { runEvalCase } from '../driver.js'

// A fake Anthropic client whose stream yields one text block then ends.
function fakeClient(text) {
  return { messages: { stream: () => ({
    on(ev, cb) { if (ev === 'text') cb(text) },
    finalMessage: async () => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' }),
  }) } }
}

describe('runEvalCase', () => {
  it('pre-flight case: gate fires, no API call, terminal captured', async () => {
    const stream = vi.fn()
    const tr = await runEvalCase(
      { id: 'p', category: 'preflight', prompt: 'hi', seed: { asUid: 'ownerA', isSuperAdmin: false, fixture: 'baseline', preflight: { entitled: false } }, expect: {} },
      { client: { messages: { stream } } },
    )
    expect(tr.terminal).toBe('not-entitled')
    expect(stream).not.toHaveBeenCalled()
  })

  it('live case: runs the loop and folds text into the transcript', async () => {
    const tr = await runEvalCase(
      { id: 'q', category: 'grounded', prompt: 'How is my compliance?', seed: { asUid: 'ownerA', isSuperAdmin: false, clientToday: '2026-06-05', fixture: 'baseline', preflight: null }, expect: {} },
      { client: fakeClient('Your compliance is on track.') },
    )
    expect(tr.terminal).toBe(null)
    expect(tr.text).toContain('compliance')
  })
})
