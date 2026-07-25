// T4 — food-cost v2 store tests (overview slice + upload wizard state machine).
// Design: docs/plans/2026-07-24-ross-foodcost-d3-ui-design.md §4b/§4c/§4d.
//
// Isolation: v2/service.js is the module's ONLY I/O boundary (CF fetch, mapping
// RTDB CRUD, v1 parse wrappers, saveStockUsage lazy-import) and is vi.mock'd
// wholesale here — no real firebase, no real CF, no v1 imports load. The T1
// upload utils (mapping-memory / ingest-guards) are pure and run REAL.

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../public/js/modules/food-cost/v2/service.js', () => ({
  getFoodCostOverview: vi.fn(),
  loadMapping: vi.fn(),
  saveMapping: vi.fn(),
  bumpMappingUseCount: vi.fn(),
  parseCsv: vi.fn(),
  detectMapping: vi.fn(),
  processWithMapping: vi.fn(),
  saveStockUsage: vi.fn(),
}))

const svc = await import('../../public/js/modules/food-cost/v2/service.js')
const { useFoodCostStore } = await import('../../public/js/modules/food-cost/v2/store.js')
const { useFoodCostUploadStore } = await import('../../public/js/modules/food-cost/v2/upload/upload-store.js')
const { normalizeHeaders, fingerprintHeaders } = await import(
  '../../public/js/modules/food-cost/v2/upload/mapping-memory.js'
)
const { MAX_FILE_BYTES, MAX_ROWS } = await import(
  '../../public/js/modules/food-cost/v2/upload/ingest-guards.js'
)

// §5 payload — mirrors the buildOverview return verbatim
// (functions/food-cost-overview.js:178-197).
function overviewPayload(overrides = {}) {
  return {
    hasData: true,
    asOf: '2026-07-20T00:00:00.000Z',
    dataAgeDays: 5,
    kpis: {
      costPct: 31.2,
      costPctTrend: [29.8, 30.1, 31.2],
      spend: 15230.5,
      spendTrend: [14100, 14800, 15230.5],
      prevCostPct: 30.1,
    },
    summary: {
      trend: 'rising',
      lowStockCount: 1,
      lowStockItems: [{ itemCode: 'A1', description: 'Beef', closingQty: 3, daysOfCover: 1.5 }],
      itemsAnalysed: 120,
    },
    order: { items: [], totals: { estimatedTotalCost: 0 }, caveats: [] },
    runway: [{ item: 'Beef', daysLeft: 1.5, tone: 'warn' }],
    ...overrides,
  }
}

const HEADERS = ['Item Code', 'Description', 'Opening Qty', 'Closing Qty']
const ROWS = [['A1', 'Beef', '10', '4'], ['B2', 'Chips', '5', '2']]

function makeFile({ size = 100, name = 'stock.csv', text = 'irrelevant,csv' } = {}) {
  return { name, size, text: async () => text }
}

// detectAndMapHeaders contract: ~18 keys always present, -1 = unmapped
// (services/data-service.js:142 → data-processor.js:96).
function detectedMapping(overrides = {}) {
  return {
    itemCode: 0, description: 1, category: -1, unit: -1, costCenter: -1,
    openingQty: 2, openingValue: -1, purchaseQty: -1, purchases: -1,
    closingQty: 3, closingValue: -1, unitCost: -1, supplierName: -1,
    stockLevel: -1, totalCost: -1, openingStockValue: -1,
    closingStockValue: -1, purchaseValue: -1,
    ...overrides,
  }
}

function mockParse(headers = HEADERS, rows = ROWS) {
  // parseCSVData returns {headers, data:{headers, rows}} — the whole parse
  // object under `data` (services/data-service.js:34-37). The store must
  // adapt to checkParsedShape's {headers, rows} (T1 review N3).
  svc.parseCsv.mockReturnValue({ headers, data: { headers, rows } })
}

function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Overview slice
// ---------------------------------------------------------------------------

