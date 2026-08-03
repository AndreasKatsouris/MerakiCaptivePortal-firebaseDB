// Guard: analytics-dashboard.js must never use v-html for errorMessage.
// Lesson: bug-queue 2026-07-23 (automation queue Q11) — same class as the
// closed #147 (RossHomeDesktop.vue) and #184 (FoodCostApp.vue) fixes.
// errorMessage was not exploitable today (no attacker-controlled text reaches
// it), but the anti-pattern is identical; render via {{ }} (auto-escaped),
// not v-html. The one caller that needed real markup (showNoDataMessage's
// actionable links) now renders it as real template markup gated by
// `showNoDataHelp`, not as an HTML string bound through v-html.
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const modulePath = resolve(
  __dirname,
  '../../public/js/modules/food-cost/analytics-dashboard.js'
)

describe('analytics-dashboard.js XSS guard', () => {
  const src = readFileSync(modulePath, 'utf8')

  it('must not contain v-html', () => {
    expect(src).not.toMatch(/v-html/)
  })

  it('renders errorMessage via {{ }} interpolation', () => {
    expect(src).toMatch(/\{\{\s*errorMessage\s*\}\}/)
  })

  it('the no-data help links still exist as real template markup', () => {
    expect(src).toMatch(/showNoDataHelp/)
    expect(src).toMatch(/Generate test data/)
  })
})
