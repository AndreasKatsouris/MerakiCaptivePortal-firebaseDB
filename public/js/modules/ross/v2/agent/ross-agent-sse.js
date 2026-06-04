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