describe('overview: load()', () => {
  test('success populates data, clears loading/error/empty', async () => {
    const payload = overviewPayload()
    svc.getFoodCostOverview.mockResolvedValue(payload)

    const store = useFoodCostStore()
    await store.load({ locationId: 'loc-1' })

    expect(svc.getFoodCostOverview).toHaveBeenCalledWith({ locationId: 'loc-1' })
    expect(store.data).toEqual(payload)
    expect(store.empty).toBe(false)
    expect(store.error).toBeNull()
    expect(store.loading).toBe(false)
  })

  test('daysToNextDelivery is forwarded when set', async () => {
    svc.getFoodCostOverview.mockResolvedValue(overviewPayload())
    const store = useFoodCostStore()
    await store.load({ locationId: 'loc-1', daysToNextDelivery: 3 })
    expect(svc.getFoodCostOverview).toHaveBeenCalledWith({
      locationId: 'loc-1', daysToNextDelivery: 3,
    })
  })

  test('bare {hasData:false} → empty-state flag, NOT an error', async () => {
    svc.getFoodCostOverview.mockResolvedValue({ hasData: false })
    const store = useFoodCostStore()
    await store.load({ locationId: 'loc-1' })
    expect(store.empty).toBe(true)
    expect(store.error).toBeNull()
    expect(store.data).toBeNull()
    expect(store.loading).toBe(false)
  })

  test('service error envelope → store.error set, loading false', async () => {
    svc.getFoodCostOverview.mockResolvedValue({
      hasData: false, error: 'Could not reach the server. Check your connection and try again.',
    })
    const store = useFoodCostStore()
    await store.load({ locationId: 'loc-1' })
    expect(store.error).toMatch(/could not reach/i)
    expect(store.empty).toBe(false)
    expect(store.data).toBeNull()
    expect(store.loading).toBe(false)
  })

  test('no locationId → local error, service never called', async () => {
    const store = useFoodCostStore()
    await store.load()
    expect(svc.getFoodCostOverview).not.toHaveBeenCalled()
    expect(store.error).toMatch(/location/i)
    expect(store.loading).toBe(false)
  })

  test('stale-token guard: rapid double load(), second wins', async () => {
    const first = deferred()
    const second = deferred()
    svc.getFoodCostOverview
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    const store = useFoodCostStore()
    const p1 = store.load({ locationId: 'loc-1' })
    const p2 = store.load({ locationId: 'loc-2' })

    // second resolves first; the late first result must be discarded
    second.resolve(overviewPayload({ asOf: 'SECOND' }))
    await p2
    first.resolve(overviewPayload({ asOf: 'FIRST' }))
    await p1

    expect(store.data.asOf).toBe('SECOND')
    expect(store.loading).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Upload slice — ingest guards
// ---------------------------------------------------------------------------

describe('upload: ingest guards', () => {
  test('oversized file rejected BEFORE read: banner set, stays idle, no parse', async () => {
    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile({ size: MAX_FILE_BYTES + 1 }))

    expect(up.status).toBe('idle')
    expect(up.banner).toMatchObject({ ok: false, code: 'file-too-large' })
    expect(svc.parseCsv).not.toHaveBeenCalled()
    expect(up.parsed).toBeNull()
  })

  test('5001 parsed rows reject with typed banner (the {headers, rows: data.rows} N3 adaptation)', async () => {
    const bigRows = Array.from({ length: MAX_ROWS + 1 }, () => ['x'])
    mockParse(['H1'], bigRows)

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())

    expect(up.status).toBe('idle')
    expect(up.banner).toMatchObject({ ok: false, code: 'too-many-rows', actual: MAX_ROWS + 1 })
    expect(up.parsed).toBeNull()
  })

  test('exactly 5000 rows pass the gate', async () => {
    mockParse(['H1'], Array.from({ length: MAX_ROWS }, () => ['x']))
    svc.loadMapping.mockResolvedValue(null)
    svc.detectMapping.mockReturnValue(detectedMapping())

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())
    expect(up.banner).toBeNull()
    expect(up.status).toBe('mapped-manual')
  })

  test('empty parse result (no headers) → empty-file banner, stays idle', async () => {
    mockParse([], [])
    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())
    expect(up.status).toBe('idle')
    expect(up.banner).toMatchObject({ code: 'empty-file' })
  })
})

// ---------------------------------------------------------------------------
// Upload slice — fingerprint HIT (one-click) path
// ---------------------------------------------------------------------------

