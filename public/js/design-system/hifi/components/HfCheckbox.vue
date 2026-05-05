<script setup>
// Boolean checkbox with label slot. v-model:checked compatible.
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled:   { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const checked = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})
</script>

<template>
  <label class="hf-checkbox" :class="{ 'hf-checkbox--disabled': disabled }">
    <input
      type="checkbox"
      v-model="checked"
      :disabled="disabled"
      class="hf-checkbox__input"
    />
    <span class="hf-checkbox__box" aria-hidden="true">
      <svg v-if="checked" width="12" height="12" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12l5 5L20 7" />
      </svg>
    </span>
    <span class="hf-checkbox__label">
      <slot />
    </span>
  </label>
</template>

<style scoped>
.hf-checkbox {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  font-family: var(--hf-font-body);
  font-size: 13px;
  color: var(--hf-ink);
  line-height: 1.4;
}
.hf-checkbox--disabled { opacity: 0.5; pointer-events: none; }

.hf-checkbox__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 0;
  height: 0;
}
.hf-checkbox__box {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border: 1px solid var(--hf-line-2);
  border-radius: 3px;
  background: var(--hf-paper);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--hf-paper);
  transition: border-color var(--hf-transition), background var(--hf-transition);
  margin-top: 2px;
}
.hf-checkbox__input:checked ~ .hf-checkbox__box {
  background: var(--hf-ink);
  border-color: var(--hf-ink);
}
.hf-checkbox__input:focus-visible ~ .hf-checkbox__box {
  outline: 2px solid var(--hf-ink);
  outline-offset: 2px;
}
.hf-checkbox__label { flex: 1; min-width: 0; }
</style>
