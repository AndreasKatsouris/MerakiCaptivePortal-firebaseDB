# ROSS Run Execution UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the operator-facing Run execution UI that consumes the already-shipped Runs server surface (`rossCreateRun` / `rossSubmitResponse` / `rossGetRun`) and honours all 10 `inputType`s.

**Architecture:** New tab on the existing concierge shell (`/ross.html?tab=run&workflowId=…&locationId=…`). Single scrollable list of task cards + sticky bottom bar + inline completion banner. Auto-save on commit per task; client pre-flight for `requiredNote` with server 422 as safety net. Photo/signature render as placeholder cards with `Mark N/A` sentinel submit. Pragmatic component split: polymorphic `RossRunTaskInput` + dedicated card/bar/banner components.

**Tech Stack:** Vue 3 SFCs + Pinia (existing v2 module pattern), Vitest for unit tests, Hi-Fi design system (`Hf*` components + `--hf-*` tokens). No CF changes.

**Spec:** `docs/plans/2026-05-13-ross-run-execution-ui-design.html`

**Branch:** `feature/ross-run-execution-ui` (worktree: `.worktrees/ross-run-execution-ui`)

---

## Pre-flight checklist (do these BEFORE Task 1)

Confirms the plan assumptions still hold. Each check is mechanical.

- [ ] **Verify Hi-Fi tokens against source.** Run `grep -oE '\-\-hf-[a-z0-9-]+' public/css/hifi-tokens.css | sort -u` from the worktree root. Confirm `--hf-bg`, `--hf-paper`, `--hf-ink`, `--hf-muted`, `--hf-line`, `--hf-accent`, `--hf-good`, `--hf-warn`, `--hf-font-body`, `--hf-radius-md`, `--hf-space-3` all appear. (Note: there is NO `--hf-fg`, `--hf-surface`, `--hf-font-sans` — those were the PR #55 bugs.)
- [ ] **Verify Hi-Fi components exist.** Run `ls public/js/design-system/hifi/components/`. Confirm `HfButton.vue`, `HfCard.vue`, `HfCheckbox.vue`, `HfChip.vue`, `HfIcon.vue`, `HfInput.vue`, `HfSelect.vue` all present.
- [ ] **Verify server input-type enum.** Run `grep -n "VALID_INPUT_TYPES" functions/ross.js | head -3`. Confirm the list is exactly `['checkbox', 'text', 'number', 'temperature', 'yes_no', 'dropdown', 'timestamp', 'photo', 'signature', 'rating']`.
- [ ] **Confirm `functions/node_modules` populated.** Run `ls functions/node_modules/firebase-functions/package.json`. If missing, `cd functions && npm install` (≈53s) — needed only if deploying functions, which this PR does not, but verify anyway.
- [ ] **Confirm worktree is current branch.** Run `git rev-parse --abbrev-ref HEAD`. Expect `feature/ross-run-execution-ui`. Confirm `git status` is clean (spec commit already in place).

If any check fails, stop and resolve before writing code.

---

## Task 1: Run input-type constants module

**Files:**
- Create: `public/js/modules/ross/v2/constants/run-input-types.js`
- Create: `tests/unit/ross-run-input-types.test.js`

Per-type metadata used by the input component and card. Pure module, easy to unit-test.

- [ ] **Step 1: Write the failing test**

`tests/unit/ross-run-input-types.test.js`:

```js
import { describe, test, expect } from 'vitest'
import {
  VALID_INPUT_TYPES,
  NA_SENTINEL,
  isPlaceholderType,
  isRangeType,
  needsPreflightNote,
} from '../../public/js/modules/ross/v2/constants/run-input-types.js'

describe('VALID_INPUT_TYPES', () => {
  test('matches server enum exactly', () => {
    expect(VALID_INPUT_TYPES).toEqual([
      'checkbox', 'text', 'number', 'temperature',
      'yes_no', 'dropdown', 'timestamp', 'photo', 'signature', 'rating',
    ])
  })
})

describe('NA_SENTINEL', () => {
  test('is the literal string "n/a"', () => {
    expect(NA_SENTINEL).toBe('n/a')
  })
})

describe('isPlaceholderType', () => {
  test('returns true for photo', () => {
    expect(isPlaceholderType('photo')).toBe(true)
  })
  test('returns true for signature', () => {
    expect(isPlaceholderType('signature')).toBe(true)
  })
  test('returns false for checkbox', () => {
    expect(isPlaceholderType('checkbox')).toBe(false)
  })
  test('returns false for unknown', () => {
    expect(isPlaceholderType('frobnicate')).toBe(false)
  })
})

describe('isRangeType', () => {
  test('returns true for number', () => {
    expect(isRangeType('number')).toBe(true)
  })
  test('returns true for temperature', () => {
    expect(isRangeType('temperature')).toBe(true)
  })
  test('returns false for checkbox', () => {
    expect(isRangeType('checkbox')).toBe(false)
  })
})

describe('needsPreflightNote', () => {
  test('returns false for non-range type', () => {
    expect(needsPreflightNote('checkbox', 'on', { min: 0, max: 5, requiredNote: true })).toBe(false)
  })
  test('returns false when in range', () => {
    expect(needsPreflightNote('temperature', 3, { min: 0, max: 5, requiredNote: true })).toBe(false)
  })
  test('returns false when out of range but requiredNote false', () => {
    expect(needsPreflightNote('temperature', 12, { min: 0, max: 5, requiredNote: false })).toBe(false)
  })
  test('returns true when out of range AND requiredNote true', () => {
    expect(needsPreflightNote('temperature', 12, { min: 0, max: 5, requiredNote: true })).toBe(true)
    expect(needsPreflightNote('temperature', -2, { min: 0, max: 5, requiredNote: true })).toBe(true)
  })
  test('returns false when inputConfig missing', () => {
    expect(needsPreflightNote('temperature', 12, undefined)).toBe(false)
  })
  test('coerces stringy numeric value', () => {
    expect(needsPreflightNote('number', '99', { min: 0, max: 5, requiredNote: true })).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/ross-run-input-types.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`public/js/modules/ross/v2/constants/run-input-types.js`:

```js
// Run UI input-type metadata. Mirrors server VALID_INPUT_TYPES
// (functions/ross.js:25) — keep in lockstep if the server changes.

export const VALID_INPUT_TYPES = [
  'checkbox', 'text', 'number', 'temperature',
  'yes_no', 'dropdown', 'timestamp', 'photo', 'signature', 'rating',
]

// Sentinel response value submitted by the "Mark N/A" affordance on
// photo/signature placeholder cards. The server has no validateResponseValue
// case for these types, so any string passes type-validation and the task
// counts as responded.
export const NA_SENTINEL = 'n/a'

const PLACEHOLDER_TYPES = new Set(['photo', 'signature'])
const RANGE_TYPES = new Set(['number', 'temperature'])

export function isPlaceholderType(t) {
  return PLACEHOLDER_TYPES.has(t)
}

export function isRangeType(t) {
  return RANGE_TYPES.has(t)
}

// Client-side pre-flight: should we reveal the note textarea BEFORE
// hitting the server? Mirrors the server's auto-flag + 422 logic so
// the same UI path handles both pre-flight and server 422 fallback.
export function needsPreflightNote(inputType, value, inputConfig) {
  if (!isRangeType(inputType)) return false
  if (!inputConfig) return false
  if (!inputConfig.requiredNote) return false
  const n = Number(value)
  if (Number.isNaN(n)) return false
  if (inputConfig.min !== undefined && n < inputConfig.min) return true
  if (inputConfig.max !== undefined && n > inputConfig.max) return true
  return false
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/ross-run-input-types.test.js`
Expected: PASS — all 14 tests green.

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/ross/v2/constants/run-input-types.js tests/unit/ross-run-input-types.test.js
git commit -m "feat(ross-v2): run input-type constants + preflight helper"
```

---

## Task 2: `run-service.js` — three CF wrappers

**Files:**
- Create: `public/js/modules/ross/v2/run-service.js`
- Create: `tests/unit/ross-run-service.test.js`
- Reference: `public/js/modules/ross/v2/playbook-service.js` (mirror its fetch/auth shape)

- [ ] **Step 1: Read the reference service**

Open `public/js/modules/ross/v2/playbook-service.js`. Note the pattern: `getIdToken()` via firebase auth, POST to the CF URL, JSON body `{ data: {...} }`, parse `{ result }` or surface error. Match this exactly — don't invent a new shape.

- [ ] **Step 2: Write the failing test**

`tests/unit/ross-run-service.test.js`:

```js
import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock firebase auth before importing the service so the import-time
// auth lookup doesn't blow up under vitest.
vi.mock('../../public/js/config/firebase-config.js', () => ({
  auth: { currentUser: { getIdToken: () => Promise.resolve('test-token') } },
}))

const { createRun, submitResponse, getRun } = await import(
  '../../public/js/modules/ross/v2/run-service.js'
)

beforeEach(() => {
  global.fetch = vi.fn()
})

describe('createRun', () => {
  test('POSTs workflowId+locationId, returns server result', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: { runId: 'r1', status: 'in_progress', responses: {} } }),
    })
    const out = await createRun({ workflowId: 'w1', locationId: 'l1' })
    expect(out).toEqual({ runId: 'r1', status: 'in_progress', responses: {} })
    expect(global.fetch).toHaveBeenCalledOnce()
    const [, opts] = global.fetch.mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ data: { workflowId: 'w1', locationId: 'l1' } })
  })
})

describe('submitResponse', () => {
  test('returns 200 result with status:200 wrapper', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: { runId: 'r1', status: 'in_progress' } }),
    })
    const out = await submitResponse({
      workflowId: 'w1', locationId: 'l1', runId: 'r1',
      taskId: 't1', value: 3,
    })
    expect(out.status).toBe(200)
    expect(out.result.runId).toBe('r1')
  })

  test('surfaces 422 as { status:422, requiredNote:true } (not thrown)', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: 'Note required', requiredNote: true }),
    })
    const out = await submitResponse({
      workflowId: 'w1', locationId: 'l1', runId: 'r1',
      taskId: 't1', value: 12,
    })
    expect(out.status).toBe(422)
    expect(out.requiredNote).toBe(true)
  })

  test('throws on other non-ok status', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal' }),
    })
    await expect(submitResponse({
      workflowId: 'w1', locationId: 'l1', runId: 'r1',
      taskId: 't1', value: 1,
    })).rejects.toThrow(/Internal/)
  })
})

describe('getRun', () => {
  test('POSTs workflowId+locationId, returns currentRun+previousResponses', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        result: { currentRun: { runId: 'r1' }, previousResponses: {} },
      }),
    })
    const out = await getRun({ workflowId: 'w1', locationId: 'l1' })
    expect(out.currentRun.runId).toBe('r1')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/unit/ross-run-service.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

`public/js/modules/ross/v2/run-service.js`:

```js
import { auth } from '../../../config/firebase-config.js'

// Match the URL pattern used by playbook-service.js. Confirm the
// exact base path there before copying — likely the firebase callable
// /us-central1/<name> URL or the project's CF host.
const FN_BASE = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net'

async function call(name, data) {
  const token = await auth.currentUser.getIdToken()
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data }),
  })
  return res
}

