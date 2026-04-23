<script setup>
// Initials avatar. Background tone is deterministic from the first initial
// so the same person gets the same color every render.
import { computed } from 'vue'

const props = defineProps({
  initials: { type: String, default: 'A' },
  size:     { type: [Number, String], default: 32 },
  tone:     { type: String, default: null },
})

const tones = ['#e7d9be','#d9e3cd','#e5cfc2','#cfd4e3','#e3cfd7','#d4dcca']

const bg = computed(() => props.tone
  || tones[(props.initials.charCodeAt(0) || 0) % tones.length])

const fontSize = computed(() => `${Number(props.size) * 0.42}px`)
</script>

<template>
  <div
    class="hf-avatar"
    :style="{ width: `${size}px`, height: `${size}px`, background: bg, fontSize }"
    :aria-label="`Avatar for ${initials}`"
  >{{ initials }}</div>
</template>

<style scoped>
.hf-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--hf-ink);
  font-family: var(--hf-font-display);
  border: 1px solid var(--hf-line);
  flex-shrink: 0;
  line-height: 1;
  user-select: none;
}
</style>
