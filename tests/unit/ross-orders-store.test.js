import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../public/js/modules/ross/v2/orders-service.js', () => ({
  listSuppliers: vi.fn(),
  saveSupplier: vi.fn(),
  archiveSupplier: vi.fn(),
  listProducts: vi.fn(),
  saveProduct: vi.fn(),
  previewSeed: vi.fn(),
  commitSeed: vi.fn(),
}))

const service = await import('../../public/js/modules/ross/v2/orders-service.js')
const { useOrdersStore } = await import('../../public/js/modules/ross/v2/orders-store.js')

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('useOrdersStore.loadSuppliers', () => {
  it('populates suppliers and clears loading', async () => {
    service.listSuppliers.mockResolvedValue([{ supplierId: 's1', name: 'A', needsEmail: false }])
    const store = useOrdersStore()
    await store.loadSuppliers('loc1')
    expect(store.suppliers).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBe('')
  })

  it('surfaces an error without leaving loading stuck on', async () => {
    service.listSuppliers.mockRejectedValue(new Error('boom'))
    const store = useOrdersStore()
    await store.loadSuppliers('loc1')
    expect(store.error).toBeTruthy()
    expect(store.loading).toBe(false)
    expect(store.suppliers).toEqual([])
  })

  it('ignores a stale response when a newer load has started (race guard)', async () => {
    let resolveFirst
    service.listSuppliers
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockResolvedValueOnce([{ supplierId: 's2', name: 'Second' }])

    const store = useOrdersStore()
    const first = store.loadSuppliers('loc1')
    await store.loadSuppliers('loc2')
    resolveFirst([{ supplierId: 's1', name: 'First' }])
    await first

    expect(store.suppliers.map((s) => s.name)).toEqual(['Second'])
  })

  it('requires a locationId', async () => {
    const store = useOrdersStore()
    await store.loadSuppliers('')
    expect(service.listSuppliers).not.toHaveBeenCalled()
    expect(store.error).toBeTruthy()
  })
})

describe('needsEmailCount', () => {
  it('counts suppliers with no email — the export-only state', async () => {
    service.listSuppliers.mockResolvedValue([
      { supplierId: 's1', name: 'A', needsEmail: true },
      { supplierId: 's2', name: 'B', needsEmail: true },
      { supplierId: 's3', name: 'C', needsEmail: false },
    ])
    const store = useOrdersStore()
    await store.loadSuppliers('loc1')
    expect(store.needsEmailCount).toBe(2)
  })
})

describe('saveSupplier', () => {
  it('reloads the book after a successful save', async () => {
    service.saveSupplier.mockResolvedValue({ supplierId: 's1' })
    service.listSuppliers.mockResolvedValue([{ supplierId: 's1', name: 'A' }])
    const store = useOrdersStore()
    await store.saveSupplier({ locationId: 'loc1', supplier: { name: 'A' } })
    expect(service.listSuppliers).toHaveBeenCalledWith('loc1')
    expect(store.suppliers).toHaveLength(1)
  })

  it('returns false and sets error on failure, leaving the book untouched', async () => {
    service.saveSupplier.mockRejectedValue(new Error('nope'))
    const store = useOrdersStore()
    const ok = await store.saveSupplier({ locationId: 'loc1', supplier: { name: 'A' } })
    expect(ok).toBe(false)
    expect(store.error).toBeTruthy()
    expect(service.listSuppliers).not.toHaveBeenCalled()
  })
})

describe('seed flow', () => {
  it('stores a preview without writing anything', async () => {
    service.previewSeed.mockResolvedValue({
      hasData: true, sourceTimestamp: 1000, truncated: false,
      suppliers: [{ name: 'P', itemCount: 2, mergeKey: 'p' }], items: [],
      unassigned: { itemCount: 3, items: [] },
    })
    const store = useOrdersStore()
    await store.loadSeedPreview('loc1')
    expect(store.seedPreview.suppliers).toHaveLength(1)
    expect(store.seedPreview.unassigned.itemCount).toBe(3)
    expect(service.commitSeed).not.toHaveBeenCalled()
  })

  it('records hasData:false as "no stock counts", not as an error', async () => {
    service.previewSeed.mockResolvedValue({ hasData: false })
    const store = useOrdersStore()
    await store.loadSeedPreview('loc1')
    expect(store.seedPreview).toBeNull()
    expect(store.error).toBe('')
    expect(store.seedUnavailable).toBe(true)
  })

  it('commits only ticked names and reloads the book', async () => {
    service.commitSeed.mockResolvedValue({ hasData: true, suppliersCreated: 1, productsCreated: 2 })
    service.listSuppliers.mockResolvedValue([{ supplierId: 's1', name: 'P' }])
    const store = useOrdersStore()
    const out = await store.commitSeed({ locationId: 'loc1', supplierNames: ['P'] })
    expect(service.commitSeed).toHaveBeenCalledWith({ locationId: 'loc1', supplierNames: ['P'] })
    expect(out.suppliersCreated).toBe(1)
    expect(store.suppliers).toHaveLength(1)
    expect(store.seedPreview).toBeNull()
  })

  it('passes a selections payload straight through (rename + merge)', async () => {
    service.commitSeed.mockResolvedValue({ hasData: true, suppliersCreated: 1, productsCreated: 3 })
    service.listSuppliers.mockResolvedValue([])
    const selections = [{ name: 'ABC Meats (Pty) Ltd', sourceNames: ['ABC Meats', 'abc meats'] }]
    const store = useOrdersStore()
    await store.commitSeed({ locationId: 'loc1', selections })
    expect(service.commitSeed).toHaveBeenCalledWith({ locationId: 'loc1', selections })
  })

  it('surfaces a commit failure without clearing the preview the owner is mid-review on', async () => {
    service.previewSeed.mockResolvedValue({
      hasData: true, sourceTimestamp: 1, truncated: false,
      suppliers: [{ name: 'P', itemCount: 1, mergeKey: 'p' }], items: [],
      unassigned: { itemCount: 0, items: [] },
    })
    service.commitSeed.mockRejectedValue(new Error('nope'))
    const store = useOrdersStore()
    await store.loadSeedPreview('loc1')
    const out = await store.commitSeed({ locationId: 'loc1', supplierNames: ['P'] })
    expect(out).toBeNull()
    expect(store.error).toBeTruthy()
    expect(store.seedPreview).not.toBeNull()
  })
})

