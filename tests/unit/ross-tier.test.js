import { describe, test, expect } from 'vitest'
import {
  VALID_TIERS,
  validateTier,
  userCanActivate,
  filterTemplatesByTier,
} from '../../functions/ross-tier.js'

describe('VALID_TIERS', () => {
  test('exports exactly free and all-in', () => {
    expect(VALID_TIERS).toEqual(['free', 'all-in'])
  })
})

describe('validateTier', () => {
  test('returns null for free', () => {
    expect(validateTier('free')).toBeNull()
  })
  test('returns null for all-in', () => {
    expect(validateTier('all-in')).toBeNull()
  })
  test('returns error for unknown tier', () => {
    expect(validateTier('premium')).toMatch(/Invalid tier/)
  })
  test('returns error for empty string', () => {
    expect(validateTier('')).toMatch(/Invalid tier/)
  })
  test('returns error for null', () => {
    expect(validateTier(null)).toMatch(/Invalid tier/)
  })
  test('returns error for undefined', () => {
    expect(validateTier(undefined)).toMatch(/Invalid tier/)
  })
  test('returns error for non-string', () => {
    expect(validateTier(42)).toMatch(/Invalid tier/)
  })
})

describe('userCanActivate', () => {
  test('superAdmin can activate any tier', () => {
    expect(userCanActivate('free', 'all-in', true)).toBe(true)
    expect(userCanActivate('all-in', 'free', true)).toBe(true)
    expect(userCanActivate(null, 'all-in', true)).toBe(true)
  })
  test('all-in user can activate free template', () => {
    expect(userCanActivate('all-in', 'free', false)).toBe(true)
  })
  test('all-in user can activate all-in template', () => {
    expect(userCanActivate('all-in', 'all-in', false)).toBe(true)
  })
  test('free user can activate free template', () => {
    expect(userCanActivate('free', 'free', false)).toBe(true)
  })
  test('free user cannot activate all-in template', () => {
    expect(userCanActivate('free', 'all-in', false)).toBe(false)
  })
  test('missing user tier defaults to most-restrictive (free) — cannot activate all-in', () => {
    expect(userCanActivate(null, 'all-in', false)).toBe(false)
    expect(userCanActivate(undefined, 'all-in', false)).toBe(false)
  })
  test('missing user tier can still activate free template', () => {
    expect(userCanActivate(null, 'free', false)).toBe(true)
  })
})

describe('filterTemplatesByTier', () => {
  const templates = [
    { templateId: 't1', name: 'A', tier: 'free' },
    { templateId: 't2', name: 'B', tier: 'all-in' },
    { templateId: 't3', name: 'C', tier: 'free' },
  ]

  test('superAdmin sees everything', () => {
    expect(filterTemplatesByTier(templates, 'free', true)).toEqual(templates)
    expect(filterTemplatesByTier(templates, null, true)).toEqual(templates)
  })
  test('all-in user sees everything', () => {
    expect(filterTemplatesByTier(templates, 'all-in', false)).toEqual(templates)
  })
  test('free user sees only free templates', () => {
    const result = filterTemplatesByTier(templates, 'free', false)
    expect(result.map(t => t.templateId)).toEqual(['t1', 't3'])
  })
  test('missing user tier behaves as free (most-restrictive)', () => {
    const result = filterTemplatesByTier(templates, null, false)
    expect(result.map(t => t.templateId)).toEqual(['t1', 't3'])
  })
  test('templates missing tier field are excluded for free users (fail closed)', () => {
    const withMissing = [...templates, { templateId: 't4', name: 'D' }]
    const result = filterTemplatesByTier(withMissing, 'free', false)
    expect(result.map(t => t.templateId)).toEqual(['t1', 't3'])
  })
  test('templates missing tier field visible to all-in / superAdmin', () => {
    const withMissing = [...templates, { templateId: 't4', name: 'D' }]
    expect(filterTemplatesByTier(withMissing, 'all-in', false).length).toBe(4)
    expect(filterTemplatesByTier(withMissing, null, true).length).toBe(4)
  })
  test('empty input returns empty', () => {
    expect(filterTemplatesByTier([], 'free', false)).toEqual([])
  })
})
