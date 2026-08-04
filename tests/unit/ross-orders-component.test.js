// @vitest-environment happy-dom
//
// Component tests for the Orders picker.
//
// These exist because their ABSENCE was the direct cause of three MUST-FIX
// findings surviving to review: a chip that implied "move" over an add-only
// backend, a selection model that collapsed two distinct rows, and a commit
// response whose warnings were returned by the server and dropped by the client.
// The server core was well covered, and that coverage is exactly what made an
// untested 250-line picker feel safe to ship.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../public/js/modules/ross/v2/orders-service.js', () => ({
  listSuppliers: vi.fn(), saveSupplier: vi.fn(), archiveSupplier: vi.fn(),
  listProducts: vi.fn(), saveProduct: vi.fn(), previewSeed: vi.fn(), commitSeed: vi.fn(),
}))

const service = await import('../../public/js/modules/ross/v2/orders-service.js')
const { useOrdersStore } = await import('../../public/js/modules/ross/v2/orders-store.js')
const RossOrders = (await import('../../public/js/modules/ross/v2/components/RossOrders.vue')).default

const global = { stubs: {} }

const row = (ref, description, opts = {}) => ({
  ref,
  key: opts.itemCode ? `c:${opts.itemCode}` : `d:${description.toLowerCase()}`,
  description,
  supplierName: opts.supplierName || '',
  unit: opts.unit || 'ea',
  itemCode: opts.itemCode || '',
  lastPrice: opts.lastPrice ?? null,
  category: opts.category || 'Butchery',
  costCenter: opts.costCenter || 'Kitchen',
})

function preview({ items = [], unassigned = [], extra = {} } = {}) {
  return {
    hasData: true, sourceTimestamp: 1717200000000, truncated: false,
    unitDefaultedCount: 0, duplicateGroupCount: 0,
    suppliers: [], items, unassigned: { itemCount: unassigned.length, items: unassigned },
    ...extra,
  }
}

async function mountWithPreview(p) {
  service.listSuppliers.mockResolvedValue([])
  service.previewSeed.mockResolvedValue(p)
  const wrapper = mount(RossOrders, { global })
  const store = useOrdersStore()
  store.locations = [{ id: 'loc1', name: 'Venue' }]
  store.selectedLocationId = 'loc1'
  await wrapper.vm.$nextTick()
  await store.loadSeedPreview('loc1')
  await wrapper.vm.$nextTick()
  return { wrapper, store }
}

/** Let the commit promise chain (service -> store -> reload -> render) settle. */
const flush = async (wrapper) => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve()
    await wrapper.vm.$nextTick()
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('item rows are addressed by ref, not by content key', () => {
  // Two rows of one description in different cost centres share a content key.
  // Selecting one used to tick both and write the other's unit and price.
  const colliding = [
    row('r0', 'Chicken Breast', { costCenter: 'Kitchen', unit: 'kg', lastPrice: 50 }),
    row('r1', 'Chicken Breast', { costCenter: 'Bar', unit: 'ea', lastPrice: 99 }),
  ]

  it('renders both rows even though their content keys are identical', async () => {
    const { wrapper } = await mountWithPreview(preview({ unassigned: colliding }))
    expect(colliding[0].key).toBe(colliding[1].key)
    expect(wrapper.findAll('.ord__item')).toHaveLength(2)
  })

  it('ticking one row does NOT tick its content-key twin', async () => {
    const { wrapper } = await mountWithPreview(preview({ unassigned: colliding }))
    const boxes = wrapper.findAll('.ord__item input[type="checkbox"]')
    await boxes[0].setValue(true)
    expect(boxes[0].element.checked).toBe(true)
    expect(boxes[1].element.checked).toBe(false)
  })

  it('sends the selected row REF, so the server writes that row', async () => {
    const { wrapper } = await mountWithPreview(preview({ unassigned: colliding }))
    service.commitSeed.mockResolvedValue({ suppliersCreated: 1, productsCreated: 1, ignoredCount: 0 })

    await wrapper.findAll('.ord__item input[type="checkbox"]')[0].setValue(true)
    await wrapper.find('.ord__assign-input input').setValue('Alpha')
    await wrapper.findAll('.ord__assign-input button')[0].trigger('click')
    await wrapper.vm.$nextTick()
    const importBtn = wrapper.findAll('button').find((b) => b.text().startsWith('Import'))
    await importBtn.trigger('click')
    await wrapper.vm.$nextTick()

    const payload = service.commitSeed.mock.calls[0][0]
    expect(payload.selections[0].itemRefs).toEqual(['r0'])
    expect(payload.sourceTimestamp).toBe(1717200000000)
  })
})

