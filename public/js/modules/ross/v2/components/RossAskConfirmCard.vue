<!-- public/js/modules/ross/v2/components/RossAskConfirmCard.vue -->
<script setup>
// Inline confirm-card for a `confirm`-tier agent action (established v2 inline
// pattern, not a modal-on-modal). summary/args are server-sourced and rendered
// via auto-escaping interpolation — never v-html.
defineProps({
  pending: { type: Object, required: true }, // { turnId, tool, summary, args, expiresAt }
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['approve', 'decline'])
</script>

<template>
  <div class="ross-ask-confirm" role="group" aria-label="Confirm Ross action">
    <div class="ross-ask-confirm__head">
      <HfIcon name="sparkle" :size="14" color="var(--hf-accent)" />
      <span class="hf-mono ross-ask-confirm__eyebrow">Ross proposes</span>
    </div>
    <p class="ross-ask-confirm__summary">{{ pending.summary }}</p>
    <div class="ross-ask-confirm__actions">
      <button class="ross-ask-confirm__btn ross-ask-confirm__btn--go" :disabled="busy" @click="emit('approve')">Confirm</button>
      <button class="ross-ask-confirm__btn" :disabled="busy" @click="emit('decline')">Cancel</button>
    </div>
  </div>
</template>

<style scoped>
.ross-ask-confirm {
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-sm);
  background: var(--hf-bg2);
  padding: 0.75rem;
  margin: 0.5rem 0;
}
.ross-ask-confirm__head { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
.ross-ask-confirm__eyebrow { color: var(--hf-muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; }
.ross-ask-confirm__summary { color: var(--hf-ink); font-family: var(--hf-font-body); margin: 0 0 0.6rem; }
.ross-ask-confirm__actions { display: flex; gap: 0.5rem; }
.ross-ask-confirm__btn {
  font-family: var(--hf-font-body); font-size: 0.85rem; padding: 0.35rem 0.9rem;
  border-radius: var(--hf-radius-sm); border: 1px solid var(--hf-line);
  background: var(--hf-paper); color: var(--hf-ink); cursor: pointer;
}
.ross-ask-confirm__btn--go { background: var(--hf-accent); color: var(--hf-paper); border-color: var(--hf-accent); }
.ross-ask-confirm__btn:disabled { opacity: 0.5; cursor: default; }
</style>
