<script setup>
// Wizard step 3 — mandatory preview (F10) + period params + save.
// Bespoke table (the Hi-Fi kit has none); all cells render via {{ }} —
// tenant CSV strings are auto-escaped, never v-html (§4d).
// Save retries reuse the same meta: the store allows saveUpload from both
// 'previewed' and 'error' (save-failed) states.
import { ref, computed, onMounted } from 'vue'
import { useFoodCostUploadStore } from '../upload/upload-store.js'
import { HfButton, HfInput } from '/js/design-system/hifi/index.js'
import { zar } from '../content.js'

const props = defineProps({
  locationId: { type: String, default: '' },
})
const emit = defineEmits(['back'])
const upload = useFoodCostUploadStore()

const PREVIEW_ROWS = 15

// Period params (re-runs buildPreview) — seeded from the store's previewParams.
const stockPeriodDays = ref(7)
const daysToNextDelivery = ref(5)
const salesAmount = ref(0)
// Save meta (used at save time only).
const storeName = ref('')
const openingDate = ref('')
const closingDate = ref('')
const mappingLabel = ref('')

onMounted(() => {
  const p = upload.previewParams
  if (p) {
    stockPeriodDays.value = p.stockPeriodDays
    daysToNextDelivery.value = p.daysToNextDelivery
    salesAmount.value = p.salesAmount
  }
})

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function updatePreview() {
  upload.buildPreview({
    stockPeriodDays: clampInt(stockPeriodDays.value, 1, 365, 7),
    daysToNextDelivery: clampInt(daysToNextDelivery.value, 1, 30, 5),
    salesAmount: Number(salesAmount.value) || 0,
  })
}

function save() {
  const label = String(mappingLabel.value || '').trim()
  upload.saveUpload({
    locationId: props.locationId,
    storeName: String(storeName.value || '').trim(),
    openingDate: openingDate.value || '',
    closingDate: closingDate.value || '',
    ...(label ? { mappingLabel: label } : {}),
  })
}

const saving = computed(() => upload.status === 'saving')
const items = computed(() => (upload.preview && upload.preview.items) || [])
const rows = computed(() => items.value.slice(0, PREVIEW_ROWS))
const totals = computed(() => (upload.preview && upload.preview.totals) || null)
// A new (or edited) mapping gets stored on save — offer an optional label.
const showLabelInput = computed(() => !!upload.fingerprint && upload.mappingSource !== 'memory')

/** Row cost mirrors computeTotals' fallback (upload-store.js:48-54). */
function rowCost(it) {
  const c = it && it.costOfUsage !== undefined && it.costOfUsage !== null
    ? Number.parseFloat(it.costOfUsage)
    : (Number.parseFloat(it && it.usage) || 0) * (Number.parseFloat(it && it.unitCost) || 0)
  return Number.isNaN(c) ? 0 : c
}

function fmtQty(v) {
  const n = Number(v) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** Unit costs need cents — zar() rounds to whole Rand. */
function zarCents(v) {
  return 'R' + new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(v) || 0)
}
</script>