export async function createRun({ workflowId, locationId }) {
  const res = await call('rossCreateRun', { workflowId, locationId })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `rossCreateRun failed (${res.status})`)
  }
  const body = await res.json()
  return body.result
}

export async function submitResponse({ workflowId, locationId, runId, taskId, value, note }) {
  const payload = { workflowId, locationId, runId, taskId, value }
  if (note !== undefined && note !== null) payload.note = note
  const res = await call('rossSubmitResponse', payload)
  if (res.status === 422) {
    const body = await res.json().catch(() => ({}))
    return { status: 422, requiredNote: body.requiredNote === true, error: body.error || null }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `rossSubmitResponse failed (${res.status})`)
  }
  const body = await res.json()
  return { status: 200, result: body.result }
}

export async function getRun({ workflowId, locationId }) {
  const res = await call('rossGetRun', { workflowId, locationId })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `rossGetRun failed (${res.status})`)
  }
  const body = await res.json()
  return body.result
}
```

> **Verify the FN_BASE URL** before committing — open `playbook-service.js` and copy its base URL verbatim. The URL above is a best-guess; the project's exact value lives in that file.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/unit/ross-run-service.test.js`
Expected: PASS — all 5 tests green.

- [ ] **Step 6: Commit**

```bash
git add public/js/modules/ross/v2/run-service.js tests/unit/ross-run-service.test.js
git commit -m "feat(ross-v2): run-service CF wrappers (createRun/submitResponse/getRun)"
```

---

## Task 3: `run-store.js` — `initRun` action

**Files:**
- Create: `public/js/modules/ross/v2/run-store.js`
- Create: `tests/unit/ross-run-store.test.js`
- Reference: `public/js/modules/ross/v2/playbook-store.js`

This task ships ONLY `initRun`. `commitResponse` is Task 4 to keep diffs small.

- [ ] **Step 1: Write the failing test**

`tests/unit/ross-run-store.test.js`:

```js
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../public/js/modules/ross/v2/run-service.js', () => ({
  createRun: vi.fn(),
  submitResponse: vi.fn(),
  getRun: vi.fn(),
}))
vi.mock('../../public/js/modules/ross/v2/playbook-service.js', () => ({
  getPlaybookWorkflows: vi.fn(),
}))

const runService = await import('../../public/js/modules/ross/v2/run-service.js')
const playbookService = await import('../../public/js/modules/ross/v2/playbook-service.js')
const { useRunStore } = await import('../../public/js/modules/ross/v2/run-store.js')

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('initRun', () => {
  test('happy path: getRun + createRun + workflow load → state populated', async () => {
    runService.getRun.mockResolvedValue({ currentRun: null, previousResponses: {} })
    runService.createRun.mockResolvedValue({
      runId: 'r1', status: 'in_progress', startedAt: 123, responses: {},
    })
    playbookService.getPlaybookWorkflows.mockResolvedValue([
      { workflowId: 'w1', locationId: 'l1', name: 'Daily Opening',
        tasks: [{ id: 't1', title: 'Lights', inputType: 'checkbox', required: true }] },
    ])

    const store = useRunStore()
    await store.initRun('w1', 'l1')

    expect(store.currentRun.runId).toBe('r1')
    expect(store.workflow.name).toBe('Daily Opening')
    expect(store.workflow.tasks).toHaveLength(1)
    expect(store.responses).toEqual({})
    expect(store.loading).toBe(false)
    expect(store.loadError).toBeNull()
  })

  test('resume: getRun returns in-progress run → responses hydrated', async () => {
    runService.getRun.mockResolvedValue({
      currentRun: {
        runId: 'r1', status: 'in_progress',
        responses: { t1: { value: true, submittedAt: 99, flagged: false } },
      },
      previousResponses: {},
    })
    runService.createRun.mockResolvedValue({
      runId: 'r1', status: 'in_progress', startedAt: 123,
      responses: { t1: { value: true, submittedAt: 99, flagged: false } },
    })
    playbookService.getPlaybookWorkflows.mockResolvedValue([
      { workflowId: 'w1', locationId: 'l1', name: 'X', tasks: [] },
    ])

    const store = useRunStore()
    await store.initRun('w1', 'l1')

    expect(store.responses.t1.value).toBe(true)
  })

  test('workflow not found → loadError surfaced', async () => {
    runService.getRun.mockResolvedValue({ currentRun: null, previousResponses: {} })
    runService.createRun.mockResolvedValue({ runId: 'r1', status: 'in_progress', responses: {} })
    playbookService.getPlaybookWorkflows.mockResolvedValue([])

    const store = useRunStore()
    await store.initRun('w1', 'l1')

    expect(store.loadError).toMatch(/workflow/i)
  })

  test('createRun throws → loadError surfaced, loading false', async () => {
    runService.getRun.mockResolvedValue({ currentRun: null, previousResponses: {} })
    runService.createRun.mockRejectedValue(new Error('Network down'))

    const store = useRunStore()
    await store.initRun('w1', 'l1')

    expect(store.loadError).toBe('Network down')
    expect(store.loading).toBe(false)
  })
})

describe('reset', () => {
  test('clears all state', async () => {
    const store = useRunStore()
    store.currentRun = { runId: 'r1' }
    store.responses = { t1: { value: true } }
    store.reset()
    expect(store.currentRun).toBeNull()
    expect(store.responses).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/ross-run-store.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`public/js/modules/ross/v2/run-store.js`:

```js
import { defineStore } from 'pinia'
import { createRun, getRun } from './run-service.js'
import { getPlaybookWorkflows } from './playbook-service.js'

