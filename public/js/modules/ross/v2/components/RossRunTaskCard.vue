<script setup>
import { ref, watch } from 'vue'
import RossRunTaskInput from './RossRunTaskInput.vue'
import HfChip from '../../../../design-system/hifi/components/HfChip.vue'
import HfButton from '../../../../design-system/hifi/components/HfButton.vue'

const props = defineProps({
  task:         { type: Object, required: true },
  response:     { default: null },               // { value, note, submittedAt, flagged } or null
  saveStatus:   { type: String, default: 'idle' }, // idle | saving | saved | error
  error:        { type: String, default: null },
  requiresNote: { type: Boolean, default: false }, // server 422 fallback: open note field
  disabled:     { type: Boolean, default: false }, // true after run completes
})

const emit = defineEmits(['save', 'dismissError'])

const noteFieldOpen = ref(false)
const pendingValue = ref(undefined)
const noteText = ref('')

function onCommit(value) {
  // No client-side pre-flight tripped — save without a note. Stash the value
  // so the server-fallback path (watch on requiresNote below) can resubmit it
  // with a note if the server returns 422.
  pendingValue.value = value
  noteFieldOpen.value = false
  emit('save', { value, note: undefined })
}

function onPreflightNote({ value }) {
  pendingValue.value = value
  noteText.value = props.response?.note ?? ''
  noteFieldOpen.value = true
}

// Server safety net: when the store flags this task as requiring a note
// (server 422 path), open the note field with the value we just submitted
// stashed in pendingValue.
watch(() => props.requiresNote, (val) => {
  if (val) {
    noteText.value = props.response?.note ?? ''
    noteFieldOpen.value = true
  }
})

function onNoteBlur() {
  const note = noteText.value.trim()
  if (!note) return  // can't save without note when pre-flight tripped
  emit('save', { value: pendingValue.value, note })
}
</script>

<template>
  <article class="rrtc" :class="{ 'rrtc--done': response, 'rrtc--flagged': response?.flagged }">
    <header class="rrtc__head">
      <h3 class="rrtc__title">{{ task.title }}</h3>
      <div class="rrtc__meta">
        <HfChip v-if="task.required">Required</HfChip>
        <HfChip v-if="response?.flagged" tone="warn">Flagged</HfChip>
      </div>
    </header>

    <p v-if="task.description" class="rrtc__desc">{{ task.description }}</p>

    <div class="rrtc__input">
      <RossRunTaskInput
        :task="task"
        :value="response?.value"
        :disabled="disabled"
        @commit="onCommit"
        @preflight-note="onPreflightNote"
      />
      <span class="rrtc__save" :data-status="saveStatus">
        <span v-if="saveStatus === 'saving'">Saving…</span>
        <span v-else-if="saveStatus === 'saved'">Saved ✓</span>
      </span>
    </div>

    <div v-if="noteFieldOpen || response?.note" class="rrtc__note">
      <label class="rrtc__note-label">
        Note <span class="rrtc__note-hint">(required — value is out of range)</span>
      </label>
      <textarea
        v-model="noteText"
        class="rrtc__note-input"
        :disabled="disabled"
        rows="2"
        placeholder="Explain the out-of-range value"
        @blur="onNoteBlur"
      ></textarea>
    </div>

    <div v-if="error" class="rrtc__error">
      <span>{{ error }}</span>
      <HfButton variant="ghost" size="sm" @click="emit('dismissError')">Dismiss</HfButton>
    </div>
  </article>
</template>

<style scoped>
.rrtc {
  background: var(--hf-paper); border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-lg); padding: var(--hf-space-4) var(--hf-space-5);
  margin: 0 0 var(--hf-space-3);
  transition: border-color var(--hf-transition);
}
.rrtc--done { border-color: var(--hf-good); }
.rrtc--flagged { border-color: var(--hf-warn); }
.rrtc__head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--hf-space-3); margin-bottom: var(--hf-space-2);
}
.rrtc__title {
  font: 1.05rem/1.3 var(--hf-font-display);
  color: var(--hf-ink); margin: 0;
}
.rrtc__meta { display: inline-flex; gap: var(--hf-space-2); flex-shrink: 0; }
.rrtc__desc { color: var(--hf-muted); margin: 0 0 var(--hf-space-3); font-size: 0.9rem; }
.rrtc__input {
  display: flex; align-items: center; gap: var(--hf-space-3);
}
.rrtc__save { font-size: 0.85rem; color: var(--hf-muted); min-width: 5rem; }
.rrtc__save[data-status="saved"] { color: var(--hf-good); }
.rrtc__note { margin-top: var(--hf-space-3); }
.rrtc__note-label {
  display: block; font-size: 0.85rem; color: var(--hf-ink-2); margin-bottom: var(--hf-space-1);
}
.rrtc__note-hint { color: var(--hf-warn); font-style: italic; }
.rrtc__note-input {
  width: 100%; font: inherit; color: var(--hf-ink);
  background: var(--hf-bg); border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md); padding: var(--hf-space-2) var(--hf-space-3);
  resize: vertical;
}
.rrtc__error {
  margin-top: var(--hf-space-3); padding: var(--hf-space-2) var(--hf-space-3);
  background: var(--hf-bg2); border-left: 3px solid var(--hf-crit);
  border-radius: 0 var(--hf-radius-sm) var(--hf-radius-sm) 0;
  display: flex; align-items: center; justify-content: space-between; gap: var(--hf-space-3);
  color: var(--hf-crit); font-size: 0.9rem;
}
</style>
