// Upload-wizard display strings (D3 T5): human labels for the 18
// detectAndMapHeaders fields (upload/mapping-memory.js KNOWN_MAPPING_FIELDS)
// and inline-banner copy for the upload store's typed banner codes
// (upload/upload-store.js + upload/ingest-guards.js). Pure module — no
// firebase, no DOM.

export const MAPPING_FIELD_LABELS = Object.freeze({
  itemCode: 'Item code',
  description: 'Description',
  category: 'Category',
  unit: 'Unit',
  costCenter: 'Cost centre',
  openingQty: 'Opening qty',
  openingValue: 'Opening value (R)',
  purchaseQty: 'Purchase qty',
  purchases: 'Purchases',
  closingQty: 'Closing qty',
  closingValue: 'Closing value (R)',
  unitCost: 'Unit cost',
  supplierName: 'Supplier',
  stockLevel: 'Stock level',
  totalCost: 'Total cost',
  openingStockValue: 'Opening stock value (R)',
  closingStockValue: 'Closing stock value (R)',
  purchaseValue: 'Purchase value (R)',
})

// The mapping editor shows ONLY these 12 fields (operator preview feedback,
// 2026-07-25: the full 18 read as duplicates). Ground truth from
// data-processor.js processStockData:
//   - `unitCost` and `totalCost` are NEVER READ by the processor (unit cost is
//     always derived from value/qty — the GT1/O5 quirk); showing them misleads.
//   - `purchases` is only a FALLBACK alias for `purchaseQty` (:337-341).
//   - `openingStockValue`/`closingStockValue`/`purchaseValue` are optional
//     direct-value overrides, auto-derived when unmapped (:404-414).
// Hidden fields keep whatever auto-detection assigned (validated, harmless) —
// they are just not shown or user-editable.
export const VISIBLE_MAPPING_FIELDS = Object.freeze([
  'itemCode', 'description', 'category', 'unit', 'costCenter', 'supplierName',
  'openingQty', 'openingValue', 'purchaseQty', 'closingQty', 'closingValue',
  'stockLevel',
])

function mb(bytes) {
  if (!Number.isFinite(bytes)) return null
  const v = bytes / (1024 * 1024)
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1)
}

/**
 * Banner copy for a typed upload banner ({code, ...}). Returns '' for null.
 * Codes: file-too-large | too-many-rows | too-many-columns | invalid-parse |
 * empty-file | read-failed | no-items | save-failed.
 */
export function bannerText(banner) {
  if (!banner) return ''
  switch (banner.code) {
    case 'file-too-large': {
      const actual = mb(banner.actualBytes)
      const limit = mb(banner.limitBytes) || '2'
      return actual
        ? `That file is too large (${actual} MB) — the limit is ${limit} MB.`
        : `That file is too large — the limit is ${limit} MB.`
    }
    case 'too-many-rows':
      return `That file has too many rows (${Number(banner.actual).toLocaleString('en-ZA')}) — the limit is ${Number(banner.limit).toLocaleString('en-ZA')}.`
    case 'too-many-columns':
      return `That file has too many columns (${banner.actual}) — the limit is ${banner.limit}.`
    case 'invalid-parse':
      return 'That file could not be read as a CSV. Check the format and try again.'
    case 'empty-file':
      return 'That file has no data rows. Export a stock count with at least one item.'
    case 'read-failed':
      return 'The file could not be read. Try again, or pick a different file.'
    case 'no-items':
      return 'No stock items could be built with this column mapping. Check the mapping and try again.'
    case 'save-failed':
      return banner.message || 'Failed to save the stock count.'
    default:
      return 'Something went wrong. Please try again.'
  }
}
