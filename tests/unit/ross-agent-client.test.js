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

  test('synthesizes a truncated error when the stream closes with zero events (no busy hang)', async () => {
    // 200 + SSE headers, but the body yields no frames before closing.
    const fetchMock = vi.fn().mockResolvedValue(fakeStreamingResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    const events = []
    await streamRossChat({ message: 'yo' }, (e) => events.push(e))

    expect(events).toEqual([{ type: 'error', code: 'truncated', message: expect.any(String) }])
  })

  test('does NOT synthesize an error when the stream ends with a done event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeStreamingResponse([
      'data: {"type":"done","threadId":"t1","turnId":"u1","costCents":1}\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const events = []
    await streamRossChat({ message: 'yo' }, (e) => events.push(e))

    expect(events).toEqual([{ type: 'done', threadId: 't1', turnId: 'u1', costCents: 1 }])
  })
})
