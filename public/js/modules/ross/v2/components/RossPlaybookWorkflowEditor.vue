<script setup>
// Inline editor for workflow create / edit / activate-from-template.
// Mounts under the panel header in RossPlaybook.vue (same anchor
// position as RossPeople's editor).
//
// Three modes, switched on store state:
//
//  - mode === 'create'          → custom workflow (rossCreateWorkflow)
//  - mode === 'edit'            → existing workflow (rossUpdateWorkflow)
//  - mode === 'activate'        → template instantiation (rossActivateWorkflow)
//
// EDIT MODE LIMITATION: rossUpdateWorkflow allowedFields are limited
// to name, notificationChannels, notifyPhone, notifyEmail,
// daysBeforeAlert, status. Category, recurrence, description,
// locations, and subtasks are NOT editable on an existing workflow —
// the form disables those fields and surfaces a passive caption. To
// change them the user must delete + recreate.
//
// ACTIVATE MODE: locations + nextDueDate + (optional) name override
// only. Subtasks come from the template; we don't expose a subtask
// editor. Recurrence + category come from the template too.

import { computed, ref, watch } from 'vue'
import {
  usePlaybookStore, VALID_CATEGORIES, VALID_RECURRENCES,
} from '../playbook-store.js'
import { HfIcon, HfButton, HfInput } from '/js/design-system/hifi/index.js'
import RossPlaybookSubtaskRow from './RossPlaybookSubtaskRow.vue'

const store = usePlaybookStore()

// Stable id for in-form subtask rows. Index keys lose row identity
// across reorders — local state (focus, half-typed input) can stick
// to the wrong row after a splice. Stripped before the server payload.
function newUid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const mode = computed(() => {
  if (store.activateTemplateId) return 'activate'
  if (store.editingWorkflowId === 'new') return 'create'
  if (store.editingWorkflowId) return 'edit'
  return null
})

const editingWorkflow = computed(() =>
  mode.value === 'edit'
    ? store.workflowById.get(store.editingWorkflowId) || null
    : null,
)

const activateTemplate = computed(() => {
  if (mode.value !== 'activate') return null
  // Match either `templateId` (canonical) or legacy `id`. rossGetTemplates
  // returns Object.values(...) so the document carries `templateId`; older
  // shapes sometimes had `id`.
  return store.templates.find((t) =>
    (t.templateId || t.id) === store.activateTemplateId,
  ) || null
})

// Tasks live under `subtasks` (server seed + rossCreateTemplate +
// rossActivateWorkflow). Same defensive `tasks` fallback as the parent.
const activateSubtasks = computed(() => {
  const t = activateTemplate.value
  if (!t) return []
  if (Array.isArray(t.subtasks)) return t.subtasks
  if (Array.isArray(t.tasks)) return t.tasks
  return []
})

// Form draft. Field meanings match the rossCreateWorkflow contract.
function blankForm() {
  return {
    name: '',
    description: '',
    category: 'operations',
    recurrence: 'weekly',
    customInterval: null,         // unused unless extended later
    locationIds: [],               // selected location ids
    nextDueDate: '',               // YYYY-MM-DD; converted to ms on send
    daysBeforeAlert: [7, 1],       // default: 7d + 1d before
    notifyPhone: '',
    notifyEmail: '',
    subtasks: [],                  // [{ title, daysOffset, order }]
  }
}
const form = ref(blankForm())

// Hydrate the form whenever the editor opens for a new entity.
watch(
  () => [mode.value, store.editingWorkflowId, store.activateTemplateId],
  () => {
    if (!mode.value) return
    if (mode.value === 'edit' && editingWorkflow.value) {
      const w = editingWorkflow.value
      form.value = {
        name: w.name || '',
        description: w.description || '',
        category: w.category || 'operations',
        recurrence: w.recurrence || 'weekly',
        customInterval: w.customInterval || null,
        locationIds: [w.locationId].filter(Boolean),
        nextDueDate: w.nextDueDate ? toDateInput(w.nextDueDate) : '',
        daysBeforeAlert: Array.isArray(w.daysBeforeAlert) ? [...w.daysBeforeAlert] : [7, 1],
        notifyPhone: w.notifyPhone || '',
        notifyEmail: w.notifyEmail || '',
        subtasks: [],
      }
    } else if (mode.value === 'activate' && activateTemplate.value) {
      const t = activateTemplate.value
      form.value = {
        ...blankForm(),
        name: t.name || '',
        description: t.description || '',
        category: t.category || 'operations',
        recurrence: t.recurrence || 'weekly',
        daysBeforeAlert: Array.isArray(t.daysBeforeAlert) ? [...t.daysBeforeAlert] : [7, 1],
      }
    } else {
      form.value = blankForm()
    }
  },
  { immediate: true },
)