export const useRunStore = defineStore('ross-run', {
  state: () => ({
    currentRun: null,
    workflow: null,
    responses: {},
    saveStatus: {},
    errors: {},
    loading: false,
    loadError: null,
  }),

  actions: {
    async initRun(workflowId, locationId) {
      this.loading = true
      this.loadError = null
      try {
        const existing = await getRun({ workflowId, locationId })
        const run = await createRun({ workflowId, locationId })
        this.currentRun = run
        this.responses = run.responses || existing?.currentRun?.responses || {}

        const workflows = await getPlaybookWorkflows()
        const wf = workflows.find(
          w => w.workflowId === workflowId && w.locationId === locationId,
        )
        if (!wf) {
          this.loadError = 'Workflow not found at this location.'
          return
        }
        this.workflow = wf
      } catch (err) {
        this.loadError = err.message || 'Failed to start run.'
      } finally {
        this.loading = false
      }
    },

    reset() {
      this.currentRun = null
      this.workflow = null
      this.responses = {}
      this.saveStatus = {}
      this.errors = {}
      this.loading = false
      this.loadError = null
    },
  },
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/ross-run-store.test.js`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/ross/v2/run-store.js tests/unit/ross-run-store.test.js
git commit -m "feat(ross-v2): run-store initRun + reset (Pinia)"
```

---

## Task 4: `run-store.js` — `commitResponse` action

**Files:**
- Modify: `public/js/modules/ross/v2/run-store.js`
- Modify: `tests/unit/ross-run-store.test.js` (append cases)

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/ross-run-store.test.js` (inside the file, before the closing of existing describe blocks won't matter — add a new top-level `describe`):

```js
describe('commitResponse', () => {
  test('200: saveStatus saving → saved, response stored', async () => {
    runService.submitResponse.mockResolvedValue({
      status: 200,
      result: {
        runId: 'r1', status: 'in_progress',
        responses: { t1: { value: 3, submittedAt: 100, flagged: false } },
      },
    })
    const store = useRunStore()
    store.currentRun = { runId: 'r1', status: 'in_progress' }
    store.workflow = { workflowId: 'w1', locationId: 'l1', tasks: [] }

    const pending = store.commitResponse('t1', 3)
    expect(store.saveStatus.t1).toBe('saving')
    await pending
    expect(store.saveStatus.t1).toBe('saved')
    expect(store.responses.t1.value).toBe(3)
    expect(store.errors.t1).toBeNull()
  })

  test('200 with run completed: currentRun.status flips to completed', async () => {
    runService.submitResponse.mockResolvedValue({
      status: 200,
      result: {
        runId: 'r1', status: 'completed', completedAt: 200,
        onTime: true, flaggedCount: 0,
        responses: { t1: { value: 3, submittedAt: 100, flagged: false } },
      },
    })
    const store = useRunStore()
    store.currentRun = { runId: 'r1', status: 'in_progress' }
    store.workflow = { workflowId: 'w1', locationId: 'l1', tasks: [] }

    await store.commitResponse('t1', 3)
    expect(store.currentRun.status).toBe('completed')
    expect(store.currentRun.onTime).toBe(true)
    expect(store.currentRun.flaggedCount).toBe(0)
  })

  test('422 requiredNote: returns { requiredNote:true }, saveStatus idle, no error', async () => {
    runService.submitResponse.mockResolvedValue({
      status: 422, requiredNote: true, error: 'Note required',
    })
    const store = useRunStore()
    store.currentRun = { runId: 'r1', status: 'in_progress' }
    store.workflow = { workflowId: 'w1', locationId: 'l1', tasks: [] }

    const result = await store.commitResponse('t1', 12)
    expect(result).toEqual({ requiredNote: true })
    expect(store.saveStatus.t1).toBe('idle')
    expect(store.errors.t1).toBeNull()
  })

  test('thrown error: saveStatus error, errors[taskId] populated', async () => {
    runService.submitResponse.mockRejectedValue(new Error('Network fail'))
    const store = useRunStore()
    store.currentRun = { runId: 'r1', status: 'in_progress' }
    store.workflow = { workflowId: 'w1', locationId: 'l1', tasks: [] }

    await store.commitResponse('t1', 3)
    expect(store.saveStatus.t1).toBe('error')
    expect(store.errors.t1).toBe('Network fail')
  })
})

describe('dismissError', () => {
  test('clears errors[taskId] and resets saveStatus to idle', () => {
    const store = useRunStore()
    store.errors = { t1: 'oops' }
    store.saveStatus = { t1: 'error' }
    store.dismissError('t1')
    expect(store.errors.t1).toBeNull()
    expect(store.saveStatus.t1).toBe('idle')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/ross-run-store.test.js`
Expected: FAIL — `commitResponse is not a function` etc.

- [ ] **Step 3: Update `run-store.js`**

Add imports + actions inside the existing `defineStore` actions block:

```js
// (at top, replace the existing import line)
import { createRun, getRun, submitResponse } from './run-service.js'
```

Add these actions alongside `initRun` and `reset`:

```js
    async commitResponse(taskId, value, note) {
      if (!this.currentRun?.runId || !this.workflow) return
      this.saveStatus = { ...this.saveStatus, [taskId]: 'saving' }
      this.errors = { ...this.errors, [taskId]: null }
      try {
        const out = await submitResponse({
          workflowId: this.workflow.workflowId,
          locationId: this.workflow.locationId,
          runId: this.currentRun.runId,
          taskId,
          value,
          note,
        })
        if (out.status === 422 && out.requiredNote) {
          this.saveStatus = { ...this.saveStatus, [taskId]: 'idle' }
          return { requiredNote: true }
        }
        // 200
        const result = out.result
        if (result.responses && result.responses[taskId]) {
          this.responses = { ...this.responses, [taskId]: result.responses[taskId] }
        }
        if (result.status === 'completed') {
          this.currentRun = { ...this.currentRun, ...result }
        }
        this.saveStatus = { ...this.saveStatus, [taskId]: 'saved' }
      } catch (err) {
        this.saveStatus = { ...this.saveStatus, [taskId]: 'error' }
        this.errors = { ...this.errors, [taskId]: err.message || 'Save failed' }
      }
    },

    dismissError(taskId) {
      this.errors = { ...this.errors, [taskId]: null }
      this.saveStatus = { ...this.saveStatus, [taskId]: 'idle' }
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/ross-run-store.test.js`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/ross/v2/run-store.js tests/unit/ross-run-store.test.js
git commit -m "feat(ross-v2): run-store commitResponse + dismissError"
```

---

## Task 5: `RossRunTaskInput.vue` — base + simple inputs

**Files:**
- Create: `public/js/modules/ross/v2/components/RossRunTaskInput.vue`

Covers the simple types: `checkbox`, `text`, `yes_no`, `dropdown`, `timestamp`, `rating`. Number/temperature with pre-flight is Task 6; placeholders are Task 7.

> **Read first:** `public/js/modules/ross/v2/components/RossPlaybookTaskConfigFields.vue` for the inputType-switch pattern used in v2. Mirror that structure.

- [ ] **Step 1: Create the component**

`public/js/modules/ross/v2/components/RossRunTaskInput.vue`:

```vue
<script setup>
// Polymorphic per-task input. Renders the right control for the task's
// inputType and emits commit(value) on per-type commit semantics.
//
// Number/temperature with pre-flight live here too (Task 6).
// Photo/signature placeholder + Mark N/A live here too (Task 7).
import { ref, watch } from 'vue'
import { NA_SENTINEL, needsPreflightNote } from '../constants/run-input-types.js'
import HfCheckbox from '../../../../design-system/hifi/components/HfCheckbox.vue'
import HfInput    from '../../../../design-system/hifi/components/HfInput.vue'
import HfSelect   from '../../../../design-system/hifi/components/HfSelect.vue'
import HfButton   from '../../../../design-system/hifi/components/HfButton.vue'
import HfChip     from '../../../../design-system/hifi/components/HfChip.vue'

const props = defineProps({
  task:    { type: Object, required: true },    // { id, title, inputType, inputConfig, required }
  value:   { default: undefined },               // existing response value (for resume)
  disabled:{ type: Boolean, default: false },
})

const emit = defineEmits(['commit', 'preflightNote'])

// Local working value; updated on input change but only emitted on commit.
const local = ref(props.value)
watch(() => props.value, v => { local.value = v })

function commit(v) {
  // Pre-flight: range types with requiredNote get intercepted.
  if (needsPreflightNote(props.task.inputType, v, props.task.inputConfig)) {
    emit('preflightNote', { value: v, reason: 'out-of-range' })
    return
  }
  emit('commit', v)
}

function onCheckbox(e) {
  local.value = !!e.target.checked
  commit(local.value)
}

function onText(e) {
  local.value = e.target.value
  // commit fires on blur — set up @blur handler in template
}
function onTextBlur() {
  commit(local.value)
}

function onYesNo(answer) {
  local.value = answer
  commit(answer)
}

function onDropdownChange(v) {
  local.value = v
  commit(v)
}

function onTimestampChange(e) {
  local.value = e.target.value
  commit(local.value)
}

function onRating(stars) {
  local.value = stars
  commit(stars)
}
</script>

<template>
  <div class="rrti">
    <!-- checkbox -->
    <label v-if="task.inputType === 'checkbox'" class="rrti__checkbox">
      <HfCheckbox :model-value="!!local" :disabled="disabled" @change="onCheckbox" />
      <span class="rrti__cb-text">Done</span>
    </label>

    <!-- text -->
    <HfInput
      v-else-if="task.inputType === 'text'"
      :model-value="local ?? ''"
      :disabled="disabled"
      placeholder="Enter response"
      @input="onText"
      @blur="onTextBlur"
    />

    <!-- yes_no -->
    <div v-else-if="task.inputType === 'yes_no'" class="rrti__yesno">
      <HfButton
        :variant="local === 'yes' ? 'primary' : 'ghost'"
        :disabled="disabled"
        @click="onYesNo('yes')"
      >Yes</HfButton>
      <HfButton
        :variant="local === 'no' ? 'primary' : 'ghost'"
        :disabled="disabled"
        @click="onYesNo('no')"
      >No</HfButton>
    </div>

    <!-- dropdown -->
    <HfSelect
      v-else-if="task.inputType === 'dropdown'"
      :model-value="local ?? ''"
      :options="task.inputConfig?.options || []"
      :disabled="disabled"
      placeholder="Select an option"
      @update:model-value="onDropdownChange"
    />

    <!-- timestamp -->
    <input
      v-else-if="task.inputType === 'timestamp'"
      type="datetime-local"
      class="rrti__timestamp"
      :value="local ?? ''"
      :disabled="disabled"
      @change="onTimestampChange"
    />

    <!-- rating -->
    <div v-else-if="task.inputType === 'rating'" class="rrti__rating">
      <button
        v-for="n in (task.inputConfig?.max || 5)"
        :key="n"
        type="button"
        class="rrti__star"
        :class="{ 'rrti__star--filled': (local || 0) >= n }"
        :disabled="disabled"
        @click="onRating(n)"
        :aria-label="`${n} star${n > 1 ? 's' : ''}`"
      >★</button>
    </div>

    <!-- number / temperature / photo / signature handled in later tasks; fallback stub -->
    <div v-else class="rrti__fallback">
      Input type "{{ task.inputType }}" not yet implemented.
    </div>
  </div>
</template>

<style scoped>
.rrti { font: 0.95rem/1.4 var(--hf-font-body); color: var(--hf-ink); }
.rrti__checkbox { display: inline-flex; align-items: center; gap: var(--hf-space-2); cursor: pointer; }
.rrti__cb-text { color: var(--hf-ink-2); }
.rrti__yesno { display: inline-flex; gap: var(--hf-space-2); }
.rrti__timestamp {
  font: inherit; color: var(--hf-ink);
  background: var(--hf-paper); border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md); padding: var(--hf-space-2) var(--hf-space-3);
}
.rrti__rating { display: inline-flex; gap: var(--hf-space-1); }
.rrti__star {
  background: none; border: none; cursor: pointer; padding: 0 var(--hf-space-1);
  color: var(--hf-line-2); font-size: 1.4rem; line-height: 1; transition: color var(--hf-transition);
}
.rrti__star--filled { color: var(--hf-gold); }
.rrti__star:disabled { cursor: default; }
.rrti__fallback { color: var(--hf-muted); font-style: italic; }
</style>
```

- [ ] **Step 2: Confirm Hi-Fi component import paths**

The relative path `../../../../design-system/hifi/components/HfXxx.vue` from `public/js/modules/ross/v2/components/` resolves to `public/js/design-system/hifi/components/`. Verify with `ls public/js/design-system/hifi/components/HfButton.vue`. If the import paths are off-by-one, fix before building.

- [ ] **Step 3: Sanity build**

Run: `npm run build`
Expected: PASS. If component fails to import an `Hf*` path, the build will tell you exactly which line.

- [ ] **Step 4: Commit**

```bash
git add public/js/modules/ross/v2/components/RossRunTaskInput.vue
git commit -m "feat(ross-v2): RossRunTaskInput base + simple inputs (checkbox/text/yes_no/dropdown/timestamp/rating)"
```

---

## Task 6: `RossRunTaskInput.vue` — number / temperature with pre-flight

**Files:**
- Modify: `public/js/modules/ross/v2/components/RossRunTaskInput.vue`
- Create: `tests/unit/ross-run-task-input-preflight.test.js`

- [ ] **Step 1: Write the failing test**

`tests/unit/ross-run-task-input-preflight.test.js`:

```js
import { describe, test, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// Stub Hi-Fi components — pre-flight logic is in the parent.
const stubs = {
  HfCheckbox: { template: '<input type="checkbox" />' },
  HfInput:    { template: '<input class="hf-input" />' },
  HfSelect:   { template: '<select></select>' },
  HfButton:   { template: '<button><slot /></button>' },
  HfChip:     { template: '<span><slot /></span>' },
}

const { default: RossRunTaskInput } = await import(
  '../../public/js/modules/ross/v2/components/RossRunTaskInput.vue'
)

function mountIt(task, value) {
  return mount(RossRunTaskInput, {
    props: { task, value },
    global: { stubs },
  })
}

describe('RossRunTaskInput preflight (number/temperature)', () => {
  const TEMP_TASK = {
    id: 't1', title: 'Fridge temp',
    inputType: 'temperature',
    inputConfig: { min: 0, max: 5, unit: '°C', requiredNote: true },
    required: true,
  }

  test('in-range value emits commit, not preflightNote', async () => {
    const w = mountIt(TEMP_TASK, undefined)
    await w.find('input[type="number"]').setValue('3')
    await w.find('input[type="number"]').trigger('blur')
    expect(w.emitted().commit?.[0]).toEqual([3])
    expect(w.emitted().preflightNote).toBeUndefined()
  })

  test('out-of-range with requiredNote: emits preflightNote, NOT commit', async () => {
    const w = mountIt(TEMP_TASK, undefined)
    await w.find('input[type="number"]').setValue('12')
    await w.find('input[type="number"]').trigger('blur')
    expect(w.emitted().preflightNote?.[0]?.[0]).toMatchObject({ value: 12, reason: 'out-of-range' })
    expect(w.emitted().commit).toBeUndefined()
  })

  test('out-of-range with requiredNote=false: emits commit (server still flags but no note needed)', async () => {
    const task = {
      ...TEMP_TASK,
      inputConfig: { ...TEMP_TASK.inputConfig, requiredNote: false },
    }
    const w = mountIt(task, undefined)
    await w.find('input[type="number"]').setValue('12')
    await w.find('input[type="number"]').trigger('blur')
    expect(w.emitted().commit?.[0]).toEqual([12])
  })

  test('plain number input behaves the same as temperature', async () => {
    const task = {
      id: 't2', title: 'Cash count',
      inputType: 'number',
      inputConfig: { min: 100, max: 10000, requiredNote: true },
    }
    const w = mountIt(task, undefined)
    await w.find('input[type="number"]').setValue('50')
    await w.find('input[type="number"]').trigger('blur')
    expect(w.emitted().preflightNote?.[0]?.[0]).toMatchObject({ value: 50 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/ross-run-task-input-preflight.test.js`
Expected: FAIL — number/temperature branches not implemented yet.

- [ ] **Step 3: Add the branches in `RossRunTaskInput.vue`**

In `<script setup>`, add:

```js
function onNumberInput(e) {
  // Update local but don't commit until blur.
  const raw = e.target.value
  local.value = raw === '' ? undefined : Number(raw)
}
function onNumberBlur() {
  if (local.value === undefined || local.value === '' || Number.isNaN(local.value)) return
  commit(local.value)
}
```

In `<template>`, add branches BEFORE the `<!-- yes_no -->` block (and remove `number`/`temperature` from the fallback stub):

```vue
    <!-- number -->
    <div v-else-if="task.inputType === 'number'" class="rrti__number">
      <input
        type="number"
        class="rrti__numinput"
        :value="local ?? ''"
        :disabled="disabled"
        :min="task.inputConfig?.min"
        :max="task.inputConfig?.max"
        @input="onNumberInput"
        @blur="onNumberBlur"
      />
    </div>

    <!-- temperature -->
    <div v-else-if="task.inputType === 'temperature'" class="rrti__temperature">
      <input
        type="number"
        class="rrti__numinput"
        :value="local ?? ''"
        :disabled="disabled"
        :min="task.inputConfig?.min"
        :max="task.inputConfig?.max"
        step="0.1"
        @input="onNumberInput"
        @blur="onNumberBlur"
      />
      <span v-if="task.inputConfig?.unit" class="rrti__unit">{{ task.inputConfig.unit }}</span>
    </div>
```

In `<style scoped>`, append:

```css
.rrti__number, .rrti__temperature { display: inline-flex; align-items: baseline; gap: var(--hf-space-2); }
.rrti__numinput {
  font: inherit; color: var(--hf-ink);
  background: var(--hf-paper); border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md); padding: var(--hf-space-2) var(--hf-space-3);
  width: 8rem;
}
.rrti__unit { color: var(--hf-muted); font-family: var(--hf-font-mono); }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/ross-run-task-input-preflight.test.js`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/ross/v2/components/RossRunTaskInput.vue tests/unit/ross-run-task-input-preflight.test.js
git commit -m "feat(ross-v2): RossRunTaskInput number/temperature with pre-flight note"
```

---

## Task 7: `RossRunTaskInput.vue` — photo / signature placeholder

**Files:**
- Modify: `public/js/modules/ross/v2/components/RossRunTaskInput.vue`

- [ ] **Step 1: Add the placeholder branch**

In `<script setup>`, add helper:

```js
function markNa() {
  local.value = NA_SENTINEL
  emit('commit', NA_SENTINEL)
}
```

In `<template>`, add a branch (before the fallback stub; remove `photo` and `signature` from the fallback's implicit catchall by adding explicit cases):

```vue
    <!-- photo / signature placeholder -->
    <div
      v-else-if="task.inputType === 'photo' || task.inputType === 'signature'"
      class="rrti__placeholder"
    >
      <HfChip>Coming soon</HfChip>
      <span class="rrti__placeholder-text">
        {{ task.inputType === 'photo' ? 'Photo capture' : 'Signature' }} not yet available.
      </span>
      <HfButton
        v-if="local !== NA_SENTINEL"
        variant="ghost"
        size="sm"
        :disabled="disabled"
        @click="markNa"
      >Mark N/A</HfButton>
      <span v-else class="rrti__placeholder-na">Marked N/A</span>
    </div>
```

Expose `NA_SENTINEL` in `<script setup>` so the template can compare against it:

```js
// (already imported at top — just ensure it's in scope for the template)
```

> Note: in Vue 3 `<script setup>`, imports are automatically available in the template. No extra `defineExpose` needed.

In `<style scoped>`:

```css
.rrti__placeholder {
  display: inline-flex; align-items: center; gap: var(--hf-space-3);
  padding: var(--hf-space-2) var(--hf-space-3);
  background: var(--hf-bg2); border: 1px dashed var(--hf-line-2);
  border-radius: var(--hf-radius-md);
}
.rrti__placeholder-text { color: var(--hf-muted); font-size: 0.9rem; }
.rrti__placeholder-na { color: var(--hf-good); font-size: 0.9rem; }
```

- [ ] **Step 2: Sanity build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add public/js/modules/ross/v2/components/RossRunTaskInput.vue
git commit -m "feat(ross-v2): RossRunTaskInput photo/signature placeholder + Mark N/A"
```

---

## Task 8: `RossRunTaskCard.vue`

**Files:**
- Create: `public/js/modules/ross/v2/components/RossRunTaskCard.vue`

Frame for one task. Owns the note textarea reveal, save indicator, error banner.

- [ ] **Step 1: Create the component**

`public/js/modules/ross/v2/components/RossRunTaskCard.vue`:

```vue
<script setup>
import { ref } from 'vue'
import RossRunTaskInput from './RossRunTaskInput.vue'
import HfChip from '../../../../design-system/hifi/components/HfChip.vue'
import HfButton from '../../../../design-system/hifi/components/HfButton.vue'

const props = defineProps({
  task:        { type: Object, required: true },
  response:    { default: null },               // { value, note, submittedAt, flagged } or null
  saveStatus:  { type: String, default: 'idle' }, // idle | saving | saved | error
  error:       { type: String, default: null },
  disabled:    { type: Boolean, default: false }, // true after run completes
})

const emit = defineEmits(['save', 'dismissError'])

const noteFieldOpen = ref(false)
const pendingValue = ref(undefined)
const noteText = ref('')

function onCommit(value) {
  // No pre-flight tripped — just save.
  noteFieldOpen.value = false
  emit('save', { value, note: undefined })
}

function onPreflightNote({ value }) {
  pendingValue.value = value
  noteText.value = props.response?.note ?? ''
  noteFieldOpen.value = true
}

function onNoteBlur() {
  const note = noteText.value.trim()
  if (!note) return  // can't save without note when pre-flight tripped
  emit('save', { value: pendingValue.value, note })
}
</script>

<template>
  <article class="rrtc" :class="{ 'rrtc--done': response, 'rrtc--flagged': response?.flagged }">
    <header class="rrtc__head">
      <h3 class="rrtc__title">{{ task.title }}</h3>
      <div class="rrtc__meta">
        <HfChip v-if="task.required">Required</HfChip>
        <HfChip v-if="response?.flagged" tone="warn">Flagged</HfChip>
      </div>
    </header>

    <p v-if="task.description" class="rrtc__desc">{{ task.description }}</p>

    <div class="rrtc__input">
      <RossRunTaskInput
        :task="task"
        :value="response?.value"
        :disabled="disabled"
        @commit="onCommit"
        @preflight-note="onPreflightNote"
      />
      <span class="rrtc__save" :data-status="saveStatus">
        <span v-if="saveStatus === 'saving'">Saving…</span>
        <span v-else-if="saveStatus === 'saved'">Saved ✓</span>
      </span>
    </div>

    <div v-if="noteFieldOpen || response?.note" class="rrtc__note">
      <label class="rrtc__note-label">
        Note <span class="rrtc__note-hint">(required — value is out of range)</span>
      </label>
      <textarea
        v-model="noteText"
        class="rrtc__note-input"
        :disabled="disabled"
        rows="2"
        placeholder="Explain the out-of-range value"
        @blur="onNoteBlur"
      ></textarea>
    </div>

    <div v-if="error" class="rrtc__error">
      <span>{{ error }}</span>
      <HfButton variant="ghost" size="sm" @click="emit('dismissError')">Dismiss</HfButton>
    </div>
  </article>
</template>

<style scoped>
.rrtc {
  background: var(--hf-paper); border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-lg); padding: var(--hf-space-4) var(--hf-space-5);
  margin: 0 0 var(--hf-space-3);
  transition: border-color var(--hf-transition);
}
.rrtc--done { border-color: var(--hf-good); }
.rrtc--flagged { border-color: var(--hf-warn); }
.rrtc__head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--hf-space-3); margin-bottom: var(--hf-space-2);
}
.rrtc__title {
  font: 1.05rem/1.3 var(--hf-font-display);
  color: var(--hf-ink); margin: 0;
}
.rrtc__meta { display: inline-flex; gap: var(--hf-space-2); flex-shrink: 0; }
.rrtc__desc { color: var(--hf-muted); margin: 0 0 var(--hf-space-3); font-size: 0.9rem; }
.rrtc__input {
  display: flex; align-items: center; gap: var(--hf-space-3);
}
.rrtc__save { font-size: 0.85rem; color: var(--hf-muted); min-width: 5rem; }
.rrtc__save[data-status="saved"] { color: var(--hf-good); }
.rrtc__note { margin-top: var(--hf-space-3); }
.rrtc__note-label {
  display: block; font-size: 0.85rem; color: var(--hf-ink-2); margin-bottom: var(--hf-space-1);
}
.rrtc__note-hint { color: var(--hf-warn); font-style: italic; }
.rrtc__note-input {
  width: 100%; font: inherit; color: var(--hf-ink);
  background: var(--hf-bg); border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md); padding: var(--hf-space-2) var(--hf-space-3);
  resize: vertical;
}
.rrtc__error {
  margin-top: var(--hf-space-3); padding: var(--hf-space-2) var(--hf-space-3);
  background: var(--hf-bg2); border-left: 3px solid var(--hf-crit);
  border-radius: 0 var(--hf-radius-sm) var(--hf-radius-sm) 0;
  display: flex; align-items: center; justify-content: space-between; gap: var(--hf-space-3);
  color: var(--hf-crit); font-size: 0.9rem;
}
</style>
```

- [ ] **Step 2: Sanity build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add public/js/modules/ross/v2/components/RossRunTaskCard.vue
git commit -m "feat(ross-v2): RossRunTaskCard frame + note reveal + save indicator + error banner"
```

---

## Task 9: `RossRunSummaryBar.vue`

**Files:**
- Create: `public/js/modules/ross/v2/components/RossRunSummaryBar.vue`

Sticky bottom bar. Shows progress + a Finish button that navigates back to Playbook (server auto-completes; this button is a navigation affordance, not a submit).

- [ ] **Step 1: Create the component**

```vue
<script setup>
import HfButton from '../../../../design-system/hifi/components/HfButton.vue'

const props = defineProps({
  requiredTotal: { type: Number, required: true },
  requiredDone:  { type: Number, required: true },
  optionalTotal: { type: Number, required: true },
  optionalDone:  { type: Number, required: true },
})

const emit = defineEmits(['finish'])
</script>

<template>
  <div class="rrsb" role="status" aria-live="polite">
    <div class="rrsb__progress">
      <strong class="rrsb__count">{{ requiredDone }} / {{ requiredTotal }}</strong>
      <span class="rrsb__label">required tasks complete</span>
      <span v-if="optionalTotal > 0" class="rrsb__opt">
        ({{ optionalDone }} / {{ optionalTotal }} optional)
      </span>
    </div>
    <HfButton
      variant="primary"
      :disabled="requiredDone < requiredTotal"
      @click="emit('finish')"
    >Finish run</HfButton>
  </div>
</template>

<style scoped>
.rrsb {
  position: sticky; bottom: 0;
  background: var(--hf-paper); border-top: 1px solid var(--hf-line);
  padding: var(--hf-space-3) var(--hf-space-5);
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--hf-space-4);
  box-shadow: var(--hf-shadow-2);
}
.rrsb__progress { font: 0.95rem/1.3 var(--hf-font-body); color: var(--hf-ink); }
.rrsb__count { color: var(--hf-ink); font-weight: 600; margin-right: var(--hf-space-2); }
.rrsb__label { color: var(--hf-muted); }
.rrsb__opt { color: var(--hf-muted); margin-left: var(--hf-space-2); font-size: 0.85rem; }
@media (max-width: 640px) {
  .rrsb { flex-direction: column; align-items: stretch; gap: var(--hf-space-2); }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add public/js/modules/ross/v2/components/RossRunSummaryBar.vue
git commit -m "feat(ross-v2): RossRunSummaryBar sticky progress + Finish button"
```

---

## Task 10: `RossRunCompletionBanner.vue`

**Files:**
- Create: `public/js/modules/ross/v2/components/RossRunCompletionBanner.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup>
import HfButton from '../../../../design-system/hifi/components/HfButton.vue'
import HfChip from '../../../../design-system/hifi/components/HfChip.vue'

const props = defineProps({
  run: { type: Object, required: true }, // { completedAt, onTime, flaggedCount }
})

const emit = defineEmits(['backToPlaybook', 'viewActivity'])
</script>

<template>
  <aside class="rrcb" role="status">
    <div class="rrcb__icon" aria-hidden="true">✓</div>
    <div class="rrcb__body">
      <h3 class="rrcb__title">Run complete</h3>
      <div class="rrcb__chips">
        <HfChip :tone="run.onTime ? 'good' : 'warn'">
          {{ run.onTime ? 'On time' : 'Late' }}
        </HfChip>
        <HfChip :tone="(run.flaggedCount || 0) > 0 ? 'warn' : 'good'">
          {{ run.flaggedCount || 0 }} flagged
        </HfChip>
      </div>
    </div>
    <div class="rrcb__actions">
      <HfButton variant="ghost" @click="emit('backToPlaybook')">Back to Playbook</HfButton>
      <HfButton variant="primary" @click="emit('viewActivity')">View in Activity</HfButton>
    </div>
  </aside>
</template>

<style scoped>
.rrcb {
  position: sticky; bottom: 0;
  background: var(--hf-paper); border-top: 2px solid var(--hf-good);
  padding: var(--hf-space-4) var(--hf-space-5);
  display: flex; align-items: center; gap: var(--hf-space-4);
  box-shadow: var(--hf-shadow-2);
}
.rrcb__icon {
  width: 2.5rem; height: 2.5rem; border-radius: 50%;
  background: var(--hf-good); color: var(--hf-paper);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.4rem; flex-shrink: 0;
}
.rrcb__body { flex: 1; }
.rrcb__title { font: 1.1rem/1.2 var(--hf-font-display); margin: 0 0 var(--hf-space-1); }
.rrcb__chips { display: inline-flex; gap: var(--hf-space-2); }
.rrcb__actions { display: inline-flex; gap: var(--hf-space-2); flex-shrink: 0; }
@media (max-width: 640px) {
  .rrcb { flex-direction: column; align-items: stretch; }
  .rrcb__actions { flex-direction: column; }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add public/js/modules/ross/v2/components/RossRunCompletionBanner.vue
git commit -m "feat(ross-v2): RossRunCompletionBanner success state"
```

---

## Task 11: `RossRun.vue` page

**Files:**
- Create: `public/js/modules/ross/v2/components/RossRun.vue`

Top-level page mounted by `RossHome.vue` when `?tab=run`. Owns: param read, store init, list render, summary bar / completion banner swap, navigation buttons.

- [ ] **Step 1: Create the component**

```vue
<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRunStore } from '../run-store.js'
import RossRunTaskCard from './RossRunTaskCard.vue'
import RossRunSummaryBar from './RossRunSummaryBar.vue'
import RossRunCompletionBanner from './RossRunCompletionBanner.vue'
import HfButton from '../../../../design-system/hifi/components/HfButton.vue'

const props = defineProps({
  workflowId: { type: String, required: true },
  locationId: { type: String, required: true },
})

const store = useRunStore()

const tasks = computed(() => store.workflow?.tasks || [])
const requiredTasks = computed(() => tasks.value.filter(t => t.required))
const optionalTasks = computed(() => tasks.value.filter(t => !t.required))
const requiredDone = computed(() =>
  requiredTasks.value.filter(t => store.responses[t.id]).length,
)
const optionalDone = computed(() =>
  optionalTasks.value.filter(t => store.responses[t.id]).length,
)
const isCompleted = computed(() => store.currentRun?.status === 'completed')

function navTo(url) {
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function onSave(taskId, { value, note }) {
  store.commitResponse(taskId, value, note)
}

onMounted(() => {
  store.initRun(props.workflowId, props.locationId)
})

onBeforeUnmount(() => {
  store.reset()
})
</script>

<template>
  <section class="rross-run">
    <header class="rross-run__head">
      <HfButton variant="ghost" size="sm" @click="navTo('/ross.html?tab=playbook')">
        ← Back to Playbook
      </HfButton>
      <h1 class="rross-run__title">{{ store.workflow?.name || 'Run' }}</h1>
    </header>

    <div v-if="store.loading" class="rross-run__loading">Loading run…</div>

    <div v-else-if="store.loadError" class="rross-run__error">
      <p>{{ store.loadError }}</p>
      <HfButton variant="primary" @click="store.initRun(props.workflowId, props.locationId)">Retry</HfButton>
    </div>

    <template v-else-if="store.workflow">
      <div class="rross-run__list">
        <RossRunTaskCard
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          :response="store.responses[task.id] || null"
          :save-status="store.saveStatus[task.id] || 'idle'"
          :error="store.errors[task.id] || null"
          :disabled="isCompleted"
          @save="payload => onSave(task.id, payload)"
          @dismiss-error="store.dismissError(task.id)"
        />
      </div>

      <RossRunCompletionBanner
        v-if="isCompleted"
        :run="store.currentRun"
        @back-to-playbook="navTo('/ross.html?tab=playbook')"
        @view-activity="navTo('/ross.html?tab=activity')"
      />
      <RossRunSummaryBar
        v-else
        :required-total="requiredTasks.length"
        :required-done="requiredDone"
        :optional-total="optionalTasks.length"
        :optional-done="optionalDone"
        @finish="navTo('/ross.html?tab=playbook')"
      />
    </template>
  </section>
</template>

<style scoped>
.rross-run {
  display: flex; flex-direction: column; min-height: 100vh;
  background: var(--hf-bg); color: var(--hf-ink);
  font-family: var(--hf-font-body);
}
.rross-run__head {
  display: flex; align-items: center; gap: var(--hf-space-4);
  padding: var(--hf-space-4) var(--hf-space-5);
  border-bottom: 1px solid var(--hf-line);
  background: var(--hf-paper);
}
.rross-run__title { font: 1.4rem/1.2 var(--hf-font-display); margin: 0; color: var(--hf-ink); }
.rross-run__list { flex: 1; padding: var(--hf-space-5); max-width: 760px; width: 100%; margin: 0 auto; }
.rross-run__loading, .rross-run__error {
  padding: var(--hf-space-6) var(--hf-space-5);
  text-align: center; color: var(--hf-muted);
}
.rross-run__error p { color: var(--hf-crit); margin: 0 0 var(--hf-space-3); }
</style>
```

- [ ] **Step 2: Sanity build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add public/js/modules/ross/v2/components/RossRun.vue
git commit -m "feat(ross-v2): RossRun page — list + summary/completion swap"
```

---

## Task 12: Wire `?tab=run` into `RossHome.vue`

**Files:**
- Modify: `public/js/modules/ross/v2/components/RossHome.vue`

Add `run` to `VALID_TABS`, switch into `RossRun` view with workflowId+locationId from URL.

- [ ] **Step 1: Read current `RossHome.vue`** (already done in pre-flight — see structure noted above).

- [ ] **Step 2: Apply this exact patch**

Replace the `VALID_TABS` line:

```js
const VALID_TABS = new Set(['home', 'playbook', 'activity', 'people', 'run'])
```

Add a ref for run params (right after `const tab = ref('home')`):

```js
const runWorkflowId = ref('')
const runLocationId = ref('')
```

Replace `readTab()` with a version that also captures run params:

```js
function readTab() {
  if (typeof window === 'undefined') return 'home'
  const params = new URLSearchParams(window.location.search)
  const t = params.get('tab')
  if (t === 'run') {
    runWorkflowId.value = params.get('workflowId') || ''
    runLocationId.value = params.get('locationId') || ''
    if (!runWorkflowId.value || !runLocationId.value) return 'playbook'
  }
  return t && VALID_TABS.has(t) ? t : 'home'
}
```

Add `run` to the view switch:

```js
const view = computed(() => {
  switch (tab.value) {
    case 'playbook': return 'playbook'
    case 'activity': return 'activity'
    case 'people':   return 'people'
    case 'run':      return 'run'
    default:         return isDesktop.value ? 'home-desktop' : 'home-mobile'
  }
})
```

Add the import and the template branch. Imports block:

```js
import RossRun from './RossRun.vue'
```

Template:

```vue
  <RossRun
    v-else-if="view === 'run'"
    :workflow-id="runWorkflowId"
    :location-id="runLocationId"
  />
```

- [ ] **Step 3: Sanity build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add public/js/modules/ross/v2/components/RossHome.vue
git commit -m "feat(ross-v2): wire ?tab=run routing in RossHome"
```

---

## Task 13: Add `Start run` button to `RossPlaybook.vue` workflow cards

**Files:**
- Modify: `public/js/modules/ross/v2/components/RossPlaybook.vue`

> **Read first:** open `RossPlaybook.vue` and locate the activated-workflow card rendering block (the one with `Edit tasks` / `Pause` / `Delete` buttons). The Start-run button goes alongside those, NOT on template cards.

- [ ] **Step 1: Read the current button cluster**

Search for the existing buttons. Find the workflow-card actions section. Note the existing button variant + size conventions used for `Edit tasks` etc. — match them.

- [ ] **Step 2: Add the button**

Insert a `Start run` button as the first action in the cluster (it's the most common action so it leads):

```vue
<HfButton
  variant="primary"
  size="sm"
  @click="goToRun(workflow)"
>Start run</HfButton>
```

Add the handler in `<script setup>`:

```js
function goToRun(workflow) {
  const url = `/ross.html?tab=run&workflowId=${encodeURIComponent(workflow.workflowId)}&locationId=${encodeURIComponent(workflow.locationId)}`
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
```

> **Field-verify before code:** confirm the workflow object on each card has `workflowId` and `locationId` properties (it does — `playbook-service.js` flattens to one row per (workflowId, locationId)). If you find a card binding to `id` or `wfId` instead, adjust.

- [ ] **Step 3: Sanity build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add public/js/modules/ross/v2/components/RossPlaybook.vue
git commit -m "feat(ross-v2): Start run button on activated workflow cards"
```

---

## Task 14: Build verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: PASS — exits 0, no errors. Asset hashes change for any file touched.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: ALL existing tests + the 4 new test files PASS.

- [ ] **Step 3: Grep for token drift**

Run: `grep -rE '\-\-hf-(fg|surface|font-sans)' public/js/modules/ross/v2/components/RossRun*.vue`
Expected: NO matches. (Catches the PR #55 token-drift bug class.)

- [ ] **Step 4: Grep for SweetAlert leakage**

Run: `grep -rE 'showToast|Swal\.' public/js/modules/ross/v2/components/RossRun*.vue`
Expected: NO matches. (v2 surfaces use inline error banners, not SweetAlert2.)

- [ ] **Step 5: Commit if any fix needed**

If a grep found a leak, fix it in one commit:

```bash
git add -p  # stage the fix only
git commit -m "fix(ross-v2): scrub <description>"
```

---

## Task 15: Manual smoke test

Open the local dev or preview build in a browser. Sign in as an operator with at least one location and one activated workflow (Daily Opening Checklist from the seeded template covers all 10 inputType branches if curated to include them; otherwise pick whatever's activated).

- [ ] **Step 1: Golden path**

Navigate to `/ross.html?tab=playbook`. Click `Start run` on a workflow card. URL changes to `?tab=run&workflowId=…&locationId=…`. Page mounts. Title shows the workflow name. Required pill shows on every required task. Sticky bar shows `0 / N required tasks complete`.

- [ ] **Step 2: Each inputType**

Work through the workflow. For each inputType that's present, confirm:

- `checkbox` — toggle ticks, indicator shows `Saving…` then `Saved ✓`, card border greens.
- `text` — type and blur; same indicator behaviour.
- `number` — in-range value commits cleanly.
- `temperature` — out-of-range value with `requiredNote: true` reveals the note textarea INLINE (no round-trip flicker). Type a note, blur, response saves and is flagged. Card border turns warn-tone.
- `yes_no` — both buttons commit and the chosen one shows primary variant.
- `dropdown` — select an option, save indicator fires.
- `timestamp` — pick a datetime, save fires.
- `photo` / `signature` — Coming soon chip visible, `Mark N/A` button submits sentinel; card border greens.
- `rating` — tap a star; bar fills to that count.

- [ ] **Step 3: Auto-completion**

Fill the last required task. Verify:
- Sticky summary bar swaps to the **green completion banner**.
- Banner shows `On time` / `Late` chip + `N flagged` chip.
- All cards become disabled (inputs cannot change).
- `Back to Playbook` and `View in Activity` buttons work and route correctly.

- [ ] **Step 4: Resume mid-run**

Start a new run on a different workflow. Fill 2 of 5 required tasks. Click `Back to Playbook` link. Re-click `Start run` on the same workflow. Verify:
- The same run resumes (no fresh run created).
- The 2 already-filled tasks show their values + `Saved ✓` indicator + green border.

- [ ] **Step 5: Mobile breakpoint**

Resize to ≤640px (or use DevTools mobile emulator). Verify:
- Cards stack cleanly.
- Sticky bar wraps to two rows (count + Finish button below).
- Completion banner stacks vertically.

- [ ] **Step 6: Error path**

Open DevTools → Network → set Offline. Try to commit a value. Verify:
- Save indicator stays `Saving…` (or goes to `error` state after fetch times out).
- Error banner appears on the affected card with the network error message verbatim + Dismiss button.
- Going back online + re-committing succeeds.

If any step fails, fix in one focused commit and re-smoke.

---

## Task 16: Preview deploy + push branch

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/ross-run-execution-ui
```

- [ ] **Step 2: Deploy preview channel**

```bash
firebase hosting:channel:deploy ross-run-execution-ui --expires 7d
```

Capture the preview URL from the output for the PR description.

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(ross-v2): Run execution UI (Phase 6 PR 3)" --body "$(cat <<'EOF'
## Summary

Operator-facing Run execution UI for ROSS v2. Consumes the already-shipped Runs server surface (`rossCreateRun` / `rossSubmitResponse` / `rossGetRun`); honours all 10 `inputType`s; auto-saves on commit; client pre-flight for `requiredNote` with server 422 safety net; inline completion banner.

Spec: `docs/plans/2026-05-13-ross-run-execution-ui-design.html`
Plan: `docs/plans/2026-05-13-pr3-ross-run-execution-ui-plan.md`

Closes Phase 6 task: **Operator-facing Run execution UI**.

## What this PR does

- New tab on the concierge shell: `/ross.html?tab=run&workflowId=…&locationId=…`
- Single scrollable list of task cards + sticky summary bar / completion banner swap
- Polymorphic `RossRunTaskInput` covering 10 inputTypes (number/temperature with pre-flight note; photo/signature as "Coming soon" placeholder + Mark N/A sentinel)
- Pinia store + thin service wrappers; vitest coverage on store + pre-flight logic
- Wire `Start run` button on activated workflow cards in the Playbook tab

## What this PR does NOT do

- No CF changes — server contract is already shipped
- No photo upload pipeline / signature pad — Phase 2
- No offline queue — re-commit on reconnect
- No concierge home active-run surfacing — separate sprint task

## Test plan

- [ ] Build green (`npm run build`)
- [ ] All unit tests pass (`npm test`)
- [ ] Manual smoke on preview (see plan Task 15)
- [ ] Mobile breakpoint (≤640px) smoke
- [ ] Error path: network offline mid-save
- [ ] Resume: navigate away and back mid-run

Preview: <paste URL here>
EOF
)"
```

- [ ] **Step 4: Stop here**

The PR is open. The user reviews and merges. After merge, follow the standard reflect cycle per CLAUDE.md (update SELF_OPTIMIZATION, LESSONS, SCORECARD, PROJECT_BACKLOG; report summary).

---

## Summary of what gets shipped

| File | Status | LOC ballpark |
|------|--------|---|
| `public/js/modules/ross/v2/constants/run-input-types.js` | new | ~45 |
| `public/js/modules/ross/v2/run-service.js` | new | ~70 |
| `public/js/modules/ross/v2/run-store.js` | new | ~110 |
| `public/js/modules/ross/v2/components/RossRun.vue` | new | ~110 |
| `public/js/modules/ross/v2/components/RossRunTaskCard.vue` | new | ~120 |
| `public/js/modules/ross/v2/components/RossRunTaskInput.vue` | new | ~200 |
| `public/js/modules/ross/v2/components/RossRunSummaryBar.vue` | new | ~50 |
| `public/js/modules/ross/v2/components/RossRunCompletionBanner.vue` | new | ~70 |
| `public/js/modules/ross/v2/components/RossHome.vue` | modify | +20 |
| `public/js/modules/ross/v2/components/RossPlaybook.vue` | modify | +12 |
| `tests/unit/ross-run-input-types.test.js` | new | ~70 |
| `tests/unit/ross-run-service.test.js` | new | ~90 |
| `tests/unit/ross-run-store.test.js` | new | ~190 |
| `tests/unit/ross-run-task-input-preflight.test.js` | new | ~80 |

**Net code added:** ~1100 lines (≈700 production + 430 tests).
**CF changes:** none.
**RTDB rule changes:** none.
**New dependencies:** none.
