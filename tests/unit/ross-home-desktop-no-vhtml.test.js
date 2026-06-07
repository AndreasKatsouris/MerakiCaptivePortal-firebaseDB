// Guard: RossHomeDesktop.vue must never use v-html for agent/server-derived
// card content. Any v-html on that surface could enable stored-XSS if a
// guest name, location name, or server value ever contains HTML tags.
// Lesson: #139 — on Vue surfaces render untrusted content via {{ }} (auto-
// escaped), not v-html. See fix PR that closed this: fix/ross-home-vhtml-escape.
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const vuePath = resolve(
  __dirname,
  '../../public/js/modules/ross/v2/components/RossHomeDesktop.vue'
)

describe('RossHomeDesktop.vue XSS guard', () => {
  it('must not contain v-html (use {{ }} for agent-derived card text)', () => {
    const src = readFileSync(vuePath, 'utf8')
    expect(src).not.toMatch(/v-html/)
  })
})