// D1.1. Grouping by category was the first attempt and it was wrong — a
// category routinely spans several suppliers, so it is a FILTER, not a unit of
// assignment. The owner needs the full list, filterable, with multi-select.
describe('seedAllItems / seedFilterOptions', () => {
  const previewWith = (items, unassigned) => ({
    hasData: true, sourceTimestamp: 1, truncated: false,
    suppliers: [], items,
    unassigned: { itemCount: unassigned.length, items: unassigned },
  })
  const it_ = (description, supplierName, category, costCenter) => ({
    description, supplierName, category, costCenter, unit: 'ea', itemCode: '',
    lastPrice: null, key: `d:${description}`,
  })

  it('merges assigned and unassigned into one list, flagging which is which', async () => {
    service.previewSeed.mockResolvedValue(previewWith(
      [it_('water', 'Peninsula', 'Beverages', 'Bar')],
      [it_('beef', '', 'Butchery', 'Kitchen')],
    ))
    const store = useOrdersStore()
    await store.loadSeedPreview('loc1')

    expect(store.seedAllItems.map((i) => i.description)).toEqual(['beef', 'water'])
    const byDesc = Object.fromEntries(store.seedAllItems.map((i) => [i.description, i.assigned]))
    expect(byDesc).toEqual({ beef: false, water: true })
  })

  it('offers only filter values that actually occur', async () => {
    service.previewSeed.mockResolvedValue(previewWith(
      [it_('water', 'P', 'Beverages', 'Bar')],
      [it_('beef', '', 'Butchery', 'Kitchen')],
    ))
    const store = useOrdersStore()
    await store.loadSeedPreview('loc1')
    expect(store.seedFilterOptions.categories).toEqual(['Beverages', 'Butchery'])
    expect(store.seedFilterOptions.costCentres).toEqual(['Bar', 'Kitchen'])
  })

  it('is empty with no preview loaded', () => {
    const store = useOrdersStore()
    expect(store.seedAllItems).toEqual([])
    expect(store.seedFilterOptions).toEqual({ categories: [], costCentres: [] })
  })
})

// The stock CSV's supplier column is free text, so one company arrives under
// several spellings. The server supplies a mergeKey per derived supplier; the
// review screen needs them grouped so the owner can merge with one action.
describe('seedDuplicateGroups', () => {
  const preview = (suppliers) => ({
    hasData: true, sourceTimestamp: 1, truncated: false,
    suppliers, items: [], unassigned: { itemCount: 0, items: [] },
  })

  it('groups derived names sharing a mergeKey, largest group first', async () => {
    service.previewSeed.mockResolvedValue(preview([
      { name: 'ABC Meats', itemCount: 4, mergeKey: 'abc meats' },
      { name: 'abc meats', itemCount: 2, mergeKey: 'abc meats' },
      { name: 'Solo Co', itemCount: 1, mergeKey: 'solo co' },
      { name: 'A.B.C. Meats', itemCount: 1, mergeKey: 'a b c meats' },
    ]))
    const store = useOrdersStore()
    await store.loadSeedPreview('loc1')

    expect(store.seedDuplicateGroups).toHaveLength(1)
    expect(store.seedDuplicateGroups[0].names).toEqual(['ABC Meats', 'abc meats'])
    // The most-used spelling is the sensible default canonical name.
    expect(store.seedDuplicateGroups[0].suggestedName).toBe('ABC Meats')
  })

  it('is empty when every derived name is distinct', async () => {
    service.previewSeed.mockResolvedValue(preview([
      { name: 'One', itemCount: 1, mergeKey: 'one' },
      { name: 'Two', itemCount: 1, mergeKey: 'two' },
    ]))
    const store = useOrdersStore()
    await store.loadSeedPreview('loc1')
    expect(store.seedDuplicateGroups).toEqual([])
  })

  it('is empty with no preview loaded', () => {
    expect(useOrdersStore().seedDuplicateGroups).toEqual([])
  })
})
