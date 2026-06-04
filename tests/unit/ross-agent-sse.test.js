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
