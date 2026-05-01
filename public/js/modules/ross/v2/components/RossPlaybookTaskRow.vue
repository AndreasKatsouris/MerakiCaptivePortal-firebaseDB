<script setup>
// One row in the workflow tasks editor. Owns its own draft state so
// the user can edit + cancel without round-tripping each keystroke.
// Type-switch clears stale inputConfig keys via defaultInputConfig.
//
// Save/Delete/Cancel are explicit (button-driven) — there is no
// autosave. Slide-down delete confirm strip mirrors PR #28's pattern.
//
// `task` may be a real task (with server `taskId`) or a draft for an
// add-task row (with `_uid` only). Parent controls which by passing
// `isDraft`.
import { computed, ref, watch } from 'vue'
import { HfInput, HfButton, HfIcon } from '/js/design-system/hifi/index.js'
import {
  INPUT_TYPE_OPTIONS, defaultInputConfig, validateInputConfig, hasConfigFields,
} from '../constants/input-types.js'
import RossPlaybookTaskConfigFields from './RossPlaybookTaskConfigFields.vue'

const props = defineProps({
  // Existing task (server-resident) OR draft (add-row).
  task:    { type: Object, required: true },
  index:   { type: Number, required: true },
  // True when this is the add-task draft (not yet saved). Hides Delete,
  // shows "Add" instead of "Save".
  isDraft: { type: Boolean, default: false },
  // Disable everything while another row is saving.
  disabled:{ type: Boolean, default: false },
  // Per-row error from store.taskRowErrors.
  rowError:{ type: String, default: '' },
})

const emit = defineEmits([
  'save',         // (taskData) — parent fires the CF + reloads
  'cancel',       // user cancelled add-row draft
  'delete',       // (taskId) — parent shows confirm + fires CF
])

// --- Draft state ---------------------------------------------------
function fromTask(t) {
  return {
    title: t.title || '',
    inputType: t.inputType || 'checkbox',
    inputConfig: (t.inputConfig && typeof t.inputConfig === 'object') ? { ...t.inputConfig } : {},
    required: t.required !== false,
  }
}

const draft = ref(fromTask(props.task))

// Re-hydrate when the underlying task changes (e.g. after store.load()).
// Compare by id+revision-marker to avoid resetting an open edit while
// the user is still typing — only re-hydrate on identity change.
const taskKey = computed(() => props.task.taskId || props.task._uid || props.index)
watch(taskKey, () => { draft.value = fromTask(props.task) })

// Type-switch: clear stale inputConfig keys so we don't ship min/max
// for a dropdown task (server stores verbatim — UI is the only guard).
function changeType(nextType) {
  if (nextType === draft.value.inputType) return
  draft.value = {
    ...draft.value,
    inputType: nextType,
    inputConfig: defaultInputConfig(nextType),
  }
}

function patchConfig(nextCfg) {
  draft.value = { ...draft.value, inputConfig: nextCfg }
}

// --- Validation ----------------------------------------------------
const titleError = computed(() => {
  if (!draft.value.title || !draft.value.title.trim()) return 'Title required'
  if (draft.value.title.length > 200) return 'Max 200 characters'
  return null
})
const configError = computed(() =>
  validateInputConfig(draft.value.inputType, draft.value.inputConfig),
)
const isValid = computed(() => !titleError.value && !configError.value)

// --- Save / cancel / delete ---------------------------------------
function commit() {
  if (!isValid.value) return
  emit('save', {
    title: draft.value.title.trim(),
    inputType: draft.value.inputType,
    inputConfig: draft.value.inputConfig,
    required: draft.value.required,
  })
}
function cancelDraft() {
  emit('cancel')
}

// Slide-down delete confirm — mirrors RossPlaybook.vue's workflow
// delete pattern. Only shown when `confirming` is true.
const confirming = ref(false)
function startDelete() { confirming.value = true }
function cancelDelete() { confirming.value = false }
function commitDelete() {
  emit('delete', props.task.taskId)
  // Parent decides whether to keep `confirming` open on error; we leave
  // it visible so the user sees the row error. Parent toggles by
  // unmounting on success.
}

const showConfig = computed(() => hasConfigFields(draft.value.inputType))
</script>

