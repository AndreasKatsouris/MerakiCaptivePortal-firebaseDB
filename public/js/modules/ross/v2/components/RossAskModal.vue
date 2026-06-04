<!-- public/js/modules/ross/v2/components/RossAskModal.vue -->
<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import RossAskMessage from './RossAskMessage.vue'
import RossAskConfirmCard from './RossAskConfirmCard.vue'
import {
  initialConversation, startUserTurn, startResume, reduceEvent,
} from '../agent/ross-agent-conversation.js'
import { streamRossChat, resumeRossChat } from '../agent/ross-agent-client.js'

const visible = ref(false)
const input = ref('')
const inputEl = ref(null)
const scrollEl = ref(null)
let convo = reactive(initialConversation())

function replaceConvo(next) {
  // reactive() can't be reassigned; copy fields in so Vue tracks the change.
  Object.assign(convo, next)
}

async function scrollToEnd() {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}

function onEvent(ev) {
  replaceConvo(reduceEvent(convo, ev))
  scrollToEnd()
}

async function send() {
  const message = input.value.trim()
  if (!message || convo.busy) return
  input.value = ''
  replaceConvo(startUserTurn(convo, message))
  scrollToEnd()
  await streamRossChat({ message, threadId: convo.threadId || undefined }, onEvent)
}

async function decide(decision) {
  const pending = convo.pendingConfirm
  if (!pending) return
  replaceConvo(startResume(convo))
  scrollToEnd()
  await resumeRossChat({ resumeTurnId: pending.turnId, decision }, onEvent)
}

function open(seed) {
  visible.value = true
  if (seed) input.value = seed
  nextTick(() => inputEl.value && inputEl.value.focus())
}

function close() { visible.value = false }

function onKeydown(e) {
  // ⌘K / Ctrl+K toggles open.
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    visible.value ? close() : open()
    return
  }
  if (visible.value && e.key === 'Escape') { e.preventDefault(); close() }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// SA-locale cost label (review N-2): sub-rand turns read "12c"; a rand or more
// reads "R1.50" rather than a raw "150c".
const costLabel = computed(() => {
  const c = convo.lastCostCents
  if (c === null || c === undefined) return ''
  return c < 100 ? `${c}c` : `R${(c / 100).toFixed(2)}`
})

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="ross-ask-scrim" @click.self="close">
      <div class="ross-ask-modal" role="dialog" aria-modal="true" aria-label="Ask Ross">
        <header class="ross-ask-modal__head">
          <HfIcon name="sparkle" :size="16" color="var(--hf-accent)" />
          <span class="ross-ask-modal__title">Ask Ross</span>
          <button class="ross-ask-modal__close" aria-label="Close" @click="close">✕</button>
        </header>

        <div ref="scrollEl" class="ross-ask-modal__body">
          <p v-if="!convo.turns.length" class="ross-ask-modal__empty hf-mono">
            Ask about your workflows, staff, runs, or compliance.
          </p>
          <RossAskMessage v-for="(t, i) in convo.turns" :key="i" :turn="t" />

          <RossAskConfirmCard
            v-if="convo.pendingConfirm"
            :pending="convo.pendingConfirm"
            :busy="false"
            @approve="decide('approve')"
            @decline="decide('decline')"
          />

          <div v-if="convo.banner" class="ross-ask-banner" :class="`ross-ask-banner--${convo.banner.kind}`">
            {{ convo.banner.message }}
          </div>
        </div>

        <footer class="ross-ask-modal__foot">
          <input
            ref="inputEl"
            v-model="input"
            class="ross-ask-modal__input"
            type="text"
            placeholder="Ask Ross anything…"
            :disabled="convo.busy"
            @keydown.enter="send"
          />
          <button class="ross-ask-modal__send" :disabled="convo.busy || !input.trim()" @click="send">Send</button>
        </footer>
        <div v-if="convo.lastCostCents !== null" class="hf-mono ross-ask-modal__cost">
          last turn · {{ costLabel }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ross-ask-scrim {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 10vh; z-index: 1000;
}
.ross-ask-modal {
  width: min(640px, 92vw); max-height: 75vh; display: flex; flex-direction: column;
  background: var(--hf-paper); border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-lg); box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden;
}
.ross-ask-modal__head { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--hf-line); }
.ross-ask-modal__title { font-family: var(--hf-font-display); color: var(--hf-ink); flex: 1; }
.ross-ask-modal__close { background: none; border: none; color: var(--hf-muted); cursor: pointer; font-size: 0.9rem; }
.ross-ask-modal__body { flex: 1; overflow-y: auto; padding: 1rem; }
.ross-ask-modal__empty { color: var(--hf-muted); font-size: 0.8rem; }
.ross-ask-banner { margin-top: 0.6rem; padding: 0.6rem 0.8rem; border-radius: var(--hf-radius-sm); font-family: var(--hf-font-body); font-size: 0.85rem; }
.ross-ask-banner--terminal { background: var(--hf-bg2); color: var(--hf-muted); border: 1px solid var(--hf-line); }
.ross-ask-banner--error { background: #fdecea; color: #b3261e; border: 1px solid #f5c6c2; }
.ross-ask-modal__foot { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid var(--hf-line); }
.ross-ask-modal__input {
  flex: 1; padding: 0.5rem 0.75rem; border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-sm); font-family: var(--hf-font-body); color: var(--hf-ink); background: var(--hf-paper);
}
.ross-ask-modal__send {
  padding: 0.5rem 1.1rem; border-radius: var(--hf-radius-sm); border: 1px solid var(--hf-accent);
  background: var(--hf-accent); color: var(--hf-paper); cursor: pointer; font-family: var(--hf-font-body);
}
.ross-ask-modal__send:disabled { opacity: 0.5; cursor: default; }
.ross-ask-modal__cost { color: var(--hf-muted); font-size: 0.7rem; text-align: right; padding: 0 1rem 0.6rem; }
</style>
