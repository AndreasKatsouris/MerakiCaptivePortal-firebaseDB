<script setup>
// Template editor — superAdmin-only inline editor for ROSS templates.
// Mounts under the Templates section header. Two modes:
//
//  - mode === 'create'  → rossCreateTemplate
//  - mode === 'edit'    → rossUpdateTemplate (allowedFields = name,
//    category, description, recurrence, daysBeforeAlert, subtasks, tags)
//
// Templates are the *canonical* policy — workflows are instantiations
// of them per location. So unlike the workflow editor's edit mode,
// every field here is editable: changing the template's recurrence /
// category propagates to future activations but does NOT retroactively
// touch live workflows. A future PR may surface that propagation
// caveat to the user; for now the help copy makes it explicit.

import { computed, ref, watch } from 'vue'
import {
  usePlaybookStore, VALID_CATEGORIES, VALID_RECURRENCES,
} from '../playbook-store.js'
import { HfIcon, HfButton, HfInput } from '/js/design-system/hifi/index.js'
import RossPlaybookSubtaskRow from './RossPlaybookSubtaskRow.vue'

const store = usePlaybookStore()

// Generate a stable id for in-form subtask rows. v-for keyed on array
// index breaks when rows are reordered: focus, half-typed values, and
// component local state stick to the wrong row after a splice. _uid is
// stripped before the server payload is built.
function newUid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const mode = computed(() => {
  if (store.editingTemplateId === 'new') return 'create'
  if (store.editingTemplateId) return 'edit'
  return null
})

const editingTemplate = computed(() => {
  if (mode.value !== 'edit') return null
  // Match either `templateId` (canonical, server seed) or legacy `id`.
  return store.templates.find((t) =>
    (t.templateId || t.id) === store.editingTemplateId,
  ) || null
})

function blankForm() {
  return {
    name: '',
    description: '',
    category: 'operations',
    recurrence: 'weekly',
    daysBeforeAlert: [7, 1],
    subtasks: [],          // [{ title, daysOffset, order }]
    tags: [],              // string[]
  }
}
const form = ref(blankForm())

// Hydrate when the editor opens for a different entity.
watch(
  () => [mode.value, store.editingTemplateId],
  () => {
    if (!mode.value) return
    if (mode.value === 'edit' && editingTemplate.value) {
      const t = editingTemplate.value
      // Subtasks live under `subtasks` server-side. Defensive `tasks`
      // fallback covers a stale-cache edge during rollouts.
      const subs = Array.isArray(t.subtasks) ? t.subtasks
        : Array.isArray(t.tasks) ? t.tasks : []
      form.value = {
        name: t.name || '',
        description: t.description || '',
        category: t.category || 'operations',
        recurrence: t.recurrence || 'weekly',
        daysBeforeAlert: Array.isArray(t.daysBeforeAlert) ? [...t.daysBeforeAlert] : [7, 1],
        subtasks: subs.map((s, i) => ({
          _uid: newUid(),
          title: s.title || '',
          daysOffset: Number.isFinite(Number(s.daysOffset)) ? Number(s.daysOffset) : 0,
          order: s.order || i + 1,
        })),
        tags: Array.isArray(t.tags) ? [...t.tags] : [],
      }
    } else {
      form.value = blankForm()
    }
  },
  { immediate: true },
)

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

// --- Subtasks -----------------------------------------------------
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

// --- Tags (free-text, comma-or-enter to commit) -------------------
const tagDraft = ref('')
function commitTag() {
  const v = tagDraft.value.trim()
  if (!v) return
  if (form.value.tags.includes(v)) {
    tagDraft.value = ''
    return
  }
  form.value = { ...form.value, tags: [...form.value.tags, v] }
  tagDraft.value = ''
}
function removeTag(tag) {
  form.value = {
    ...form.value,
    tags: form.value.tags.filter((t) => t !== tag),
  }
}
function tagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    commitTag()
  }
}

// --- Validation ---------------------------------------------------
const errors = computed(() => {
  const out = {}
  if (!form.value.name.trim()) out.name = 'Required'
  if (!VALID_CATEGORIES.includes(form.value.category)) out.category = 'Invalid'
  if (!VALID_RECURRENCES.includes(form.value.recurrence)) out.recurrence = 'Invalid'
  // An empty alert array silently disables every reminder for the
  // template. Surface it as a form error rather than letting the user
  // ship a no-alert policy by accident.
  if (!form.value.daysBeforeAlert.some((d) => Number.isInteger(d) && d > 0)) {
    out.daysBeforeAlert = 'Pick at least one alert day'
  }
  return out
})
const formValid = computed(() => Object.keys(errors.value).length === 0)

