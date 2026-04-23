<script setup>
// Editorial button. Variants mirror kit.jsx .hf-btn + .ghost/.outline/.accent.
import { computed } from 'vue'

const props = defineProps({
  variant: { type: String, default: 'solid', validator: v => ['solid','ghost','outline','accent'].includes(v) },
  size:    { type: String, default: 'md',    validator: v => ['sm','md'].includes(v) },
  as:      { type: String, default: 'button' },
  disabled:{ type: Boolean, default: false },
})

const classes = computed(() => ['hf-btn', `hf-btn--${props.variant}`, `hf-btn--${props.size}`])
</script>

<template>
  <component :is="as" :class="classes" :disabled="as === 'button' ? disabled : undefined">
    <slot name="leading" />
    <slot />
    <slot name="trailing" />
  </component>
</template>

<style scoped>
.hf-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  border-radius: var(--hf-radius);
  cursor: pointer;
  border: 1px solid var(--hf-ink);
  background: var(--hf-ink);
  color: var(--hf-bg);
  font-family: var(--hf-font-body);
  letter-spacing: 0.01em;
  transition: background 200ms var(--hf-ease), transform 100ms var(--hf-ease), opacity 120ms;
  white-space: nowrap;
}
.hf-btn:hover  { background: var(--hf-ink-2); border-color: var(--hf-ink-2); }
.hf-btn:active { transform: translateY(1px); }
.hf-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
.hf-btn:focus-visible { outline: 2px solid var(--hf-accent); outline-offset: 2px; }

.hf-btn--ghost   { background: transparent; color: var(--hf-ink); border-color: var(--hf-line-2); }
.hf-btn--ghost:hover { background: var(--hf-paper); border-color: var(--hf-ink-2); }

.hf-btn--outline { background: var(--hf-paper); color: var(--hf-ink); border-color: var(--hf-line-2); }
.hf-btn--outline:hover { border-color: var(--hf-ink); background: var(--hf-bg); }

.hf-btn--accent  { background: var(--hf-accent); border-color: var(--hf-accent); color: var(--hf-ink); }
.hf-btn--accent:hover { background: var(--hf-accent-2); border-color: var(--hf-accent-2); color: var(--hf-bg); }

.hf-btn--sm { padding: 5px 10px; font-size: 12px; }
</style>
