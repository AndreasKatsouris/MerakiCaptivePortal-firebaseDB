<script setup>
// Text input with optional leading/trailing icon slots. v-model compatible.
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  type:        { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  disabled:    { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const value = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})
</script>

<template>
  <label class="hf-input" :class="{ 'hf-input--disabled': disabled }">
    <slot name="leading" />
    <input
      v-model="value"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      class="hf-input__field"
    />
    <slot name="trailing" />
  </label>
</template>

<style scoped>
.hf-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--hf-line-2);
  border-radius: var(--hf-radius);
  background: var(--hf-paper);
  transition: border-color var(--hf-transition), background var(--hf-transition);
}
.hf-input:focus-within { border-color: var(--hf-ink); }
.hf-input--disabled { opacity: 0.5; pointer-events: none; }

.hf-input__field {
  border: none;
  outline: none;
  background: transparent;
  font-family: var(--hf-font-body);
  font-size: 13px;
  color: var(--hf-ink);
  flex: 1;
  min-width: 0;
  line-height: 1.2;
}
.hf-input__field::placeholder { color: var(--hf-muted); }
</style>
