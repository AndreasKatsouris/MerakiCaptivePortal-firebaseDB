import { describe, test, expect } from 'vitest'

import {
  normalizeHeaders,
  fingerprintHeaders,
  validateStoredMapping,
  buildMappingRecord,
} from '../../public/js/modules/food-cost/v2/upload/mapping-memory.js'
import {
  MAX_FILE_BYTES,
  MAX_ROWS,
  MAX_COLS,
  checkFileSize,
  checkParsedShape,
} from '../../public/js/modules/food-cost/v2/upload/ingest-guards.js'

// Mirrors the detectAndMapHeaders contract (services/data-service.js:142 →
// data-processor.js:96): ~18 keys always present, -1 for unmapped.
function realisticMapping(headerCount, overrides = {}) {
  return {
    itemCode: headerCount > 0 ? 0 : -1,
    description: headerCount > 1 ? 1 : -1,
    category: -1,
    unit: -1,
    costCenter: -1,
    openingQty: headerCount > 2 ? 2 : -1,
    openingValue: -1,
    purchaseQty: -1,
    purchases: -1,
    closingQty: -1,
    closingValue: -1,
    unitCost: -1,
    supplierName: -1,
    stockLevel: -1,
    totalCost: -1,
    openingStockValue: -1,
    closingStockValue: -1,
    purchaseValue: -1,
    ...overrides,
  }
}

const HEADERS_NORM = ['item code', 'description', 'opening qty']

