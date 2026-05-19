// Pure relative-time formatter for Ross home cards.
//
// relTime(timestampMs, nowMs?) returns a short human-readable phrase
// describing how long ago `timestampMs` was, relative to `nowMs`
// (defaults to Date.now()).

const MIN_MS = 60_000
const HOUR_MS = 60 * MIN_MS
const DAY_MS = 24 * HOUR_MS

export function relTime(timestampMs, nowMs = Date.now()) {
  const elapsed = Math.max(0, nowMs - Number(timestampMs))
  if (elapsed < MIN_MS) return 'just now'
  if (elapsed < HOUR_MS) {
    const n = Math.floor(elapsed / MIN_MS)
    return `${n} min ago`
  }
  if (elapsed < DAY_MS) {
    const n = Math.floor(elapsed / HOUR_MS)
    return `${n} hour${n === 1 ? '' : 's'} ago`
  }
  if (elapsed < 2 * DAY_MS) return 'yesterday'
  if (elapsed < 7 * DAY_MS) {
    const n = Math.floor(elapsed / DAY_MS)
    return `${n} days ago`
  }
  return `on ${new Date(timestampMs).toISOString().slice(0, 10)}`
}
