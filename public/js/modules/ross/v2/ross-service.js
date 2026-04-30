// LLM-ready abstraction over Ross content.
//
// getHomeFeed() now has two paths:
//   - ROSS_HOME_REAL_DATA ON  (default): run detectors.js against RTDB and
//     compose a feed from real signals; fall back to LEARNING_MODE_CARDS
//     when data is too thin. Headline is templated from the user's name
//     and whichever detectors fired.
//   - ROSS_HOME_REAL_DATA OFF: return the original scripted wireframe feed
//     unchanged. Used for demos and QA against a known shape.
//
// getHomeSidebar(), getFirstRunFindings(), askRoss() remain scripted —
// separate slices. Signatures match what an LLM-backed service would
// eventually yield, so the swap is a body replacement.

import {
  FINDINGS_FIRST_RUN,
  HOME_FEED,
  HOME_HEADLINE,
  QUICK_JUMPS,
  LEARNING_MODE_CARDS,
  ASK_ROSS_SAMPLE,
  LIVE_VENUES,
  ROSS_SUGGESTIONS,
  currentDateLine,
} from './content.js'
import { auth } from '../../../config/firebase-config.js'
import { isEnabled } from '../../../config/feature-flags.js'
import {
  buildContext,
  buildHeadline,
  detectFoodCostDrift,
  detectLapsedVIPs,
  detectRevenueTrend,
  getActiveSnoozes,
} from './detectors.js'
import {
  detectLiveVenues,
  detectTonightsBookings,
  detectLapsedVIPSuggestion,
  detectBestWeekday,
} from './sidebar-detectors.js'

const FAKE_LATENCY_MS = 80
const wait = () => new Promise(r => setTimeout(r, FAKE_LATENCY_MS))

const FUNCTIONS_BASE_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net'

/**
 * Snooze a feed card for `hours` (default 24). Calls rossV2Snooze, which
 * writes ross/v2Snoozes/{uid}/{cardId}. The next getHomeFeed() will
 * filter the snoozed card out via getActiveSnoozes() in detectors.js.
 *
 * Returns the server's confirmation { success, cardId, expiresAt }.
 */
export async function snoozeCard(cardId, hours = 24) {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  const idToken = await user.getIdToken()
  const res = await fetch(`${FUNCTIONS_BASE_URL}/rossV2Snooze`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ data: { cardId, hours } }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`rossV2Snooze failed (${res.status}): ${text}`)
  }
  const json = await res.json()
  return json.result || json
}

function scriptedFeed() {
  return {
    headline: HOME_HEADLINE,
    dateLine: currentDateLine(),
    cards: HOME_FEED,
    quickJumps: QUICK_JUMPS,
  }
}

function padCards(realCards) {
  if (realCards.length >= 3) return realCards.slice(0, 3)
  const usedIds = new Set(realCards.map((c) => c.id))
  const fillers = LEARNING_MODE_CARDS.filter((c) => !usedIds.has(c.id))
  return [...realCards, ...fillers].slice(0, 3)
}

/**
 * Fetch the 3-card home feed. With the flag ON, pulls from RTDB via
 * detectors. Caller (Pinia store) still gets the same shape.
 */
export async function getHomeFeed() {
  if (!isEnabled('ROSS_HOME_REAL_DATA')) {
    await wait()
    return scriptedFeed()
  }

  try {
    const ctx = await buildContext(auth)
    if (!ctx.uid) return scriptedFeed()

    const [fc, vip, rev, snoozes] = await Promise.all([
      detectFoodCostDrift(ctx).catch((e) => { console.warn('[ross] food-cost detector failed', e); return null }),
      detectLapsedVIPs(ctx).catch((e) => { console.warn('[ross] lapsed-VIPs detector failed', e); return null }),
      detectRevenueTrend(ctx).catch((e) => { console.warn('[ross] revenue detector failed', e); return null }),
      getActiveSnoozes(ctx).catch((e) => { console.warn('[ross] snoozes read failed', e); return new Set() }),
    ])

    // Filter out cards the user has snoozed; padCards re-fills the grid
    // with LEARNING_MODE_CARDS so the layout stays 3-wide.
    const realCards = [fc, vip, rev].filter((c) => c && !snoozes.has(c.id))
    const cards = padCards(realCards)
    return {
      headline: buildHeadline(ctx, realCards),
      dateLine: currentDateLine(),
      cards,
      quickJumps: QUICK_JUMPS,
    }
  } catch (e) {
    console.error('[ross] getHomeFeed failed, falling back to scripted feed', e)
    return scriptedFeed()
  }
}