describe('upload: fingerprint HIT path', () => {
  async function storedRecordFor(headers) {
    const headersNorm = normalizeHeaders(headers)
    const fp = await fingerprintHeaders(headersNorm)
    return {
      fp,
      record: {
        headersNorm,
        mapping: detectedMapping(),
        label: 'stock.csv',
        savedAt: 1000,
        useCount: 3,
      },
    }
  }

  test('HIT + valid stored mapping → mapped-auto, mapping applied WITHOUT the editor', async () => {
    mockParse()
    const { fp, record } = await storedRecordFor(HEADERS)
    svc.loadMapping.mockResolvedValue(record)

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())

    expect(svc.loadMapping).toHaveBeenCalledWith(fp)
    expect(up.status).toBe('mapped-auto')
    expect(up.mappingSource).toBe('memory')
    expect(up.mapping).toEqual(record.mapping)
    expect(svc.detectMapping).not.toHaveBeenCalled()
  })

  test('full one-click flow: mapped-auto → previewed → saving → saved; useCount bumped; overview reloaded', async () => {
    mockParse()
    const { fp, record } = await storedRecordFor(HEADERS)
    svc.loadMapping.mockResolvedValue(record)
    svc.processWithMapping.mockReturnValue([
      { description: 'Beef', usage: 6, unitCost: 10, costOfUsage: 60,
        openingValue: 100, closingValue: 40, purchaseValue: 0 },
    ])
    svc.saveStockUsage.mockResolvedValue({ ok: true, result: { timestamp: '20260725_120000' } })
    svc.bumpMappingUseCount.mockResolvedValue({ ok: true })
    svc.getFoodCostOverview.mockResolvedValue(overviewPayload())

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())
    expect(up.status).toBe('mapped-auto')

    up.buildPreview({ stockPeriodDays: 7, daysToNextDelivery: 5, salesAmount: 1000 })
    expect(up.status).toBe('previewed')
    expect(up.preview.items).toHaveLength(1)
    expect(up.preview.totals.totalCostOfUsage).toBe(60)
    expect(up.preview.totals.costPercentage).toBeCloseTo(6)

    await up.saveUpload({ locationId: 'loc-1', storeName: 'Ocean Club' })
    expect(up.status).toBe('saved')
    expect(svc.saveStockUsage).toHaveBeenCalledWith(expect.objectContaining({
      selectedLocationId: 'loc-1',
      stockItems: up.preview.items,
      totalCostOfUsage: 60,
      salesAmount: 1000,
    }))
    // memory-sourced mapping → bump, never re-save
    expect(svc.bumpMappingUseCount).toHaveBeenCalledWith(fp, 3)
    expect(svc.saveMapping).not.toHaveBeenCalled()
    // overview reloaded after save
    expect(svc.getFoodCostOverview).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: 'loc-1' }),
    )
  })
})

// ---------------------------------------------------------------------------
// Upload slice — MISS / degraded / stale paths
// ---------------------------------------------------------------------------

describe('upload: MISS and fallback paths', () => {
  test('fingerprint MISS → mapped-manual with detectMapping result exposed for the editor', async () => {
    mockParse()
    svc.loadMapping.mockResolvedValue(null)
    svc.detectMapping.mockReturnValue(detectedMapping())

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())

    expect(up.status).toBe('mapped-manual')
    expect(up.mappingSource).toBe('detected')
    expect(up.mapping).toEqual(detectedMapping())
    expect(svc.detectMapping).toHaveBeenCalledWith(HEADERS)
  })

  test('MISS path: edit → preview → save stores the mapping under the fingerprint', async () => {
    mockParse()
    const headersNorm = normalizeHeaders(HEADERS)
    const fp = await fingerprintHeaders(headersNorm)
    svc.loadMapping.mockResolvedValue(null)
    const detected = detectedMapping()
    svc.detectMapping.mockReturnValue(detected)
    svc.processWithMapping.mockReturnValue([{ description: 'Beef', usage: 1, unitCost: 2, costOfUsage: 2 }])
    svc.saveStockUsage.mockResolvedValue({ ok: true, result: { timestamp: 'k1' } })
    svc.saveMapping.mockResolvedValue({ ok: true })
    svc.getFoodCostOverview.mockResolvedValue(overviewPayload())

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile({ name: 'july-stock.csv' }))

    up.setMappingField('closingValue', 3)
    expect(up.mapping.closingValue).toBe(3)
    // immutability: the detected object from the service is never mutated
    expect(detected.closingValue).toBe(-1)

    up.buildPreview({ stockPeriodDays: 7, daysToNextDelivery: 5 })
    expect(up.status).toBe('previewed')

    await up.saveUpload({ locationId: 'loc-1' })
    expect(up.status).toBe('saved')
    expect(svc.bumpMappingUseCount).not.toHaveBeenCalled()
    expect(svc.saveMapping).toHaveBeenCalledWith(fp, expect.objectContaining({
      headersNorm,
      mapping: expect.objectContaining({ closingValue: 3, itemCode: 0 }),
      label: 'july-stock.csv',
      useCount: 0,
    }))
  })

  test('fingerprint failure (crypto.subtle throws) degrades to the MISS path', async () => {
    mockParse()
    svc.detectMapping.mockReturnValue(detectedMapping())

    const up = useFoodCostUploadStore()
    // T1 CONSUMER CONTRACT: fingerprintHeaders rejects in insecure contexts —
    // injectable seam lets us prove the degrade without patching globals.
    up._fingerprintFn = async () => { throw new Error('crypto.subtle unavailable') }
    await up.ingestFile(makeFile())

    expect(up.fingerprint).toBeNull()
    expect(svc.loadMapping).not.toHaveBeenCalled()
    expect(up.status).toBe('mapped-manual')
  })

  test('degraded fingerprint: save succeeds but no mapping is stored', async () => {
    mockParse()
    svc.detectMapping.mockReturnValue(detectedMapping())
    svc.processWithMapping.mockReturnValue([{ usage: 1, unitCost: 1, costOfUsage: 1 }])
    svc.saveStockUsage.mockResolvedValue({ ok: true, result: {} })
    svc.getFoodCostOverview.mockResolvedValue(overviewPayload())

    const up = useFoodCostUploadStore()
    up._fingerprintFn = async () => { throw new Error('insecure context') }
    await up.ingestFile(makeFile())
    up.buildPreview()
    await up.saveUpload({ locationId: 'loc-1' })

    expect(up.status).toBe('saved')
    expect(svc.saveMapping).not.toHaveBeenCalled()
    expect(svc.bumpMappingUseCount).not.toHaveBeenCalled()
  })

  test('validateStoredMapping reject (stale stored mapping) → MISS path', async () => {
    mockParse()
    svc.detectMapping.mockReturnValue(detectedMapping())
    // stored under the right fingerprint but with mismatched headersNorm
    svc.loadMapping.mockResolvedValue({
      headersNorm: ['different', 'headers', 'entirely', 'here'],
      mapping: detectedMapping(),
      savedAt: 1,
      useCount: 9,
    })

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())

    expect(up.status).toBe('mapped-manual')
    expect(up.storedMapping).toBeNull()
    expect(svc.detectMapping).toHaveBeenCalled()
  })

  test('out-of-range column index in stored mapping → MISS path', async () => {
    mockParse() // 4 headers → valid indexes are [-1, 4)
    svc.detectMapping.mockReturnValue(detectedMapping())
    svc.loadMapping.mockResolvedValue({
      headersNorm: normalizeHeaders(HEADERS),
      mapping: detectedMapping({ closingQty: 60 }),
      savedAt: 1,
      useCount: 1,
    })

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())
    expect(up.status).toBe('mapped-manual')
  })
})

