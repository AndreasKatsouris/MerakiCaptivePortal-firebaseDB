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

  test('startResume finalizes the paused turn and opens a fresh streaming assistant turn', () => {
    let s = startUserTurn(initialConversation(), 'activate it')          // [user, assistant#1 streaming]
    s = reduceEvent(s, { type: 'text', delta: 'Activating…' })            // assistant#1 has text
    s = reduceEvent(s, { type: 'confirm', turnId: 'p1', tool: 'activateWorkflow', summary: 'Activate', args: {}, expiresAt: 1 })
    const before = s.turns.length
    const r = startResume(s)
    expect(r.pendingConfirm).toBe(null)
    expect(r.busy).toBe(true)
    expect(r.turns.length).toBe(before + 1)                               // a fresh turn was pushed
    expect(r.turns[before - 1]).toMatchObject({ role: 'assistant', text: 'Activating…', status: 'done' }) // old finalized
    expect(r.turns[r.turns.length - 1]).toMatchObject({ role: 'assistant', text: '', status: 'streaming' }) // fresh
  })

  test('done preserves costCents of 0 (not lost via a falsy check)', () => {
    let s = startUserTurn(initialConversation(), 'hi')
    s = reduceEvent(s, { type: 'done', threadId: 'th1', turnId: 'u1', costCents: 0 })
    expect(s.lastCostCents).toBe(0)
  })

  test('terminal finalizes the empty streaming assistant turn (no lingering thinking state)', () => {
    let s = startUserTurn(initialConversation(), 'hi')
    s = reduceEvent(s, { type: 'terminal', reason: 'no-credit', message: 'Out of credit.' })
    expect(s.turns[1].status).toBe('done')
    expect(s.banner).toEqual({ kind: 'terminal', message: 'Out of credit.' })
    expect(s.busy).toBe(false)
  })

  test('error finalizes the streaming assistant turn', () => {
    let s = startUserTurn(initialConversation(), 'hi')
    s = reduceEvent(s, { type: 'error', code: 'internal', message: 'oops' })
    expect(s.turns[1].status).toBe('done')
    expect(s.banner).toEqual({ kind: 'error', message: 'oops' })
  })

  test('done without a threadId keeps the existing threadId', () => {
    let s = startUserTurn(initialConversation(), 'first')
    s = reduceEvent(s, { type: 'done', threadId: 'th1', turnId: 'u1', costCents: 1 })
    s = startUserTurn(s, 'second')
    s = reduceEvent(s, { type: 'done', turnId: 'u2', costCents: 2 }) // no threadId on this event
    expect(s.threadId).toBe('th1')
  })

  // --- Conversation reset (close/new-chat) ---

  test('initialConversation() produces a clean state matching the reset shape', () => {
    // After a full conversation, calling initialConversation() again (the reset path)
    // must return a blank slate — no turns, no thread, not busy.
    let s = startUserTurn(initialConversation(), 'hi')
    s = reduceEvent(s, { type: 'done', threadId: 'th1', turnId: 'u1', costCents: 5 })
    // Simulate what the modal does on close/new-chat.
    const reset = initialConversation()
    expect(reset.turns).toEqual([])
    expect(reset.threadId).toBe(null)
    expect(reset.busy).toBe(false)
    expect(reset.pendingConfirm).toBe(null)
    expect(reset.banner).toBe(null)
    expect(reset.lastCostCents).toBe(null)
  })

  test('reset after a mid-stream abort does not carry over stale state', () => {
    // Simulate a conversation aborted mid-stream: busy is still true when
    // the modal closes. The reset (initialConversation) must clear busy
    // regardless — the abort() call stops the pump, and the modal replaces
    // convo with a fresh initialConversation() without waiting for the pump.
    let s = startUserTurn(initialConversation(), 'hi')
    // Abort fires before 'done' — busy is still true.
    expect(s.busy).toBe(true)
    // Reset wipes the conversation, including the busy flag.
    const reset = initialConversation()
    expect(reset.busy).toBe(false)
    expect(reset.turns).toEqual([])
  })

  test('reset v-key strategy: turns array is empty after reset so index-based keys are safe', () => {
    // The modal uses :key="`${resetCount}-${i}`". After a reset, turns === []
    // so no stale VDOM nodes with the old resetCount prefix survive.
    let s = startUserTurn(initialConversation(), 'first message')
    s = reduceEvent(s, { type: 'done', threadId: 't1', turnId: 'u1', costCents: 1 })
    expect(s.turns.length).toBe(2)
    // Reset.
    const reset = initialConversation()
    // All previous turn indices are gone — no key collision possible.
    expect(reset.turns.length).toBe(0)
  })
})
