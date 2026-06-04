/**
 * Immutable conversation state for the Ask Ross modal. Every function returns a
 * NEW state object (project immutability rule) — never mutate the input.
 *
 * Pure: no fetch, no DOM, no timers. The modal feeds SSE events from the client
 * through reduceEvent() and re-renders from the returned state.
 */

export function initialConversation() {
  return {
    threadId: null,
    turns: [],
    pendingConfirm: null,
    banner: null,
    busy: false,
    lastCostCents: null,
  }
}

/** Begin a fresh user turn: append the user message + an empty streaming assistant turn. */
export function startUserTurn(state, message) {
  return {
    ...state,
    banner: null,
    busy: true,
    pendingConfirm: null,
    turns: [
      ...state.turns,
      { role: 'user', text: message, actions: [], status: 'done' },
      { role: 'assistant', text: '', actions: [], status: 'streaming' },
    ],
  }
}

/** Resume after a confirm decision: continue the SAME assistant turn (re-open it for streaming). */
export function startResume(state) {
  const turns = state.turns.slice()
  const last = turns[turns.length - 1]
  if (last && last.role === 'assistant') {
    turns[turns.length - 1] = { ...last, status: 'streaming' }
  } else {
    turns.push({ role: 'assistant', text: '', actions: [], status: 'streaming' })
  }
  return { ...state, banner: null, busy: true, pendingConfirm: null, turns }
}

function patchLastAssistant(state, patch) {
  const turns = state.turns.slice()
  // Find the last assistant turn.
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'assistant') {
      turns[i] = patch(turns[i])
      return { ...state, turns }
    }
  }
  return state
}

/** Fold one SSE event into the conversation. Returns a new state. */
export function reduceEvent(state, event) {
  switch (event.type) {
    case 'text':
      return patchLastAssistant(state, (t) => ({ ...t, text: t.text + event.delta }))
    case 'action':
      return patchLastAssistant(state, (t) => ({
        ...t,
        actions: [...t.actions, { tool: event.tool, status: event.status }],
      }))
    case 'confirm':
      return {
        ...state,
        pendingConfirm: {
          turnId: event.turnId,
          tool: event.tool,
          summary: event.summary,
          args: event.args,
          expiresAt: event.expiresAt,
        },
      }
    case 'terminal':
      return { ...state, banner: { kind: 'terminal', message: event.message }, busy: false }
    case 'error':
      return { ...state, banner: { kind: 'error', message: event.message }, busy: false }
    case 'done': {
      const finalized = patchLastAssistant(state, (t) => ({ ...t, status: 'done' }))
      return {
        ...finalized,
        threadId: event.threadId || finalized.threadId,
        lastCostCents: typeof event.costCents === 'number' ? event.costCents : finalized.lastCostCents,
        busy: false,
        pendingConfirm: null,
      }
    }
    default:
      return state
  }
}
