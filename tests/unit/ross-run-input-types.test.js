import { describe, test, expect } from 'vitest'
import {
  VALID_INPUT_TYPES,
  NA_SENTINEL,
  isPlaceholderType,
  isRangeType,
  needsPreflightNote,
} from '../../public/js/modules/ross/v2/constants/run-input-types.js'

describe('VALID_INPUT_TYPES', () => {
  test('matches server enum exactly', () => {
    expect(VALID_INPUT_TYPES).toEqual([
      'checkbox', 'text', 'number', 'temperature',
      'yes_no', 'dropdown', 'timestamp', 'photo', 'signature', 'rating',
    ])
  })
})

describe('NA_SENTINEL', () => {
  test('is the literal string "n/a"', () => {
    expect(NA_SENTINEL).toBe('n/a')
  })
})

describe('isPlaceholderType', () => {
  test('returns true for photo', () => {
    expect(isPlaceholderType('photo')).toBe(true)
  })
  test('returns true for signature', () => {
    expect(isPlaceholderType('signature')).toBe(true)
  })
  test('returns false for checkbox', () => {
    expect(isPlaceholderType('checkbox')).toBe(false)
  })
  test('returns false for unknown', () => {
    expect(isPlaceholderType('frobnicate')).toBe(false)
  })
})

describe('isRangeType', () => {
  test('returns true for number', () => {
    expect(isRangeType('number')).toBe(true)
  })
  test('returns true for temperature', () => {
    expect(isRangeType('temperature')).toBe(true)
  })
  test('returns false for checkbox', () => {
    expect(isRangeType('checkbox')).toBe(false)
  })
})

describe('needsPreflightNote', () => {
  test('returns false for non-range type', () => {
    expect(needsPreflightNote('checkbox', 'on', { min: 0, max: 5, requiredNote: true })).toBe(false)
  })
  test('returns false when in range', () => {
    expect(needsPreflightNote('temperature', 3, { min: 0, max: 5, requiredNote: true })).toBe(false)
  })
  test('returns false when out of range but requiredNote false', () => {
    expect(needsPreflightNote('temperature', 12, { min: 0, max: 5, requiredNote: false })).toBe(false)
  })
  test('returns true when out of range AND requiredNote true', () => {
    expect(needsPreflightNote('temperature', 12, { min: 0, max: 5, requiredNote: true })).toBe(true)
    expect(needsPreflightNote('temperature', -2, { min: 0, max: 5, requiredNote: true })).toBe(true)
  })
  test('returns false when inputConfig missing', () => {
    expect(needsPreflightNote('temperature', 12, undefined)).toBe(false)
  })
  test('coerces stringy numeric value', () => {
    expect(needsPreflightNote('number', '99', { min: 0, max: 5, requiredNote: true })).toBe(true)
  })
})
