// Queue & Floor service — Phase A4 scripted, shaped as a live
// subscription (not a one-shot getter) so A4.1 can swap in a real
// RTDB listener on queueIndex/byLocation/{loc} + tablesByLocation/{loc}
// without changing the UI contract.
//
// Usage:
//   const unsub = subscribeFloor(locationId, (snapshot) => { ... })
//   // later: unsub()

import { VENUE, WAITLIST, FLOOR_TABLES, FLOOR_ROSS, SERVICE_METRICS, TONIGHT } from './content.js'

function snapshot(locationId) {
  // Deep-copy so the store can mutate safely without polluting the module.
  return {
    venue:   { ...VENUE },
    waitlist: WAITLIST.map(w => ({ ...w })),
    tables:   FLOOR_TABLES.map(t => ({ ...t })),
    ross:     { ...FLOOR_ROSS, parts: FLOOR_ROSS.parts.map(p => ({ ...p })), actions: FLOOR_ROSS.actions.map(a => ({ ...a })) },
    metrics:  SERVICE_METRICS.map(m => ({ ...m })),
    tonight:  { ...TONIGHT, bookingsByHour: TONIGHT.bookingsByHour.map(p => ({ ...p })) },
    lastUpdated: Date.now(),
  }
}

export function subscribeFloor(locationId, onSnapshot) {
  // Emit an initial snapshot on next tick so subscribers always see one
  // async delivery (matches RTDB `on('value')` semantics).
  const initialTimer = setTimeout(() => onSnapshot(snapshot(locationId)), 40)

  // Fake a "live" feed: every 30s nudge the avg-wait value so the
  // "updated Ns ago" indicator behaves realistically during demos. Real
  // listener will push on any matching RTDB child change.
  const heartbeat = setInterval(() => onSnapshot(snapshot(locationId)), 30_000)

  return () => {
    clearTimeout(initialTimer)
    clearInterval(heartbeat)
  }
}
