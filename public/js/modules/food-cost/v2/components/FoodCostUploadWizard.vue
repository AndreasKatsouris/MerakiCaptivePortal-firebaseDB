<script setup>
// Upload wizard — bespoke modal overlay (the Hi-Fi kit has no modal; --hf-*
// tokens throughout). Steps are DERIVED from the upload store's status
// machine (upload-store.js): idle → parsed → mapped-auto|mapped-manual →
// previewed → saving → saved | error. All state changes go through store
// actions; this shell only orchestrates which step renders and shows the
// typed inline banners (never SweetAlert2 on v2 surfaces).
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useFoodCostUploadStore } from '../upload/upload-store.js'
import { bannerText } from './upload-labels.js'
import { HfButton, HfIcon } from '/js/design-system/hifi/index.js'
import UploadFileStep from './UploadFileStep.vue'
import UploadMappingStep from './UploadMappingStep.vue'
import UploadPreviewStep from './UploadPreviewStep.vue'

const props = defineProps({
  locationId: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const upload = useFoodCostUploadStore()

// "Back to mapping" from the preview: status stays 'previewed' (the store has
// no backward transition); this local flag re-shows the editor, and the next
// buildPreview clears it.
const forceMapping = ref(false)

const step = computed(() => {
  switch (upload.status) {
    case 'saved': return 'saved'
    case 'saving': return 'preview'
    case 'previewed':
    case 'error': return forceMapping.value ? 'mapping' : 'preview'
    case 'mapped-auto':
    case 'mapped-manual': return 'mapping'
    case 'parsed': return 'analysing'
    default: return 'file'
  }
})

const stepIndex = computed(() => (
  { file: 1, analysing: 1, mapping: 2, preview: 3, saved: 3 }[step.value] || 1
))
const stepTitles = ['Upload file', 'Map columns', 'Preview & save']

const bannerMessage = computed(() => bannerText(upload.banner))
const isSaveFailed = computed(() => upload.banner && upload.banner.code === 'save-failed')

function onPreview() {
  // First preview uses the store defaults; the preview step re-runs it with
  // edited params. Preview is mandatory on BOTH mapping paths (F10).
  upload.buildPreview(upload.previewParams || {})
}

watch(() => upload.status, (s) => {
  if (s === 'previewed') forceMapping.value = false
})

function close() {
  if (upload.status === 'saving') return
  upload.resetUpload()
  emit('close')
}

// Saved → success banner, then auto-close (the overview already reloaded in
// saveUpload).
let closeTimer = null
watch(() => upload.status, (s) => {
  if (s === 'saved') closeTimer = setTimeout(close, 1800)
})

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  upload.resetUpload() // fresh wizard every open (mount = open)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  if (closeTimer) clearTimeout(closeTimer)
})
</script>

<template>
  <div class="upload-wizard" role="dialog" aria-modal="true" aria-label="Upload stock count" @mousedown.self="close">
    <div class="upload-wizard__panel">
      <header class="upload-wizard__head">
        <div>
          <div class="hf-eyebrow">Upload stock count</div>
          <div class="upload-wizard__steps">
            <span
              v-for="(t, i) in stepTitles" :key="t"
              class="upload-wizard__step"
              :class="{ 'is-active': stepIndex === i + 1, 'is-done': stepIndex > i + 1 }"
            >
              <span class="hf-mono upload-wizard__step-n">{{ i + 1 }}</span>
              {{ t }}
            </span>
          </div>
        </div>
        <button
          class="upload-wizard__close"
          type="button"
          aria-label="Close"
          :disabled="upload.status === 'saving'"
          @click="close"
        >
          <HfIcon name="x" :size="16" />
        </button>
      </header>

      <!-- Inline banner (guard rejections, no-items, save-failed) -->
      <div v-if="bannerMessage && step !== 'saved'" class="upload-wizard__banner" role="alert">
        <HfIcon name="alert" :size="14" color="var(--hf-warn)" />
        <span>{{ bannerMessage }}</span>
      </div>

      <div class="upload-wizard__body">
        <UploadFileStep v-if="step === 'file'" />

        <div v-else-if="step === 'analysing'" class="upload-wizard__analysing">
          <div class="hf-eyebrow">Analysing columns…</div>
        </div>

        <UploadMappingStep v-else-if="step === 'mapping'" @preview="onPreview" />

        <UploadPreviewStep
          v-else-if="step === 'preview'"
          :location-id="locationId"
          @back="forceMapping = true"
        />

        <div v-else-if="step === 'saved'" class="upload-wizard__saved" role="status">
          <HfIcon name="check" :size="22" color="var(--hf-good)" />
          <div class="upload-wizard__saved-lead">Stock count saved</div>
          <div class="upload-wizard__saved-sub">The dashboard is refreshing with your new data.</div>
        </div>
      </div>

      <!-- save-failed retry hint (the preview step's Save doubles as retry) -->
      <div v-if="isSaveFailed && step === 'preview'" class="upload-wizard__retry-hint">
        Nothing was saved — check your connection and press
        <strong>Save stock count</strong> to retry.
      </div>
    </div>
  </div>
</template>

<style scoped>
.upload-wizard {
  position: fixed; inset: 0; z-index: 100;
  display: grid; place-items: center;
  background: rgba(20, 18, 12, 0.45);
  padding: 20px;
}
.upload-wizard__panel {
  width: 100%; max-width: 760px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  background: var(--hf-paper);
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md);
  box-shadow: var(--hf-shadow-2);
  padding: 20px 24px 24px;
}

.upload-wizard__head {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 14px;
}
.upload-wizard__steps { display: flex; gap: 14px; margin-top: 8px; flex-wrap: wrap; }
.upload-wizard__step {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--hf-muted);
}
.upload-wizard__step.is-active { color: var(--hf-ink); font-weight: 500; }
.upload-wizard__step.is-done { color: var(--hf-ink-2); }
.upload-wizard__step-n {
  display: inline-grid; place-items: center;
  width: 18px; height: 18px; font-size: 10px;
  border: 1px solid var(--hf-line-2); border-radius: 999px;
}
.upload-wizard__step.is-active .upload-wizard__step-n {
  background: var(--hf-ink); color: var(--hf-bg); border-color: var(--hf-ink);
}

.upload-wizard__close {
  border: none; background: transparent; cursor: pointer;
  color: var(--hf-muted); padding: 4px; border-radius: var(--hf-radius-sm);
}
.upload-wizard__close:hover { color: var(--hf-ink); background: var(--hf-bg); }
.upload-wizard__close:disabled { opacity: 0.4; cursor: not-allowed; }

.upload-wizard__banner {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 12px; margin-bottom: 14px;
  border: 1px solid var(--hf-warn);
  border-radius: var(--hf-radius);
  background: var(--hf-bg2); /* fallback when color-mix is unsupported */
  background: color-mix(in srgb, var(--hf-warn) 8%, transparent);
  font-size: 12.5px; line-height: 1.5;
}
.upload-wizard__banner :deep(svg) { flex-shrink: 0; margin-top: 2px; }

.upload-wizard__analysing { padding: 48px 0; text-align: center; }

.upload-wizard__saved {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 44px 0;
  text-align: center;
}
.upload-wizard__saved-lead { font-size: 16px; font-weight: 500; margin-top: 6px; }
.upload-wizard__saved-sub { font-size: 12px; color: var(--hf-muted); }

.upload-wizard__retry-hint {
  margin-top: 10px; font-size: 12px; color: var(--hf-muted); text-align: right;
}
</style>
