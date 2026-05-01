<script setup>
// Type-specific inputConfig sub-form. One component, v-if ladder on
// inputType — keeps the "stale-config-clear-on-type-switch" invariant
// in one place. Parent owns the inputConfig state; this component
// emits patches via update events.
//
// Emits a single `update:config` with the fully-replaced config object.
// Parent should sanitise + validate before send (uses
// constants/input-types.js helpers).
import { computed } from 'vue'
import { HfInput, HfButton, HfIcon } from '/js/design-system/hifi/index.js'

const props = defineProps({
  inputType: { type: String, required: true },
  config:    { type: Object, default: () => ({}) },
  disabled:  { type: Boolean, default: false },
})

const emit = defineEmits(['update:config'])

function patch(key, val) {
  emit('update:config', { ...props.config, [key]: val })
}
function patchOptions(opts) {
  emit('update:config', { ...props.config, options: opts })
}

// --- number / temperature ----------------------------------------
const minVal = computed({
  get() { return props.config.min ?? '' },
  set(v) { patch('min', v === '' ? null : Number(v)) },
})
const maxVal = computed({
  get() { return props.config.max ?? '' },
  set(v) { patch('max', v === '' ? null : Number(v)) },
})
const unitVal = computed({
  get() { return props.config.unit ?? '' },
  set(v) { patch('unit', v) },
})
const requiredNote = computed({
  get() { return !!props.config.requiredNote },
  set(v) { patch('requiredNote', !!v) },
})

// --- dropdown -----------------------------------------------------
// Options live in the config as a string[]. We render one HfInput per
// option + an "Add option" affordance. Empty strings allowed during
// editing; sanitiser strips them at send time.
function updateOption(idx, val) {
  const next = [...(props.config.options || [])]
  next[idx] = val
  patchOptions(next)
}
function removeOption(idx) {
  const next = [...(props.config.options || [])]
  next.splice(idx, 1)
  patchOptions(next)
}
function addOption() {
  patchOptions([...(props.config.options || []), ''])
}

// --- rating -------------------------------------------------------
const scaleVal = computed({
  get() { return props.config.scale ?? 5 },
  set(v) {
    const n = Number(v)
    patch('scale', Number.isInteger(n) ? n : 5)
  },
})

// --- text ---------------------------------------------------------
const placeholderVal = computed({
  get() { return props.config.placeholder ?? '' },
  set(v) { patch('placeholder', v) },
})
const maxLengthVal = computed({
  get() { return props.config.maxLength ?? '' },
  set(v) { patch('maxLength', v === '' ? null : Number(v)) },
})
</script>

<template>
  <div class="cfg">
    <!-- number / temperature -->
    <div v-if="inputType === 'number' || inputType === 'temperature'" class="cfg__grid">
      <label class="cfg__field">
        <span class="hf-eyebrow">Min</span>
        <HfInput v-model="minVal" type="number" :disabled="disabled" placeholder="—" />
      </label>
      <label class="cfg__field">
        <span class="hf-eyebrow">Max</span>
        <HfInput v-model="maxVal" type="number" :disabled="disabled" placeholder="—" />
      </label>
      <label v-if="inputType === 'temperature'" class="cfg__field">
        <span class="hf-eyebrow">Unit</span>
        <select v-model="unitVal" class="cfg__select" :disabled="disabled">
          <option value="C">°C</option>
          <option value="F">°F</option>
        </select>
      </label>
      <label v-else class="cfg__field">
        <span class="hf-eyebrow">Unit (optional)</span>
        <HfInput v-model="unitVal" :disabled="disabled" placeholder="e.g. kg, %" />
      </label>
      <label class="cfg__field cfg__field--span2 cfg__check">
        <input
          type="checkbox"
          :checked="requiredNote"
          @change="requiredNote = $event.target.checked"
          :disabled="disabled"
        />
        <span class="hf-mono">Require a note when value is out of range</span>
      </label>
      <p class="cfg__hint hf-mono">
        Out-of-range readings auto-flag in the run history. If both Min and Max are blank, no flagging applies.
      </p>
    </div>

    <!-- dropdown -->
    <div v-else-if="inputType === 'dropdown'" class="cfg__dropdown">
      <span class="hf-eyebrow">Options</span>
      <p class="cfg__hint hf-mono">At least two non-empty unique options.</p>
      <ul class="cfg__opt-list">
        <li
          v-for="(opt, i) in (props.config.options || [])" :key="i"
          class="cfg__opt"
        >
          <HfInput
            :model-value="opt"
            @update:modelValue="(v) => updateOption(i, v)"
            :disabled="disabled"
            :placeholder="`Option ${i + 1}`"
          />
          <HfButton
            variant="ghost" size="sm"
            :disabled="disabled"
            @click="removeOption(i)"
            aria-label="Remove option"
          >
            <HfIcon name="x" :size="12" />
          </HfButton>
        </li>
      </ul>
      <HfButton variant="ghost" size="sm" @click="addOption" :disabled="disabled">
        <template #leading><HfIcon name="plus" :size="12" /></template>
        Add option
      </HfButton>
    </div>

    <!-- rating -->
    <div v-else-if="inputType === 'rating'" class="cfg__grid">
      <label class="cfg__field">
        <span class="hf-eyebrow">Scale (max value)</span>
        <HfInput v-model="scaleVal" type="number" :disabled="disabled" placeholder="5" />
      </label>
      <label class="cfg__field cfg__field--span2 cfg__check">
        <input
          type="checkbox"
          :checked="requiredNote"
          @change="requiredNote = $event.target.checked"
          :disabled="disabled"
        />
        <span class="hf-mono">Require a note with the rating</span>
      </label>
      <p class="cfg__hint hf-mono">
        Integer rating from 1 to the scale value. Default scale is 5.
      </p>
    </div>

    <!-- text -->
    <div v-else-if="inputType === 'text'" class="cfg__grid">
      <label class="cfg__field cfg__field--span2">
        <span class="hf-eyebrow">Placeholder (optional)</span>
        <HfInput v-model="placeholderVal" :disabled="disabled" placeholder="e.g. Notes from this check" />
      </label>
      <label class="cfg__field">
        <span class="hf-eyebrow">Max length (optional)</span>
        <HfInput v-model="maxLengthVal" type="number" :disabled="disabled" placeholder="—" />
      </label>
    </div>

    <!-- checkbox / yes_no / timestamp / photo / signature: no config -->
  </div>
</template>

<style scoped>
.cfg {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px dashed var(--hf-line);
  border-radius: var(--hf-radius-sm, 4px);
  background: var(--hf-fg-faint, rgba(0,0,0,0.02));
}
.cfg__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}
@media (max-width: 600px) {
  .cfg__grid { grid-template-columns: 1fr; }
}
.cfg__field {
  display: flex; flex-direction: column; gap: 4px;
}
.cfg__field--span2 { grid-column: 1 / -1; }
.cfg__check {
  flex-direction: row; align-items: center; gap: 6px;
}
.cfg__select {
  font: inherit;
  padding: 6px 8px;
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-sm, 4px);
  background: var(--hf-bg);
  color: var(--hf-fg);
}
.cfg__hint {
  grid-column: 1 / -1;
  font-size: 11px; color: var(--hf-muted);
  margin: 0;
}

.cfg__dropdown { display: flex; flex-direction: column; gap: 6px; }
.cfg__opt-list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 4px;
}
.cfg__opt {
  display: flex; align-items: center; gap: 4px;
}
.cfg__opt > :first-child { flex: 1; }
</style>
