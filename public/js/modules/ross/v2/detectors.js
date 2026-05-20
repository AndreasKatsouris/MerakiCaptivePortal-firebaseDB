// Ross home detectors. Each function inspects RTDB and returns either a
// card shaped to match HOME_FEED[i] in content.js, or null if the signal
// is too thin to be honest about. Detectors are independent so they run
// in parallel from ross-service.js getHomeFeed().
//
// Conventions:
//   - Pure functions: take { uid, locationIds, locations, now }, return card|null.
//   - All numeric text uses en-ZA locale; money is ZAR.
//   - Hide > fake: if data is insufficient, return null. The caller will
//     slot a LEARNING_MODE_CARDS item in its place.

import {
  rtdb, ref, get, query, orderByChild, equalTo,
} from '../../../config/firebase-config.js'
import { getHomeWorkflowDigest } from './ross-service.js'
import { relTime } from './utils/rel-time.js'
import { MISSED_DAYS_THRESHOLD } from './workflow-status.js'

/**
 * Read this user's currently-active snoozes from ross/v2Snoozes/{uid}.
 * Returns a Set<cardId> of snoozes whose expiresAt is still in the
 * future. getHomeFeed uses this to filter out cards the user has hidden.
 */
export async function getActiveSnoozes(ctx) {
  const { uid, now } = ctx
  if (!uid) return new Set()
  let snap
  try {
    snap = await get(ref(rtdb, `ross/v2Snoozes/${uid}`))
  } catch (_) { return new Set() }
  if (!snap?.exists()) return new Set()
  const active = new Set()
  for (const [cardId, val] of Object.entries(snap.val() || {})) {
    if (Number(val?.expiresAt) > now) active.add(cardId)
  }
  return active
}

const DAY_MS = 86_400_000
const COGS_TARGET = 30          // %
const COGS_ALERT_DELTA = 3      // pp above target → tone: warn
const LAPSED_DAYS = 90
const MIN_LAPSED_GUESTS = 5
const MIN_PAIRED_RECORDS = 3    // at least 3 stock-cost records in window
const REVENUE_WINDOW_DAYS = 14  // lookback for revenue trend
const REVENUE_MIN_DAYS = 7      // need ≥7 days to say anything