// ---------------------------------------------------------------------------
// Upload slice — value-columns warning + save failure
// ---------------------------------------------------------------------------

describe('upload: value-columns warning (§4d)', () => {
  test('neither openingValue nor closingValue mapped → warnCostsUnavailable true', async () => {
    mockParse()
    svc.loadMapping.mockResolvedValue(null)
    svc.detectMapping.mockReturnValue(detectedMapping()) // both value cols -1

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())
    expect(up.warnCostsUnavailable).toBe(true)
  })

  test('mapping either value column clears the warning', async () => {
    mockParse()
    svc.loadMapping.mockResolvedValue(null)
    svc.detectMapping.mockReturnValue(detectedMapping())

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())
    up.setMappingField('closingValue', 3)
    expect(up.warnCostsUnavailable).toBe(false)

    up.setMappingField('closingValue', -1)
    up.setMappingField('openingValue', 2)
    expect(up.warnCostsUnavailable).toBe(false)
  })

  test('no mapping yet → no warning', () => {
    const up = useFoodCostUploadStore()
    expect(up.warnCostsUnavailable).toBe(false)
  })
})

describe('upload: save failure', () => {
  test('save failure → error state, mapping NOT stored, no useCount bump, no reload', async () => {
    mockParse()
    svc.loadMapping.mockResolvedValue(null)
    svc.detectMapping.mockReturnValue(detectedMapping())
    svc.processWithMapping.mockReturnValue([{ usage: 1, unitCost: 1, costOfUsage: 1 }])
    svc.saveStockUsage.mockResolvedValue({ ok: false, error: 'PERMISSION_DENIED' })

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())
    up.buildPreview()
    await up.saveUpload({ locationId: 'loc-1' })

    expect(up.status).toBe('error')
    expect(up.banner).toMatchObject({ code: 'save-failed' })
    expect(svc.saveMapping).not.toHaveBeenCalled()
    expect(svc.bumpMappingUseCount).not.toHaveBeenCalled()
    expect(svc.getFoodCostOverview).not.toHaveBeenCalled()
  })

  test('wrong-state guards: buildPreview/saveUpload no-op outside their states', async () => {
    const up = useFoodCostUploadStore()
    up.buildPreview()
    expect(svc.processWithMapping).not.toHaveBeenCalled()
    expect(up.status).toBe('idle')

    await up.saveUpload({ locationId: 'loc-1' })
    expect(svc.saveStockUsage).not.toHaveBeenCalled()
    expect(up.status).toBe('idle')
  })

  test('resetUpload returns the wizard to idle', async () => {
    mockParse()
    svc.loadMapping.mockResolvedValue(null)
    svc.detectMapping.mockReturnValue(detectedMapping())

    const up = useFoodCostUploadStore()
    await up.ingestFile(makeFile())
    expect(up.status).toBe('mapped-manual')

    up.resetUpload()
    expect(up.status).toBe('idle')
    expect(up.parsed).toBeNull()
    expect(up.mapping).toBeNull()
    expect(up.fingerprint).toBeNull()
    expect(up.banner).toBeNull()
  })
})