function scriptedSidebar() {
  return {
    askRoss: ASK_ROSS_SAMPLE,
    venues: LIVE_VENUES,
    suggestions: ROSS_SUGGESTIONS,
  }
}

/**
 * Right-rail: live venue strip + Ross's "you might want to…" suggestions +
 * the Ask Ross sample prompt.
 *
 * With ROSS_HOME_REAL_DATA ON: venues come from queue/{loc}/entries, and
 * suggestions are built from real signals (tonight's bookings, lapsed
 * VIPs). Suggestions list may be 0–2 items long (we hide rather than
 * fake). Birthdays and shift-gap suggestions are dropped — no data source
 * exists for them today (Phase 2 decision).
 *
 * askRoss.recent stays scripted until the LLM lands (Phase 6).
 */
export async function getHomeSidebar() {
  if (!isEnabled('ROSS_HOME_REAL_DATA')) {
    await wait()
    return scriptedSidebar()
  }

  try {
    const ctx = await buildContext(auth)
    if (!ctx.uid) return scriptedSidebar()

    const [venues, tonights, lapsed] = await Promise.all([
      detectLiveVenues(ctx).catch((e) => { console.warn('[ross] live-venues detector failed', e); return [] }),
      detectTonightsBookings(ctx).catch((e) => { console.warn('[ross] bookings detector failed', e); return null }),
      detectLapsedVIPSuggestion(ctx).catch((e) => { console.warn('[ross] lapsed-vip suggestion failed', e); return null }),
    ])

    const realSuggestions = [tonights, lapsed].filter(Boolean)
    const suggestions = realSuggestions.length > 0
      ? realSuggestions
      : ROSS_SUGGESTIONS.map((s) => ({ ...s, illustrative: true }))

    return {
      askRoss: ASK_ROSS_SAMPLE,
      venues: venues.length ? venues : LIVE_VENUES.map((v) => ({ ...v, illustrative: true })),
      suggestions,
    }
  } catch (e) {
    console.error('[ross] getHomeSidebar failed, falling back to scripted', e)
    return scriptedSidebar()
  }
}

function scriptedFindings() {
  return {
    intro: {
      eyebrow: "Hi, I'm Ross.",
      headline: "I've been learning your restaurants",
      subline: 'for the last 14 minutes.',
      lead:
        "I've read 18,400 receipts, 22,100 guest visits, and 3 years of " +
        "service history across your four venues. Here's what I found that " +
        "surprised me.",
    },
    findings: FINDINGS_FIRST_RUN.map((f) => ({ ...f, source: 'illustrative' })),
  }
}

/**
 * First-run "three surprising findings". Per Phase 2 decision (2 real
 * + 1 banner), we attempt one real finding (best-day-of-week revenue
 * lift) and slot the remaining two from FINDINGS_FIRST_RUN with an
 * `illustrative` flag so the UI can banner them.
 *
 * Realistically only one detector is buildable today; "frequent
 * unrecognised guests" needs guest schema fields that don't exist yet,
 * and the patio/area trend needs a table-section attribute that also
 * doesn't exist. Both stay illustrative until the data ships.
 */
export async function getFirstRunFindings() {
  if (!isEnabled('ROSS_HOME_REAL_DATA')) {
    await wait()
    return scriptedFindings()
  }

  try {
    const ctx = await buildContext(auth)
    if (!ctx.uid) return scriptedFindings()

    const real = await detectBestWeekday(ctx).catch((e) => {
      console.warn('[ross] best-weekday finding failed', e); return null
    })

    const findings = []
    if (real) findings.push(real)
    const remaining = FINDINGS_FIRST_RUN
      .filter((f) => !findings.some((rf) => rf.headline === f.headline))
      .map((f) => ({ ...f, source: 'illustrative' }))
    while (findings.length < 3 && remaining.length) findings.push(remaining.shift())

    return {
      intro: scriptedFindings().intro,
      findings,
    }
  } catch (e) {
    console.error('[ross] getFirstRunFindings failed, falling back to scripted', e)
    return scriptedFindings()
  }
}

/**
 * Thin placeholder for the Ask Ross command palette. Real implementation
 * would stream from Anthropic; this returns a scripted canned reply so the
 * UI plumbing can be built against the eventual shape.
 */
export async function askRoss(prompt) {
  await wait()
  return {
    prompt,
    answer: {
      text:
        "Scripted placeholder — this surface will stream a real Ross reply " +
        "once the LLM integration lands. Your prompt: " + JSON.stringify(prompt),
      citations: [],
    },
  }
}
