import { auth } from '../../../../config/firebase-config.js'
import { createSSEParser } from './ross-agent-sse.js'

const FUNCTIONS_BASE_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net'
const ROSS_CHAT_URL = `${FUNCTIONS_BASE_URL}/rossChat`

/** Client-local date in SA timezone — server uses it for "today" boundaries. */
function saToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/**
 * Core SSE pump. POSTs `body` (FLAT — rossChat reads req.body directly, NOT
 * req.body.data) with a Bearer ID token, then reads the event-stream and calls
 * onEvent(parsedEvent) for each frame.
 *
 * Never throws to the caller: transport/HTTP failures are surfaced as a
 * synthetic { type:'error' } event so the reducer renders a banner uniformly.
 * Aborts are swallowed silently; cancellation wiring is deferred (callers disable input while busy).
 */
async function pump(body, onEvent) {
  const user = auth.currentUser
  // Track whether a turn-ENDING event (done/terminal/error) reached the caller.
  // The reducer only clears `busy` on those; if the stream closes cleanly having
  // emitted none (e.g. the CF returns 200 + SSE headers then drops the connection
  // with zero frames on a cold-start timeout), we must synthesize one — otherwise
  // the input stays disabled with no recovery short of a reload (review M-2).
  let sawTerminal = false
  const emit = (ev) => {
    if (ev.type === 'done' || ev.type === 'terminal' || ev.type === 'error') sawTerminal = true
    onEvent(ev)
  }

  if (!user) {
    emit({ type: 'error', code: 'no_auth', message: 'Please sign in to ask Ross.' })
    return
  }
  const controller = new AbortController()

  let res
  try {
    const idToken = await user.getIdToken()
    res = await fetch(ROSS_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ clientToday: saToday(), ...body }),
      signal: controller.signal,
    })
  } catch (err) {
    if (controller.signal.aborted) return
    emit({ type: 'error', code: 'network', message: 'Could not reach Ross. Check your connection and try again.' })
    return
  }

  if (!res.ok) {
    emit({ type: 'error', code: `http_${res.status}`, message: 'Ross is unavailable right now. Please try again.' })
    return
  }

  const decoder = new TextDecoder()
  const parser = createSSEParser()
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) emit(ev)
    }
  } catch (err) {
    if (!controller.signal.aborted) {
      emit({ type: 'error', code: 'stream', message: 'Ross’s reply was cut off. Please try again.' })
    }
    return
  }

  // Stream ended cleanly. If the server never sent a turn-ending event, synthesize
  // one so the UI can't hang busy (review M-2). The abort guard avoids a spurious
  // error when the caller intentionally cancelled.
  if (!sawTerminal && !controller.signal.aborted) {
    emit({ type: 'error', code: 'truncated', message: 'Ross didn’t finish that reply. Please try again.' })
  }
}

/** Start a fresh turn. body: { message, threadId? }. */
export function streamRossChat(body, onEvent) {
  return pump(body, onEvent)
}

/** Resume a paused confirm turn. */
export function resumeRossChat({ resumeTurnId, decision }, onEvent) {
  return pump({ resumeTurnId, decision }, onEvent)
}
