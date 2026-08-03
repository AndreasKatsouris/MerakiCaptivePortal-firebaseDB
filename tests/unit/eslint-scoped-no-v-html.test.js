// Guard for the scoped `vue/no-v-html` eslint rule (automation queue Q6, 3c item 2).
// Global lint is unusable (152k errors over public/ — see LESSONS 2026-06-05
// process/ci-gate-baseline), so this rule is narrowed to the two actively
// developed v2 surfaces via eslint.config.js's scoped `files` block. This test
// asserts the rule actually FIRES within that scope (RED against a v-html
// fixture) and stays quiet outside it, plus that the real v2 source is clean.
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { ESLint } from 'eslint'

const CONFIG_PATH = resolve(__dirname, '../../eslint.config.js')
const V_HTML_FIXTURE = '<template><div v-html="userSuppliedHtml"></div></template>\n<script setup>\nconst userSuppliedHtml = \'<b>x</b>\'\n</script>\n'

async function lintFixture(virtualPath) {
  const eslint = new ESLint({ overrideConfigFile: CONFIG_PATH })
  const [result] = await eslint.lintText(V_HTML_FIXTURE, { filePath: virtualPath })
  return result.messages
}

describe('scoped vue/no-v-html eslint rule', () => {
  it('fires on a v-html fixture inside ross/v2', async () => {
    const messages = await lintFixture('public/js/modules/ross/v2/components/__fixture.vue')
    expect(messages.some((m) => m.ruleId === 'vue/no-v-html')).toBe(true)
  })

  it('fires on a v-html fixture inside food-cost/v2', async () => {
    const messages = await lintFixture('public/js/modules/food-cost/v2/components/__fixture.vue')
    expect(messages.some((m) => m.ruleId === 'vue/no-v-html')).toBe(true)
  })

  it('does NOT fire on the identical v-html fixture outside the scoped dirs', async () => {
    const messages = await lintFixture('public/js/modules/some-other-module/components/__fixture.vue')
    expect(messages.some((m) => m.ruleId === 'vue/no-v-html')).toBe(false)
  })

  it('scoped npx eslint run is green over the real ross/v2 + food-cost/v2 .vue files', async () => {
    const eslint = new ESLint({ overrideConfigFile: CONFIG_PATH })
    const results = await eslint.lintFiles([
      'public/js/modules/ross/v2/**/*.vue',
      'public/js/modules/food-cost/v2/**/*.vue'
    ])
    const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0)
    const vHtmlHits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === 'vue/no-v-html')
    expect(vHtmlHits).toEqual([])
    expect(errorCount).toBe(0)
  })
})

// Sanity: confirm the fixture text itself really contains v-html, so a typo in
// the fixture string above can't produce a false green.
describe('fixture sanity', () => {
  it('the fixture literally contains v-html', () => {
    expect(V_HTML_FIXTURE).toMatch(/v-html/)
  })
})

// Read-only cross-check against the guard tests already shipped by Q2 (#184) —
// no reason for these two files to have regressed since.
describe('scoped source still has no known v-html (cross-check with Q2 guards)', () => {
  it('FoodCostApp.vue', () => {
    const src = readFileSync(
      resolve(__dirname, '../../public/js/modules/food-cost/v2/components/FoodCostApp.vue'),
      'utf8'
    )
    expect(src).not.toMatch(/v-html/)
  })
})