// en-ZA formatters cached at module scope
const zar = new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR', maximumFractionDigits: 0,
})
const pct1 = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}`

// ---------- Context builder ----------

export async function buildContext(auth) {
  const user = auth?.currentUser
  if (!user) return { uid: null, locationIds: [], locations: {}, now: Date.now(), displayName: null }

  const uid = user.uid
  const now = Date.now()

  const snap = await get(ref(rtdb, `userLocations/${uid}`))
  const locMap = snap.exists() ? (snap.val() || {}) : {}
  const locationIds = Object.keys(locMap)

  // Resolve human-readable names in parallel (best effort — if locations/{id}
  // is readable we use its name; otherwise fall back to the userLocations value).
  const nameEntries = await Promise.all(locationIds.map(async (id) => {
    try {
      const ls = await get(ref(rtdb, `locations/${id}/name`))
      if (ls.exists() && typeof ls.val() === 'string') return [id, ls.val()]
    } catch (_) { /* noop */ }
    const fallback = typeof locMap[id] === 'string' ? locMap[id] : (locMap[id]?.name || id)
    return [id, fallback]
  }))
  const locations = Object.fromEntries(nameEntries)

  const displayName = user.displayName || null
  return { uid, locationIds, locations, now, displayName }
}

// ---------- Card 1: Food cost drift ----------

function extractCost(rec) {
  return Number(
    rec?.totals?.totalCostOfUsage ??
    rec?.totalCostOfUsage ??
    rec?.costOfUsage ??
    0
  ) || 0
}
function extractRevenue(rec) {
  return Number(rec?.salesTotal ?? rec?.salesRevenue ?? rec?.totals?.salesTotal ?? 0) || 0
}
function extractTs(rec) {
  return Number(rec?.timestamp ?? rec?.recordDate ?? rec?.createdAt ?? 0) || 0
}

export async function detectFoodCostDrift(ctx) {
  const { locationIds, locations, now } = ctx
  if (!locationIds.length) return null

  const since = now - REVENUE_WINDOW_DAYS * DAY_MS
  let best = null  // { locId, locName, series: [{ts, pct}], avgPct, currentPct }

  for (const locId of locationIds) {
    let snap
    try {
      snap = await get(ref(rtdb, `locations/${locId}/stockUsage`))
    } catch (_) { continue }
    if (!snap?.exists()) continue

    const recs = Object.values(snap.val() || {})
      .map((r) => ({ ts: extractTs(r), cost: extractCost(r), revenue: extractRevenue(r) }))
      .filter((r) => r.ts >= since && r.cost > 0 && r.revenue > 0)
      .sort((a, b) => a.ts - b.ts)

    if (recs.length < MIN_PAIRED_RECORDS) continue

    const series = recs.map((r) => ({ ts: r.ts, pct: (r.cost / r.revenue) * 100 }))
    const avgPct = series.reduce((s, p) => s + p.pct, 0) / series.length
    const currentPct = series[series.length - 1].pct

    if (!best || avgPct > best.avgPct) {
      best = { locId, locName: locations[locId] || 'Your venue', series, avgPct, currentPct }
    }
  }

  if (!best) return null

  // Last 7 points, padded to 7 with the earliest available value so the
  // sparkline renders with a consistent shape.
  const trendPts = best.series.slice(-7)
  const pad = 7 - trendPts.length
  const trend = pad > 0
    ? [...Array(pad).fill(trendPts[0].pct), ...trendPts.map((p) => p.pct)]
    : trendPts.map((p) => p.pct)

  const delta = best.currentPct - COGS_TARGET
  const tone = best.currentPct > COGS_TARGET + COGS_ALERT_DELTA ? 'warn' : 'default'
  const chipTone = tone === 'warn' ? 'warn' : 'default'
  const dir = delta >= 0 ? `${pct1(delta)}pp above` : `${pct1(Math.abs(delta))}pp below`

  const sampleCount = best.series.length
  const eyebrow = `${best.locName} · ${sampleCount} recent stock counts`
  const headline = tone === 'warn'
    ? `Food cost is tracking at ${pct1(best.currentPct)}%, ${dir} target.`
    : `Food cost is running at ${pct1(best.currentPct)}%, ${dir} target.`
  const detail =
    `Average over the last ${sampleCount} stock counts is ${pct1(best.avgPct)}%. ` +
    `Target is ${COGS_TARGET}%. ` +
    (tone === 'warn'
      ? 'Worth opening the food-cost brief to see which items are drifting.'
      : 'Nothing urgent — keeping an eye on ingredient mix.')

  return {
    id: 'real-food-cost',
    tone,
    eyebrow,
    chip: { tone: chipTone, label: tone === 'warn' ? 'Needs attention' : 'Food cost' },
    headline,
    detail,
    actions: [
      { id: 'open-food-cost', label: 'Open food-cost brief', variant: 'solid', trailing: 'arrow',
        href: `/food-cost-v2.html?loc=${encodeURIComponent(best.locId)}` },
      { id: 'ask-why', label: 'Ask Ross why', variant: 'ghost' },
      { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
    ],
    footnote: `${sampleCount} data points · last ${REVENUE_WINDOW_DAYS} days`,
    sidecar: {
      kind: 'kpi-spark',
      eyebrow: 'Food cost %',
      value: pct1(best.currentPct),
      unit: '%',
      target: `target ${COGS_TARGET}%`,
      trend,
      color: tone === 'warn' ? 'var(--hf-warn)' : 'var(--hf-accent)',
    },
    _meta: { contextLine: `Food cost at ${best.locName} is ${pct1(best.currentPct)}%.` },
  }
}

// ---------- Card 2: Lapsed VIP guests ----------

function guestLastActivity(g) {
  return Number(
    g?.lastLogin ?? g?.lastVisitAt ?? g?.lastVisit ?? g?.nameCollectedAt ?? g?.createdAt ?? 0
  ) || 0
}

export async function detectLapsedVIPs(ctx) {
  const { locationIds, now } = ctx
  if (!locationIds.length) return null

  const cutoff = now - LAPSED_DAYS * DAY_MS
  const recentWindow = now - 30 * DAY_MS

  let totalGuests = 0
  let returningRecent = 0
  let lapsedCount = 0

  for (const locId of locationIds) {
    let snap
    try {
      // guests.indexOn includes 'locationId' (database.rules.json:15)
      const q = query(ref(rtdb, 'guests'), orderByChild('locationId'), equalTo(locId))
      snap = await get(q)
    } catch (_) { continue }
    if (!snap?.exists()) continue

    const guests = Object.values(snap.val() || {})
    for (const g of guests) {
      if (!g || typeof g !== 'object') continue
      totalGuests++
      const last = guestLastActivity(g)
      if (!last) continue
      if (last >= recentWindow) returningRecent++
      if (last < cutoff) lapsedCount++
    }
  }

  if (lapsedCount < MIN_LAPSED_GUESTS) return null

  const returnRate = totalGuests > 0 ? returningRecent / totalGuests : 0
  const returnPct = Math.round(returnRate * 100)

  return {
    id: 'real-lapsed-guests',
    tone: 'default',
    eyebrow: `${lapsedCount} guest${lapsedCount === 1 ? '' : 's'} · ${LAPSED_DAYS}+ days silent`,
    chip: { tone: 'default', label: 'Guest intelligence', icon: 'users' },
    headline: `${lapsedCount} guests haven't visited in over ${LAPSED_DAYS} days.`,
    detail:
      `Across your venues, ${lapsedCount} previously-seen guests have gone quiet. ` +
      (returnPct > 0
        ? `Your 30-day return rate is tracking at ${returnPct}%. A win-back nudge usually helps — draft one from the guests surface.`
        : 'A win-back campaign is a cheap way to test whether they\'re recoverable.'),
    actions: [
      { id: 'see-guests', label: `See all ${lapsedCount} guests`, variant: 'solid',
        href: '/guests-v2.html?filter=lapsed' },
      { id: 'draft-winback', label: 'Draft win-back', variant: 'ghost',
        href: '/campaigns-v2.html?segment=lapsed-vip' },
      { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
    ],
    sidecar: {
      kind: 'donut',
      value: returnRate,
      label: `${returnPct}%`,
      sub: 'return rate',
      color: 'var(--hf-accent)',
    },
    _meta: { contextLine: `${lapsedCount} guests have gone quiet.` },
  }
}

