// Food Cost v2 upload-wizard store (D3 T4) — the M-1 state machine.
//
// A SEPARATE Pinia store (not a slice of store.js): the wizard's lifecycle is
// disjoint from the overview's, and keeping it here holds both files inside
// the small-file convention. The only coupling is intentional: a successful
// save reloads the overview store.
//
// Status machine (design §4b/plan T4):
//   idle → parsed → mapped-auto | mapped-manual → previewed → saving
//        → saved | error
// Guard rejections (file size, parsed shape) surface as typed `banner`
// payloads and LEAVE status at 'idle' — inline banners, never SweetAlert2.
//
// All I/O goes through ../service.js (mocked wholesale in tests); the T1
// utils (mapping-memory / ingest-guards) are pure and used directly. The
// fingerprint fn is injectable via `_fingerprintFn` (test seam) because
// crypto.subtle is absent in insecure contexts and the T1 CONSUMER CONTRACT
// requires degrading to detect+confirm, never failing the upload.

import { defineStore } from 'pinia'
import {
  loadMapping,
  saveMapping,
  bumpMappingUseCount,
  parseCsv,
  detectMapping,
  processWithMapping,
  saveStockUsage,
} from '../service.js'
import {
  normalizeHeaders,
  fingerprintHeaders,
  validateStoredMapping,
  buildMappingRecord,
} from './mapping-memory.js'
import { checkFileSize, checkParsedShape } from './ingest-guards.js'
import { useFoodCostStore } from '../store.js'

function sumField(items, field) {
  return items.reduce((total, it) => total + (Number.parseFloat(it?.[field]) || 0), 0)
}

/**
 * Totals for the save payload — mirrors the v1 component's derivations
 * (refactored-app-component.js:1367-1394 costOfUsage fold, :1874-1880 sums).
 * Pure; exported for direct testing if T5 needs it.
 */
export function computeTotals(items, salesAmount = 0) {
  const totalCostOfUsage = items.reduce((total, it) => {
    const cost = it?.costOfUsage !== undefined && it?.costOfUsage !== null
      ? Number.parseFloat(it.costOfUsage)
      : (Number.parseFloat(it?.usage) || 0) * (Number.parseFloat(it?.unitCost) || 0)
    return Number.isNaN(cost) ? total : total + cost
  }, 0)
  const sales = Number.parseFloat(salesAmount) || 0
  return {
    totalOpeningValue: sumField(items, 'openingValue'),
    totalPurchases: sumField(items, 'purchaseValue'),
    totalClosingValue: sumField(items, 'closingValue'),
    totalUsage: sumField(items, 'usage'),
    totalCostOfUsage,
    salesAmount: sales,
    costPercentage: sales > 0 ? (totalCostOfUsage / sales) * 100 : 0,
  }
}

