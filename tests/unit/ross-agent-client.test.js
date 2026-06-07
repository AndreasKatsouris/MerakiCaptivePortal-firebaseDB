import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock firebase auth so getIdToken() resolves without a real Firebase app.
vi.mock('../../public/js/config/firebase-config.js', () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('tok-123') } },
}))

import { streamRossChat, resumeRossChat } from '../../public/js/modules/ross/v2/agent/ross-agent-client.js'

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

  test('returns { promise, abort } shape', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeStreamingResponse([])))
    const result = streamRossChat({ message: 'yo' }, () => {})
    expect(typeof result.promise?.then).toBe('function')
    expect(typeof result.abort).toBe('function')
  })

  test('POSTs a FLAT body with a Bearer token and emits parsed events in order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeStreamingResponse([
      'data: {"type":"text","delta":"Hi"}\n\n',
      'data: {"type":"done","threadId":"t1","turnId":"u1","costCents":1}\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const events = []
    await streamRossChat({ message: 'yo', threadId: 't1' }, (e) => events.push(e)).promise

    expect(events).toEqual([
      { type: 'text', delta: 'Hi' },
      { type: 'done', threadId: 't1', turnId: 'u1', costCents: 1 },
    ])
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/rossChat$/)
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toBe('Bearer tok-123')
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
    await streamRossChat({ message: 'yo' }, (e) => events.push(e)).promise

    expect(events).toEqual([{ type: 'error', code: 'http_401', message: expect.any(String) }])
  })

  test('synthesizes a truncated error when the stream closes with zero events (no busy hang)', async () => {
    // 200 + SSE headers, but the body yields no frames before closing.
    const fetchMock = vi.fn().mockResolvedValue(fakeStreamingResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    const events = []
    await streamRossChat({ message: 'yo' }, (e) => events.push(e)).promise

    expect(events).toEqual([{ type: 'error', code: 'truncated', message: expect.any(String) }])
  })

  test('does NOT synthesize an error when the stream ends with a done event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeStreamingResponse([
      'data: {"type":"done","threadId":"t1","turnId":"u1","costCents":1}\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const events = []
    await streamRossChat({ message: 'yo' }, (e) => events.push(e)).promise

    expect(events).toEqual([{ type: 'done', threadId: 't1', turnId: 'u1', costCents: 1 }])
  })

  test('abort() is callable and does not throw', () => {
    // Minimal contract: abort() must be a no-throw function that can be called
    // at any point, including when no fetch is in flight yet.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeStreamingResponse([])))
    const { abort } = streamRossChat({ message: 'test' }, () => {})
    expect(() => abort()).not.toThrow()
  })

  test('abort() called before fetch resolves prevents onEvent from being called', async () => {
    // fetch never resolves (simulates a genuinely stalled network request).
    let rejectFetch
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(
      new Promise((_, rej) => { rejectFetch = rej })
    ))

    const events = []
    const { promise, abort } = streamRossChat({ message: 'stalled' }, (e) => events.push(e))

    // Abort immediately — the fetch is still pending.
    abort()
    // Reject the fetch with an AbortError (what browsers do when the signal fires).
    const abortErr = new DOMException('The user aborted a request.', 'AbortError')
    rejectFetch(abortErr)

    await promise

    // Aborted before any frame was received — no events should have been emitted.
    expect(events).toEqual([])
  })

  test('resumeRossChat returns { promise, abort } shape', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeStreamingResponse([])))
    const result = resumeRossChat({ resumeTurnId: 'p1', decision: 'approve' }, () => {})
    expect(typeof result.promise?.then).toBe('function')
    expect(typeof result.abort).toBe('function')
  })
})
