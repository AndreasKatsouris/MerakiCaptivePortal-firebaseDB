// Sidebar + first-run findings detectors. Separate from detectors.js
// (which serves the home feed) so the two slices can evolve independently.
//
// Conventions match detectors.js:
//   - Pure functions: take ctx ({ uid, locationIds, locations, now, displayName })
//   - en-ZA / ZAR formatting throughout
//   - Hide > fake: return null when data is too thin
//   - Snapshot reads only; no realtime subscriptions (per Phase 2 decision)

import {
  rtdb, ref, get, query, orderByChild, equalTo,
} from '../../../config/firebase-config.js'

const DAY_MS = 86_400_000
const LAPSED_DAYS = 90
const MIN_LAPSED_GUESTS = 5
const QUEUE_WAIT_GOOD_MINUTES = 15
const QUEUE_WAIT_WARN_MINUTES = 30

const zar = new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR', maximumFractionDigits: 0,
})

// ---------- Live venues (right-rail strip) ----------

/**
 * Live venue strip: each user-accessible location with real-time-ish wait
 * stats from queue/{locId}/entries. Tone derives from average wait of
 * 'waiting' entries:
 *   <15m → good, <30m → default, ≥30m → warn
 *
 * Returns [] when the user has no locations. Always returns one tile per
 * location even if queue is empty (shows '—' for wait).
 */
export async function detectLiveVenues(ctx) {
  const { locationIds, locations } = ctx
  if (!locationIds.length) return []

  const tiles = await Promise.all(locationIds.map(async (locId) => {
    let waiting = 0
    let avgWaitMin = 0
    try {
      const snap = await get(ref(rtdb, `queue/${locId}/entries`))
      if (snap?.exists()) {
        const entries = Object.values(snap.val() || {})
        const waitingEntries = entries.filter((e) => e?.status === 'waiting')
        waiting = waitingEntries.length
        if (waiting > 0) {
          const total = waitingEntries.reduce((s, e) => s + (Number(e?.estimatedWaitTime) || 0), 0)
          avgWaitMin = Math.round(total / waiting)
        }
      }
    } catch (_) { /* fall through to defaults */ }

    let tone
    if (waiting === 0) tone = 'muted'
    else if (avgWaitMin < QUEUE_WAIT_GOOD_MINUTES) tone = 'good'
    else if (avgWaitMin < QUEUE_WAIT_WARN_MINUTES) tone = 'default'
    else tone = 'warn'

    const primary = waiting > 0
      ? `${waiting} waiting`
      : 'no queue'
    const secondary = avgWaitMin > 0
      ? `${avgWaitMin}m avg wait`
      : '—'

    return {
      name: locations[locId] || locId,
      status: 'open', // operational status not modelled in RTDB; placeholder
      primary,
      secondary,
      tone,
      seed: 0, // sparkline disabled — would need historical wait data
    }
  }))

  return tiles
}

// ---------- Tonight's bookings (suggestion) ----------

function todayIsoDate(now) {
  const d = new Date(now)
  return d.toISOString().slice(0, 10)
}

/**
 * Sum confirmed bookings for the current ISO date across user's locations.
 * Returns a suggestion card or null if there are none today.
 */
export async function detectTonightsBookings(ctx) {
  const { locationIds, now } = ctx
  if (!locationIds.length) return null

  const today = todayIsoDate(now)
  let total = 0
  let totalGuests = 0
  let busiestLoc = null
  let busiestCount = 0

  for (const locId of locationIds) {
    let snap
    try {
      // bookings.indexOn includes 'location' and 'date' (database.rules.json).
      // Querying by 'location' first (cheaper) then filtering by date in code.
      const q = query(ref(rtdb, 'bookings'), orderByChild('location'), equalTo(locId))
      snap = await get(q)
    } catch (_) { continue }
    if (!snap?.exists()) continue

    const all = Object.values(snap.val() || {})
    const todays = all.filter((b) =>
      b && b.date === today && (b.status === 'confirmed' || b.status === 'pending')
    )
    if (!todays.length) continue
    total += todays.length
    totalGuests += todays.reduce((s, b) => s + (Number(b?.numberOfGuests) || 0), 0)
    if (todays.length > busiestCount) {
      busiestCount = todays.length
      busiestLoc = locId
    }
  }

  if (total === 0) return null

  const venueLabel = busiestLoc ? (ctx.locations[busiestLoc] || 'a venue') : 'your venues'
  const text = total === 1
    ? `1 booking tonight at ${venueLabel}`
    : totalGuests > 0
      ? `${total} bookings tonight · ${totalGuests} guests`
      : `${total} bookings tonight across your venues`

  return {
    id: 'tonights-bookings',
    text,
    action: 'See bookings',
    href: `/admin-dashboard.html#bookingManagementContent`,
  }
}

// ---------- Lapsed VIPs (suggestion) ----------

