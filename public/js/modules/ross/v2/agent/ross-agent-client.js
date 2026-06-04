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
  if (!user) {
    onEvent({ type: 'error', code: 'no_auth', message: 'Please sign in to ask Ross.' })
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
    onEvent({ type: 'error', code: 'network', message: 'Could not reach Ross. Check your connection and try again.' })
    return
  }

  if (!res.ok) {
    onEvent({ type: 'error', code: `http_${res.status}`, message: 'Ross is unavailable right now. Please try again.' })
    return
  }

  const decoder = new TextDecoder()
  const parser = createSSEParser()
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) onEvent(ev)
    }
  } catch (err) {
    if (!controller.signal.aborted) {
      onEvent({ type: 'error', code: 'stream', message: 'Ross’s reply was cut off. Please try again.' })
    }
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