export const useFoodCostUploadStore = defineStore('foodCostUpload', {
  state: () => ({
    status: 'idle',       // idle|parsed|mapped-auto|mapped-manual|previewed|saving|saved|error
    banner: null,         // typed inline-banner payload ({code, ...}) or null
    fileName: '',
    parsed: null,         // { headers, rows } — the N3-adapted parse result
    headersNorm: [],
    fingerprint: null,    // 64-hex, or null when fingerprinting degraded
    storedMapping: null,  // the validated fingerprint-HIT record, if any
    mapping: null,        // working {field: colIndex} (detectAndMapHeaders shape)
    mappingSource: null,  // 'memory' (one-click) | 'detected' (editor / edited)
    preview: null,        // { items, totals }
    previewParams: null,  // { stockPeriodDays, daysToNextDelivery, salesAmount }
    saveResult: null,
    _fingerprintFn: null, // test seam; null → real fingerprintHeaders
  }),

  getters: {
    /**
     * §4d value-columns warning: v1 derives unitCost ONLY from
     * openingValue/openingQty + closingValue/closingQty (data-processor.js:
     * 352-396) — with neither value column mapped, every cost KPI is garbage.
     */
    warnCostsUnavailable(state) {
      const m = state.mapping
      if (!m) return false
      const unmapped = (v) => typeof v !== 'number' || v === -1
      return unmapped(m.openingValue) && unmapped(m.closingValue)
    },
  },

  actions: {
    resetUpload() {
      // _fingerprintFn deliberately survives (test seam, set before ingest)
      this.status = 'idle'
      this.banner = null
      this.fileName = ''
      this.parsed = null
      this.headersNorm = []
      this.fingerprint = null
      this.storedMapping = null
      this.mapping = null
      this.mappingSource = null
      this.preview = null
      this.previewParams = null
      this.saveResult = null
    },

    /**
     * idle → parsed → mapped-auto | mapped-manual.
     * Gate 1 (checkFileSize) runs BEFORE the file is read; gate 2
     * (checkParsedShape) after parse, before anything per-row (§4d placement).
     */
    async ingestFile(file) {
      this.resetUpload()

      const sizeCheck = checkFileSize(file)
      if (!sizeCheck.ok) {
        this.banner = sizeCheck
        return
      }

      let text
      try {
        text = await file.text()
      } catch {
        this.banner = { code: 'read-failed' }
        return
      }

      // parseCSVData returns {headers, data:{headers, rows}} — `data` is the
      // whole parse object; checkParsedShape wants {headers, rows} (N3).
      const parsedResult = parseCsv(text)
      const headers = Array.isArray(parsedResult?.headers) ? parsedResult.headers : []
      const rows = Array.isArray(parsedResult?.data?.rows) ? parsedResult.data.rows : []

      const shapeCheck = checkParsedShape({ headers, rows })
      if (!shapeCheck.ok) {
        this.banner = shapeCheck
        return
      }
      if (!headers.length || !rows.length) {
        this.banner = { code: 'empty-file' }
        return
      }

      this.fileName = String(file.name || '')
      this.parsed = { headers, rows }
      this.status = 'parsed'

      await this._resolveMapping(headers)
    },

    /**
     * Fingerprint flow (§4c). HIT requires BOTH the exact fingerprint match
     * AND validateStoredMapping passing (headersNorm deep-equal + every index
     * an integer in [-1, headerCount) + known-field whitelist). Any failure —
     * including fingerprintHeaders rejecting in insecure contexts (the T1
     * CONSUMER CONTRACT) — degrades to detect+confirm.
     */
    async _resolveMapping(headers) {
      this.headersNorm = normalizeHeaders(headers)

      let fingerprint = null
      try {
        fingerprint = await (this._fingerprintFn || fingerprintHeaders)(this.headersNorm)
      } catch {
        fingerprint = null // degrade: MISS path, upload continues
      }
      this.fingerprint = fingerprint

      if (fingerprint) {
        const stored = await loadMapping(fingerprint)
        if (stored && validateStoredMapping(stored, this.headersNorm).valid) {
          this.storedMapping = stored
          this.mapping = { ...stored.mapping }
          this.mappingSource = 'memory'
          this.status = 'mapped-auto'
          return
        }
      }

      this.storedMapping = null
      this.mapping = { ...detectMapping(headers) }
      this.mappingSource = 'detected'
      this.status = 'mapped-manual'
    },

    /** Editor edit — immutable; an edited mapping is (re)stored on save. */
    setMappingField(field, colIndex) {
      if (!this.mapping) return
      this.mapping = { ...this.mapping, [field]: colIndex }
      this.mappingSource = 'detected'
    },

    /**
     * mapped-* → previewed. Preview is MANDATORY on both paths (F10) — the
     * one-click flow still shows the processed rows before saving.
     */
    buildPreview({ stockPeriodDays = 7, daysToNextDelivery = 5, salesAmount = 0 } = {}) {
      if (!this.parsed || !this.mapping) return
      if (!['mapped-auto', 'mapped-manual', 'previewed'].includes(this.status)) return

      // Copy the mapping in: the v1 processor is documented to mutate
      // mappings passed by reference (data-service.js:61-63).
      const items = processWithMapping(
        { headers: [...this.parsed.headers], rows: this.parsed.rows },
        { ...this.mapping },
        { stockPeriodDays, daysToNextDelivery },
      )
      if (!Array.isArray(items) || items.length === 0) {
        this.banner = { code: 'no-items' }
        return
      }
      this.banner = null
      this.previewParams = { stockPeriodDays, daysToNextDelivery, salesAmount }
      this.preview = { items, totals: computeTotals(items, salesAmount) }
      this.status = 'previewed'
    },

    /**
     * previewed → saving → saved | error. The mapping is persisted (or its
     * useCount bumped) ONLY after a successful save; a failed save stores
     * nothing. A degraded (null) fingerprint skips mapping persistence
     * entirely — the upload itself still succeeds.
     *
     * @param {{locationId?: string, storeName?: string, openingDate?: string,
     *   closingDate?: string, mappingLabel?: string}} meta
     */
    async saveUpload(meta = {}) {
      if (!['previewed', 'error'].includes(this.status) || !this.preview) return

      const overview = useFoodCostStore()
      const locationId = meta.locationId || overview.locationId
      const totals = this.preview.totals

      this.banner = null
      this.status = 'saving'

      // Payload mirrors the v1 save (refactored-app-component.js:1860-1889);
      // saveStockData writes these exact fields (database-operations.js:89-120).
      const saveRes = await saveStockUsage({
        selectedLocationId: locationId,
        storeName: meta.storeName || '',
        openingDate: meta.openingDate || '',
        closingDate: meta.closingDate || '',
        stockPeriodDays: this.previewParams?.stockPeriodDays || 0,
        daysToNextDelivery: this.previewParams?.daysToNextDelivery || 0,
        totalOpeningValue: totals.totalOpeningValue,
        totalPurchases: totals.totalPurchases,
        totalClosingValue: totals.totalClosingValue,
        totalUsage: totals.totalUsage,
        totalCostOfUsage: totals.totalCostOfUsage,
        salesAmount: totals.salesAmount,
        costPercentage: totals.costPercentage,
        stockItems: this.preview.items,
      })

      if (!saveRes || !saveRes.ok) {
        this.status = 'error'
        this.banner = {
          code: 'save-failed',
          message: (saveRes && saveRes.error) || 'Failed to save the stock count.',
        }
        return // mapping NOT stored, no useCount bump
      }

      if (this.fingerprint) {
        if (this.mappingSource === 'memory' && this.storedMapping) {
          await bumpMappingUseCount(this.fingerprint, this.storedMapping.useCount)
        } else {
          await saveMapping(this.fingerprint, buildMappingRecord(
            this.headersNorm,
            this.mapping,
            meta.mappingLabel || this.fileName,
            Date.now(),
          ))
        }
      }

      this.saveResult = saveRes.result || null
      this.status = 'saved'

      // Fresh data just landed — reload the dashboard.
      await overview.load({ locationId })
    },
  },
})
