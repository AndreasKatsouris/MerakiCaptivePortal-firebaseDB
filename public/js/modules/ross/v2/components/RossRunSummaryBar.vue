<script setup>
import HfButton from '../../../../design-system/hifi/components/HfButton.vue'

const props = defineProps({
  requiredTotal: { type: Number, required: true },
  requiredDone:  { type: Number, required: true },
  optionalTotal: { type: Number, required: true },
  optionalDone:  { type: Number, required: true },
})

const emit = defineEmits(['finish'])
</script>

<template>
  <div class="rrsb" role="status" aria-live="polite">
    <div class="rrsb__progress">
      <strong class="rrsb__count">{{ requiredDone }} / {{ requiredTotal }}</strong>
      <span class="rrsb__label">required tasks complete</span>
      <span v-if="optionalTotal > 0" class="rrsb__opt">
        ({{ optionalDone }} / {{ optionalTotal }} optional)
      </span>
    </div>
    <HfButton
      variant="solid"
      :disabled="requiredDone < requiredTotal"
      @click="emit('finish')"
    >Finish run</HfButton>
  </div>
</template>

<style scoped>
.rrsb {
  position: sticky; bottom: 0;
  background: var(--hf-paper); border-top: 1px solid var(--hf-line);
  padding: var(--hf-space-3) var(--hf-space-5);
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--hf-space-4);
  box-shadow: var(--hf-shadow-2);
}
.rrsb__progress { font: 0.95rem/1.3 var(--hf-font-body); color: var(--hf-ink); }
.rrsb__count { color: var(--hf-ink); font-weight: 600; margin-right: var(--hf-space-2); }
.rrsb__label { color: var(--hf-muted); }
.rrsb__opt { color: var(--hf-muted); margin-left: var(--hf-space-2); font-size: 0.85rem; }
@media (max-width: 640px) {
  .rrsb { flex-direction: column; align-items: stretch; gap: var(--hf-space-2); }
}
</style>
