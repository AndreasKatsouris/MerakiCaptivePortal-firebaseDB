import { describe, test, expect, vi, beforeEach } from 'vitest'

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

describe('createRun error', () => {
  test('throws with server error message on 500', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(JSON.stringify({ error: 'Workflow not found' })),
    })
    await expect(createRun({ workflowId: 'w1', locationId: 'l1' }))
      .rejects.toThrow(/Workflow not found/)
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
      text: () => Promise.resolve(JSON.stringify({ error: 'Note required', requiredNote: true })),
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
      text: () => Promise.resolve(JSON.stringify({ error: 'Internal' })),
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

describe('getRun error', () => {
  test('throws with server error message on 500', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(JSON.stringify({ error: 'Auth failed' })),
    })
    await expect(getRun({ workflowId: 'w1', locationId: 'l1' }))
      .rejects.toThrow(/Auth failed/)
  })
})
