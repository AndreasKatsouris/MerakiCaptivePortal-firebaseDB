// Campaigns-Compose service — Phase A6 scripted.
// A6.1 wires audience from guestSegmentsIndex, draft body from ross-service
// (same scripted→LLM swap pattern used on Ross home), projections from the
// forecast engine, recent campaigns from the campaigns RTDB node.

import {
  HEADER, AUDIENCE, MESSAGE, TIMING,
  PROJECTED_IMPACT, ROSS_NOTES, RECENT_CAMPAIGNS,
} from './content.js'

const FAKE_LATENCY_MS = 60
const wait = () => new Promise(r => setTimeout(r, FAKE_LATENCY_MS))

export async function getCampaignDraft({ segmentId = 'lapsed-vips' } = {}) {
  await wait()
  return {
    segmentId,
    header: HEADER,
    audience: AUDIENCE,
    message: MESSAGE,
    timing: TIMING,
    impact: PROJECTED_IMPACT,
    notes: ROSS_NOTES,
    recent: RECENT_CAMPAIGNS,
  }
}
