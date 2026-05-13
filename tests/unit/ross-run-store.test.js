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
  test('happy path: createRun + workflow load → state populated', async () => {
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

  test('tasks normalize: object-shaped tasks from playbook-service become a sorted array with id', async () => {
    runService.createRun.mockResolvedValue({
      runId: 'r1', status: 'in_progress', startedAt: 123, responses: {},
    })
    // playbook-service.js returns tasks as an OBJECT keyed by taskId
    // (RTDB native shape), not an array. Store must normalize.
    playbookService.getPlaybookWorkflows.mockResolvedValue([
      { workflowId: 'w1', locationId: 'l1', name: 'Daily Opening',
        tasks: {
          t2: { title: 'Cash float', order: 2, required: true, inputType: 'number' },
          t1: { title: 'Lights on', order: 1, required: true, inputType: 'checkbox' },
          t3: { title: 'Notes', order: 3, required: false, inputType: 'text' },
        } },
    ])

    const store = useRunStore()
    await store.initRun('w1', 'l1')

    expect(Array.isArray(store.workflow.tasks)).toBe(true)
    expect(store.workflow.tasks).toHaveLength(3)
    // sorted by order, with id injected from the key
    expect(store.workflow.tasks[0]).toMatchObject({ id: 't1', title: 'Lights on', order: 1 })
    expect(store.workflow.tasks[1]).toMatchObject({ id: 't2', title: 'Cash float', order: 2 })
    expect(store.workflow.tasks[2]).toMatchObject({ id: 't3', title: 'Notes', order: 3 })
  })

  test('resume: createRun returns in-progress run with responses → responses hydrated', async () => {
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

  test('workflow not found → loadError surfaced, currentRun stays null', async () => {
    runService.createRun.mockResolvedValue({ runId: 'r1', status: 'in_progress', responses: {} })
    playbookService.getPlaybookWorkflows.mockResolvedValue([])

    const store = useRunStore()
    await store.initRun('w1', 'l1')

    expect(store.loadError).toMatch(/workflow/i)
    expect(store.currentRun).toBeNull()
    expect(store.workflow).toBeNull()
  })

  test('createRun throws → loadError surfaced, loading false', async () => {
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

describe('commitResponse', () => {
  test('200: saveStatus saving → saved, response built client-side from submitted value', async () => {
    runService.submitResponse.mockResolvedValue({
      status: 200,
      result: { success: true, taskId: 't1', flagged: false, runCompleted: false },
    })
    const store = useRunStore()
    store.currentRun = { runId: 'r1', completedAt: null }
    store.workflow = { workflowId: 'w1', locationId: 'l1', tasks: [] }

    const pending = store.commitResponse('t1', 3)
    expect(store.saveStatus.t1).toBe('saving')
    await pending
    expect(store.saveStatus.t1).toBe('saved')
    expect(store.responses.t1.value).toBe(3)
    expect(store.responses.t1.flagged).toBe(false)
    expect(store.errors.t1).toBeNull()
  })

  test('200 with runCompleted: currentRun.completedAt is stamped, flaggedCount computed', async () => {
    runService.submitResponse.mockResolvedValue({
      status: 200,
      result: { success: true, taskId: 't1', flagged: true, runCompleted: true },
    })
    const store = useRunStore()
    store.currentRun = { runId: 'r1', completedAt: null }
    store.workflow = { workflowId: 'w1', locationId: 'l1', tasks: [] }
    // Pre-existing response, also flagged → flaggedCount should be 2
    store.responses = { t0: { value: 99, flagged: true } }

    await store.commitResponse('t1', 12, 'out of range')
    expect(store.currentRun.completedAt).toBeGreaterThan(0)
    expect(store.currentRun.flaggedCount).toBe(2)
    expect(store.responses.t1.flagged).toBe(true)
    expect(store.responses.t1.note).toBe('out of range')
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