// Convert an ms-epoch timestamp (or ISO string) to YYYY-MM-DD for the
// date input. Falls back to '' on bad input.
function toDateInput(value) {
  const d = new Date(typeof value === 'number' ? value : Date.parse(value))
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fromDateInput(value) {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

// --- Locations ----------------------------------------------------
const isEditMode = computed(() => mode.value === 'edit')
function toggleLocation(id) {
  if (isEditMode.value) return // locked in edit mode
  const set = new Set(form.value.locationIds)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  form.value = { ...form.value, locationIds: Array.from(set) }
}

// --- Days-before-alert chips --------------------------------------
const ALERT_OPTIONS = [30, 14, 7, 3, 1]
function toggleAlert(d) {
  const set = new Set(form.value.daysBeforeAlert)
  if (set.has(d)) set.delete(d)
  else set.add(d)
  form.value = {
    ...form.value,
    daysBeforeAlert: Array.from(set).sort((a, b) => b - a),
  }
}

// --- Subtasks (create mode only) ----------------------------------
function addSubtask() {
  form.value = {
    ...form.value,
    subtasks: [
      ...form.value.subtasks,
      { _uid: newUid(), title: '', daysOffset: 0, order: form.value.subtasks.length + 1 },
    ],
  }
}
function updateSubtask(index, patch) {
  const next = form.value.subtasks.slice()
  next[index] = patch
  form.value = { ...form.value, subtasks: next }
}
function removeSubtask(index) {
  const next = form.value.subtasks.slice()
  next.splice(index, 1)
  // Re-number `order` to stay 1-based contiguous after removal.
  form.value = {
    ...form.value,
    subtasks: next.map((s, i) => ({ ...s, order: i + 1 })),
  }
}
function moveSubtask({ from, to }) {
  if (to < 0 || to >= form.value.subtasks.length) return
  const next = form.value.subtasks.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  form.value = {
    ...form.value,
    subtasks: next.map((s, i) => ({ ...s, order: i + 1 })),
  }
}

// --- Validation + submit ------------------------------------------
// Loose E.164 check: + followed by 7-15 digits. Twilio/SendGrid handle
// the strict country-code validation; this just catches obvious typos
// before the round trip.
const E164_LIKE = /^\+\d{7,15}$/

const errors = computed(() => {
  const out = {}
  if (!form.value.name.trim()) out.name = 'Required'
  if (!VALID_CATEGORIES.includes(form.value.category)) out.category = 'Invalid'
  if (!VALID_RECURRENCES.includes(form.value.recurrence)) out.recurrence = 'Invalid'
  if (!isEditMode.value && form.value.locationIds.length === 0) {
    out.locations = 'Pick at least one location'
  }
  if (!isEditMode.value && !form.value.nextDueDate) {
    out.nextDueDate = 'Required'
  }
  const phone = form.value.notifyPhone.trim()
  if (phone && !E164_LIKE.test(phone)) {
    out.notifyPhone = 'Use international format: +27 …'
  }
  // Empty alert array silently disables every reminder. Surface as a
  // form error rather than letting a no-alert workflow ship.
  if (!form.value.daysBeforeAlert.some((d) => Number.isInteger(d) && d > 0)) {
    out.daysBeforeAlert = 'Pick at least one alert day'
  }
  return out
})
const formValid = computed(() => Object.keys(errors.value).length === 0)

async function save() {
  if (!formValid.value) return

  if (mode.value === 'edit') {
    // Only the allowedFields (name, daysBeforeAlert, notifyPhone, notifyEmail).
    // notificationChannels and status are managed elsewhere (status =
    // pause/resume on the card; channels stay default until 4d.2).
    await store.updateWorkflow(store.editingWorkflowId, {
      name: form.value.name.trim(),
      notifyPhone: form.value.notifyPhone.trim() || null,
      notifyEmail: form.value.notifyEmail.trim() || null,
      daysBeforeAlert: form.value.daysBeforeAlert,
    }).catch(() => { /* saveError already populated */ })
    return
  }

  // Locations: build aligned name array so the server doesn't fall
  // back to id-as-name. Match indices exactly.
  const locationNames = form.value.locationIds.map((id) =>
    store.locations.find((l) => l.id === id)?.name || id,
  )

  if (mode.value === 'activate') {
    await store.activateTemplate({
      templateId: store.activateTemplateId,
      locationIds: form.value.locationIds,
      locationNames,
      name: form.value.name.trim() || undefined,
      description: form.value.description.trim() || undefined,
      nextDueDate: fromDateInput(form.value.nextDueDate),
      daysBeforeAlert: form.value.daysBeforeAlert,
      notifyPhone: form.value.notifyPhone.trim() || null,
      notifyEmail: form.value.notifyEmail.trim() || null,
    }).catch(() => {})
    return
  }

  // Create custom workflow — also passes subtasks.
  await store.createWorkflow({
    name: form.value.name.trim(),
    description: form.value.description.trim() || null,
    category: form.value.category,
    recurrence: form.value.recurrence,
    locationIds: form.value.locationIds,
    locationNames,
    nextDueDate: fromDateInput(form.value.nextDueDate),
    subtasks: form.value.subtasks
      .filter((s) => s.title && s.title.trim())
      .map((s, i) => ({
        title: s.title.trim(),
        daysOffset: Number.isFinite(Number(s.daysOffset)) ? Number(s.daysOffset) : 0,
        order: i + 1,
      })),
    daysBeforeAlert: form.value.daysBeforeAlert,
    notifyPhone: form.value.notifyPhone.trim() || null,
    notifyEmail: form.value.notifyEmail.trim() || null,
  }).catch(() => {})
}

const titleText = computed(() => {
  if (mode.value === 'edit') return 'Edit workflow'
  if (mode.value === 'activate') return `Activate template: ${activateTemplate.value?.name || ''}`
  return 'New workflow'
})

const recurrenceOptions = VALID_RECURRENCES.map((r) => ({
  id: r,
  label: r === 'once' ? 'one-off' : r,
}))
const categoryOptions = [
  { id: 'compliance', label: 'Compliance' },
  { id: 'operations', label: 'Operations' },
  { id: 'finance', label: 'Finance' },
  { id: 'hr', label: 'People & HR' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'growth', label: 'Growth' },
]
</script>

<template>
  <div v-if="mode" class="wfeditor">
    <header class="wfeditor__head">
      <h3 class="wfeditor__title">{{ titleText }}</h3>
      <button class="wfeditor__close" @click="store.closeEditor()" aria-label="Close editor">
        <HfIcon name="x" :size="14" />
      </button>
    </header>

    <p v-if="isEditMode" class="wfeditor__caption hf-mono">
      Editing applies to name, alerts, and notifications only. To change
      schedule, locations, or tasks, delete this workflow and recreate it.
    </p>
    <p v-else-if="mode === 'activate'" class="wfeditor__caption hf-mono">
      Tasks come from the template ({{ activateSubtasks.length }}).
      Pick locations and a start date — Ross handles the rest.
    </p>

    <!-- Activate-mode preview: read-only list of the template's subtasks
         so the user can verify the policy before committing. Day offset
         is shown to make the schedule explicit. -->
    <div v-if="mode === 'activate' && activateSubtasks.length" class="wfeditor__preview">
      <h4 class="wfeditor__section-title">Template tasks</h4>
      <ol class="wfeditor__preview-list">
        <li
          v-for="(s, i) in activateSubtasks" :key="i"
          class="wfeditor__preview-item"
        >
          <span class="wfeditor__preview-num hf-mono">{{ i + 1 }}.</span>
          <span class="wfeditor__preview-title">{{ s.title || 'Untitled task' }}</span>
          <span v-if="Number(s.daysOffset) !== 0" class="hf-mono wfeditor__preview-offset">
            {{ Number(s.daysOffset) > 0 ? '+' : '' }}{{ s.daysOffset }}d
          </span>
        </li>
      </ol>
    </div>
    <div v-else-if="mode === 'activate' && !activateSubtasks.length" class="wfeditor__preview wfeditor__preview--warn hf-mono">
      This template has no tasks defined. Activating it will create an empty
      workflow at the selected location(s). Pick a different template, or
      cancel and edit this template (Phase 4d.2) before activating.
    </div>

    <!-- Identity -->
    <div class="wfeditor__grid">
      <label class="wfeditor__field wfeditor__field--span2">
        <span class="hf-eyebrow">Name *</span>
        <HfInput v-model="form.name" placeholder="e.g. Daily opening checklist" />
      </label>
      <label class="wfeditor__field wfeditor__field--span2">
        <span class="hf-eyebrow">
          Description
          <span v-if="isEditMode" class="wfeditor__locked-tag">locked</span>
        </span>
        <HfInput
          v-model="form.description"
          placeholder="What this rule covers"
          :disabled="isEditMode"
        />
      </label>

      <label class="wfeditor__field">
        <span class="hf-eyebrow">
          Category
          <span v-if="isEditMode || mode === 'activate'" class="wfeditor__locked-tag">locked</span>
        </span>
        <select
          v-model="form.category"
          class="wfeditor__select"
          :disabled="isEditMode || mode === 'activate'"
        >
          <option v-for="c in categoryOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
      </label>

      <label class="wfeditor__field">
        <span class="hf-eyebrow">
          Recurrence
          <span v-if="isEditMode || mode === 'activate'" class="wfeditor__locked-tag">locked</span>
        </span>
        <select
          v-model="form.recurrence"
          class="wfeditor__select"
          :disabled="isEditMode || mode === 'activate'"
        >
          <option v-for="r in recurrenceOptions" :key="r.id" :value="r.id">{{ r.label }}</option>
        </select>
      </label>
    </div>

    <!-- Locations + schedule -->
    <div class="wfeditor__section">
      <h4 class="wfeditor__section-title">
        Locations
        <span v-if="isEditMode" class="wfeditor__locked-tag">locked</span>
      </h4>
      <div v-if="store.locationsLoading" class="hf-mono wfeditor__sub">loading…</div>
      <div v-else-if="store.locationsError" class="hf-mono wfeditor__sub wfeditor__sub--err">
        {{ store.locationsError }}
      </div>
      <div v-else-if="!store.locations.length" class="hf-mono wfeditor__sub">
        No locations linked to your account.
      </div>
      <div v-else class="wfeditor__loc-grid">
        <button
          v-for="loc in store.locations" :key="loc.id"
          class="wfeditor__loc-pill"
          :class="{ 'is-active': form.locationIds.includes(loc.id), 'is-disabled': isEditMode }"
          @click="toggleLocation(loc.id)"
          type="button"
          :disabled="isEditMode"
        >
          {{ loc.name }}
        </button>
      </div>
      <p v-if="errors.locations" class="wfeditor__field-err">{{ errors.locations }}</p>
    </div>

    <div class="wfeditor__grid">
      <label class="wfeditor__field">
        <span class="hf-eyebrow">
          {{ mode === 'activate' ? 'Start date *' : 'Next due date *' }}
          <span v-if="isEditMode" class="wfeditor__locked-tag">locked</span>
        </span>
        <input
          v-model="form.nextDueDate"
          type="date"
          class="wfeditor__date"
          :disabled="isEditMode"
        />
        <span v-if="errors.nextDueDate" class="wfeditor__field-err">{{ errors.nextDueDate }}</span>
      </label>
      <div class="wfeditor__field">
        <span class="hf-eyebrow">Alert days before due</span>
        <div class="wfeditor__chip-row">
          <button
            v-for="d in ALERT_OPTIONS" :key="d"
            class="wfeditor__chip"
            :class="{ 'is-active': form.daysBeforeAlert.includes(d) }"
            @click="toggleAlert(d)"
            type="button"
          >
            {{ d }}d
          </button>
        </div>
        <span v-if="errors.daysBeforeAlert" class="wfeditor__field-err">
          {{ errors.daysBeforeAlert }}
        </span>
      </div>
    </div>

    <!-- Subtasks (create mode only) -->
    <div v-if="mode === 'create'" class="wfeditor__section">
      <h4 class="wfeditor__section-title">Tasks</h4>
      <p class="wfeditor__sub hf-mono">
        Each task lands as a checkbox in the run. Day offset = days from due date
        (0 means due on the day, +1 = next day, -1 = day before).
      </p>
      <ul v-if="form.subtasks.length" class="wfeditor__subtask-list">
        <RossPlaybookSubtaskRow
          v-for="(s, i) in form.subtasks"
          :key="s._uid || i"
          :subtask="s"
          :index="i"
          :total="form.subtasks.length"
          :disabled="store.saving"
          @update="(patch) => updateSubtask(i, patch)"
          @remove="removeSubtask"
          @move="moveSubtask"
        />
      </ul>
      <div class="wfeditor__subtask-add">
        <HfButton variant="ghost" @click="addSubtask" :disabled="store.saving">
          <template #leading><HfIcon name="plus" :size="13" /></template>
          Add task
        </HfButton>
      </div>
    </div>

    <!-- Notifications -->
    <div class="wfeditor__grid">
      <label class="wfeditor__field">
        <span class="hf-eyebrow">Notify phone</span>
        <HfInput v-model="form.notifyPhone" placeholder="+27 …" />
        <span v-if="errors.notifyPhone" class="wfeditor__field-err">{{ errors.notifyPhone }}</span>
      </label>
      <label class="wfeditor__field">
        <span class="hf-eyebrow">Notify email</span>
        <HfInput v-model="form.notifyEmail" type="email" placeholder="alerts@venue.co.za" />
      </label>
    </div>

    <!-- Error banner -->
    <div v-if="store.saveError" class="wfeditor__error">
      <HfIcon name="x" :size="12" />
      <span>{{ store.saveError }}</span>
    </div>

    <!-- Actions -->
    <div class="wfeditor__actions">
      <HfButton variant="ghost" @click="store.closeEditor()" :disabled="store.saving">
        Cancel
      </HfButton>
      <HfButton
        variant="solid"
        :disabled="!formValid || store.saving"
        @click="save"
      >
        {{
          store.saving ? 'Saving…'
          : mode === 'edit' ? 'Save changes'
          : mode === 'activate' ? 'Activate'
          : 'Create workflow'
        }}
      </HfButton>
    </div>
  </div>
</template>

<style scoped>
.wfeditor {
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius);
  background: var(--hf-bg);
  padding: 18px 20px 20px;
  margin-bottom: 24px;
}

.wfeditor__head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 6px;
}
.wfeditor__title {
  font-family: var(--hf-font-display);
  font-size: 19px; font-weight: 400; margin: 0;
}
.wfeditor__close {
  background: transparent; border: none; cursor: pointer;
  color: var(--hf-muted);
  padding: 4px;
}
.wfeditor__close:hover { color: var(--hf-ink); }