function buildPayload() {
  // Server filters allowedFields, but trim/normalise here so the payload
  // matches the canonical shape the read view expects.
  return {
    name: form.value.name.trim(),
    category: form.value.category,
    description: form.value.description.trim() || '',
    recurrence: form.value.recurrence,
    daysBeforeAlert: form.value.daysBeforeAlert.filter((d) => Number.isInteger(d) && d > 0),
    // _uid is form-only — strip before the round trip.
    subtasks: form.value.subtasks
      .filter((s) => s.title && s.title.trim())
      .map((s, i) => ({
        title: s.title.trim(),
        daysOffset: Number.isFinite(Number(s.daysOffset)) ? Number(s.daysOffset) : 0,
        order: i + 1,
      })),
    tags: form.value.tags,
  }
}

async function save() {
  if (!formValid.value) return
  const payload = buildPayload()
  if (mode.value === 'edit') {
    await store.updateTemplate(store.editingTemplateId, payload)
      .catch(() => { /* templateSaveError populated */ })
    return
  }
  await store.createTemplate(payload).catch(() => {})
}

const titleText = computed(() =>
  mode.value === 'edit' ? 'Edit template' : 'New template',
)

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
  <div v-if="mode" class="tpleditor">
    <header class="tpleditor__head">
      <h3 class="tpleditor__title">{{ titleText }}</h3>
      <button
        class="tpleditor__close"
        @click="store.closeTemplateEditor()"
        aria-label="Close template editor"
      >
        <HfIcon name="x" :size="14" />
      </button>
    </header>

    <p class="tpleditor__caption hf-mono">
      Templates are the canonical policy — workflows are instantiations
      per location. Editing a template updates future activations only;
      live workflows already running keep their original schedule.
    </p>

    <!-- Identity -->
    <div class="tpleditor__grid">
      <label class="tpleditor__field tpleditor__field--span2">
        <span class="hf-eyebrow">Name *</span>
        <HfInput v-model="form.name" placeholder="e.g. Daily opening checklist" />
        <span v-if="errors.name" class="tpleditor__field-err">{{ errors.name }}</span>
      </label>
      <label class="tpleditor__field tpleditor__field--span2">
        <span class="hf-eyebrow">Description</span>
        <HfInput
          v-model="form.description"
          placeholder="What this rule covers"
        />
      </label>

      <label class="tpleditor__field">
        <span class="hf-eyebrow">Category</span>
        <select v-model="form.category" class="tpleditor__select">
          <option v-for="c in categoryOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
      </label>

      <label class="tpleditor__field">
        <span class="hf-eyebrow">Recurrence</span>
        <select v-model="form.recurrence" class="tpleditor__select">
          <option v-for="r in recurrenceOptions" :key="r.id" :value="r.id">{{ r.label }}</option>
        </select>
      </label>
    </div>

    <!-- Alerts -->
    <div class="tpleditor__field">
      <span class="hf-eyebrow">Default alert days before due</span>
      <div class="tpleditor__chip-row">
        <button
          v-for="d in ALERT_OPTIONS" :key="d"
          class="tpleditor__chip"
          :class="{ 'is-active': form.daysBeforeAlert.includes(d) }"
          @click="toggleAlert(d)"
          type="button"
        >
          {{ d }}d
        </button>
      </div>
      <span v-if="errors.daysBeforeAlert" class="tpleditor__field-err">
        {{ errors.daysBeforeAlert }}
      </span>
    </div>

    <!-- Subtasks -->
    <div class="tpleditor__section">
      <h4 class="tpleditor__section-title">Tasks</h4>
      <p class="tpleditor__sub hf-mono">
        Each task becomes a checkbox in every workflow run. Day offset =
        days from due date (0 = due on the day, +1 = next day).
      </p>
      <ul v-if="form.subtasks.length" class="tpleditor__subtask-list">
        <RossPlaybookSubtaskRow
          v-for="(s, i) in form.subtasks"
          :key="s._uid"
          :subtask="s"
          :index="i"
          :total="form.subtasks.length"
          :disabled="store.templateSaving"
          @update="(patch) => updateSubtask(i, patch)"
          @remove="removeSubtask"
          @move="moveSubtask"
        />
      </ul>
      <div class="tpleditor__subtask-add">
        <HfButton variant="ghost" @click="addSubtask" :disabled="store.templateSaving">
          <template #leading><HfIcon name="plus" :size="13" /></template>
          Add task
        </HfButton>
      </div>
    </div>

    <!-- Tags -->
    <div class="tpleditor__field">
      <span class="hf-eyebrow">Tags</span>
      <div class="tpleditor__tag-row">
        <span
          v-for="t in form.tags" :key="t"
          class="tpleditor__tag hf-mono"
        >
          {{ t }}
          <button class="tpleditor__tag-remove" @click="removeTag(t)" aria-label="Remove tag">
            <HfIcon name="x" :size="10" />
          </button>
        </span>
        <HfInput
          v-model="tagDraft"
          @keydown="tagKey"
          @blur="commitTag"
          placeholder="add a tag, comma or enter"
          class="tpleditor__tag-input"
        />
      </div>
    </div>

    <!-- Error banner -->
    <div v-if="store.templateSaveError" class="tpleditor__error">
      <HfIcon name="x" :size="12" />
      <span>{{ store.templateSaveError }}</span>
    </div>

    <!-- Actions -->
    <div class="tpleditor__actions">
      <HfButton
        variant="ghost"
        @click="store.closeTemplateEditor()"
        :disabled="store.templateSaving"
      >
        Cancel
      </HfButton>
      <HfButton
        variant="solid"
        :disabled="!formValid || store.templateSaving"
        @click="save"
      >
        {{
          store.templateSaving ? 'Saving…'
          : mode === 'edit' ? 'Save changes'
          : 'Create template'
        }}
      </HfButton>
    </div>
  </div>
