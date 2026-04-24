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
} from './detectors.js'

const FAKE_LATENCY_MS = 80
const wait = () => new Promise(r => setTimeout(r, FAKE_LATENCY_MS))

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

    const [fc, vip, rev] = await Promise.all([
      detectFoodCostDrift(ctx).catch((e) => { console.warn('[ross] food-cost detector failed', e); return null }),
      detectLapsedVIPs(ctx).catch((e) => { console.warn('[ross] lapsed-VIPs detector failed', e); return null }),
      detectRevenueTrend(ctx).catch((e) => { console.warn('[ross] revenue detector failed', e); return null }),
    ])

    const realCards = [fc, vip, rev].filter(Boolean)
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

/**
 * Right-rail: live venue strip + Ross's "you might want to…" suggestions +
 * the Ask Ross sample prompt. Still scripted — separate slice.
 */
export async function getHomeSidebar() {
  await wait()
  return {
    askRoss: ASK_ROSS_SAMPLE,
    venues: LIVE_VENUES,
    suggestions: ROSS_SUGGESTIONS,
  }
}

/**
 * First-run "three surprising findings". Still scripted.
 */
export async function getFirstRunFindings() {
  await wait()
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
    findings: FINDINGS_FIRST_RUN,
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
