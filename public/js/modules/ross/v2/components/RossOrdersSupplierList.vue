<script setup>
// Supplier rows for the D1 book. Read-only display plus edit / archive intents
// emitted upward — the parent shell owns the store.
//
// Delete is a two-step inline slide-down confirm (the Playbook / People
// pattern), never a modal: SweetAlert2 silently no-ops on the Hi-Fi mount shell
// (PR #42 lesson). The confirm copy says HIDES rather than deletes, because the
// server soft-archives (active:false) so suppliers referenced by a sent PO stay
// resolvable forever. Claiming a hard delete here would be a lie.
//
// All text renders through {{ }}, which auto-escapes. No v-html anywhere.
import { ref } from 'vue'
import { HfIcon, HfChip, HfButton } from '/js/design-system/hifi/index.js'

defineProps({
  suppliers: { type: Array, default: () => [] },
  busyId: { type: String, default: '' },
})
const emit = defineEmits(['edit', 'archive'])

const confirmingId = ref('')

function startConfirm(id) { confirmingId.value = id }
function cancelConfirm() { confirmingId.value = '' }
function commit(id) {
  if (confirmingId.value !== id) return
  emit('archive', id)
  confirmingId.value = ''
}
</script>

<template>
  <ul class="ordl">
    <li v-for="s in suppliers" :key="s.supplierId" class="ordl__row">
      <div class="ordl__body">
        <div class="ordl__name-line">
          <h4 class="ordl__name">{{ s.name }}</h4>
          <HfChip v-if="s.needsEmail" tone="warn">Needs email</HfChip>
        </div>
        <div class="hf-mono ordl__meta">
          <span v-if="s.contactName">{{ s.contactName }}</span>
          <span v-if="s.email">· {{ s.email }}</span>
          <span v-if="s.phone">· {{ s.phone }}</span>
          <span v-if="!s.contactName && !s.email && !s.phone">no contact details yet</span>
        </div>
      </div>

      <div class="ordl__actions">
        <HfButton variant="ghost" :disabled="busyId === s.supplierId" @click="emit('edit', s.supplierId)">
          Edit
        </HfButton>
        <HfButton
          v-if="confirmingId !== s.supplierId"
          variant="ghost"
          :disabled="busyId === s.supplierId"
          @click="startConfirm(s.supplierId)"
        >Remove</HfButton>
      </div>

      <!-- Two-step confirm, inline on the row -->
      <div v-if="confirmingId === s.supplierId" class="ordl__confirm">
        <p class="ordl__confirm-msg">
          Removing hides this supplier from new orders. Past orders keep their record.
        </p>
        <div class="ordl__confirm-actions">
          <HfButton variant="ghost" @click="cancelConfirm">Keep</HfButton>
          <HfButton
            variant="solid"
            :disabled="busyId === s.supplierId"
            @click="commit(s.supplierId)"
          >{{ busyId === s.supplierId ? 'Removing…' : 'Confirm remove' }}</HfButton>
        </div>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.ordl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ordl__row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
  border: 1px solid var(--hf-line); border-radius: var(--hf-radius-md, 10px);
  padding: 12px 14px; background: var(--hf-surface);
}
.ordl__body { flex: 1 1 240px; min-width: 0; }
.ordl__name-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ordl__name { margin: 0; font-size: 14px; font-weight: 600; color: var(--hf-ink); }
.ordl__meta {
  font-size: 12px; color: var(--hf-ink-3); margin-top: 3px;
  display: flex; gap: 4px; flex-wrap: wrap;
}
.ordl__actions { display: flex; gap: 6px; flex-shrink: 0; }
.ordl__confirm {
  flex-basis: 100%; border-top: 1px dashed var(--hf-line); padding-top: 10px; margin-top: 2px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.ordl__confirm-msg { margin: 0; font-size: 13px; color: var(--hf-ink-2); }
.ordl__confirm-actions { display: flex; gap: 6px; }
@media (max-width: 640px) {
  .ordl__actions { width: 100%; }
  .ordl__confirm { flex-direction: column; align-items: stretch; }
}
</style>
