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
  test('null template tier fails closed for free user', () => {
    expect(userCanActivate('free', null, false)).toBe(false)
  })
  test('undefined template tier fails closed for free user', () => {
    expect(userCanActivate('free', undefined, false)).toBe(false)
  })
  test('null template tier still passes for all-in user', () => {
    expect(userCanActivate('all-in', null, false)).toBe(true)
  })
  test('null template tier still passes for superAdmin', () => {
    expect(userCanActivate(null, null, true)).toBe(true)
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

describe('filterTemplatesByTier — includeLocked param', () => {
  const templates = [
    { templateId: 't1', name: 'Free A', tier: 'free' },
    { templateId: 't2', name: 'Free B', tier: 'free' },
    { templateId: 't3', name: 'All-in A', tier: 'all-in' },
    { templateId: 't4', name: 'All-in B', tier: 'all-in' },
  ]

  test('Free user with includeLocked:true keeps all-in templates and stamps locked:true', () => {
    const result = filterTemplatesByTier(templates, 'free', false, true)
    expect(result).toHaveLength(4)
    expect(result.find(t => t.templateId === 't1').locked).toBeUndefined()
    expect(result.find(t => t.templateId === 't2').locked).toBeUndefined()
    expect(result.find(t => t.templateId === 't3').locked).toBe(true)
    expect(result.find(t => t.templateId === 't4').locked).toBe(true)
  })

  test('Free user with includeLocked:false (default) drops all-in templates — unchanged behavior', () => {
    const result = filterTemplatesByTier(templates, 'free', false)
    expect(result).toHaveLength(2)
    expect(result.every(t => t.tier === 'free')).toBe(true)
  })

  test('Free user with includeLocked omitted matches includeLocked:false', () => {
    const a = filterTemplatesByTier(templates, 'free', false)
    const b = filterTemplatesByTier(templates, 'free', false, false)
    expect(a).toEqual(b)
  })

  test('All-in user with includeLocked:true returns all templates with no locked flag', () => {
    const result = filterTemplatesByTier(templates, 'all-in', false, true)
    expect(result).toHaveLength(4)
    expect(result.some(t => t.locked === true)).toBe(false)
  })

  test('SuperAdmin with includeLocked:true returns all templates with no locked flag', () => {
    const result = filterTemplatesByTier(templates, 'free', true, true)
    expect(result).toHaveLength(4)
    expect(result.some(t => t.locked === true)).toBe(false)
  })

  test('Missing userTier with includeLocked:true behaves like Free', () => {
    const result = filterTemplatesByTier(templates, null, false, true)
    expect(result).toHaveLength(4)
    expect(result.find(t => t.tier === 'all-in').locked).toBe(true)
  })

  test('Falsy includeLocked values (string "true", 1, etc.) do NOT activate locked mode — strict === true only', () => {
    const result = filterTemplatesByTier(templates, 'free', false, 1)
    expect(result).toHaveLength(2)
  })

  test('Locked flag does not mutate input templates', () => {
    const input = templates.map(t => ({ ...t }))
    filterTemplatesByTier(input, 'free', false, true)
    expect(input.find(t => t.templateId === 't3').locked).toBeUndefined()
  })
})
