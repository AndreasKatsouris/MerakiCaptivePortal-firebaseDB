<script setup>
// Keyboard shortcut pill.
defineProps({ keys: { type: [String, Array], default: () => [] } })
</script>

<template>
  <kbd class="hf-kbd">
    <slot>{{ Array.isArray(keys) ? keys.join(' + ') : keys }}</slot>
  </kbd>
</template>

<style scoped>
.hf-kbd {
  font-family: var(--hf-font-mono);
  font-size: 10px;
  padding: 2px 5px;
  border: 1px solid var(--hf-line-2);
  border-radius: var(--hf-radius-sm);
  background: var(--hf-paper);
  color: var(--hf-muted);
  line-height: 1;
  letter-spacing: 0.04em;
}
</style>
