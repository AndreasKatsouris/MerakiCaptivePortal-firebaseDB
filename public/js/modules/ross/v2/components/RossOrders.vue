<script setup>
// Orders — the D1 supplier book. Structure mirrors RossPeople.vue: back link,
// intro, location picker, then content. Three states: empty book, seed review,
// populated book.
//
// The seed review is a REVIEW SCREEN, never a silent bulk write. Everything the
// server derived is shown before anything is written, including the parts that
// would otherwise vanish quietly — items with no supplier, guessed units, and
// duplicate spellings of one company.
//
// No SweetAlert2 (silently no-ops on the Hi-Fi mount shell — PR #42). All text
// renders through {{ }}, which auto-escapes. No v-html anywhere.
import { onMounted, computed, ref, watch } from 'vue'
import { useOrdersStore } from '../orders-store.js'
import RossOrdersSupplierList from './RossOrdersSupplierList.vue'
import RossOrdersSupplierEditor from './RossOrdersSupplierEditor.vue'
import { HfIcon, HfButton, HfLogo, HfChip } from '/js/design-system/hifi/index.js'

const store = useOrdersStore()

onMounted(() => {
  if (!store.locations.length) store.loadLocations()
})

const locations = computed(() => store.locations)
const selectedLocationId = computed(() => store.selectedLocationId)
const suppliers = computed(() => store.suppliers)

const editingId = ref(null)   // null | 'new' | supplierId
const busyId = ref('')
const saving = ref(false)
const saveError = ref('')
const successMsg = ref('')

const editingSupplier = computed(() => (
  editingId.value && editingId.value !== 'new'
    ? suppliers.value.find((s) => s.supplierId === editingId.value) || null
    : null
))

// --- seed review rows ---------------------------------------------------------
// One row per supplier the owner will import. Rows start 1:1 with the derived
// names and collapse when the owner merges a duplicate group. `sourceNames` is
// what the server must recognise; `name` is what gets stored, so renaming is
// free but the source must always be something the server itself derived.
const rows = ref([])

function rowsFromPreview(preview) {
  if (!preview?.suppliers) return []
  return preview.suppliers.map((s) => ({
    key: s.mergeKey ? `${s.mergeKey}::${s.name}` : s.name,
    name: s.name,
    sourceNames: [s.name],
    itemCount: s.itemCount || 0,
    ticked: true,
  }))
}

watch(() => store.seedPreview, (p) => { rows.value = rowsFromPreview(p) })

const tickedCount = computed(() => rows.value.filter((r) => r.ticked).length)
const canCommit = computed(() => (
  tickedCount.value > 0 && rows.value.every((r) => !r.ticked || r.name.trim().length > 0)
))

// Groups still worth offering a merge for: those whose members are all still
// present as separate rows. Once merged, the group disappears from the prompt.
const openMergeGroups = computed(() => store.seedDuplicateGroups.filter((g) => (
  g.names.every((n) => rows.value.some((r) => r.sourceNames.length === 1 && r.sourceNames[0] === n))
)))

function mergeGroup(group) {
  const kept = rows.value.filter((r) => !(r.sourceNames.length === 1 && group.names.includes(r.sourceNames[0])))
  const merged = {
    key: `merged::${group.mergeKey}`,
    name: group.suggestedName,
    sourceNames: [...group.names],
    itemCount: group.itemCount,
    ticked: true,
  }
  rows.value = [merged, ...kept]
}

function tickAll(value) {
  rows.value = rows.value.map((r) => ({ ...r, ticked: value }))
}

