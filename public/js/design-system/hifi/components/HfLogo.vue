<script setup>
// Sparks wordmark with 8-pointed star mark.
defineProps({
  size:  { type: [Number, String], default: 20 },
  color: { type: String, default: 'var(--hf-ink)' },
  wordmark: { type: Boolean, default: true },
})
</script>

<template>
  <div class="hf-logo">
    <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" :fill="color" />
    </svg>
    <span v-if="wordmark" class="hf-logo__wordmark" :style="{ fontSize: `${Number(size) * 0.95}px`, color }">Sparks</span>
  </div>
</template>

<style scoped>
.hf-logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.hf-logo__wordmark {
  font-family: var(--hf-font-display);
  letter-spacing: -0.01em;
  line-height: 1;
}
</style>
