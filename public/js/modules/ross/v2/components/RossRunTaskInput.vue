<script setup>
import { ref, watch } from 'vue'
import { NA_SENTINEL, needsPreflightNote } from '../constants/run-input-types.js'
import HfCheckbox from '../../../../design-system/hifi/components/HfCheckbox.vue'
import HfInput    from '../../../../design-system/hifi/components/HfInput.vue'
import HfSelect   from '../../../../design-system/hifi/components/HfSelect.vue'
import HfButton   from '../../../../design-system/hifi/components/HfButton.vue'

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
    <!-- HfInput exposes update:modelValue; @blur falls through to root <label> -->
    <HfInput
      v-else-if="task.inputType === 'text'"
      :model-value="local ?? ''"
      :disabled="disabled"
      :placeholder="task.inputConfig?.placeholder || 'Enter response'"
      @update:model-value="onTextInput"
      @blur="onTextBlur"
    />

    <!-- yes_no -->
    <!-- HfButton variants: solid | ghost | outline | accent (no "primary") -->
    <div v-else-if="task.inputType === 'yes_no'" class="rrti__yesno">
      <HfButton
        :variant="local === 'yes' ? 'solid' : 'ghost'"
        :disabled="disabled"
        @click="onYesNo('yes')"
      >Yes</HfButton>
      <HfButton
        :variant="local === 'no' ? 'solid' : 'ghost'"
        :disabled="disabled"
        @click="onYesNo('no')"
      >No</HfButton>
    </div>

    <!-- dropdown — options must be { value, label } objects for HfSelect -->
    <HfSelect
      v-else-if="task.inputType === 'dropdown'"
      :model-value="local ?? ''"
      :options="(task.inputConfig?.options || []).map(o => ({ value: o, label: o }))"
      :disabled="disabled"
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
      @change="onTimestampChange"
    />

    <!-- rating -->
    <div v-else-if="task.inputType === 'rating'" class="rrti__rating">
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

    <!-- fallback (number/temperature handled in Task 6; photo/signature in Task 7) -->
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
</style>
