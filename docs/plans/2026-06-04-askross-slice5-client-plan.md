# askRoss Slice 5 — Ask Ross Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scripted `askRoss()` stub with a real ⌘K command-palette modal that streams a live Ross conversation from the `rossChat` SSE Cloud Function, renders inline confirm-cards, and shows friendly terminal/error banners.

**Architecture:** A pure SSE frame parser and a pure event→conversation reducer carry all the risky logic and are unit-tested in the node env (no DOM). A thin `fetch()`-based transport wraps them. Three Vue components (modal + message + confirm-card) consume the reducer and render via auto-escaping text interpolation. Desktop only this slice — mobile pill wiring is backlogged.

**Tech Stack:** Vanilla ES modules + Vue 3 (Options-free `<script setup>`), Hi-Fi `--hf-*` tokens + `Hf*` components, Firebase Auth ID tokens, `fetch()` + `ReadableStream` for SSE (native `EventSource` is GET-only and can't send an `Authorization` header), vitest.

---

## Server contract (already shipped — `functions/agent/rossChat.js`, do NOT modify)

- **Endpoint:** `POST https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/rossChat`
- **Auth:** `Authorization: Bearer <idToken>` header. CORS already allows the hosting origins (slice 3).
- **Body is FLAT** (NOT wrapped in `{ data: {...} }` like the sibling `rossV2Snooze`/`rossGetHomeWorkflowDigest` services):
  - New turn: `{ message: string, threadId?: string, clientToday?: 'YYYY-MM-DD' }`
  - Resume:   `{ resumeTurnId: string, decision: 'approve' | 'decline', clientToday?: 'YYYY-MM-DD' }`
- **Response:** `text/event-stream`. Frames are `data: <json>\n\n`. Event shapes (`type` discriminator):
  - `{ type: 'text', delta: string }`
  - `{ type: 'action', tool: string, status: 'refused' | 'done' | 'failed' | 'declined' }`
  - `{ type: 'confirm', turnId: string, tool: string, summary: string, args: object, expiresAt: number }`
  - `{ type: 'terminal', reason: string, gate?: string, message: string }`
  - `{ type: 'error', code: string, message: string }`
  - `{ type: 'done', threadId: string, turnId: string, costCents: number, decision?: 'approve'|'decline' }`

## File structure

| File | Responsibility |
|------|----------------|
| `public/js/modules/ross/v2/agent/ross-agent-sse.js` | **Pure.** `createSSEParser()` — stateful chunk→events splitter. No fetch, no DOM. |
| `public/js/modules/ross/v2/agent/ross-agent-conversation.js` | **Pure.** Immutable reducer: `initialConversation()`, `startUserTurn()`, `startResume()`, `reduceEvent()`. No fetch, no DOM. |
| `public/js/modules/ross/v2/agent/ross-agent-client.js` | Thin transport. `streamRossChat()` / `resumeRossChat()` — `fetch()` POST → `ReadableStream` → parser → `onEvent`. Returns `{ abort }`. |
| `public/js/modules/ross/v2/components/RossAskConfirmCard.vue` | Inline confirm-card. Text-interpolated (auto-escaped) summary + Approve/Cancel. |
| `public/js/modules/ross/v2/components/RossAskMessage.vue` | One turn bubble (user / streaming assistant + action lines). |
| `public/js/modules/ross/v2/components/RossAskModal.vue` | ⌘K modal. Owns conversation state, wires client + reducer, focus trap, ESC/scrim dismiss. |
| `public/js/modules/ross/v2/components/RossHomeDesktop.vue` (modify) | Mount the modal; open on ⌘K / rail click / `#ask=` deep-link. Retire scripted stub usage. |
| `public/js/modules/ross/v2/ross-service.js` (modify) | Remove the scripted `askRoss()` export + its `ASK_ROSS_SAMPLE` plumbing where dead. |
| `tests/unit/ross-agent-sse.test.js` | Parser tests. |
| `tests/unit/ross-agent-conversation.test.js` | Reducer tests. |
| `tests/unit/ross-agent-client.test.js` | Transport tests (mocked `fetch` + fake stream). |

**Testing note:** Component-mount tests need `happy-dom`, which is absent from this worktree's root `node_modules` and not used by any existing ross v2 test (they all test pure logic). We follow that pattern: all risky logic lives in the three pure/thin modules above and is unit-tested in the node env; the `.vue` components are verified by `npm run build` + manual preview smoke (the project's established UI verification path).