// ---------- Card 3: Revenue trend ----------

function collectDailyRevenue(dailyData) {
  if (!dailyData || typeof dailyData !== 'object') return []
  return Object.entries(dailyData).map(([date, d]) => ({
    date,
    revenue: Number(d?.revenue) || 0,
  }))
}

export async function detectRevenueTrend(ctx) {
  const { locationIds, locations, now } = ctx
  if (!locationIds.length) return null

  const cutoff = now - REVENUE_WINDOW_DAYS * DAY_MS
  const cutoffDate = new Date(cutoff).toISOString().slice(0, 10)

  let best = null  // { locId, locName, daily: [{date, revenue}], recent7Sum, prior7Sum }

  for (const locId of locationIds) {
    let indexSnap
    try {
      indexSnap = await get(ref(rtdb, `salesDataIndex/byLocation/${locId}`))
    } catch (_) { continue }
    if (!indexSnap?.exists()) continue

    const salesDataIds = Object.keys(indexSnap.val() || {})
    const byDate = {}

    for (const id of salesDataIds) {
      let ds
      try { ds = await get(ref(rtdb, `salesData/${id}/dailyData`)) } catch (_) { continue }
      if (!ds?.exists()) continue
      for (const entry of collectDailyRevenue(ds.val())) {
        if (!entry.date || entry.date < cutoffDate) continue
        byDate[entry.date] = (byDate[entry.date] || 0) + entry.revenue
      }
    }

    const daily = Object.entries(byDate)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date))

    if (daily.length < REVENUE_MIN_DAYS) continue

    const recent = daily.slice(-7)
    const prior = daily.slice(-14, -7)
    const recent7Sum = recent.reduce((s, d) => s + d.revenue, 0)
    const prior7Sum = prior.reduce((s, d) => s + d.revenue, 0)

    if (!best || Math.abs(recent7Sum - prior7Sum) > Math.abs(best.recent7Sum - best.prior7Sum)) {
      best = { locId, locName: locations[locId] || 'Your venue', daily, recent7Sum, prior7Sum }
    }
  }

  if (!best) return null

  // Build 12-bar series, newest last
  const last12 = best.daily.slice(-12)
  // Normalise to units of R1,000 for the sidecar bars (visual only)
  const bars = last12.map((d) => Math.max(1, Math.round(d.revenue / 1000)))
  const accentIndex = last12.length - 1

  const delta = best.prior7Sum > 0 ? (best.recent7Sum - best.prior7Sum) / best.prior7Sum : 0
  const deltaPct = Math.round(delta * 100)
  const rising = delta >= 0
  const tone = rising ? 'good' : 'warn'
  const chipTone = rising ? 'good' : 'warn'
  const chipIcon = rising ? 'check' : 'alert'
  const headline = rising
    ? `${best.locName} revenue is up ${deltaPct}% week-on-week.`
    : `${best.locName} revenue is down ${Math.abs(deltaPct)}% week-on-week.`

  const absDelta = best.recent7Sum - best.prior7Sum
  const deltaLabel = `${rising ? '↑' : '↓'} ${zar.format(Math.abs(absDelta))} vs prior 7 days`

  return {
    id: 'real-revenue-trend',
    tone,
    eyebrow: `Last 7 days · ${zar.format(best.recent7Sum)}`,
    chip: { tone: chipTone, label: rising ? 'Trending up' : 'Watch this', icon: chipIcon },
    headline,
    detail:
      `Rolling 7 days totalled ${zar.format(best.recent7Sum)} vs ${zar.format(best.prior7Sum)} the week before — ` +
      (rising
        ? 'worth pulling the breakdown to see whether a promo, event, or mix change is driving it.'
        : 'open the breakdown to check whether covers, check size, or a specific service is the culprit.'),
    actions: [
      { id: 'see-breakdown', label: 'See breakdown', variant: 'solid',
        href: `/analytics-v2.html?loc=${encodeURIComponent(best.locId)}` },
      { id: 'forecast', label: 'Open forecast', variant: 'ghost',
        href: `/analytics-v2.html?loc=${encodeURIComponent(best.locId)}&tab=forecast` },
      { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
    ],
    sidecar: {
      kind: 'kpi-bars',
      eyebrow: '7-day revenue',
      value: zar.format(best.recent7Sum),
      delta: { label: deltaLabel, tone: rising ? 'good' : 'warn' },
      bars,
      accentIndex,
    },
    _meta: { contextLine: `${best.locName} revenue ${rising ? 'up' : 'down'} ${Math.abs(deltaPct)}%.` },
  }
}