function guestLastActivity(g) {
  return Number(
    g?.lastLogin ?? g?.lastVisitAt ?? g?.lastVisit ?? g?.nameCollectedAt ?? g?.createdAt ?? 0
  ) || 0
}

/**
 * Suggestion variant of the home-feed lapsed-VIP card. Returns a single
 * suggestion line + action target, or null if below threshold.
 */
export async function detectLapsedVIPSuggestion(ctx) {
  const { locationIds, now } = ctx
  if (!locationIds.length) return null

  const cutoff = now - LAPSED_DAYS * DAY_MS
  let lapsedCount = 0

  for (const locId of locationIds) {
    let snap
    try {
      const q = query(ref(rtdb, 'guests'), orderByChild('locationId'), equalTo(locId))
      snap = await get(q)
    } catch (_) { continue }
    if (!snap?.exists()) continue

    const guests = Object.values(snap.val() || {})
    for (const g of guests) {
      if (!g || typeof g !== 'object') continue
      const last = guestLastActivity(g)
      if (last && last < cutoff) lapsedCount++
    }
  }

  if (lapsedCount < MIN_LAPSED_GUESTS) return null

  return {
    id: 'lapsed-vips',
    text: `${lapsedCount} guests haven't visited in ${LAPSED_DAYS}+ days`,
    action: 'Draft win-back',
    href: '/guests-v2.html?filter=lapsed',
  }
}

// ---------- First-run finding: best day-of-week ----------

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const FINDING_LOOKBACK_DAYS = 90
const FINDING_MIN_DAYS = 14
const FINDING_MIN_LIFT = 0.15 // 15% above weekday average

/**
 * Identify whether one weekday meaningfully out-performs the rest in
 * average daily revenue. Returns a finding card or null when the dataset
 * is too thin or no weekday clearly leads.
 */
export async function detectBestWeekday(ctx) {
  const { locationIds, locations, now } = ctx
  if (!locationIds.length) return null

  const cutoff = now - FINDING_LOOKBACK_DAYS * DAY_MS
  const cutoffDate = new Date(cutoff).toISOString().slice(0, 10)

  let best = null

  for (const locId of locationIds) {
    let indexSnap
    try {
      indexSnap = await get(ref(rtdb, `salesDataIndex/byLocation/${locId}`))
    } catch (_) { continue }
    if (!indexSnap?.exists()) continue

    const ids = Object.keys(indexSnap.val() || {})
    const byWeekday = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }))

    for (const id of ids) {
      let dailySnap
      try { dailySnap = await get(ref(rtdb, `salesData/${id}/dailyData`)) } catch (_) { continue }
      if (!dailySnap?.exists()) continue

      for (const [date, d] of Object.entries(dailySnap.val() || {})) {
        if (!date || date < cutoffDate) continue
        const revenue = Number(d?.revenue) || 0
        if (revenue <= 0) continue
        // Parse YYYY-MM-DD as local-naive — weekday derivation is stable
        const wkday = new Date(date + 'T00:00:00').getDay()
        if (Number.isNaN(wkday)) continue
        byWeekday[wkday].sum += revenue
        byWeekday[wkday].n += 1
      }
    }

    const totalDays = byWeekday.reduce((s, w) => s + w.n, 0)
    if (totalDays < FINDING_MIN_DAYS) continue

    // Average revenue per occurrence of each weekday
    const avgs = byWeekday.map((w) => (w.n > 0 ? w.sum / w.n : 0))
    const allObservedAvg = avgs.filter((_, i) => byWeekday[i].n > 0)
    if (allObservedAvg.length < 4) continue // need most weekdays present

    const overallMean = allObservedAvg.reduce((s, v) => s + v, 0) / allObservedAvg.length
    let topIdx = -1
    let topVal = 0
    for (let i = 0; i < 7; i++) {
      if (byWeekday[i].n === 0) continue
      if (avgs[i] > topVal) { topVal = avgs[i]; topIdx = i }
    }
    if (topIdx < 0) continue

    const lift = (topVal - overallMean) / overallMean
    if (lift < FINDING_MIN_LIFT) continue

    if (!best || lift > best.lift) {
      best = {
        locId, locName: locations[locId] || 'a venue',
        weekday: WEEKDAYS[topIdx],
        avgRev: topVal, overallMean, lift, totalDays,
      }
    }
  }

  if (!best) return null

  const liftPct = Math.round(best.lift * 100)
  return {
    id: 'best-weekday',
    headline: `${best.weekday}s at ${best.locName} earn ${liftPct}% more than your weekday average.`,
    detail:
      `Across the last ${best.totalDays} days, ${best.weekday} averaged ` +
      `${zar.format(Math.round(best.avgRev))}/day — ${liftPct}% above the cross-day mean ` +
      `of ${zar.format(Math.round(best.overallMean))}. Worth weighing whether a ` +
      `${best.weekday.toLowerCase()}-specific promotion or extra staff would amplify it.`,
    accent: true,
    source: 'derived', // marks as real (vs. illustrative)
  }
}
