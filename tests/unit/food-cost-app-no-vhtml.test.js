// Guard: FoodCostApp.vue must never use v-html for the Ross diagnosis detail.
// Lesson: bug-queue 2026-07-02 — this v-html is currently safe (content.js is
// static), but the queued W1 food-cost work will route live/agent-derived
// diagnosis text into this same field, at which point it becomes exploitable.
// Same class as the closed #147 RossHomeDesktop.vue fix — render via {{ }}
// (auto-escaped), not v-html.
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const vuePath = resolve(
  __dirname,
  '../../public/js/modules/food-cost/v2/components/FoodCostApp.vue'
)

describe('FoodCostApp.vue XSS guard', () => {
  it('must not contain v-html (use {{ }} for diagnosis detail text)', () => {
    const src = readFileSync(vuePath, 'utf8')
    expect(src).not.toMatch(/v-html/)
  })
})
