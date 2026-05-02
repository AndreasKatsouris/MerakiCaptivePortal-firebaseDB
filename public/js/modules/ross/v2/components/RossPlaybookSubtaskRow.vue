<script setup>
// Single subtask row used by RossPlaybookWorkflowEditor (create mode)
// and RossPlaybookTemplateEditor.
//
// Phase 4e.2: subtasks now carry inputType + inputConfig that propagate
// to the per-location task at workflow create / activate time (server
// CF helper buildTaskFromSubtask). Type select is always visible and
// defaults to "Checkbox"; the config sub-form renders only when a
// non-default type is selected, matching hasConfigFields(). Type-switch
// clears stale inputConfig keys via defaultInputConfig — same
// invariant as the per-task editor (4e.1).
//
// Reorder uses explicit up/down buttons over drag-and-drop: keyboard
// reachable, mobile-friendly, and matches the Hi-Fi v2 minimalist
// pointer-and-keyboard aesthetic.
import { computed } from 'vue'
import { HfIcon, HfButton, HfInput } from '/js/design-system/hifi/index.js'
import {
  INPUT_TYPE_OPTIONS, defaultInputConfig, hasConfigFields,
} from '../constants/input-types.js'
import RossPlaybookTaskConfigFields from './RossPlaybookTaskConfigFields.vue'

const props = defineProps({
  subtask: { type: Object, required: true },
  index: { type: Number, required: true },
  total: { type: Number, required: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update', 'remove', 'move'])

function patch(next) {
  emit('update', next)
}

const titleVal = computed({
  get() { return props.subtask.title || '' },
  set(v) { patch({ ...props.subtask, title: v }) },
})

const offsetVal = computed({
  get() {
    const n = Number(props.subtask.daysOffset)
    return Number.isFinite(n) ? n : 0
  },
  set(v) {
    const n = Number(v)
    patch({ ...props.subtask, daysOffset: Number.isFinite(n) ? n : 0 })
  },
})

const inputType = computed(() => props.subtask.inputType || 'checkbox')
const inputConfig = computed(() =>
  (props.subtask.inputConfig && typeof props.subtask.inputConfig === 'object')
    ? props.subtask.inputConfig
    : {},
)
const showConfig = computed(() => hasConfigFields(inputType.value))

function changeType(nextType) {
  if (nextType === inputType.value) return
  // Clear stale inputConfig keys on switch — never inherit between types
  // (e.g. min/max left over after switching to dropdown).
  patch({
    ...props.subtask,
    inputType: nextType,
    inputConfig: defaultInputConfig(nextType),
  })
}
function patchConfig(nextCfg) {
  patch({ ...props.subtask, inputConfig: nextCfg })
}

const isFirst = computed(() => props.index === 0)
const isLast = computed(() => props.index === props.total - 1)
</script>

<template>
  <li class="subtask">
    <!-- Top line: order + title + day offset + type + reorder/remove -->
    <div class="subtask__top">
      <div class="subtask__order hf-mono">{{ index + 1 }}</div>
      <div class="subtask__fields">
        <label class="subtask__field subtask__field--title">
          <span class="hf-eyebrow">Task title</span>
          <HfInput
            v-model="titleVal"
            placeholder="e.g. Check fridge temperature"
            :disabled="disabled"
          />
        </label>
        <label class="subtask__field subtask__field--offset">
          <span class="hf-eyebrow">Day offset</span>
          <HfInput
            v-model="offsetVal"
            type="number"
            :disabled="disabled"
            placeholder="0"
          />
        </label>
        <label class="subtask__field subtask__field--type">
          <span class="hf-eyebrow">Type</span>
          <select
            :value="inputType"
            @change="changeType($event.target.value)"
            class="subtask__select"
            :disabled="disabled"
          >
            <option v-for="o in INPUT_TYPE_OPTIONS" :key="o.id" :value="o.id">
              {{ o.label }}
            </option>
          </select>
        </label>
      </div>
      <div class="subtask__actions">
        <HfButton
          variant="ghost" size="sm"
          :disabled="disabled || isFirst"
          @click="emit('move', { from: index, to: index - 1 })"
          aria-label="Move task up"
        >
          <HfIcon name="arrow" :size="12" class="subtask__arrow subtask__arrow--up" />
        </HfButton>
        <HfButton
          variant="ghost" size="sm"
          :disabled="disabled || isLast"
          @click="emit('move', { from: index, to: index + 1 })"
          aria-label="Move task down"
        >
          <HfIcon name="arrow" :size="12" class="subtask__arrow subtask__arrow--down" />
        </HfButton>
        <HfButton
          variant="ghost" size="sm"
          :disabled="disabled"
          @click="emit('remove', index)"
          aria-label="Remove task"
        >
          <HfIcon name="x" :size="12" />
        </HfButton>
      </div>
    </div>

    <!-- Second line: type-specific config sub-form, only when the
         selected type carries config fields (number/temperature/dropdown/
         rating/text). Checkbox/yes_no/timestamp/photo/signature render
         nothing here — row stays compact for the dominant default case. -->
    <RossPlaybookTaskConfigFields
      v-if="showConfig"
      :input-type="inputType"
      :config="inputConfig"
      :disabled="disabled"
      @update:config="patchConfig"
    />
  </li>
</template>

<style scoped>
.subtask {
  padding: 10px 0;
  border-bottom: 1px dashed var(--hf-line);
}
.subtask:last-child { border-bottom: none; }

.subtask__top {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: end;
  gap: 12px;
}

.subtask__order {
  font-size: 11px;
  color: var(--hf-muted);
  letter-spacing: 0.06em;
  width: 18px;
  text-align: right;
  padding-bottom: 9px;
}

.subtask__fields {
  display: grid;
  grid-template-columns: 1fr 90px 130px;
  gap: 8px 12px;
}
@media (max-width: 600px) {
  .subtask__fields { grid-template-columns: 1fr; }
}

.subtask__field {
  display: flex; flex-direction: column; gap: 4px;
}

.subtask__select {
  font: inherit;
  padding: 8px 10px;
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-sm, 4px);
  background: var(--hf-bg);
  color: var(--hf-fg);
}

.subtask__actions {
  display: flex; align-items: center; gap: 4px;
  padding-bottom: 4px;
}

.subtask__arrow--up { transform: rotate(-90deg); }
.subtask__arrow--down { transform: rotate(90deg); }
</style>