.wfeditor__caption {
  font-size: 11px;
  color: var(--hf-muted);
  margin: 0 0 14px;
  padding: 8px 10px;
  background: var(--hf-paper);
  border-left: 2px solid var(--hf-line-2);
  border-radius: 0 var(--hf-radius) var(--hf-radius) 0;
}

/* Activate-mode template preview */
.wfeditor__preview {
  margin: 0 0 14px;
  padding: 10px 12px;
  border: 1px solid var(--hf-line-2);
  border-radius: var(--hf-radius);
  background: var(--hf-paper);
}
.wfeditor__preview .wfeditor__section-title {
  margin-top: 0;
}
.wfeditor__preview-list {
  list-style: none;
  margin: 6px 0 0; padding: 0;
}
.wfeditor__preview-item {
  display: flex; align-items: baseline; gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  color: var(--hf-ink);
  border-bottom: 1px dashed var(--hf-line);
}
.wfeditor__preview-item:last-child { border-bottom: none; }
.wfeditor__preview-num {
  font-size: 11px;
  color: var(--hf-muted);
  min-width: 22px;
}
.wfeditor__preview-title { flex: 1; min-width: 0; }
.wfeditor__preview-offset {
  font-size: 11px;
  color: var(--hf-muted);
  letter-spacing: 0.04em;
}
.wfeditor__preview--warn {
  font-size: 11px;
  color: var(--hf-warn);
  background: rgba(212, 87, 47, 0.04);
  border-color: rgba(212, 87, 47, 0.25);
}

