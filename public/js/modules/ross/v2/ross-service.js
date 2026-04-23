// LLM-ready abstraction over Ross content. Current implementation reads
// scripted content from ./content.js; an eventual Anthropic-backed
// implementation replaces only the bodies of these functions while keeping
// signatures identical. Every call returns a Promise so swapping to a
// remote LLM doesn't ripple through the UI.

import {
  FINDINGS_FIRST_RUN,
  HOME_FEED,
  HOME_HEADLINE,
  QUICK_JUMPS,
  ASK_ROSS_SAMPLE,
  LIVE_VENUES,
  ROSS_SUGGESTIONS,
  currentDateLine,
} from './content.js'

// Simulated latency keeps loading states honest during development.
const FAKE_LATENCY_MS = 80
const wait = () => new Promise(r => setTimeout(r, FAKE_LATENCY_MS))

/**
 * Fetch the 3-card home feed. Shape is stable; a real implementation would
 * synthesise these from RTDB aggregates + an LLM-authored headline/detail.
 */
export async function getHomeFeed() {
  await wait()
  return {
    headline: HOME_HEADLINE,
    dateLine: currentDateLine(),
    cards: HOME_FEED,
    quickJumps: QUICK_JUMPS,
  }
}

/**
 * Right-rail: live venue strip + Ross's "you might want to…" suggestions +
 * the Ask Ross sample prompt.
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
 * First-run "three surprising findings". Real implementation will derive
 * these from the user's actual historical RTDB data; scripted version is
 * venue-agnostic storytelling we can ship on day one.
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
