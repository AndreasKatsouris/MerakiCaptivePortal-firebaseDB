<script setup>
// Native <select> styled with --hf-* tokens. v-model compatible.
import { computed } from 'vue'

const props = defineProps({
  modelValue:  { type: [String, Number, null], default: '' },
  options:     { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  disabled:    { type: Boolean, default: false },
  required:    { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const value = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})
</script>

<template>
  <label class="hf-select" :class="{ 'hf-select--disabled': disabled }">
    <select
      v-model="value"
      :disabled="disabled"
      :required="required"
      class="hf-select__field"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
    <span class="hf-select__chevron" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  </label>
</template>

<style scoped>
.hf-select {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border: 1px solid var(--hf-line-2);
  border-radius: var(--hf-radius);
  background: var(--hf-paper);
  transition: border-color var(--hf-transition), background var(--hf-transition);
}
.hf-select:focus-within { border-color: var(--hf-ink); }
.hf-select--disabled { opacity: 0.5; pointer-events: none; }

.hf-select__field {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  border: none;
  outline: none;
  background: transparent;
  font-family: var(--hf-font-body);
  font-size: 13px;
  color: var(--hf-ink);
  flex: 1;
  min-width: 0;
  line-height: 1.2;
  padding-right: 18px;
  cursor: pointer;
}
.hf-select__chevron {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--hf-muted);
  pointer-events: none;
  display: inline-flex;
}
</style>