.wfeditor__grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin-top: 14px;
}
@media (max-width: 600px) { .wfeditor__grid { grid-template-columns: 1fr; } }

.wfeditor__field {
  display: flex; flex-direction: column; gap: 4px;
  min-width: 0;
}
.wfeditor__field--span2 { grid-column: 1 / -1; }

.wfeditor__select,
.wfeditor__date {
  font-family: var(--hf-font-body);
  font-size: 13px;
  padding: 8px 12px;
  border: 1px solid var(--hf-line-2);
  border-radius: var(--hf-radius);
  background: var(--hf-bg);
  color: var(--hf-ink);
}
.wfeditor__select:disabled,
.wfeditor__date:disabled {
  background: var(--hf-paper);
  color: var(--hf-muted);
  cursor: not-allowed;
}

.wfeditor__locked-tag {
  font-family: var(--hf-font-mono);
  font-size: 9px;
  color: var(--hf-muted);
  margin-left: 6px;
  padding: 1px 4px;
  border: 1px solid var(--hf-line);
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  vertical-align: middle;
}

.wfeditor__section {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed var(--hf-line);
}
.wfeditor__section-title {
  font-family: var(--hf-font-display);
  font-size: 14px; font-weight: 400;
  margin: 0 0 8px;
}
.wfeditor__sub {
  font-size: 11px; color: var(--hf-muted);
  margin: 0 0 10px;
}
.wfeditor__sub--err { color: var(--hf-warn); font-family: var(--hf-font-mono); }

