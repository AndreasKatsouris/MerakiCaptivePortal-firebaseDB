// Guests service — Phase A3 scripted. A3.1 wires RTDB guests/{guestId}
// plus guestVisitsIndex/byGuest/{guestId}. Service is async so call
// sites won't need to change.

import { GUEST_LIST_TOTAL, GUEST_LIST_FILTERS, GUESTS, GUEST_PROFILES } from './content.js'

const FAKE_LATENCY_MS = 60
const wait = (ms = FAKE_LATENCY_MS) => new Promise(r => setTimeout(r, ms))

export async function listGuests({ filter = 'vip', query = '' } = {}) {
  await wait()
  let rows = GUESTS
  const q = query.trim().toLowerCase()
  if (q) rows = rows.filter(g => g.name.toLowerCase().includes(q) || g.summary.toLowerCase().includes(q))
  // Filter mapping — currently scripted summaries; real impl will query
  // guest subscriptions / lastVisitAt / birthday index.
  if (filter === 'vip')      rows = rows.filter(g => /VIP/.test(g.summary))
  if (filter === 'lapsed')   rows = rows.filter(g => /Lapsed/.test(g.summary))
  if (filter === 'new')      rows = rows.filter(g => /New/.test(g.summary))
  if (filter === 'birthday') rows = rows.filter(g => /Birthday/.test(g.summary))
  return { total: GUEST_LIST_TOTAL, filters: GUEST_LIST_FILTERS, rows }
}

export async function getGuest(guestId) {
  await wait()
  return GUEST_PROFILES[guestId] || GUEST_PROFILES.ef
}