<template>
  <li class="taskrow" :class="{ 'is-draft': isDraft }">
    <div class="taskrow__head">
      <div class="taskrow__order hf-mono">{{ index + 1 }}</div>
      <div class="taskrow__title-row">
        <label class="taskrow__field taskrow__field--title">
          <span class="hf-eyebrow">Title</span>
          <HfInput
            v-model="draft.title"
            :disabled="disabled"
            placeholder="e.g. Check fridge temperature"
          />
          <span v-if="titleError" class="taskrow__field-err">{{ titleError }}</span>
        </label>
        <label class="taskrow__field taskrow__field--type">
          <span class="hf-eyebrow">Type</span>
          <select
            :value="draft.inputType"
            @change="changeType($event.target.value)"
            class="taskrow__select"
            :disabled="disabled"
          >
            <option v-for="o in INPUT_TYPE_OPTIONS" :key="o.id" :value="o.id">
              {{ o.label }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <RossPlaybookTaskConfigFields
      v-if="showConfig"
      :input-type="draft.inputType"
      :config="draft.inputConfig"
      :disabled="disabled"
      @update:config="patchConfig"
    />
    <p v-if="configError" class="taskrow__field-err taskrow__field-err--cfg">{{ configError }}</p>

    <div class="taskrow__meta">
      <label class="taskrow__check">
        <input type="checkbox" v-model="draft.required" :disabled="disabled" />
        <span class="hf-mono">Required</span>
      </label>

      <div class="taskrow__actions">
        <HfButton
          v-if="isDraft"
          variant="ghost" size="sm" @click="cancelDraft" :disabled="disabled"
        >
          Cancel
        </HfButton>
        <HfButton
          variant="solid" size="sm"
          @click="commit"
          :disabled="!isValid || disabled"
        >
          {{ isDraft ? 'Add task' : 'Save' }}
        </HfButton>
        <HfButton
          v-if="!isDraft"
          variant="ghost" size="sm"
          @click="startDelete"
          :disabled="disabled || confirming"
        >
          Delete
        </HfButton>
      </div>
    </div>

    <!-- Per-row error from store.taskRowErrors (e.g. server 4xx) -->
    <div v-if="rowError" class="taskrow__error hf-mono">
      <HfIcon name="x" :size="12" /> {{ rowError }}
    </div>

    <!-- Slide-down delete confirm strip -->
    <div v-if="confirming" class="taskrow__confirm">
      <div class="taskrow__confirm-copy hf-mono">
        Delete "{{ draft.title || 'this task' }}"? Any in-progress responses against this task will lose their target — operators won't be able to submit values for it once removed.
      </div>
      <div class="taskrow__confirm-actions">
        <HfButton variant="solid" size="sm" @click="commitDelete" :disabled="disabled">
          {{ disabled ? 'Deleting…' : 'Confirm delete' }}
        </HfButton>
        <HfButton variant="ghost" size="sm" @click="cancelDelete" :disabled="disabled">
          Cancel
        </HfButton>
      </div>
    </div>
  </li>
</template>

<style scoped>
.taskrow {
  list-style: none;
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-sm, 4px);
  padding: 12px 14px;
  margin-bottom: 10px;
  background: var(--hf-bg);
}
.taskrow.is-draft {
  border-style: dashed;
  background: var(--hf-fg-faint, rgba(0,0,0,0.02));
}

.taskrow__head {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: start;
}
.taskrow__order {
  font-size: 11px;
  color: var(--hf-muted);
  letter-spacing: 0.06em;
  padding-top: 22px;
}
.taskrow__title-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 10px;
}
@media (max-width: 600px) {
  .taskrow__title-row { grid-template-columns: 1fr; }
}
.taskrow__field { display: flex; flex-direction: column; gap: 4px; }

.taskrow__select {
  font: inherit;
  padding: 8px 10px;
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-sm, 4px);
  background: var(--hf-bg);
  color: var(--hf-fg);
}

.taskrow__field-err {
  font-size: 11px;
  font-family: var(--hf-font-mono);
  color: var(--hf-warn, #c2410c);
}
.taskrow__field-err--cfg { margin: 6px 0 0; }

.taskrow__meta {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.taskrow__check {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px;
  color: var(--hf-muted);
}
.taskrow__actions {
  display: flex; gap: 6px;
}

.taskrow__error {
  margin-top: 8px;
  display: flex; gap: 6px; align-items: center;
  font-size: 11px;
  color: var(--hf-warn, #92400e);
  background: var(--hf-warn-bg, #fef3c7);
  border: 1px solid var(--hf-warn-border, #f59e0b);
  padding: 6px 8px;
  border-radius: var(--hf-radius-sm, 4px);
}

.taskrow__confirm {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--hf-warn-border, #f59e0b);
  background: var(--hf-warn-bg, #fef3c7);
  border-radius: var(--hf-radius-sm, 4px);
}
.taskrow__confirm-copy {
  font-size: 11px;
  color: var(--hf-warn, #92400e);
  margin-bottom: 8px;
}
.taskrow__confirm-actions {
  display: flex; gap: 6px;
}
</style>