.wfeditor__field-err {
  margin-top: 4px;
  font-family: var(--hf-font-mono);
  font-size: 11px;
  color: var(--hf-warn);
}

.wfeditor__loc-grid {
  display: flex; flex-wrap: wrap; gap: 8px;
}
.wfeditor__loc-pill {
  background: var(--hf-bg);
  border: 1px solid var(--hf-line-2);
  color: var(--hf-ink); cursor: pointer;
  padding: 6px 14px;
  border-radius: 999px;
  font-family: var(--hf-font-body);
  font-size: 13px;
  transition: background var(--hf-transition), color var(--hf-transition), border-color var(--hf-transition);
}
.wfeditor__loc-pill:hover:not(.is-disabled) { border-color: var(--hf-ink-2); }
.wfeditor__loc-pill.is-active {
  background: var(--hf-ink); color: var(--hf-bg);
  border-color: var(--hf-ink);
}
.wfeditor__loc-pill.is-disabled {
  cursor: not-allowed; opacity: 0.55;
}

.wfeditor__chip-row {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding-top: 4px;
}
.wfeditor__chip {
  background: var(--hf-paper);
  border: 1px solid var(--hf-line-2);
  color: var(--hf-ink); cursor: pointer;
  padding: 4px 10px;
  border-radius: 999px;
  font-family: var(--hf-font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
}
.wfeditor__chip:hover { border-color: var(--hf-ink-2); }
.wfeditor__chip.is-active {
  background: var(--hf-ink); color: var(--hf-bg);
  border-color: var(--hf-ink);
}

.wfeditor__subtask-list {
  list-style: none;
  margin: 6px 0 8px;
  padding: 0;
}
.wfeditor__subtask-add {
  margin-top: 8px;
}

.wfeditor__error {
  margin-top: 14px;
  padding: 8px 12px;
  background: rgba(212, 87, 47, 0.06);
  border: 1px solid rgba(212, 87, 47, 0.25);
  border-radius: var(--hf-radius);
  color: var(--hf-warn);
  font-family: var(--hf-font-mono);
  font-size: 12px;
  display: flex; align-items: center; gap: 8px;
}

.wfeditor__actions {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px dashed var(--hf-line);
}
</style>