describe('filtering and select-all', () => {
  const mixed = [
    row('r0', 'beef', { category: 'Butchery', costCenter: 'Kitchen' }),
    row('r1', 'lamb', { category: 'Butchery', costCenter: 'Kitchen' }),
    row('r2', 'cola', { category: 'Beverages', costCenter: 'Bar' }),
  ]

  it('select-all applies to the CURRENT FILTER, not the whole list', async () => {
    const { wrapper } = await mountWithPreview(preview({ unassigned: mixed }))
    const selects = wrapper.findAll('select')
    await selects[1].setValue('Butchery')            // category filter
    expect(wrapper.findAll('.ord__item')).toHaveLength(2)

    await wrapper.find('.ord__assign-bar input[type="checkbox"]').setValue(true)
    await wrapper.find('.ord__assign-input input').setValue('Butcher Co')
    await wrapper.findAll('.ord__assign-input button')[0].trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('2 items → Butcher Co')
  })

  it('staged items drop out of the list so they cannot be assigned twice', async () => {
    const { wrapper } = await mountWithPreview(preview({ unassigned: mixed }))
    await wrapper.findAll('.ord__item input[type="checkbox"]')[0].setValue(true)
    await wrapper.find('.ord__assign-input input').setValue('Butcher Co')
    await wrapper.findAll('.ord__assign-input button')[0].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.ord__item')).toHaveLength(2)
  })
})

describe('undo', () => {
  it('removes only the group it belongs to, after an earlier undo', async () => {
    // `name::length` ids repeated after an undo, so one Undo removed two groups.
    const items = [row('r0', 'a'), row('r1', 'b'), row('r2', 'c')]
    const { wrapper } = await mountWithPreview(preview({ unassigned: items }))

    const stage = async (idx, name) => {
      await wrapper.findAll('.ord__item input[type="checkbox"]')[idx].setValue(true)
      await wrapper.find('.ord__assign-input input').setValue(name)
      await wrapper.findAll('.ord__assign-input button')[0].trigger('click')
      await wrapper.vm.$nextTick()
    }
    await stage(0, 'ABC')
    await stage(0, 'ABC')
    expect(wrapper.findAll('.ord__assign-done-row')).toHaveLength(2)

    await wrapper.findAll('.ord__assign-undo')[0].trigger('click')
    await wrapper.vm.$nextTick()
    await stage(0, 'ABC')

    expect(wrapper.findAll('.ord__assign-done-row')).toHaveLength(2)
    await wrapper.findAll('.ord__assign-undo')[0].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.ord__assign-done-row')).toHaveLength(1)
  })
})

describe('the commit result is never reported as a clean success when it was not', () => {
  it('warns when the server ignored selections', async () => {
    const { wrapper } = await mountWithPreview(preview({ unassigned: [row('r0', 'beef')] }))
    service.commitSeed.mockResolvedValue({
      suppliersCreated: 0, productsCreated: 0, ignoredCount: 388, truncated: false,
    })
    await wrapper.findAll('.ord__item input[type="checkbox"]')[0].setValue(true)
    await wrapper.find('.ord__assign-input input').setValue('ABC')
    await wrapper.findAll('.ord__assign-input button')[0].trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button').find((b) => b.text().startsWith('Import')).trigger('click')
    await flush(wrapper)

    expect(wrapper.text()).toContain('388 selections no longer matched')
    expect(wrapper.find('.ord__banner--warn').exists()).toBe(true)
  })
})

describe('diagnosis when the stock file named no suppliers at all', () => {
  it('explains which column Ross looks for', async () => {
    const { wrapper } = await mountWithPreview(preview({ unassigned: [row('r0', 'beef')] }))
    expect(wrapper.text()).toContain('Supplier')
    expect(wrapper.text()).toContain('Vendor')
  })

  it('does not show that diagnosis when the file DID name suppliers', async () => {
    const p = preview({
      items: [row('r0', 'water', { supplierName: 'Peninsula' })],
      unassigned: [row('r1', 'beef')],
    })
    const { wrapper } = await mountWithPreview(p)
    expect(wrapper.text()).not.toContain('Vendor')
  })
})

describe('notices that must not vanish quietly', () => {
  it('shows the unit-defaulted and truncation warnings', async () => {
    const p = preview({
      unassigned: [row('r0', 'beef')],
      extra: { unitDefaultedCount: 12, truncated: true },
    })
    const { wrapper } = await mountWithPreview(p)
    expect(wrapper.text()).toContain('12 items had no unit')
    expect(wrapper.text()).toContain('first 2,000 items')
  })
})