function validStored(overrides = {}) {
  return {
    headersNorm: [...HEADERS_NORM],
    mapping: realisticMapping(HEADERS_NORM.length),
    label: 'POS export',
    savedAt: 1753300000000,
    useCount: 2,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// normalizeHeaders
// ---------------------------------------------------------------------------

describe('normalizeHeaders', () => {
  test('trims, lowercases, and collapses internal whitespace to single spaces', () => {
    expect(normalizeHeaders(['  Item   Code ', 'DESCRIPTION', 'Opening\t\tQty']))
      .toEqual(['item code', 'description', 'opening qty'])
  })

  test('preserves order', () => {
    expect(normalizeHeaders(['B', 'A', 'C'])).toEqual(['b', 'a', 'c'])
  })

  test('String()s non-string entries', () => {
    expect(normalizeHeaders([42, null, undefined, true]))
      .toEqual(['42', 'null', 'undefined', 'true'])
  })

  test('does not mutate the input array', () => {
    const input = ['  X  ']
    normalizeHeaders(input)
    expect(input).toEqual(['  X  '])
  })
})

// ---------------------------------------------------------------------------
// fingerprintHeaders
// ---------------------------------------------------------------------------

describe('fingerprintHeaders', () => {
  test('is deterministic: same input twice yields the identical lowercase hex digest', async () => {
    const a = await fingerprintHeaders(HEADERS_NORM)
    const b = await fingerprintHeaders([...HEADERS_NORM])
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  test('is order-sensitive: same headers, different order → different fingerprint', async () => {
    const a = await fingerprintHeaders(['item code', 'description'])
    const b = await fingerprintHeaders(['description', 'item code'])
    expect(a).not.toBe(b)
  })
})

// ---------------------------------------------------------------------------
// validateStoredMapping
// ---------------------------------------------------------------------------

describe('validateStoredMapping', () => {
  test('accepts a valid stored record whose mapping carries -1 sentinels', () => {
    expect(validateStoredMapping(validStored(), HEADERS_NORM)).toEqual({ valid: true })
  })

  test('accepts when label is absent', () => {
    const stored = validStored()
    delete stored.label
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(true)
  })

  test('accepts a label of exactly 100 chars', () => {
    const stored = validStored({ label: 'x'.repeat(100) })
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(true)
  })

  test('rejects headersNorm order mismatch', () => {
    const reordered = [HEADERS_NORM[1], HEADERS_NORM[0], HEADERS_NORM[2]]
    const result = validateStoredMapping(validStored(), reordered)
    expect(result.valid).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  test('rejects headersNorm count mismatch', () => {
    const result = validateStoredMapping(validStored(), [...HEADERS_NORM, 'extra col'])
    expect(result.valid).toBe(false)
  })

  test('rejects headersNorm content mismatch', () => {
    const result = validateStoredMapping(
      validStored(),
      ['item code', 'description', 'closing qty'],
    )
    expect(result.valid).toBe(false)
  })

  test('rejects mapping value -2 (below the -1 sentinel)', () => {
    const stored = validStored({ mapping: realisticMapping(3, { category: -2 }) })
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(false)
  })

  test('rejects mapping value === headerCount (out of range)', () => {
    const stored = validStored({
      mapping: realisticMapping(3, { unit: HEADERS_NORM.length }),
    })
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(false)
  })

  test('rejects fractional mapping value 1.5', () => {
    const stored = validStored({ mapping: realisticMapping(3, { unit: 1.5 }) })
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(false)
  })

  test("rejects string mapping value '3'", () => {
    const stored = validStored({ mapping: realisticMapping(3, { unit: '3' }) })
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(false)
  })

  test('rejects null stored', () => {
    expect(validateStoredMapping(null, HEADERS_NORM).valid).toBe(false)
  })

  test('rejects array-shaped stored', () => {
    expect(validateStoredMapping([validStored()], HEADERS_NORM).valid).toBe(false)
  })

  test('rejects non-object stored', () => {
    expect(validateStoredMapping('stored', HEADERS_NORM).valid).toBe(false)
  })

  test('rejects missing mapping key', () => {
    const stored = validStored()
    delete stored.mapping
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(false)
  })

  test('rejects missing headersNorm key', () => {
    const stored = validStored()
    delete stored.headersNorm
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(false)
  })

  test('rejects array-shaped mapping', () => {
    const stored = validStored({ mapping: [0, 1, 2] })
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(false)
  })

  test('rejects null mapping', () => {
    const stored = validStored({ mapping: null })
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(false)
  })

  test('rejects a label of 101 chars', () => {
    const stored = validStored({ label: 'x'.repeat(101) })
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(false)
  })

  test('rejects a non-string label', () => {
    const stored = validStored({ label: 42 })
    expect(validateStoredMapping(stored, HEADERS_NORM).valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildMappingRecord
// ---------------------------------------------------------------------------

describe('buildMappingRecord', () => {
  const NOW = 1753344000000

  test('builds the persisted shape with savedAt=now and useCount=0', () => {
    const mapping = realisticMapping(3)
    const record = buildMappingRecord(HEADERS_NORM, mapping, 'My POS', NOW)
    expect(record).toEqual({
      headersNorm: HEADERS_NORM,
      mapping,
      label: 'My POS',
      savedAt: NOW,
      useCount: 0,
    })
  })

  test('caps a 150-char label to 100 chars', () => {
    const record = buildMappingRecord(HEADERS_NORM, realisticMapping(3), 'y'.repeat(150), NOW)
    expect(record.label).toBe('y'.repeat(100))
  })

  test('coerces a missing label to empty string', () => {
    expect(buildMappingRecord(HEADERS_NORM, realisticMapping(3), undefined, NOW).label).toBe('')
    expect(buildMappingRecord(HEADERS_NORM, realisticMapping(3), null, NOW).label).toBe('')
  })

  test('caps long header entries to 120 chars', () => {
    const long = 'h'.repeat(200)
    const record = buildMappingRecord([long, 'ok'], realisticMapping(2), '', NOW)
    expect(record.headersNorm[0]).toBe('h'.repeat(120))
    expect(record.headersNorm[1]).toBe('ok')
  })

  test('returns new objects (does not alias inputs)', () => {
    const headers = [...HEADERS_NORM]
    const mapping = realisticMapping(3)
    const record = buildMappingRecord(headers, mapping, '', NOW)
    expect(record.headersNorm).not.toBe(headers)
    expect(record.mapping).not.toBe(mapping)
    expect(record.mapping).toEqual(mapping)
  })
})

// ---------------------------------------------------------------------------
// ingest-guards
// ---------------------------------------------------------------------------

describe('ingest-guards constants', () => {
  test('export the M-1 cap values', () => {
    expect(MAX_FILE_BYTES).toBe(2 * 1024 * 1024)
    expect(MAX_ROWS).toBe(5000)
    expect(MAX_COLS).toBe(60)
  })
})

describe('checkFileSize', () => {
  test('accepts a file of exactly 2 MB', () => {
    expect(checkFileSize({ size: MAX_FILE_BYTES })).toEqual({ ok: true })
  })

  test('rejects a file of 2 MB + 1 byte with a typed result', () => {
    expect(checkFileSize({ size: MAX_FILE_BYTES + 1 })).toEqual({
      ok: false,
      code: 'file-too-large',
      limitBytes: MAX_FILE_BYTES,
      actualBytes: MAX_FILE_BYTES + 1,
    })
  })

  test('fails closed on objects without a numeric size', () => {
    expect(checkFileSize(null).ok).toBe(false)
    expect(checkFileSize({}).ok).toBe(false)
    expect(checkFileSize({ size: 'big' }).ok).toBe(false)
  })
})

describe('checkParsedShape', () => {
  const cols = (n) => Array.from({ length: n }, (_, i) => `col${i}`)
  const rows = (n) => Array.from({ length: n }, () => ['a'])

  test('accepts exactly 5000 rows', () => {
    expect(checkParsedShape({ headers: cols(3), rows: rows(MAX_ROWS) })).toEqual({ ok: true })
  })

  test('rejects 5001 rows with a typed result', () => {
    expect(checkParsedShape({ headers: cols(3), rows: rows(MAX_ROWS + 1) })).toEqual({
      ok: false,
      code: 'too-many-rows',
      limit: MAX_ROWS,
      actual: MAX_ROWS + 1,
    })
  })

  test('accepts exactly 60 columns', () => {
    expect(checkParsedShape({ headers: cols(MAX_COLS), rows: rows(2) })).toEqual({ ok: true })
  })

  test('rejects 61 columns with a typed result', () => {
    expect(checkParsedShape({ headers: cols(MAX_COLS + 1), rows: rows(2) })).toEqual({
      ok: false,
      code: 'too-many-columns',
      limit: MAX_COLS,
      actual: MAX_COLS + 1,
    })
  })

  test('returns invalid-parse for garbage input', () => {
    expect(checkParsedShape(null)).toEqual({ ok: false, code: 'invalid-parse' })
    expect(checkParsedShape(undefined)).toEqual({ ok: false, code: 'invalid-parse' })
    expect(checkParsedShape({})).toEqual({ ok: false, code: 'invalid-parse' })
    expect(checkParsedShape({ headers: 'x', rows: rows(2) }))
      .toEqual({ ok: false, code: 'invalid-parse' })
    expect(checkParsedShape({ headers: cols(3), rows: null }))
      .toEqual({ ok: false, code: 'invalid-parse' })
  })
})