function formatSaDate(ts) {
  if (!Number.isFinite(ts)) return 'an earlier count'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

const seedHeadline = computed(() => {
  const p = store.seedPreview
  if (!p) return ''
  const items = (p.items?.length || 0) + (p.unassigned?.itemCount || 0)
  return `From your stock count of ${formatSaDate(p.sourceTimestamp)} — `
    + `${p.suppliers.length} supplier${p.suppliers.length === 1 ? '' : 's'}, ${items} items.`
})

// --- actions ------------------------------------------------------------------
function openCreate() { editingId.value = 'new'; saveError.value = ''; successMsg.value = '' }
function openEdit(id) { editingId.value = id; saveError.value = ''; successMsg.value = '' }
function cancelEdit() { editingId.value = null; saveError.value = '' }

async function onSave({ supplier }) {
  saving.value = true
  saveError.value = ''
  const ok = await store.saveSupplier({
    locationId: selectedLocationId.value,
    supplierId: editingId.value === 'new' ? undefined : editingId.value,
    supplier,
  })
  saving.value = false
  if (ok) cancelEdit()
  else saveError.value = store.error || 'Could not save the supplier.'
}

async function onArchive(supplierId) {
  busyId.value = supplierId
  await store.archiveSupplier({ locationId: selectedLocationId.value, supplierId })
  busyId.value = ''
}

async function startImport() {
  successMsg.value = ''
  await store.loadSeedPreview(selectedLocationId.value)
}

async function confirmImport() {
  const selections = rows.value
    .filter((r) => r.ticked)
    .map((r) => ({ name: r.name.trim(), sourceNames: r.sourceNames }))
  saving.value = true
  const out = await store.commitSeed({ locationId: selectedLocationId.value, selections })
  saving.value = false
  if (out) {
    successMsg.value = `Imported ${out.suppliersCreated} supplier`
      + `${out.suppliersCreated === 1 ? '' : 's'} and ${out.productsCreated} product`
      + `${out.productsCreated === 1 ? '' : 's'}.`
  }
}

function backToHome() {
  if (typeof window === 'undefined') return
  window.history.pushState({}, '', '/ross.html')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

watch(selectedLocationId, () => {
  cancelEdit()
  busyId.value = ''
  successMsg.value = ''
})
</script>

<template>
  <div class="ord">
    <header class="ord__head">
      <button class="ord__back" @click="backToHome">
        <HfIcon name="arrow" :size="14" />
        <span>Back to Ross</span>
      </button>
      <div class="ord__head-meta">
        <HfLogo :size="18" />
        <span class="hf-mono ord__head-mono">orders · supplier book</span>
      </div>
    </header>

    <main class="ord__main">
      <section class="ord__intro">
        <div class="hf-eyebrow">
          <HfIcon name="box" :size="11" color="var(--hf-accent)" />
          Orders
        </div>
        <h1 class="ord__title">
          Who you buy from,<br />
          <span class="ord__title-italic">and what they sell you.</span>
        </h1>
        <p class="ord__lead">
          Your supplier book lives here. Build it from a stock count you've already
          uploaded, or add suppliers by hand — then Ross can turn it into orders.
        </p>
      </section>

      <!-- Location picker -->
      <section class="ord__panel">
        <header class="ord__panel-head">
          <h2 class="ord__panel-title">Location</h2>
          <span v-if="store.locationsLoading" class="hf-mono ord__panel-sub">loading…</span>
          <span v-else-if="store.locationsError" class="hf-mono ord__panel-sub ord__panel-sub--err">
            {{ store.locationsError }}
          </span>
          <span v-else class="hf-mono ord__panel-sub">suppliers are scoped per location</span>
        </header>

        <div v-if="!store.locationsLoading && locations.length === 0" class="ord__empty-loc">
          You don't have any locations linked to your account yet.
        </div>
        <div v-else-if="!store.locationsLoading" class="ord__loc-grid">
          <button
            v-for="loc in locations" :key="loc.id"
            class="ord__loc-pill"
            :class="{ 'is-active': loc.id === selectedLocationId }"
            @click="store.selectLocation(loc.id)"
          >{{ loc.name }}</button>
        </div>
      </section>

      <section v-if="selectedLocationId" class="ord__panel">
        <header class="ord__panel-head">
          <h2 class="ord__panel-title">Suppliers</h2>
          <span class="hf-mono ord__panel-sub">
            {{ suppliers.length }} supplier{{ suppliers.length === 1 ? '' : 's' }}
            at {{ store.selectedLocation?.name || selectedLocationId }}
          </span>
        </header>

        <div v-if="successMsg" class="ord__banner ord__banner--ok">
          <HfIcon name="check" :size="12" />
          <span>{{ successMsg }}</span>
        </div>
        <div v-if="store.error" class="ord__banner ord__banner--err">
          <HfIcon name="x" :size="12" />
          <span>{{ store.error }}</span>
        </div>

        <!-- ============ SEED REVIEW ============ -->
        <div v-if="store.seedPreview" class="ord__review">
          <div class="ord__review-head">
            <h3 class="ord__review-title">Review before importing</h3>
            <p class="ord__review-sub">{{ seedHeadline }}</p>
          </div>

          <!-- Things that would otherwise vanish quietly -->
          <div v-if="store.seedPreview.unassigned.itemCount > 0" class="ord__notice">
            <HfIcon name="alert" :size="12" />
            <span>
              {{ store.seedPreview.unassigned.itemCount }} items have no supplier in your
              stock file. They won't be imported — you can add them to a supplier by hand later.
            </span>
          </div>
          <div v-if="store.seedPreview.unitDefaultedCount > 0" class="ord__notice">
            <HfIcon name="alert" :size="12" />
            <span>
              {{ store.seedPreview.unitDefaultedCount }} items had no unit in your stock file
              and will be imported as “ea”. You can correct them per supplier afterwards.
            </span>
          </div>
          <div v-if="store.seedPreview.truncated" class="ord__notice">
            <HfIcon name="alert" :size="12" />
            <span>Only the first 2,000 items of that count were read.</span>
          </div>

          <!-- Merge prompts -->
          <div v-for="g in openMergeGroups" :key="g.mergeKey" class="ord__merge">
            <div class="ord__merge-body">
              <span class="ord__merge-lead">These look like the same supplier:</span>
              <span class="hf-mono ord__merge-names">{{ g.names.join(' · ') }}</span>
            </div>
            <HfButton variant="ghost" @click="mergeGroup(g)">Merge into one</HfButton>
          </div>

          <div class="ord__review-tools">
            <span class="hf-mono ord__panel-sub">{{ tickedCount }} of {{ rows.length }} selected</span>
            <div class="ord__review-tool-btns">
              <HfButton variant="ghost" @click="tickAll(true)">Select all</HfButton>
              <HfButton variant="ghost" @click="tickAll(false)">Select none</HfButton>
            </div>
          </div>

          <ul class="ord__review-rows">
            <li v-for="r in rows" :key="r.key" class="ord__review-row">
              <input
                type="checkbox"
                class="ord__check"
                :checked="r.ticked"
                :aria-label="`Import ${r.name}`"
                @change="r.ticked = $event.target.checked"
              />
              <input
                v-model="r.name"
                class="ord__review-name"
                :disabled="!r.ticked"
                aria-label="Supplier name"
              />
              <span class="hf-mono ord__review-count">{{ r.itemCount }} items</span>
              <HfChip v-if="r.sourceNames.length > 1" tone="default">
                merged from {{ r.sourceNames.length }}
              </HfChip>
            </li>
          </ul>

          <div class="ord__review-actions">
            <HfButton variant="ghost" :disabled="saving" @click="store.clearSeedPreview()">Cancel</HfButton>
            <HfButton variant="solid" :disabled="!canCommit || saving" @click="confirmImport">
              {{ saving ? 'Importing…' : `Import ${tickedCount} supplier${tickedCount === 1 ? '' : 's'}` }}
            </HfButton>
          </div>
        </div>

        <!-- ============ EMPTY BOOK ============ -->
        <div
          v-else-if="!store.loading && suppliers.length === 0 && !editingId"
          class="ord__empty"
        >
          <span class="hf-eyebrow">No suppliers yet</span>
          <p class="ord__empty-msg">Two ways to start your book.</p>
          <div class="ord__doors">
            <div class="ord__door">
              <h4 class="ord__door-title">Import from my stock count</h4>
              <p class="ord__door-msg">
                Reads the suppliers already named in your latest food-cost upload.
                Nothing is saved until you review it.
              </p>
              <HfButton
                variant="solid"
                :disabled="store.seedLoading || store.seedUnavailable"
                @click="startImport"
              >{{ store.seedLoading ? 'Reading…' : 'Import from stock count' }}</HfButton>
              <p v-if="store.seedUnavailable" class="ord__door-note">
                No stock count found for this location yet.
              </p>
            </div>
            <div class="ord__door">
              <h4 class="ord__door-title">Add a supplier</h4>
              <p class="ord__door-msg">Type one in by hand. You can always import later.</p>
              <HfButton variant="ghost" @click="openCreate">Add a supplier</HfButton>
            </div>
          </div>
        </div>

        <!-- ============ POPULATED BOOK ============ -->
        <template v-else>
          <div v-if="!editingId" class="ord__actions-row">
            <HfButton variant="solid" @click="openCreate">
              <template #leading><HfIcon name="plus" :size="13" /></template>
              Add supplier
            </HfButton>
            <HfButton
              v-if="suppliers.length > 0"
              variant="ghost"
              :disabled="store.seedLoading || store.seedUnavailable"
              @click="startImport"
            >{{ store.seedLoading ? 'Reading…' : 'Import from stock count' }}</HfButton>
          </div>

          <RossOrdersSupplierEditor
            v-if="editingId"
            :supplier="editingSupplier"
            :saving="saving"
            :error="saveError"
            @save="onSave"
            @cancel="cancelEdit"
          />

          <div v-if="store.needsEmailCount > 0" class="ord__banner ord__banner--warn">
            <HfIcon name="alert" :size="12" />
            <span>
              {{ store.needsEmailCount }} supplier{{ store.needsEmailCount === 1 ? '' : 's' }}
              still need an email address before Ross can send their orders.
            </span>
          </div>

          <div v-if="store.loading" class="ord__state">
            <span class="hf-eyebrow">Loading suppliers…</span>
          </div>
          <RossOrdersSupplierList
            v-else-if="suppliers.length > 0"
            :suppliers="suppliers"
            :busy-id="busyId"
            @edit="openEdit"
            @archive="onArchive"
          />
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
.ord { min-height: 100vh; background: var(--hf-bg); color: var(--hf-ink); }
.ord__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px; border-bottom: 1px solid var(--hf-line);
}
.ord__back {
  display: inline-flex; align-items: center; gap: 6px; background: none; border: none;
  color: var(--hf-ink-2); cursor: pointer; font-size: 13px; padding: 4px 6px; border-radius: 6px;
}
.ord__back:hover { color: var(--hf-ink); }
.ord__head-meta { display: inline-flex; align-items: center; gap: 8px; }
.ord__head-mono { font-size: 11px; color: var(--hf-ink-3); }
.ord__main { max-width: 900px; margin: 0 auto; padding: 32px 24px 64px; }
.ord__intro { margin-bottom: 32px; }
.ord__title { font-size: 30px; line-height: 1.2; margin: 12px 0; font-weight: 600; }
.ord__title-italic { font-family: var(--hf-font-serif, serif); font-style: italic; font-weight: 400; }
.ord__lead { color: var(--hf-ink-2); font-size: 14px; line-height: 1.6; max-width: 60ch; margin: 0; }
.ord__panel {
  border: 1px solid var(--hf-line); border-radius: var(--hf-radius-lg, 14px);
  padding: 20px; margin-bottom: 20px; background: var(--hf-surface);
}
.ord__panel-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; flex-wrap: wrap; margin-bottom: 14px;
}
.ord__panel-title { font-size: 16px; font-weight: 600; margin: 0; }
.ord__panel-sub { font-size: 11px; color: var(--hf-ink-3); }
.ord__panel-sub--err { color: var(--hf-danger, #c0392b); }
.ord__empty-loc { font-size: 13px; color: var(--hf-ink-3); }
.ord__loc-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.ord__loc-pill {
  border: 1px solid var(--hf-line); background: transparent; color: var(--hf-ink-2);
  border-radius: 999px; padding: 6px 14px; font-size: 13px; cursor: pointer;
}
.ord__loc-pill.is-active { background: var(--hf-accent); border-color: var(--hf-accent); color: var(--hf-on-accent, #fff); }
.ord__actions-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.ord__banner {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border-radius: 8px; font-size: 13px; margin-bottom: 14px;
}
.ord__banner--ok { background: var(--hf-ok-soft, rgba(39, 174, 96, 0.09)); color: var(--hf-ok, #1e8449); }
.ord__banner--err { background: var(--hf-danger-soft, rgba(192, 57, 43, 0.08)); color: var(--hf-danger, #c0392b); }
.ord__banner--warn { background: var(--hf-warn-soft, rgba(230, 162, 60, 0.12)); color: var(--hf-warn, #b9770e); }
.ord__state { padding: 20px 0; text-align: center; }
.ord__empty { padding: 12px 0; }
.ord__empty-msg { color: var(--hf-ink-2); font-size: 14px; margin: 8px 0 18px; }
.ord__doors { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
.ord__door { border: 1px solid var(--hf-line); border-radius: var(--hf-radius-md, 10px); padding: 16px; }
.ord__door-title { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
.ord__door-msg { margin: 0 0 14px; font-size: 13px; color: var(--hf-ink-3); line-height: 1.5; }
.ord__door-note { margin: 10px 0 0; font-size: 12px; color: var(--hf-ink-3); }
.ord__review { border: 1px solid var(--hf-accent); border-radius: var(--hf-radius-md, 10px); padding: 16px; }
.ord__review-head { margin-bottom: 14px; }
.ord__review-title { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
.ord__review-sub { margin: 0; font-size: 13px; color: var(--hf-ink-2); }
.ord__notice {
  display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; margin-bottom: 10px;
  border-radius: 8px; font-size: 13px; line-height: 1.5;
  background: var(--hf-warn-soft, rgba(230, 162, 60, 0.12)); color: var(--hf-warn, #b9770e);
}
.ord__merge {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  border: 1px dashed var(--hf-line); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px;
}
.ord__merge-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ord__merge-lead { font-size: 13px; color: var(--hf-ink-2); }
.ord__merge-names { font-size: 12px; color: var(--hf-ink-3); }
.ord__review-tools {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap; margin: 14px 0 8px;
}
.ord__review-tool-btns { display: flex; gap: 6px; }
.ord__review-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ord__review-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ord__check { width: 16px; height: 16px; accent-color: var(--hf-accent); flex-shrink: 0; }
.ord__review-name {
  flex: 1 1 200px; min-width: 0; border: 1px solid var(--hf-line); border-radius: 6px;
  padding: 6px 10px; font-size: 13px; background: var(--hf-surface); color: var(--hf-ink);
}
.ord__review-name:disabled { opacity: 0.5; }
.ord__review-count { font-size: 11px; color: var(--hf-ink-3); flex-shrink: 0; }
.ord__review-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
@media (max-width: 640px) {
  .ord__main { padding: 24px 16px 48px; }
  .ord__title { font-size: 24px; }
  .ord__review-actions { flex-direction: column-reverse; }
}
</style>
