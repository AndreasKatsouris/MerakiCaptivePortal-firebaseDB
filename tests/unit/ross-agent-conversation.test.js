import { describe, test, expect } from 'vitest'
import {
  initialConversation,
  startUserTurn,
  startResume,
  reduceEvent,
} from '../../public/js/modules/ross/v2/agent/ross-agent-conversation.js'

describe('ross-agent-conversation', () => {
  test('startUserTurn pushes a user turn + a streaming assistant turn and goes busy', () => {
    const s = startUserTurn(initialConversation(), 'how are my fridges?')
    expect(s.turns).toEqual([
      { role: 'user', text: 'how are my fridges?', actions: [], status: 'done' },
      { role: 'assistant', text: '', actions: [], status: 'streaming' },
    ])
    expect(s.busy).toBe(true)
    expect(s.banner).toBe(null)
  })

  test('does not mutate the input state (immutability)', () => {
    const s0 = initialConversation()
    const s1 = startUserTurn(s0, 'hi')
    expect(s0.turns).toEqual([])
    expect(s1).not.toBe(s0)
  })

  test('text deltas append to the streaming assistant turn', () => {
    let s = startUserTurn(initialConversation(), 'hi')
    s = reduceEvent(s, { type: 'text', delta: 'Your ' })
    s = reduceEvent(s, { type: 'text', delta: 'fridges are fine.' })
    expect(s.turns[1].text).toBe('Your fridges are fine.')
  })

  test('action events accumulate on the streaming assistant turn', () => {
    let s = startUserTurn(initialConversation(), 'snooze it')
    s = reduceEvent(s, { type: 'action', tool: 'snoozeCard', status: 'done' })
    expect(s.turns[1].actions).toEqual([{ tool: 'snoozeCard', status: 'done' }])
  })

  test('confirm sets pendingConfirm and stays busy', () => {
    let s = startUserTurn(initialConversation(), 'activate compliance sweep')
    s = reduceEvent(s, { type: 'confirm', turnId: 'p1', tool: 'activateWorkflow', summary: 'Activate Compliance Sweep', args: { templateId: 't1' }, expiresAt: 999 })
    expect(s.pendingConfirm).toEqual({ turnId: 'p1', tool: 'activateWorkflow', summary: 'Activate Compliance Sweep', args: { templateId: 't1' }, expiresAt: 999 })
    expect(s.busy).toBe(true)
  })

  test('done captures threadId + cost, finalizes the turn, clears busy + pendingConfirm', () => {
    let s = startUserTurn(initialConversation(), 'hi')
    s = reduceEvent(s, { type: 'text', delta: 'done.' })
    s = reduceEvent(s, { type: 'done', threadId: 'th1', turnId: 'u1', costCents: 3 })
    expect(s.threadId).toBe('th1')
    expect(s.lastCostCents).toBe(3)
    expect(s.busy).toBe(false)
    expect(s.pendingConfirm).toBe(null)
    expect(s.turns[1].status).toBe('done')
  })

  test('terminal sets a terminal banner and clears busy', () => {
    let s = startUserTurn(initialConversation(), 'hi')
    s = reduceEvent(s, { type: 'terminal', reason: 'no-credit', message: 'Out of credit — ask an admin to top up.' })
    expect(s.banner).toEqual({ kind: 'terminal', message: 'Out of credit — ask an admin to top up.' })
    expect(s.busy).toBe(false)
  })

  test('error sets an error banner and clears busy', () => {
    let s = startUserTurn(initialConversation(), 'hi')
    s = reduceEvent(s, { type: 'error', code: 'internal', message: 'Ross hit a problem. Try again.' })
    expect(s.banner).toEqual({ kind: 'error', message: 'Ross hit a problem. Try again.' })
    expect(s.busy).toBe(false)
  })

  test('startResume clears pendingConfirm, goes busy, and reuses the streaming assistant turn', () => {
    let s = startUserTurn(initialConversation(), 'activate it')
    s = reduceEvent(s, { type: 'confirm', turnId: 'p1', tool: 'activateWorkflow', summary: 'Activate', args: {}, expiresAt: 1 })
    s = reduceEvent(s, { type: 'done', threadId: 'th1', turnId: 'u1', costCents: 1 })
    const r = startResume(s)
    expect(r.pendingConfirm).toBe(null)
    expect(r.busy).toBe(true)
    expect(r.turns[r.turns.length - 1]).toMatchObject({ role: 'assistant', status: 'streaming' })
  })
})
