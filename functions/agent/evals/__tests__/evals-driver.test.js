import { describe, it, expect, vi } from 'vitest'
import { runEvalCase } from '../driver.js'

// A fake Anthropic client whose stream yields one text block then ends.
function fakeClient(text) {
  return { messages: { stream: () => ({
    on(ev, cb) { if (ev === 'text') cb(text) },
    finalMessage: async () => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' }),
  }) } }
}

// A fake client that first calls a tool then responds with text.
function fakeClientWithTool(toolName, toolOutput, finalText) {
  let round = 0
  return { messages: { stream: () => ({
    on(ev, cb) { if (ev === 'text' && round > 0) cb(finalText) },
    finalMessage: async () => {
      round++
      if (round === 1) {
        return {
          content: [{ type: 'tool_use', id: 'tu_auto', name: toolName, input: {} }],
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: 'tool_use',
        }
      }
      return {
        content: [{ type: 'text', text: finalText }],
        usage: { input_tokens: 1, output_tokens: 1 },
        stop_reason: 'end_turn',
      }
    },
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

  it('paused confirm: runAgentLoop pause is captured into transcript.confirms (not executed)', async () => {
    // finalMessage returns a tool_use for a confirm-tier tool, so runAgentLoop pauses
    // and RETURNS { paused: true, pendingTool }, without executing the tool.
    const confirmClient = { messages: { stream: () => ({
      on() {},
      finalMessage: async () => ({
        content: [{ type: 'tool_use', id: 'tu1', name: 'activateTemplate', input: { templateId: 'wfA1', locationIds: ['locA'], nextDueDate: '2026-06-06' } }],
        usage: { input_tokens: 1, output_tokens: 1 },
        stop_reason: 'tool_use',
      }),
    }) } }
    const tr = await runEvalCase(
      { id: 'r', category: 'action', prompt: 'Activate the morning checks template', seed: { asUid: 'ownerA', isSuperAdmin: false, clientToday: '2026-06-05', fixture: 'baseline', preflight: null }, expect: {} },
      { client: confirmClient },
    )
    expect(tr.confirms.length).toBe(1)
    expect(tr.confirms[0].tool).toBe('activateTemplate')
    expect(tr.toolsCalled.some((t) => t.tool === 'activateTemplate' && t.status === 'done')).toBe(false)
  })

  it('system context injected into toolResults so judge can verify grounding without a tool call', async () => {
    // Guard: buildSystemForOwner pre-loads the digest into the system prompt.
    // The driver must inject a __systemContext__ synthetic entry so the judge
    // is not blind when Ross answers from the preloaded context (q-compliance etc).
    const tr = await runEvalCase(
      { id: 'q-compliance', category: 'grounded', prompt: 'How is my compliance looking?', seed: { asUid: 'ownerA', isSuperAdmin: false, clientToday: '2026-06-05', fixture: 'baseline', preflight: null }, expect: {} },
      { client: fakeClient('Your compliance looks good.') },
    )
    const sysCtx = tr.toolResults.find((r) => r.tool === '__systemContext__')
    expect(sysCtx).toBeTruthy()
    expect(typeof sysCtx.output).toBe('string')
    // System context should contain real workflow/location data, not placeholder text
    expect(sysCtx.output).toContain('Owner context')
  })

  it('tool outputs from auto-executed tools are captured in toolResults', async () => {
    // Guard: when the model calls an auto-tier tool (getStaff), the executeTool output
    // must be folded into transcript.toolResults so the judge can verify grounding.
    // The fakeClientWithTool path produces a REAL tool_result via executeTool, so we
    // expect >= 2 entries: the __systemContext__ synthetic + at least one loop-captured
    // tool_result. Asserting >= 1 would stay green on a step-4 regression (the system
    // context alone satisfies it), so >= 2 is what actually exercises the capture loop.
    const tr = await runEvalCase(
      { id: 'q-staff', category: 'multitool', prompt: 'Who is on staff at locA?', seed: { asUid: 'ownerA', isSuperAdmin: false, clientToday: '2026-06-05', fixture: 'baseline', preflight: null }, expect: {} },
      { client: fakeClientWithTool('getStaff', { staff: [] }, 'Staff at locA: Abe (Waiter), Zara (Chef).') },
    )
    expect(tr.toolResults.length).toBeGreaterThanOrEqual(2)
    // The loop-captured entry carries the paired tool name (not just a toolUseId).
    const staffResult = tr.toolResults.find((r) => r.tool === 'getStaff')
    expect(staffResult).toBeTruthy()
    expect(staffResult.toolUseId).toBeTruthy()
  })
})
