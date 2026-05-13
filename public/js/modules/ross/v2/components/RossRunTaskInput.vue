<script setup>
import { ref, watch } from 'vue'
import { NA_SENTINEL, needsPreflightNote } from '../constants/run-input-types.js'
import HfCheckbox from '../../../../design-system/hifi/components/HfCheckbox.vue'
import HfInput    from '../../../../design-system/hifi/components/HfInput.vue'
import HfSelect   from '../../../../design-system/hifi/components/HfSelect.vue'
import HfButton   from '../../../../design-system/hifi/components/HfButton.vue'
import HfChip     from '../../../../design-system/hifi/components/HfChip.vue'

const props = defineProps({
  task:     { type: Object, required: true },
  value:    { default: undefined },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['commit', 'preflightNote'])

const local = ref(props.value)
watch(() => props.value, v => { local.value = v })

function commit(v) {
  if (needsPreflightNote(props.task.inputType, v, props.task.inputConfig)) {
    emit('preflightNote', { value: v, reason: 'out-of-range' })
    return
  }
  emit('commit', v)
}

// checkbox — HfCheckbox emits update:modelValue with a boolean
function onCheckbox(v) {
  local.value = !!v
  commit(local.value)
}

// text — HfInput emits update:modelValue on every keystroke; commit on blur
function onTextInput(v) {
  local.value = v
}
function onTextBlur() {
  if (local.value === props.value) return  // no change, skip spurious commits
  commit(local.value)
}

function onYesNo(answer) {
  local.value = answer
  commit(answer)
}

// dropdown — HfSelect emits update:modelValue
function onDropdownChange(v) {
  local.value = v
  commit(v)
}

function onTimestampChange(e) {
  local.value = e.target.value
  commit(local.value)
}

function onRating(stars) {
  local.value = stars
  commit(stars)
}

// photo / signature — Phase 2 placeholder; Mark N/A bypasses pre-flight
function markNa() {
  local.value = NA_SENTINEL
  emit('commit', NA_SENTINEL)
}

// number / temperature — update local on input, commit on blur
function onNumberInput(e) {
  const raw = e.target.value
  local.value = raw === '' ? undefined : Number(raw)
}
function onNumberBlur() {
  if (local.value === undefined || local.value === '' || Number.isNaN(local.value)) return
  commit(local.value)
}
</script>

<template>
  <div class="rrti">
    <!-- checkbox -->
    <label v-if="task.inputType === 'checkbox'" class="rrti__checkbox">
      <HfCheckbox
        :model-value="!!local"
        :disabled="disabled"
        @update:model-value="onCheckbox"
      />
      <span class="rrti__cb-text">Done</span>
    </label>

    <!-- text -->
    <!-- HfInput doesn't emit blur and its root is <label>, so @blur on the
         component tag wouldn't bubble. Wrap in a div that captures DOM
         focusout (which DOES bubble) to drive the commit. -->
    <div
      v-else-if="task.inputType === 'text'"
      class="rrti__text-wrap"
      @focusout="onTextBlur"
    >
      <HfInput
        :model-value="local ?? ''"
        :disabled="disabled"
        :aria-label="task.title || 'Response'"
        :placeholder="task.inputConfig?.placeholder || 'Enter response'"
        @update:model-value="onTextInput"
      />
    </div>

    <!-- number -->
    <div v-else-if="task.inputType === 'number'" class="rrti__number">
      <input
        type="number"
        class="rrti__numinput"
        :value="local ?? ''"
        :disabled="disabled"
        :min="task.inputConfig?.min"
        :max="task.inputConfig?.max"
        :aria-label="task.title || 'Number'"
        @input="onNumberInput"
        @blur="onNumberBlur"
      />
    </div>

    <!-- temperature -->
    <div v-else-if="task.inputType === 'temperature'" class="rrti__temperature">
      <input
        type="number"
        class="rrti__numinput"
        :value="local ?? ''"
        :disabled="disabled"
        :min="task.inputConfig?.min"
        :max="task.inputConfig?.max"
        :aria-label="task.title || 'Temperature'"
        step="0.1"
        @input="onNumberInput"
        @blur="onNumberBlur"
      />
      <span v-if="task.inputConfig?.unit" class="rrti__unit">{{ task.inputConfig.unit }}</span>
    </div>

    <!-- yes_no -->
    <!-- HfButton variants: solid | ghost | outline | accent (no "primary") -->
    <!-- Emits boolean true/false — server validateResponseValue requires
         typeof value === 'boolean' for yes_no tasks (functions/ross.js:1215). -->
    <div v-else-if="task.inputType === 'yes_no'" class="rrti__yesno">
      <HfButton
        :variant="local === true ? 'solid' : 'ghost'"
        :aria-pressed="local === true"
        :disabled="disabled"
        @click="onYesNo(true)"
      >Yes</HfButton>
      <HfButton
        :variant="local === false ? 'solid' : 'ghost'"
        :aria-pressed="local === false"
        :disabled="disabled"
        @click="onYesNo(false)"
      >No</HfButton>
    </div>

    <!-- dropdown — options must be { value, label } objects for HfSelect -->
    <HfSelect
      v-else-if="task.inputType === 'dropdown'"
      :model-value="local ?? ''"
      :options="(task.inputConfig?.options || []).map(o => ({ value: o, label: o }))"
      :disabled="disabled"
      :aria-label="task.title || 'Select an option'"
      placeholder="Select an option"
      @update:model-value="onDropdownChange"
    />

    <!-- timestamp — native datetime-local; no HfInput wrapper (type not supported) -->
    <input
      v-else-if="task.inputType === 'timestamp'"
      type="datetime-local"
      class="rrti__timestamp"
      :value="local ?? ''"
      :disabled="disabled"
      :aria-label="task.title || 'Timestamp'"
      @change="onTimestampChange"
    />

    <!-- rating -->
    <div
      v-else-if="task.inputType === 'rating'"
      class="rrti__rating"
      role="group"
      :aria-label="task.title || 'Rating'"
    >
      <button
        v-for="n in (task.inputConfig?.scale || task.inputConfig?.max || 5)"
        :key="n"
        type="button"
        class="rrti__star"
        :class="{ 'rrti__star--filled': (local || 0) >= n }"
        :disabled="disabled"
        @click="onRating(n)"
        :aria-label="`${n} star${n > 1 ? 's' : ''}`"
      >&#9733;</button>
    </div>

    <!-- photo / signature placeholder -->
    <div
      v-else-if="task.inputType === 'photo' || task.inputType === 'signature'"
      class="rrti__placeholder"
    >
      <HfChip>Coming soon</HfChip>
      <span class="rrti__placeholder-text">
        {{ task.inputType === 'photo' ? 'Photo capture' : 'Signature' }} not yet available.
      </span>
      <HfButton
        v-if="local !== NA_SENTINEL"
        variant="ghost"
        size="sm"
        :disabled="disabled"
        @click="markNa"
      >Mark N/A</HfButton>
      <span v-else class="rrti__placeholder-na">Marked N/A</span>
    </div>

    <!-- fallback — catches unknown / typo input types -->
    <div v-else class="rrti__fallback">
      Input type &#34;{{ task.inputType }}&#34; not yet implemented.
    </div>
  </div>
</template>

<style scoped>
.rrti { font: 0.95rem/1.4 var(--hf-font-body); color: var(--hf-ink); }
.rrti__checkbox { display: inline-flex; align-items: center; gap: var(--hf-space-2); cursor: pointer; }
.rrti__cb-text { color: var(--hf-ink-2); }
.rrti__yesno { display: inline-flex; gap: var(--hf-space-2); }
.rrti__timestamp {
  font: inherit; color: var(--hf-ink);
  background: var(--hf-paper); border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md); padding: var(--hf-space-2) var(--hf-space-3);
}
.rrti__rating { display: inline-flex; gap: var(--hf-space-1); }
.rrti__star {
  background: none; border: none; cursor: pointer; padding: 0 var(--hf-space-1);
  color: var(--hf-line-2); font-size: 1.4rem; line-height: 1; transition: color var(--hf-transition);
}
.rrti__star--filled { color: var(--hf-gold); }
.rrti__star:disabled { cursor: default; }
.rrti__fallback { color: var(--hf-muted); font-style: italic; }
.rrti__placeholder {
  display: inline-flex; align-items: center; gap: var(--hf-space-3);
  padding: var(--hf-space-2) var(--hf-space-3);
  background: var(--hf-bg2); border: 1px dashed var(--hf-line-2);
  border-radius: var(--hf-radius-md);
}
.rrti__placeholder-text { color: var(--hf-muted); font-size: 0.9rem; }
.rrti__placeholder-na { color: var(--hf-good); font-size: 0.9rem; }
.rrti__number, .rrti__temperature { display: inline-flex; align-items: baseline; gap: var(--hf-space-2); }
.rrti__numinput {
  font: inherit; color: var(--hf-ink);
  background: var(--hf-paper); border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md); padding: var(--hf-space-2) var(--hf-space-3);
  width: 8rem;
}
.rrti__unit { color: var(--hf-muted); font-family: var(--hf-font-mono); }
</style>
