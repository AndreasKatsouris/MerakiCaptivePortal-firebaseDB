<script setup>
import HfButton from '../../../../design-system/hifi/components/HfButton.vue'
import HfChip from '../../../../design-system/hifi/components/HfChip.vue'

const props = defineProps({
  run: { type: Object, required: true }, // { completedAt, onTime, flaggedCount }
})

const emit = defineEmits(['backToPlaybook', 'viewActivity'])
</script>

<template>
  <aside class="rrcb" role="status">
    <div class="rrcb__icon" aria-hidden="true">✓</div>
    <div class="rrcb__body">
      <h3 class="rrcb__title">Run complete</h3>
      <div class="rrcb__chips">
        <HfChip :tone="run.onTime ? 'good' : 'warn'">
          {{ run.onTime ? 'On time' : 'Late' }}
        </HfChip>
        <HfChip :tone="(run.flaggedCount || 0) > 0 ? 'warn' : 'good'">
          {{ run.flaggedCount || 0 }} flagged
        </HfChip>
      </div>
    </div>
    <div class="rrcb__actions">
      <HfButton variant="ghost" @click="emit('backToPlaybook')">Back to Playbook</HfButton>
      <HfButton variant="solid" @click="emit('viewActivity')">View in Activity</HfButton>
    </div>
  </aside>
</template>

<style scoped>
.rrcb {
  position: sticky; bottom: 0;
  background: var(--hf-paper); border-top: 2px solid var(--hf-good);
  padding: var(--hf-space-4) var(--hf-space-5);
  display: flex; align-items: center; gap: var(--hf-space-4);
  box-shadow: var(--hf-shadow-2);
}
.rrcb__icon {
  width: 2.5rem; height: 2.5rem; border-radius: 50%;
  background: var(--hf-good); color: var(--hf-paper);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.4rem; flex-shrink: 0;
}
.rrcb__body { flex: 1; }
.rrcb__title { font: 1.1rem/1.2 var(--hf-font-display); margin: 0 0 var(--hf-space-1); }
.rrcb__chips { display: inline-flex; gap: var(--hf-space-2); }
.rrcb__actions { display: inline-flex; gap: var(--hf-space-2); flex-shrink: 0; }
@media (max-width: 640px) {
  .rrcb { flex-direction: column; align-items: stretch; }
  .rrcb__actions { flex-direction: column; }
}
</style>