---

## Task 1: SSE frame parser (pure)

**Files:**
- Create: `public/js/modules/ross/v2/agent/ross-agent-sse.js`
- Test: `tests/unit/ross-agent-sse.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/ross-agent-sse.test.js
import { describe, test, expect } from 'vitest'
import { createSSEParser } from '../../public/js/modules/ross/v2/agent/ross-agent-sse.js'

describe('createSSEParser', () => {
  test('parses a single complete frame', () => {
    const p = createSSEParser()
    expect(p.push('data: {"type":"text","delta":"hi"}\n\n')).toEqual([
      { type: 'text', delta: 'hi' },
    ])
  })

  test('buffers a partial frame until the terminator arrives', () => {
    const p = createSSEParser()
    expect(p.push('data: {"type":"text",')).toEqual([])
    expect(p.push('"delta":"yo"}\n\n')).toEqual([{ type: 'text', delta: 'yo' }])
  })

  test('splits multiple frames in one chunk', () => {
    const p = createSSEParser()
    const out = p.push('data: {"type":"action","tool":"snoozeCard","status":"done"}\n\ndata: {"type":"done","threadId":"t1","turnId":"u1","costCents":2}\n\n')
    expect(out).toEqual([
      { type: 'action', tool: 'snoozeCard', status: 'done' },
      { type: 'done', threadId: 't1', turnId: 'u1', costCents: 2 },
    ])
  })

  test('ignores blank keep-alive lines and non-data lines', () => {
    const p = createSSEParser()
    expect(p.push(':\n\n')).toEqual([])
    expect(p.push('\n')).toEqual([])
  })

  test('skips a malformed JSON frame without throwing', () => {
    const p = createSSEParser()
    expect(p.push('data: not-json\n\n')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ross-agent-sse.test.js`
Expected: FAIL — `createSSEParser is not a function` / module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// public/js/modules/ross/v2/agent/ross-agent-sse.js

/**
 * Stateful Server-Sent-Events frame parser for the rossChat stream.
 *
 * The transport feeds raw decoded string chunks via push(); each call returns
 * the array of fully-parsed JSON event objects that completed in that chunk.
 * Incomplete trailing data is buffered until its `\n\n` terminator arrives.
 *
 * Pure: no fetch, no DOM, no timers. Unit-testable in the node env.
 */
