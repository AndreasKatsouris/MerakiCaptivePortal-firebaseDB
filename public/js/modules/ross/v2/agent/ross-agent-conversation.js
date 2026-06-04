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

/**
 * Resume after a confirm decision. Finalize the paused assistant turn, then open
 * a FRESH assistant turn for the post-decision continuation so the pre-confirm
 * explanation and the post-approve result don't run together in one bubble.
 */
export function startResume(state) {
  const finalized = patchLastAssistant(state, (t) => ({ ...t, status: 'done' }))
  return {
    ...finalized,
    banner: null,
    busy: true,
    pendingConfirm: null,
    turns: [...finalized.turns, { role: 'assistant', text: '', actions: [], status: 'streaming' }],
  }
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
      return {
        ...patchLastAssistant(state, (t) => ({ ...t, status: 'done' })),
        banner: { kind: 'terminal', message: event.message },
        busy: false,
      }
    case 'error':
      return {
        ...patchLastAssistant(state, (t) => ({ ...t, status: 'done' })),
        banner: { kind: 'error', message: event.message },
        busy: false,
      }
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
