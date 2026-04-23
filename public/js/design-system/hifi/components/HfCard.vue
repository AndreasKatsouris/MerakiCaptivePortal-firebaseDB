<script setup>
// Editorial card — paper surface, hairline border, optional eyebrow + title.
defineProps({
  eyebrow: { type: String, default: null },
  title:   { type: String, default: null },
  padded:  { type: Boolean, default: true },
})
</script>

<template>
  <div class="hf-card" :class="{ 'hf-card--padded': padded }">
    <div v-if="eyebrow || title || $slots.header" class="hf-card__head">
      <slot name="header">
        <div v-if="eyebrow" class="hf-card__eyebrow">{{ eyebrow }}</div>
        <div v-if="title" class="hf-card__title">{{ title }}</div>
      </slot>
    </div>
    <slot />
    <div v-if="$slots.footer" class="hf-card__foot"><slot name="footer" /></div>
  </div>
</template>

<style scoped>
.hf-card {
  background: var(--hf-paper);
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md);
  color: var(--hf-ink);
}
.hf-card--padded { padding: 20px 22px; }

.hf-card__head { margin-bottom: 12px; }
.hf-card__eyebrow {
  font-family: var(--hf-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hf-muted);
  margin-bottom: 6px;
}
.hf-card__title {
  font-family: var(--hf-font-display);
  font-size: 22px;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.hf-card__foot {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--hf-line);
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
