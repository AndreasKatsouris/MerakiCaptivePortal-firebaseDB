<script setup>
// Wizard step 1 — bespoke file pick + drag-drop (the Hi-Fi kit has no file
// input; §4d). Guard rejections surface as inline banners rendered by the
// wizard shell (store.banner); this step only hands the File to the store.
import { ref } from 'vue'
import { useFoodCostUploadStore } from '../upload/upload-store.js'
import { MAX_FILE_BYTES, MAX_ROWS, MAX_COLS } from '../upload/ingest-guards.js'
import { HfIcon } from '/js/design-system/hifi/index.js'

const upload = useFoodCostUploadStore()
const inputEl = ref(null)
const dragOver = ref(false)

const limitsLine = `CSV · up to ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB · ${MAX_ROWS.toLocaleString('en-ZA')} rows · ${MAX_COLS} columns`

function pickFile() { inputEl.value && inputEl.value.click() }

function onInputChange(e) {
  const file = e.target.files && e.target.files[0]
  if (file) upload.ingestFile(file)
  e.target.value = '' // allow re-picking the same file after a rejection
}

function onDrop(e) {
  dragOver.value = false
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
  if (file) upload.ingestFile(file)
}
</script>

<template>
  <div class="upload-file">
    <div
      class="upload-file__zone"
      :class="{ 'is-drag': dragOver }"
      role="button"
      tabindex="0"
      aria-label="Choose a CSV file to upload"
      @click="pickFile"
      @keydown.enter.prevent="pickFile"
      @keydown.space.prevent="pickFile"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <HfIcon name="up" :size="22" color="var(--hf-muted)" />
      <div class="upload-file__lead">Drop your stock-count CSV here</div>
      <div class="upload-file__sub">or click to browse</div>
      <div class="hf-mono upload-file__limits">{{ limitsLine }}</div>
    </div>
    <input
      ref="inputEl"
      type="file"
      accept=".csv,text/csv"
      class="upload-file__input"
      @change="onInputChange"
    />
    <p class="upload-file__hint">
      Upload the same POS export format twice and the column mapping is
      remembered — the second upload is one click.
    </p>
  </div>
</template>

<style scoped>
.upload-file__zone {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 40px 24px;
  border: 1.5px dashed var(--hf-line-2);
  border-radius: var(--hf-radius-md);
  background: var(--hf-bg);
  cursor: pointer;
  text-align: center;
  transition: border-color var(--hf-transition), background var(--hf-transition);
}
.upload-file__zone:hover, .upload-file__zone.is-drag {
  border-color: var(--hf-ink);
  background: var(--hf-bg2);
}
.upload-file__zone:focus-visible { outline: 2px solid var(--hf-accent); outline-offset: 2px; }
.upload-file__lead { font-size: 14px; font-weight: 500; margin-top: 6px; }
.upload-file__sub { font-size: 12px; color: var(--hf-muted); }
.upload-file__limits { font-size: 11px; color: var(--hf-muted); margin-top: 8px; }
.upload-file__input { display: none; }
.upload-file__hint { font-size: 12px; color: var(--hf-muted); line-height: 1.5; margin: 14px 2px 0; }
</style>
