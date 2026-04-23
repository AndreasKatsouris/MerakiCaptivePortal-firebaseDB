// Analytics weekly-brief service — Phase A5 scripted.
// A5.1 will compose from salesDataIndex/byLocation (group revenue),
// foodCostIndex/byLocation (food-cost delta), sales-forecasting engine
// output (forecast + confidence), and the existing cover/NPS aggregates.
// Shape stays identical so the UI is unchanged when real data arrives.

import {
  MASTHEAD, SUMMARY, REVENUE_HERO, HERO_KPIS,
  STORIES_META, STORIES, FORECAST_7D, FOOTER,
} from './content.js'

const FAKE_LATENCY_MS = 60
const wait = () => new Promise(r => setTimeout(r, FAKE_LATENCY_MS))

export async function getWeeklyBrief({ week = 17 } = {}) {
  await wait()
  return {
    week,
    masthead: MASTHEAD,
    summary: SUMMARY,
    hero: REVENUE_HERO,
    heroKpis: HERO_KPIS,
    stories: { meta: STORIES_META, items: STORIES },
    forecast: FORECAST_7D,
    footer: FOOTER,
  }
}
