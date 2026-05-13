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
