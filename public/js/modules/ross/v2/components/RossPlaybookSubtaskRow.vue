<script setup>
// Single subtask row used by RossPlaybookWorkflowEditor (and reused
// by the upcoming Phase 4d.2 template editor).
//
// Scope per the 4d plan: title + daysOffset + reorder + remove only.
// Per-task inputType / inputConfig editor is deferred to Phase 4e —
// server defaults inputType: 'checkbox' which is the right default for
// the goldenpath.
//
// Reorder uses explicit up/down buttons over drag-and-drop: keyboard
// reachable, mobile-friendly, and matches the Hi-Fi v2 minimalist
// pointer-and-keyboard aesthetic.
import { computed } from 'vue'
import { HfIcon, HfButton, HfInput } from '/js/design-system/hifi/index.js'

const props = defineProps({
  subtask: { type: Object, required: true },
  index: { type: Number, required: true },
  total: { type: Number, required: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update', 'remove', 'move'])

const titleVal = computed({
  get() { return props.subtask.title || '' },
  set(v) { emit('update', { ...props.subtask, title: v }) },
})

const offsetVal = computed({
  get() {
    const n = Number(props.subtask.daysOffset)
    return Number.isFinite(n) ? n : 0
  },
  set(v) {
    const n = Number(v)
    emit('update', { ...props.subtask, daysOffset: Number.isFinite(n) ? n : 0 })
  },
})

const isFirst = computed(() => props.index === 0)
const isLast = computed(() => props.index === props.total - 1)
</script>

<template>
  <li class="subtask">
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
  </li>
</template>

<style scoped>
.subtask {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: end;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--hf-line);
}
.subtask:last-child { border-bottom: none; }

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
  grid-template-columns: 1fr 110px;
  gap: 8px 12px;
}
@media (max-width: 600px) {
  .subtask__fields { grid-template-columns: 1fr; }
}

.subtask__field {
  display: flex; flex-direction: column; gap: 4px;
}

.subtask__actions {
  display: flex; align-items: center; gap: 4px;
  padding-bottom: 4px;
}

.subtask__arrow--up { transform: rotate(-90deg); }
.subtask__arrow--down { transform: rotate(90deg); }
</style>