<template>
  <div class="upload-preview">
    <div class="hf-mono upload-preview__file">{{ upload.fileName }} · {{ items.length }} items</div>

    <!-- Period params -->
    <div class="upload-preview__params">
      <label class="upload-preview__param">
        <span>Stock period (days)</span>
        <HfInput v-model="stockPeriodDays" type="number" />
      </label>
      <label class="upload-preview__param">
        <span>Days to next delivery</span>
        <HfInput v-model="daysToNextDelivery" type="number" />
      </label>
      <label class="upload-preview__param">
        <span>Sales for the period (R)</span>
        <HfInput v-model="salesAmount" type="number" />
      </label>
      <HfButton variant="ghost" size="sm" class="upload-preview__recalc" :disabled="saving" @click="updatePreview">
        Update preview
      </HfButton>
    </div>

    <!-- Preview table -->
    <div class="upload-preview__table-wrap">
      <table class="upload-preview__table">
        <thead>
          <tr>
            <th class="hf-eyebrow">Item</th>
            <th class="hf-eyebrow">Opening</th>
            <th class="hf-eyebrow">Purchases</th>
            <th class="hf-eyebrow">Closing</th>
            <th class="hf-eyebrow">Usage</th>
            <th class="hf-eyebrow">Unit cost</th>
            <th class="hf-eyebrow">Cost of usage</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(it, i) in rows" :key="i">
            <td class="upload-preview__td-name">
              {{ it.description || it.itemCode }}
              <span class="hf-mono upload-preview__td-code">{{ it.itemCode }}</span>
            </td>
            <td class="upload-preview__td-num">{{ fmtQty(it.openingQty) }}</td>
            <td class="upload-preview__td-num">{{ fmtQty(it.purchaseQty) }}</td>
            <td class="upload-preview__td-num">{{ fmtQty(it.closingQty) }}</td>
            <td class="upload-preview__td-num">{{ fmtQty(it.usage) }}</td>
            <td class="upload-preview__td-num">{{ it.hasMissingUnitCost ? '—' : zarCents(it.unitCost) }}</td>
            <td class="upload-preview__td-num">{{ it.hasMissingUnitCost ? 'unknown' : zar(rowCost(it)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="items.length > PREVIEW_ROWS" class="hf-mono upload-preview__more">
      Showing the first {{ PREVIEW_ROWS }} of {{ items.length }} items — all
      {{ items.length }} will be saved.
    </div>

    <!-- Totals -->
    <div v-if="totals" class="upload-preview__totals">
      <span>Total usage cost <strong class="hf-num">{{ zar(totals.totalCostOfUsage) }}</strong></span>
      <span v-if="totals.salesAmount > 0">
        Cost <strong class="hf-num">{{ totals.costPercentage.toFixed(1) }}%</strong> of sales
      </span>
    </div>

    <!-- Save meta -->
    <div class="upload-preview__meta">
      <label class="upload-preview__param">
        <span>Store name (optional)</span>
        <HfInput v-model="storeName" placeholder="e.g. Main kitchen" />
      </label>
      <label class="upload-preview__param">
        <span>Opening date</span>
        <HfInput v-model="openingDate" type="date" />
      </label>
      <label class="upload-preview__param">
        <span>Closing date</span>
        <HfInput v-model="closingDate" type="date" />
      </label>
      <label v-if="showLabelInput" class="upload-preview__param">
        <span>Remember this format as (optional)</span>
        <HfInput v-model="mappingLabel" :placeholder="upload.fileName" />
      </label>
    </div>

    <div class="upload-preview__actions">
      <HfButton variant="ghost" size="sm" :disabled="saving" @click="emit('back')">Back to mapping</HfButton>
      <HfButton size="sm" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save stock count' }}
      </HfButton>
    </div>
  </div>
</template>

<style scoped>
.upload-preview__file { font-size: 11px; color: var(--hf-muted); margin-bottom: 12px; }

.upload-preview__params, .upload-preview__meta {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px 12px; align-items: end;
  margin-bottom: 14px;
}
.upload-preview__meta { grid-template-columns: repeat(3, 1fr); margin-top: 14px; margin-bottom: 0; }
@media (max-width: 640px) {
  .upload-preview__params, .upload-preview__meta { grid-template-columns: 1fr; }
}
.upload-preview__param { display: flex; flex-direction: column; gap: 3px; }
.upload-preview__param > span { font-size: 11px; color: var(--hf-muted); letter-spacing: 0.02em; }
.upload-preview__recalc { justify-self: start; }

.upload-preview__table-wrap {
  overflow-x: auto; overflow-y: auto; max-height: 260px;
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius);
}
.upload-preview__table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.upload-preview__table thead tr { border-bottom: 1px solid var(--hf-ink); text-align: left; }
.upload-preview__table th { padding: 8px; font-weight: 400; background: var(--hf-bg); position: sticky; top: 0; }
.upload-preview__table tbody tr { border-bottom: 1px solid var(--hf-line); }
.upload-preview__table td { padding: 8px; white-space: nowrap; }
.upload-preview__td-name { font-weight: 500; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.upload-preview__td-code { display: block; font-size: 10px; color: var(--hf-muted); font-weight: 400; }
.upload-preview__td-num { font-family: var(--hf-font-mono); font-feature-settings: "tnum","zero"; }

.upload-preview__more { font-size: 11px; color: var(--hf-muted); margin-top: 6px; }

.upload-preview__totals {
  display: flex; gap: 18px; flex-wrap: wrap;
  margin-top: 12px; font-size: 13px; color: var(--hf-ink-2);
}
.upload-preview__totals strong { color: var(--hf-ink); }

.upload-preview__actions {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 18px;
}
</style>