</template>

<style scoped>
.tpleditor {
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius);
  background: var(--hf-bg);
  padding: 18px 20px 20px;
  margin-bottom: 24px;
}
.tpleditor__head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 6px;
}
.tpleditor__title {
  font-family: var(--hf-font-display);
  font-size: 19px; font-weight: 400; margin: 0;
}
.tpleditor__close {
  background: transparent; border: 0; cursor: pointer; padding: 4px;
  color: var(--hf-muted);
}
.tpleditor__close:hover { color: var(--hf-fg); }

.tpleditor__caption {
  font-size: 11px;
  color: var(--hf-muted);
  margin: 0 0 16px;
  line-height: 1.5;
}

.tpleditor__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 16px;
}
@media (max-width: 600px) {
  .tpleditor__grid { grid-template-columns: 1fr; }
}
.tpleditor__field { display: flex; flex-direction: column; gap: 4px; }
.tpleditor__field--span2 { grid-column: 1 / -1; }
.tpleditor__field-err {
  font-size: 11px; color: var(--hf-warn, #c2410c);
  font-family: var(--hf-font-mono);
  margin-top: 2px;
}

.tpleditor__select {
  font: inherit;
  padding: 8px 10px;
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-sm, 4px);
  background: var(--hf-bg);
  color: var(--hf-fg);
}

.tpleditor__chip-row {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-top: 4px;
}
.tpleditor__chip {
  font: inherit;
  font-family: var(--hf-font-mono);
  font-size: 11px;
  padding: 4px 10px;
  border: 1px solid var(--hf-line);
  background: transparent;
  color: var(--hf-muted);
  border-radius: 999px;
  cursor: pointer;
}
.tpleditor__chip.is-active {
  border-color: var(--hf-fg);
  color: var(--hf-fg);
  background: var(--hf-fg-faint, rgba(0,0,0,0.04));
}

.tpleditor__section { margin: 16px 0; }
.tpleditor__section-title {
  font-family: var(--hf-font-display);
  font-size: 14px; font-weight: 400; margin: 0 0 4px;
}
.tpleditor__sub {
  font-size: 11px; color: var(--hf-muted); margin: 0 0 8px;
}
.tpleditor__subtask-list {
  list-style: none; padding: 0; margin: 0 0 8px;
}
.tpleditor__subtask-add { margin-top: 6px; }

.tpleditor__tag-row {
  display: flex; flex-wrap: wrap; gap: 6px;
  align-items: center;
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-sm, 4px);
  padding: 6px;
  background: var(--hf-bg);
}
.tpleditor__tag {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--hf-fg-faint, rgba(0,0,0,0.04));
  border: 1px solid var(--hf-line);
  padding: 2px 4px 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--hf-fg);
}
.tpleditor__tag-remove {
  background: transparent; border: 0; cursor: pointer;
  padding: 2px; color: var(--hf-muted);
  display: inline-flex; align-items: center;
}
.tpleditor__tag-remove:hover { color: var(--hf-fg); }
.tpleditor__tag-input {
  flex: 1 1 140px; min-width: 140px;
}

.tpleditor__error {
  display: flex; gap: 6px; align-items: center;
  background: var(--hf-warn-bg, #fef3c7);
  color: var(--hf-warn, #92400e);
  padding: 8px 10px;
  border: 1px solid var(--hf-warn-border, #f59e0b);
  border-radius: var(--hf-radius-sm, 4px);
  font-family: var(--hf-font-mono);
  font-size: 12px;
  margin-bottom: 12px;
}

.tpleditor__actions {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 16px;
}
</style>
