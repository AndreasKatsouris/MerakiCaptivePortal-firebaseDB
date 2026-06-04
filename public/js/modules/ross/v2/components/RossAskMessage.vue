<!-- public/js/modules/ross/v2/components/RossAskMessage.vue -->
<script setup>
// One conversation turn. User turns are plain text; assistant turns show
// streamed text + a list of live tool-action lines. All text auto-escaped.
defineProps({
  turn: { type: Object, required: true }, // { role, text, actions:[{tool,status}], status }
})

const ACTION_LABEL = {
  done: '✓',
  refused: '⊘',
  failed: '✕',
  declined: '—',
}
</script>

<template>
  <div class="ross-ask-msg" :class="`ross-ask-msg--${turn.role}`">
    <div v-if="turn.text" class="ross-ask-msg__text">{{ turn.text }}</div>
    <div
      v-if="turn.status === 'streaming' && !turn.text"
      class="ross-ask-msg__typing hf-mono"
      aria-live="polite"
    >Ross is thinking…</div>
    <ul v-if="turn.actions.length" class="ross-ask-msg__actions">
      <li v-for="(a, i) in turn.actions" :key="i" class="hf-mono ross-ask-msg__action">
        <span class="ross-ask-msg__action-mark">{{ ACTION_LABEL[a.status] || '·' }}</span> {{ a.tool }} {{ a.status }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ross-ask-msg { margin: 0.6rem 0; }
.ross-ask-msg--user .ross-ask-msg__text {
  background: var(--hf-bg2); color: var(--hf-ink); padding: 0.5rem 0.75rem;
  border-radius: var(--hf-radius-sm); display: inline-block; font-family: var(--hf-font-body);
}
.ross-ask-msg--assistant .ross-ask-msg__text { color: var(--hf-ink); font-family: var(--hf-font-body); white-space: pre-wrap; }
.ross-ask-msg__typing { color: var(--hf-muted); font-size: 0.8rem; }
.ross-ask-msg__actions { list-style: none; margin: 0.4rem 0 0; padding: 0; }
.ross-ask-msg__action { color: var(--hf-muted); font-size: 0.78rem; }
.ross-ask-msg__action-mark { color: var(--hf-accent); }
</style>
