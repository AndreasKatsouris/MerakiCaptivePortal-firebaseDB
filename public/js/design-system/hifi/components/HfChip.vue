<script setup>
// Small pill for status / tag / label. Tones mirror kit.jsx .hf-chip variants.
import { computed } from 'vue'

const props = defineProps({
  tone: { type: String, default: 'default', validator: v => ['default','solid','accent','warn','good'].includes(v) },
})

const classes = computed(() => ['hf-chip', `hf-chip--${props.tone}`])
</script>

<template>
  <span :class="classes">
    <slot name="leading" />
    <slot />
  </span>
</template>

<style scoped>
.hf-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: 11px;
  letter-spacing: 0.02em;
  border-radius: 999px;
  border: 1px solid var(--hf-line-2);
  background: var(--hf-paper);
  color: var(--hf-ink-2);
  font-family: var(--hf-font-body);
  line-height: 1.5;
}
.hf-chip--solid  { background: var(--hf-ink);      color: var(--hf-bg);      border-color: var(--hf-ink); }
.hf-chip--accent { background: transparent;         color: var(--hf-accent-2); border-color: var(--hf-accent); }
.hf-chip--warn   { background: rgba(176, 85, 58, 0.05);  color: var(--hf-warn); border-color: rgba(176, 85, 58, 0.2); }
.hf-chip--good   { background: rgba(92, 122, 74, 0.05);  color: var(--hf-good); border-color: rgba(92, 122, 74, 0.2); }
</style>
