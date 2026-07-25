<script setup>
// Wizard step 2 — column mapping.
//   - Fingerprint HIT (mappingSource 'memory'): compact confirmation with a
//     mandatory preview button (F10 — preview is never skipped) + an
//     "Adjust mapping" escape hatch into the editor.
//   - MISS / adjusted: 18-field editor (KNOWN_MAPPING_FIELDS), one HfSelect
//     per field, options = file headers + "Not mapped" (-1).
// The §4d value-columns warning renders prominently when neither
// openingValue nor closingValue is mapped (store.warnCostsUnavailable).
import { ref, computed } from 'vue'
import { useFoodCostUploadStore } from '../upload/upload-store.js'
import { KNOWN_MAPPING_FIELDS } from '../upload/mapping-memory.js'
import { MAPPING_FIELD_LABELS } from './upload-labels.js'
import { HfButton, HfIcon, HfSelect } from '/js/design-system/hifi/index.js'

const emit = defineEmits(['preview'])
const upload = useFoodCostUploadStore()
const showEditor = ref(false)

const isAutoConfirm = computed(() => upload.mappingSource === 'memory' && !showEditor.value)

const recognisedLabel = computed(() => {
  const stored = upload.storedMapping
  return (stored && stored.label) || upload.fileName || 'this format'
})

const headerOptions = computed(() => {
  const headers = (upload.parsed && upload.parsed.headers) || []
  return [
    { value: -1, label: 'Not mapped' },
    ...headers.map((h, i) => ({ value: i, label: `${i + 1} · ${String(h)}` })),
  ]
})

const fields = KNOWN_MAPPING_FIELDS.map((key) => ({
  key,
  label: MAPPING_FIELD_LABELS[key] || key,
}))

function fieldValue(key) {
  const v = upload.mapping ? upload.mapping[key] : -1
  return typeof v === 'number' ? v : -1
}
</script>

<template>
  <div class="upload-map">
    <div class="hf-mono upload-map__file">{{ upload.fileName }}</div>

    <!-- §4d value-columns warning — rendered ABOVE both branches (T5 review S3:
         a stored mapping lacking value columns must warn on the one-click
         memory path too, not only in the manual editor). -->
    <div
      v-if="upload.warnCostsUnavailable"
      class="upload-map__warn"
      role="alert"
    >
      <HfIcon name="alert" :size="14" color="var(--hf-warn)" />
      <span>
        No value columns are mapped — costs can't be derived from this file,
        so cost KPIs and order Rand values will be unavailable. Map
        "Opening value (R)" and "Closing value (R)" if your file has them.
      </span>
    </div>

    <!-- One-click confirmation (fingerprint hit) -->
    <div v-if="isAutoConfirm" class="upload-map__auto">
      <div class="upload-map__auto-head">
        <HfIcon name="check" :size="16" color="var(--hf-good)" />
        <span>Recognised: <strong>{{ recognisedLabel }}</strong> — saved mapping applied.</span>
      </div>
      <p class="upload-map__auto-sub">
        You've uploaded this format before. Preview the processed rows to
        confirm before saving.
      </p>
      <div class="upload-map__actions">
        <HfButton variant="ghost" size="sm" @click="showEditor = true">Adjust mapping</HfButton>
        <HfButton size="sm" @click="emit('preview')">Preview data</HfButton>
      </div>
    </div>

    <!-- Manual editor (miss / adjusted) -->
    <div v-else>
      <p class="upload-map__intro">
        Match each field to a column from your file. Leave fields your file
        doesn't have as "Not mapped".
      </p>

      <div class="upload-map__grid">
        <div v-for="f in fields" :key="f.key" class="upload-map__row">
          <label class="upload-map__label">{{ f.label }}</label>
          <HfSelect
            :model-value="fieldValue(f.key)"
            :options="headerOptions"
            @update:model-value="(v) => upload.setMappingField(f.key, v)"
          />
        </div>
      </div>

      <div class="upload-map__actions">
        <HfButton variant="ghost" size="sm" @click="upload.resetUpload()">Choose a different file</HfButton>
        <HfButton size="sm" @click="emit('preview')">Preview data</HfButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upload-map__file { font-size: 11px; color: var(--hf-muted); margin-bottom: 10px; }

.upload-map__auto {
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md);
  background: var(--hf-bg);
  padding: 16px;
}
.upload-map__auto-head {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px;
}
.upload-map__auto-sub { font-size: 12px; color: var(--hf-muted); margin: 8px 0 0; line-height: 1.5; }

.upload-map__intro { font-size: 13px; color: var(--hf-ink-2); margin: 0 0 12px; line-height: 1.5; }

.upload-map__warn {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 12px; margin-bottom: 12px;
  border: 1px solid var(--hf-warn);
  border-radius: var(--hf-radius);
  background: var(--hf-bg2); /* fallback when color-mix is unsupported */
  background: color-mix(in srgb, var(--hf-warn) 8%, transparent);
  font-size: 12.5px; line-height: 1.5;
}
.upload-map__warn :deep(svg) { flex-shrink: 0; margin-top: 2px; }

.upload-map__grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  max-height: 320px; overflow-y: auto;
  padding-right: 4px;
}
@media (max-width: 640px) { .upload-map__grid { grid-template-columns: 1fr; } }
.upload-map__row { display: flex; flex-direction: column; gap: 3px; }
.upload-map__label { font-size: 11px; color: var(--hf-muted); letter-spacing: 0.02em; }

.upload-map__actions {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 16px;
}
</style>
