import { describe, test, expect } from 'vitest'
import { relTime } from '../../public/js/modules/ross/v2/utils/rel-time.js'

const now = Date.parse('2026-05-19T12:00:00Z')

describe('relTime', () => {
  test('less than a minute → "just now"', () => {
    expect(relTime(now - 30_000, now)).toBe('just now')
  })
  test('3 minutes ago → "3 min ago"', () => {
    expect(relTime(now - 3 * 60_000, now)).toBe('3 min ago')
  })
  test('1 hour ago → "1 hour ago" (singular)', () => {
    expect(relTime(now - 60 * 60_000, now)).toBe('1 hour ago')
  })
  test('2 hours ago → "2 hours ago" (plural)', () => {
    expect(relTime(now - 2 * 60 * 60_000, now)).toBe('2 hours ago')
  })
  test('25 hours ago → "yesterday"', () => {
    expect(relTime(now - 25 * 60 * 60_000, now)).toBe('yesterday')
  })
  test('3 days ago → "3 days ago"', () => {
    expect(relTime(now - 3 * 24 * 60 * 60_000, now)).toBe('3 days ago')
  })
  test('30 days ago → ISO date', () => {
    const result = relTime(now - 30 * 24 * 60 * 60_000, now)
    expect(result).toMatch(/^on \d{4}-\d{2}-\d{2}$/)
  })
})