// ---------- Headline builder ----------

export function buildHeadline(ctx, realCards) {
  const first = (ctx.displayName || '').split(' ')[0] || 'there'
  const hour = new Date(ctx.now).getHours()
  const greetingTime = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const n = realCards.length
  const subtitle = n === 0
    ? 'Nothing flagged yet — Ross is still learning your venues.'
    : n === 1
      ? 'One thing worth your attention.'
      : `${n} things worth your attention.`

  const leadBits = realCards.map((c) => c?._meta?.contextLine).filter(Boolean)
  const lead = leadBits.length
    ? `Ross watched your venues overnight. ${leadBits.join(' ')}`
    : 'Ross is watching your venues and will surface insights here as your data builds up.'

  return {
    greeting: `Good ${greetingTime}, ${first}.`,
    subtitle,
    lead,
  }
}

// =========================================================================
//  Card 0: Active workflows (slot 1 — workflow card variants A-E)
// =========================================================================

// MISSED_DAYS_THRESHOLD is now imported from ./workflow-status.js so
// the home card + Playbook/Activity stat counters all use one threshold.

function _buildOverdueCard(entry, allOverdue) {
  const overdueCount = allOverdue.length
  const isMissed = entry.daysLate >= MISSED_DAYS_THRESHOLD
  const chipLabel = isMissed ? 'Missed' : 'Overdue'
  const daysLateLabel = `${entry.daysLate} day${entry.daysLate === 1 ? '' : 's'} late`
  const verbPhrase = isMissed ? 'has been missed' : 'is overdue'
  const aggSuffix = overdueCount > 1
    ? ` And ${overdueCount - 1} more venue${overdueCount - 1 === 1 ? '' : 's'} ${isMissed ? 'missed' : 'overdue'}.`
    : ''
  const footnoteText = overdueCount > 1
    ? `${overdueCount} workflows ${isMissed ? 'missed' : 'overdue'}`
    : undefined
  return {
    id: `workflow:${entry.workflowId}:${entry.locationId}`,
    tone: 'warn',
    eyebrow: `${entry.locationName} · ${daysLateLabel}`,
    chip: { tone: 'warn', label: chipLabel },
    headline: `${entry.name} ${verbPhrase} at ${entry.locationName} (${daysLateLabel}).`,
    detail: `${entry.requiredTaskCount} task${entry.requiredTaskCount === 1 ? '' : 's'} pending. Start now to catch up.${aggSuffix}`,
    actions: [
      { id: 'run-workflow', label: 'Start now', variant: 'solid', trailing: 'arrow',
        href: `/ross.html?tab=run&workflowId=${entry.workflowId}&locationId=${entry.locationId}` },
      { id: 'view-workflow', label: 'View workflow', variant: 'ghost',
        href: '/ross.html?tab=playbook' },
      { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
    ],
    footnote: footnoteText,
    sidecar: {
      kind: 'kpi-spark', eyebrow: 'Days late',
      value: entry.daysLate, unit: 'd',
      target: isMissed ? 'untouched' : 'target: 0 overdue',
      trend: [0, 0, 0, 0, 0, 0, entry.daysLate],
      color: 'var(--hf-warn)',
    },
    _meta: { contextLine: `${entry.name} ${isMissed ? 'has been missed' : 'is'} ${entry.daysLate} day${entry.daysLate === 1 ? '' : 's'} ${isMissed ? '' : 'overdue'} at ${entry.locationName}.`.replace(/\s+/g, ' ').trim() },
  }
}

function _buildInProgressCard(entry, allToday) {
  const pending = Math.max(0, entry.requiredTaskCount - entry.completedTaskCount)
  const total = entry.requiredTaskCount
  const pct = total > 0 ? Math.round((entry.completedTaskCount / total) * 100) : 0
  const otherTodayCount = Math.max(0, allToday.length - 1)
  const aggSuffix = otherTodayCount > 0
    ? ` Plus ${otherTodayCount} other workflow${otherTodayCount === 1 ? '' : 's'} due today.`
    : ''
  return {
    id: `workflow:${entry.workflowId}:${entry.locationId}`,
    tone: 'default',
    chip: { tone: 'default', label: 'In progress', icon: 'sparkle' },
    eyebrow: `${entry.locationName} · started ${relTime(entry.startedAt)}`,
    headline: `${entry.name} is half-done — ${pending} of ${total} tasks pending.`,
    detail: `Resume to keep on track today.${aggSuffix}`,
    actions: [
      { id: 'run-workflow', label: 'Resume run', variant: 'solid', trailing: 'arrow',
        href: `/ross.html?tab=run&workflowId=${entry.workflowId}&locationId=${entry.locationId}` },
      { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
    ],
    sidecar: {
      kind: 'donut',
      value: total > 0 ? entry.completedTaskCount / total : 0,
      label: `${pct}%`,
      sub: `${entry.completedTaskCount}/${total}`,
      color: 'var(--hf-accent)',
    },
    _meta: { contextLine: `${entry.name} run in progress at ${entry.locationName}.` },
  }
}

function _buildPendingTodayCard(entry, allToday) {
  const otherTodayCount = Math.max(0, allToday.length - 1)
  const aggSuffix = otherTodayCount > 0
    ? ` Plus ${otherTodayCount} other workflow${otherTodayCount === 1 ? '' : 's'} due today.`
    : ''
  return {
    id: `workflow:${entry.workflowId}:${entry.locationId}`,
    tone: 'default',
    chip: { tone: 'default', label: 'Due today', icon: 'cal' },
    eyebrow: `${entry.locationName} · ${entry.requiredTaskCount} task${entry.requiredTaskCount === 1 ? '' : 's'}`,
    headline: `${entry.name} is due today at ${entry.locationName}.`,
    detail: `${entry.requiredTaskCount} task${entry.requiredTaskCount === 1 ? '' : 's'} to run.${aggSuffix}`,
    actions: [
      { id: 'run-workflow', label: 'Start run', variant: 'solid', trailing: 'arrow',
        href: `/ross.html?tab=run&workflowId=${entry.workflowId}&locationId=${entry.locationId}` },
      { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
    ],
    sidecar: {
      kind: 'kpi-spark', eyebrow: 'Tasks',
      value: entry.requiredTaskCount, unit: '',
      target: 'due today',
      trend: Array(7).fill(entry.requiredTaskCount),
      color: 'var(--hf-accent)',
    },
    _meta: { contextLine: `${entry.name} due today at ${entry.locationName}.` },
  }
}

function _buildRecentCompletionCard(entry) {
  const flagged = Number(entry.flaggedCount) || 0
  const tone = flagged > 0 ? 'warn' : 'good'
  const chipLabel = flagged > 0 ? 'Completed with flags' : 'Just completed'
  const chipIcon = flagged > 0 ? 'alert' : 'check'
  const flaggedSuffix = flagged > 0
    ? ` ${flagged} response${flagged === 1 ? '' : 's'} flagged for review.`
    : ''
  return {
    id: `workflow:${entry.workflowId}:${entry.locationId}`,
    tone,
    chip: { tone, label: chipLabel, icon: chipIcon },
    eyebrow: `${entry.locationName} · completed ${relTime(entry.completedAt)}`,
    headline: `${entry.name} completed ${relTime(entry.completedAt)}.`,
    detail: `${entry.onTime ? 'On time.' : 'Completed late.'}${flaggedSuffix}`,
    actions: [
      { id: 'see-report', label: 'See report', variant: 'solid', trailing: 'arrow',
        href: '/ross.html?tab=activity' },
      { id: 'snooze', label: 'Hide', variant: 'ghost' },
    ],
    sidecar: {
      kind: 'donut', value: 1, label: '100%', sub: 'complete',
      color: flagged > 0 ? 'var(--hf-warn)' : 'var(--hf-good)',
    },
    _meta: { contextLine: `${entry.name} completed ${relTime(entry.completedAt)} at ${entry.locationName}.` },
  }
}

function _buildAllClearCard(digest) {
  const count = digest.activeWorkflowCount
  const upc = digest.upcoming
  const nextDueLabel = upc ? `on ${upc.nextDueDate} (${upc.name} at ${upc.locationName})` : 'soon'
  return {
    id: 'workflow-all-clear',
    tone: 'good',
    eyebrow: 'Your playbook · all clear',
    chip: { tone: 'good', label: 'All clear', icon: 'check' },
    headline: 'Nothing pressing right now.',
    detail: `Your active workflows are on schedule. Next run is ${nextDueLabel}.`,
    actions: [
      { id: 'view-playbook', label: 'View playbook', variant: 'ghost', trailing: 'arrow',
        href: '/ross.html?tab=playbook' },
      { id: 'snooze', label: 'Hide for a day', variant: 'ghost' },
    ],
    footnote: `${count} workflow${count === 1 ? '' : 's'} running`,
    sidecar: {
      kind: 'kpi-spark', eyebrow: 'On schedule',
      value: count, unit: '',
      target: 'all on track',
      trend: [1, 1, 1, 1, 1, 1, 1],
      color: 'var(--hf-good)',
    },
    _meta: { contextLine: `${count} active workflows on schedule.` },
  }
}

export async function detectActiveWorkflows(ctx) {
  if (!ctx?.uid) return null
  let digest
  try {
    digest = await getHomeWorkflowDigest()
  } catch (e) {
    console.warn('[ross] active-workflows detector failed', e)
    return null
  }

  try {
    if (digest.overdue && digest.overdue.length > 0) {
      return _buildOverdueCard(digest.overdue[0], digest.overdue)
    }
    if (digest.today && digest.today.length > 0) {
      const first = digest.today[0]
      if (first.subState === 'in_progress') {
        return _buildInProgressCard(first, digest.today)
      }
      return _buildPendingTodayCard(first, digest.today)
    }
    if (digest.recentCompletions && digest.recentCompletions.length > 0) {
      return _buildRecentCompletionCard(digest.recentCompletions[0])
    }
    if (digest.hasActiveWorkflows) {
      return _buildAllClearCard(digest)
    }
    return null
  } catch (e) {
    console.warn('[ross] active-workflows card builder threw', e)
    return null
  }
}