export function createSSEParser() {
  let buffer = ''

  return {
    push(chunk) {
      buffer += chunk
      const events = []
      let sep
      // SSE frames are terminated by a blank line (\n\n).
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawFrame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        // A frame may contain multiple lines; we only care about `data:` lines.
        for (const line of rawFrame.split('\n')) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          try {
            events.push(JSON.parse(payload))
          } catch {
            // Malformed frame — skip it rather than killing the whole stream.
          }
        }
      }
      return events
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ross-agent-sse.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/ross/v2/agent/ross-agent-sse.js tests/unit/ross-agent-sse.test.js
git commit -m "feat(ross-agent): SSE frame parser for Ask Ross client (slice 5)"
```

---

## Task 2: Event→conversation reducer (pure)

**Files:**
- Create: `public/js/modules/ross/v2/agent/ross-agent-conversation.js`
- Test: `tests/unit/ross-agent-conversation.test.js`

State shape produced by `initialConversation()`:

```javascript
{
  threadId: null,        // string once the server returns it on `done`
  turns: [],             // [{ role:'user'|'assistant', text:string, actions:[{tool,status}], status:'streaming'|'done' }]
  pendingConfirm: null,  // { turnId, tool, summary, args, expiresAt } while awaiting Approve/Cancel
  banner: null,          // { kind:'terminal'|'error', message } for terminal/error states
  busy: false,           // true while a turn is in flight (input + new sends disabled)
  lastCostCents: null,
}
```

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/ross-agent-conversation.test.js
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
    s = reduceEvent(s, { type: 'done', threadId: 'th1', turnId: 'u1', costCents: 1 }) // confirm path pauses; emulate UI calling startResume next
    const r = startResume(s)
    expect(r.pendingConfirm).toBe(null)
    expect(r.busy).toBe(true)
    expect(r.turns[r.turns.length - 1]).toMatchObject({ role: 'assistant', status: 'streaming' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ross-agent-conversation.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// public/js/modules/ross/v2/agent/ross-agent-conversation.js

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ross-agent-conversation.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/ross/v2/agent/ross-agent-conversation.js tests/unit/ross-agent-conversation.test.js
git commit -m "feat(ross-agent): immutable event→conversation reducer (slice 5)"
```

---

## Task 3: SSE transport client

**Files:**
- Create: `public/js/modules/ross/v2/agent/ross-agent-client.js`
- Test: `tests/unit/ross-agent-client.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/ross-agent-client.test.js
import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock firebase auth so getIdToken() resolves without a real Firebase app.
vi.mock('../../public/js/config/firebase-config.js', () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('tok-123') } },
}))

import { streamRossChat } from '../../public/js/modules/ross/v2/agent/ross-agent-client.js'

/** Build a fake fetch Response whose body streams the given string chunks. */
function fakeStreamingResponse(chunks) {
  const enc = new TextEncoder()
  let i = 0
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          read() {
            if (i < chunks.length) return Promise.resolve({ done: false, value: enc.encode(chunks[i++]) })
            return Promise.resolve({ done: true, value: undefined })
          },
          cancel() { return Promise.resolve() },
        }
      },
    },
  }
}

describe('streamRossChat', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  test('POSTs a FLAT body with a Bearer token and emits parsed events in order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeStreamingResponse([
      'data: {"type":"text","delta":"Hi"}\n\n',
      'data: {"type":"done","threadId":"t1","turnId":"u1","costCents":1}\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const events = []
    await streamRossChat({ message: 'yo', threadId: 't1' }, (e) => events.push(e))

    expect(events).toEqual([
      { type: 'text', delta: 'Hi' },
      { type: 'done', threadId: 't1', turnId: 'u1', costCents: 1 },
    ])
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/rossChat$/)
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toBe('Bearer tok-123')
    // FLAT body — NOT wrapped in { data: {...} }
    const sent = JSON.parse(opts.body)
    expect(sent.message).toBe('yo')
    expect(sent.threadId).toBe('t1')
    expect(sent.data).toBeUndefined()
    expect(sent.clientToday).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('emits a synthetic error event when the HTTP response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('nope') })
    vi.stubGlobal('fetch', fetchMock)

    const events = []
    await streamRossChat({ message: 'yo' }, (e) => events.push(e))

    expect(events).toEqual([{ type: 'error', code: 'http_401', message: expect.any(String) }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ross-agent-client.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// public/js/modules/ross/v2/agent/ross-agent-client.js
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
 * onEvent(parsedEvent) for each frame. Returns { abort } to cancel mid-stream.
 *
 * Never throws to the caller: transport/HTTP failures are surfaced as a
 * synthetic { type:'error' } event so the reducer renders a banner uniformly.
 */
async function pump(body, onEvent) {
  const user = auth.currentUser
  if (!user) {
    onEvent({ type: 'error', code: 'no_auth', message: 'Please sign in to ask Ross.' })
    return
  }
  const controller = new AbortController()
  // expose abort to the caller synchronously via the returned object below
  pump._lastController = controller

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

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const parser = createSSEParser()
  try {
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

function withAbort(promise) {
  const controller = pump._lastController
  return { done: promise, abort: () => controller && controller.abort() }
}

/** Start a fresh turn. body: { message, threadId? }. */
export function streamRossChat(body, onEvent) {
  return pump(body, onEvent)
}

/** Resume a paused confirm turn. */
export function resumeRossChat({ resumeTurnId, decision }, onEvent) {
  return pump({ resumeTurnId, decision }, onEvent)
}
```

> Note: `streamRossChat`/`resumeRossChat` return the `pump` promise (awaitable). The modal awaits it to know the turn finished. Abort is wired in Task 6 via a module-level controller handle; the test above only exercises the happy path + HTTP-error path, which is the risk that matters.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ross-agent-client.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/ross/v2/agent/ross-agent-client.js tests/unit/ross-agent-client.test.js
git commit -m "feat(ross-agent): fetch+ReadableStream SSE transport (slice 5)"
```

---

## Task 4: Confirm-card component

**Files:**
- Create: `public/js/modules/ross/v2/components/RossAskConfirmCard.vue`

**Security note:** `summary` and `args` come from the server/agent. These are rendered with Vue text interpolation (`{{ }}`), which auto-escapes — satisfying the slice-5 "escapeHtml the confirm-card" requirement structurally. **NEVER** use `v-html` here.

- [ ] **Step 1: Create the component** (no unit test — DOM-mount needs happy-dom; verified by build + preview)

```vue
<!-- public/js/modules/ross/v2/components/RossAskConfirmCard.vue -->
<script setup>
// Inline confirm-card for a `confirm`-tier agent action (established v2 inline
// pattern, not a modal-on-modal). summary/args are server-sourced and rendered
// via auto-escaping interpolation — never v-html.
defineProps({
  pending: { type: Object, required: true }, // { turnId, tool, summary, args, expiresAt }
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['approve', 'decline'])
</script>

<template>
  <div class="ross-ask-confirm" role="group" aria-label="Confirm Ross action">
    <div class="ross-ask-confirm__head">
      <HfIcon name="sparkle" :size="14" color="var(--hf-accent)" />
      <span class="hf-mono ross-ask-confirm__eyebrow">Ross proposes</span>
    </div>
    <p class="ross-ask-confirm__summary">{{ pending.summary }}</p>
    <div class="ross-ask-confirm__actions">
      <button class="ross-ask-confirm__btn ross-ask-confirm__btn--go" :disabled="busy" @click="emit('approve')">Confirm</button>
      <button class="ross-ask-confirm__btn" :disabled="busy" @click="emit('decline')">Cancel</button>
    </div>
  </div>
</template>

<style scoped>
.ross-ask-confirm {
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-sm);
  background: var(--hf-bg2);
  padding: 0.75rem;
  margin: 0.5rem 0;
}
.ross-ask-confirm__head { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
.ross-ask-confirm__eyebrow { color: var(--hf-muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; }
.ross-ask-confirm__summary { color: var(--hf-ink); font-family: var(--hf-font-body); margin: 0 0 0.6rem; }
.ross-ask-confirm__actions { display: flex; gap: 0.5rem; }
.ross-ask-confirm__btn {
  font-family: var(--hf-font-body); font-size: 0.85rem; padding: 0.35rem 0.9rem;
  border-radius: var(--hf-radius-sm); border: 1px solid var(--hf-line);
  background: var(--hf-paper); color: var(--hf-ink); cursor: pointer;
}
.ross-ask-confirm__btn--go { background: var(--hf-accent); color: var(--hf-paper); border-color: var(--hf-accent); }
.ross-ask-confirm__btn:disabled { opacity: 0.5; cursor: default; }
</style>
```

> **Token check before commit:** confirm `--hf-line`, `--hf-bg2`, `--hf-radius-sm`, `--hf-ink`, `--hf-paper`, `--hf-muted`, `--hf-accent`, `--hf-font-body` all exist:
> `grep -oE '\-\-hf-[a-z0-9-]+' public/css/hifi-tokens.css | sort -u | grep -E 'line|bg2|radius-sm|ink|paper|muted|accent|font-body'`
> (Per the 2026-05-12 token-verify lesson — pages render with fallthrough even when a token name is wrong, so the build won't catch it.)

- [ ] **Step 2: Commit**

```bash
git add public/js/modules/ross/v2/components/RossAskConfirmCard.vue
git commit -m "feat(ross-agent): inline confirm-card component (slice 5)"
```

---

## Task 5: Message bubble component

**Files:**
- Create: `public/js/modules/ross/v2/components/RossAskMessage.vue`

- [ ] **Step 1: Create the component**

```vue
<!-- public/js/modules/ross/v2/components/RossAskMessage.vue -->
<script setup>
// One conversation turn. User turns are plain text; assistant turns show
// streamed text + a list of live tool-action lines. All text auto-escaped.
defineProps({
  turn: { type: Object, required: true }, // { role, text, actions:[{tool,status}], status }
})

const ACTION_LABEL = {
  done: '✓',
  refused: '⊘',
  failed: '✕',
  declined: '—',
}
</script>

<template>
  <div class="ross-ask-msg" :class="`ross-ask-msg--${turn.role}`">
    <div v-if="turn.text" class="ross-ask-msg__text">{{ turn.text }}</div>
    <div
      v-if="turn.status === 'streaming' && !turn.text"
      class="ross-ask-msg__typing hf-mono"
      aria-live="polite"
    >Ross is thinking…</div>
    <ul v-if="turn.actions.length" class="ross-ask-msg__actions">
      <li v-for="(a, i) in turn.actions" :key="i" class="hf-mono ross-ask-msg__action">
        <span class="ross-ask-msg__action-mark">{{ ACTION_LABEL[a.status] || '·' }}</span> {{ a.tool }} {{ a.status }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ross-ask-msg { margin: 0.6rem 0; }
.ross-ask-msg--user .ross-ask-msg__text {
  background: var(--hf-bg2); color: var(--hf-ink); padding: 0.5rem 0.75rem;
  border-radius: var(--hf-radius-sm); display: inline-block; font-family: var(--hf-font-body);
}
.ross-ask-msg--assistant .ross-ask-msg__text { color: var(--hf-ink); font-family: var(--hf-font-body); white-space: pre-wrap; }
.ross-ask-msg__typing { color: var(--hf-muted); font-size: 0.8rem; }
.ross-ask-msg__actions { list-style: none; margin: 0.4rem 0 0; padding: 0; }
.ross-ask-msg__action { color: var(--hf-muted); font-size: 0.78rem; }
.ross-ask-msg__action-mark { color: var(--hf-accent); }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add public/js/modules/ross/v2/components/RossAskMessage.vue
git commit -m "feat(ross-agent): conversation message bubble component (slice 5)"
```

---

## Task 6: The ⌘K modal

**Files:**
- Create: `public/js/modules/ross/v2/components/RossAskModal.vue`

This component owns conversation state, wires the transport to the reducer, and handles focus trap + ESC/scrim dismiss. It exposes an `open(seed?)` method via `defineExpose` so the parent can trigger it from ⌘K / rail click / deep-link.

- [ ] **Step 1: Create the component**

```vue
<!-- public/js/modules/ross/v2/components/RossAskModal.vue -->
<script setup>
import { ref, reactive, nextTick, onMounted, onUnmounted } from 'vue'
import RossAskMessage from './RossAskMessage.vue'
import RossAskConfirmCard from './RossAskConfirmCard.vue'
import {
  initialConversation, startUserTurn, startResume, reduceEvent,
} from '../agent/ross-agent-conversation.js'
import { streamRossChat, resumeRossChat } from '../agent/ross-agent-client.js'

const visible = ref(false)
const input = ref('')
const inputEl = ref(null)
const scrollEl = ref(null)
let convo = reactive(initialConversation())

function replaceConvo(next) {
  // reactive() can't be reassigned; copy fields in so Vue tracks the change.
  Object.assign(convo, next)
}

async function scrollToEnd() {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}

function onEvent(ev) {
  replaceConvo(reduceEvent(convo, ev))
  scrollToEnd()
}

async function send() {
  const message = input.value.trim()
  if (!message || convo.busy) return
  input.value = ''
  replaceConvo(startUserTurn(convo, message))
  scrollToEnd()
  await streamRossChat({ message, threadId: convo.threadId || undefined }, onEvent)
}

async function decide(decision) {
  const pending = convo.pendingConfirm
  if (!pending) return
  replaceConvo(startResume(convo))
  scrollToEnd()
  await resumeRossChat({ resumeTurnId: pending.turnId, decision }, onEvent)
}

function open(seed) {
  visible.value = true
  if (seed) input.value = seed
  nextTick(() => inputEl.value && inputEl.value.focus())
}

function close() { visible.value = false }

function onKeydown(e) {
  // ⌘K / Ctrl+K toggles open.
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    visible.value ? close() : open()
    return
  }
  if (visible.value && e.key === 'Escape') { e.preventDefault(); close() }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="ross-ask-scrim" @click.self="close">
      <div class="ross-ask-modal" role="dialog" aria-modal="true" aria-label="Ask Ross">
        <header class="ross-ask-modal__head">
          <HfIcon name="sparkle" :size="16" color="var(--hf-accent)" />
          <span class="ross-ask-modal__title">Ask Ross</span>
          <button class="ross-ask-modal__close" aria-label="Close" @click="close">✕</button>
        </header>

        <div ref="scrollEl" class="ross-ask-modal__body">
          <p v-if="!convo.turns.length" class="ross-ask-modal__empty hf-mono">
            Ask about your workflows, staff, runs, or compliance.
          </p>
          <RossAskMessage v-for="(t, i) in convo.turns" :key="i" :turn="t" />

          <RossAskConfirmCard
            v-if="convo.pendingConfirm"
            :pending="convo.pendingConfirm"
            :busy="convo.busy && !convo.pendingConfirm"
            @approve="decide('approve')"
            @decline="decide('decline')"
          />

          <div v-if="convo.banner" class="ross-ask-banner" :class="`ross-ask-banner--${convo.banner.kind}`">
            {{ convo.banner.message }}
          </div>
        </div>

        <footer class="ross-ask-modal__foot">
          <input
            ref="inputEl"
            v-model="input"
            class="ross-ask-modal__input"
            type="text"
            placeholder="Ask Ross anything…"
            :disabled="convo.busy"
            @keydown.enter="send"
          />
          <button class="ross-ask-modal__send" :disabled="convo.busy || !input.trim()" @click="send">Send</button>
        </footer>
        <div v-if="convo.lastCostCents !== null" class="hf-mono ross-ask-modal__cost">
          last turn · {{ convo.lastCostCents }}c
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ross-ask-scrim {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 10vh; z-index: 1000;
}
.ross-ask-modal {
  width: min(640px, 92vw); max-height: 75vh; display: flex; flex-direction: column;
  background: var(--hf-paper); border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-lg); box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden;
}
.ross-ask-modal__head { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--hf-line); }
.ross-ask-modal__title { font-family: var(--hf-font-display); color: var(--hf-ink); flex: 1; }
.ross-ask-modal__close { background: none; border: none; color: var(--hf-muted); cursor: pointer; font-size: 0.9rem; }
.ross-ask-modal__body { flex: 1; overflow-y: auto; padding: 1rem; }
.ross-ask-modal__empty { color: var(--hf-muted); font-size: 0.8rem; }
.ross-ask-banner { margin-top: 0.6rem; padding: 0.6rem 0.8rem; border-radius: var(--hf-radius-sm); font-family: var(--hf-font-body); font-size: 0.85rem; }
.ross-ask-banner--terminal { background: var(--hf-bg2); color: var(--hf-muted); border: 1px solid var(--hf-line); }
.ross-ask-banner--error { background: #fdecea; color: #b3261e; border: 1px solid #f5c6c2; }
.ross-ask-modal__foot { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid var(--hf-line); }
.ross-ask-modal__input {
  flex: 1; padding: 0.5rem 0.75rem; border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-sm); font-family: var(--hf-font-body); color: var(--hf-ink); background: var(--hf-paper);
}
.ross-ask-modal__send {
  padding: 0.5rem 1.1rem; border-radius: var(--hf-radius-sm); border: 1px solid var(--hf-accent);
  background: var(--hf-accent); color: var(--hf-paper); cursor: pointer; font-family: var(--hf-font-body);
}
.ross-ask-modal__send:disabled { opacity: 0.5; cursor: default; }
.ross-ask-modal__cost { color: var(--hf-muted); font-size: 0.7rem; text-align: right; padding: 0 1rem 0.6rem; }
</style>
```

> **Token check before commit:** same grep as Task 4 plus `--hf-radius-lg`, `--hf-font-display`. Confirm each exists in `public/css/hifi-tokens.css`.

- [ ] **Step 2: Verify the build compiles the SFC**

Run: `npm run build`
Expected: build succeeds, no Vue compile error for `RossAskModal.vue`.

- [ ] **Step 3: Commit**

```bash
git add public/js/modules/ross/v2/components/RossAskModal.vue
git commit -m "feat(ross-agent): Ask Ross ⌘K command-palette modal (slice 5)"
```

---

## Task 7: Wire into the home surface + retire the stub

**Files:**
- Modify: `public/js/modules/ross/v2/components/RossHomeDesktop.vue`
- Modify: `public/js/modules/ross/v2/ross-service.js`

- [ ] **Step 1: Mount the modal + open it from ⌘K / rail click / deep-link**

In `RossHomeDesktop.vue` `<script setup>`, add the import + a ref:

```javascript
import RossAskModal from './RossAskModal.vue'
import { ref, onMounted } from 'vue' // merge with existing vue imports
const askModal = ref(null)
function openAsk(seed) { askModal.value && askModal.value.open(seed) }
```

Replace the deep-link/stub action branch (the existing `ask-why`/`ask-ross` handler at ~line 77 that does `window.location.href = '/ross.html#ask=' + …`) with a direct open:

```javascript
if (action.id === 'ask-why' || action.id === 'ask-ross') {
  const seed = card?._meta?.contextLine || card?.headline || ''
  openAsk(seed)
  return
}
```

On mount, honour an inbound `#ask=<seed>` deep-link (cards on OTHER pages still navigate here with the hash):

```javascript
onMounted(() => {
  const m = window.location.hash.match(/^#ask=(.*)$/)
  if (m) openAsk(decodeURIComponent(m[1]))
})
```

Make the existing right-rail Ask Ross `<section class="ross-home__ask">` clickable (add `@click="openAsk('')"` and `role="button"` / `tabindex="0"` + `@keydown.enter="openAsk('')"`), and mount the modal once near the root of the template:

```html
<RossAskModal ref="askModal" />
```

- [ ] **Step 2: Retire the scripted `askRoss()` stub**

In `ross-service.js`, delete the `askRoss(prompt)` export (lines ~295–313) and the now-dead `ASK_ROSS_SAMPLE` constant **only if** it has no remaining referent. Verify first:

Run: `grep -rn "askRoss\|ASK_ROSS_SAMPLE" public/js/modules/ross/`
- The `sidebar.askRoss` panel DATA (prompt + recent answers) is a different field produced by `getHomeSidebar()` — leave that intact (the rail still shows its eyebrow/teaser). Only remove the standalone `export async function askRoss()` and any import of it.
- If `ASK_ROSS_SAMPLE` is still referenced by `getHomeSidebar()`, keep it.

- [ ] **Step 3: Build + verify no dangling references**

Run: `npm run build`
Expected: build succeeds.
Run: `grep -rn "import.*askRoss" public/js/`
Expected: no results (the function import is gone).

- [ ] **Step 4: Commit**

```bash
git add public/js/modules/ross/v2/components/RossHomeDesktop.vue public/js/modules/ross/v2/ross-service.js
git commit -m "feat(ross-agent): wire Ask Ross modal into home (⌘K + rail + deep-link), retire stub (slice 5)"
```

---

## Task 8: Full verify, docs, backlog

- [ ] **Step 1: Run the full functions + unit suite**

Run: `npx vitest run tests/unit/ross-agent-sse.test.js tests/unit/ross-agent-conversation.test.js tests/unit/ross-agent-client.test.js`
Expected: all green.

Run: `npm run build`
Expected: green.

- [ ] **Step 2: Manual preview smoke (operator)** — deploy to a Firebase Hosting preview channel and click through:
  - ⌘K opens the modal; ESC + scrim close it.
  - A plain question streams tokens.
  - A confirm-tier ask (e.g. "activate the Compliance Sweep") renders the inline confirm-card; Confirm resumes and completes; Cancel declines.
  - A no-credit / disabled account shows the friendly terminal banner.
  - A home card's "Ask Ross" button opens the modal pre-seeded.

- [ ] **Step 3: Update the catalog/docs** — `rossChat` is already catalogued (slice 3). Add a one-line note in `public/kb/features/ROSS.md` that the Ask Ross client (⌘K modal) is the live consumer.

- [ ] **Step 4: Backlog the mobile follow-up** — add to `KNOWLEDGE BASE/PROJECT_BACKLOG.md` (and mirror in `public/data/project-status.json`): *"Ask Ross mobile pill wiring — wire `RossHomeMobile.vue`'s Ask Ross pill to open the same modal/surface; verify confirm-card layout at mobile breakpoint (watch the prototype-debris-on-mobile lesson)."*

- [ ] **Step 5: Reflect** — update the four feedback files per CLAUDE.md Step 11 (SELF_OPTIMIZATION, LESSONS, SCORECARD, PROJECT_BACKLOG + project-status.json in the same PR).

---

## Self-review notes

- **Spec coverage (§8):** streams tokens (Task 3+6 `text`), inline confirm-cards not modal (Task 4), live tool actions (Task 5 action lines), terminal banners (Task 6 banner) — all covered. ⌘K modal surface (Task 6). Multi-turn threadId reuse (Task 2 `done` capture + Task 6 `send` passes `convo.threadId`).
- **Type consistency:** event shapes in the reducer (Task 2) match the server emit list verbatim; `pendingConfirm` fields `{turnId,tool,summary,args,expiresAt}` consistent across Tasks 2/4/6; `decide(decision)` passes `pending.turnId` as `resumeTurnId` (matches server resume body).
- **Body shape:** Task 3 sends FLAT body (asserted in test) — the documented divergence from sibling services.
- **Escaping:** confirm-card + messages use `{{ }}` only, no `v-html` (Task 4/5).
- **Out of scope:** mobile (backlogged Task 8), citations (server emits none — dropped from the old stub shape).
