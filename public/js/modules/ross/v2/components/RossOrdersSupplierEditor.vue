<script setup>
// Inline supplier editor — create or edit one supplier in the book.
// Follows the RossPeople.vue inline-editor pattern: no modal, no SweetAlert2
// (it silently no-ops on the Hi-Fi mount shell — PR #42 lesson), inline error
// banner, Cancel/Save in the panel footer.
//
// Client validation here MIRRORS the server and is not authoritative: the CF's
// Zod schema in functions/purchase-orders/validate.js is the load-bearing check.
// All text renders through {{ }}, which auto-escapes. No v-html anywhere.
import { ref, computed, watch } from 'vue'
import { HfIcon, HfButton, HfInput } from '/js/design-system/hifi/index.js'

const props = defineProps({
  supplier: { type: Object, default: null }, // null = create mode
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['save', 'cancel'])

const DAYS = [
  { id: 1, label: 'Mon' }, { id: 2, label: 'Tue' }, { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' }, { id: 5, label: 'Fri' }, { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
]

function blank() {
  return {
    name: '', email: '', contactName: '', phone: '', accountNumber: '',
    deliveryDays: [], leadTimeDays: '', minimumOrderValue: '', notes: '',
  }
}

function fromSupplier(s) {
  if (!s) return blank()
  return {
    name: s.name || '',
    email: s.email || '',
    contactName: s.contactName || '',
    phone: s.phone || '',
    accountNumber: s.accountNumber || '',
    deliveryDays: Array.isArray(s.deliveryDays) ? [...s.deliveryDays] : [],
    leadTimeDays: Number.isFinite(s.leadTimeDays) ? String(s.leadTimeDays) : '',
    minimumOrderValue: Number.isFinite(s.minimumOrderValue) ? String(s.minimumOrderValue) : '',
    notes: s.notes || '',
  }
}

const form = ref(fromSupplier(props.supplier))
watch(() => props.supplier, (s) => { form.value = fromSupplier(s) })

const isCreate = computed(() => !props.supplier)

// Mirrors the server's z.string().email() closely enough to catch typos at the
// point of entry; the CF still rejects anything this misses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const nameError = computed(() => {
  const n = form.value.name.trim()
  if (!n) return 'A name is required.'
  if (n.length > 120) return 'Keep the name under 120 characters.'
  return ''
})
const emailError = computed(() => {
  const e = form.value.email.trim()
  if (!e) return '' // empty is a valid, expected state — see the hint below
  return EMAIL_RE.test(e) ? '' : 'That does not look like an email address.'
})
const formValid = computed(() => !nameError.value && !emailError.value)

// States the D1 limitation at the point of DECISION rather than at send time,
// which is where the owner can actually do something about it.
const showEmailHint = computed(() => !form.value.email.trim())

function toggleDay(id) {
  const set = new Set(form.value.deliveryDays)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  form.value = { ...form.value, deliveryDays: [...set].sort((a, b) => a - b) }
}

function numberOrUndefined(v) {
  const t = String(v).trim()
  if (!t) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

function submit() {
  if (!formValid.value || props.saving) return
  // Build the payload to match SupplierInput: optional numerics are OMITTED
  // rather than sent as null, because the schema treats absent as "not set".
  const supplier = {
    name: form.value.name.trim(),
    email: form.value.email.trim(),
    contactName: form.value.contactName.trim(),
    phone: form.value.phone.trim(),
    accountNumber: form.value.accountNumber.trim(),
    notes: form.value.notes.trim(),
    active: props.supplier ? props.supplier.active !== false : true,
  }
  if (form.value.deliveryDays.length) supplier.deliveryDays = [...form.value.deliveryDays]
  const lead = numberOrUndefined(form.value.leadTimeDays)
  if (lead !== undefined) supplier.leadTimeDays = lead
  const moq = numberOrUndefined(form.value.minimumOrderValue)
  if (moq !== undefined) supplier.minimumOrderValue = moq

  emit('save', { supplier })
}
</script>

<template>
  <div class="orded">
    <div class="orded__head">
      <h3 class="orded__title">{{ isCreate ? 'Add supplier' : 'Edit supplier' }}</h3>
      <button class="orded__close" @click="emit('cancel')" aria-label="Close editor">
        <HfIcon name="x" :size="14" />
      </button>
    </div>

    <div class="orded__grid">
      <label class="orded__field">
        <span class="hf-eyebrow">Supplier name *</span>
        <HfInput v-model="form.name" placeholder="e.g. Peninsula Beverages" />
        <span v-if="nameError" class="orded__field-err">{{ nameError }}</span>
      </label>
      <label class="orded__field">
        <span class="hf-eyebrow">Email</span>
        <HfInput v-model="form.email" type="email" placeholder="orders@supplier.co.za" />
        <span v-if="emailError" class="orded__field-err">{{ emailError }}</span>
        <span v-else-if="showEmailHint" class="orded__field-hint">
          Without an email you can export this order but not send it from Ross.
        </span>
      </label>
      <label class="orded__field">
        <span class="hf-eyebrow">Contact name</span>
        <HfInput v-model="form.contactName" placeholder="e.g. Thandi Mokoena" />
      </label>
      <label class="orded__field">
        <span class="hf-eyebrow">Phone</span>
        <HfInput v-model="form.phone" placeholder="+27 …" />
      </label>
      <label class="orded__field">
        <span class="hf-eyebrow">Our account number</span>
        <HfInput v-model="form.accountNumber" placeholder="e.g. ACC-10422" />
      </label>
      <label class="orded__field">
        <span class="hf-eyebrow">Lead time (days)</span>
        <HfInput v-model="form.leadTimeDays" type="number" placeholder="e.g. 2" />
      </label>
      <label class="orded__field">
        <span class="hf-eyebrow">Minimum order (R)</span>
        <HfInput v-model="form.minimumOrderValue" type="number" placeholder="e.g. 1500" />
      </label>
    </div>

    <div class="orded__days">
      <span class="hf-eyebrow orded__days-label">Delivery days</span>
      <div class="orded__days-grid">
        <button
          v-for="d in DAYS" :key="d.id"
          type="button"
          class="orded__day"
          :class="{ 'is-active': form.deliveryDays.includes(d.id) }"
          @click="toggleDay(d.id)"
        >{{ d.label }}</button>
      </div>
    </div>

    <label class="orded__field orded__field--wide">
      <span class="hf-eyebrow">Notes</span>
      <HfInput v-model="form.notes" placeholder="Anything worth remembering when ordering" />
    </label>

    <div v-if="error" class="orded__error">
      <HfIcon name="x" :size="12" />
      <span>{{ error }}</span>
    </div>

    <div class="orded__actions">
      <HfButton variant="ghost" :disabled="saving" @click="emit('cancel')">Cancel</HfButton>
      <HfButton variant="solid" :disabled="!formValid || saving" @click="submit">
        {{ saving ? 'Saving…' : (isCreate ? 'Add supplier' : 'Save changes') }}
      </HfButton>
    </div>
  </div>
</template>

<style scoped>
.orded {
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md, 10px);
  background: var(--hf-surface-2, var(--hf-surface));
  padding: 16px;
  margin-bottom: 16px;
}
.orded__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.orded__title { font-size: 15px; font-weight: 600; margin: 0; color: var(--hf-ink); }
.orded__close {
  background: none; border: none; cursor: pointer; color: var(--hf-ink-3);
  padding: 4px; display: inline-flex; border-radius: 6px;
}
.orded__close:hover { color: var(--hf-ink); background: var(--hf-surface-3, transparent); }
.orded__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.orded__field { display: flex; flex-direction: column; gap: 6px; }
.orded__field--wide { margin-top: 12px; }
.orded__field-err { font-size: 12px; color: var(--hf-danger, #c0392b); }
.orded__field-hint { font-size: 12px; color: var(--hf-ink-3); line-height: 1.4; }
.orded__days { margin-top: 14px; }
.orded__days-label { display: block; margin-bottom: 8px; }
.orded__days-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.orded__day {
  border: 1px solid var(--hf-line); background: transparent; color: var(--hf-ink-2);
  border-radius: 999px; padding: 5px 12px; font-size: 12px; cursor: pointer;
}
.orded__day.is-active { background: var(--hf-accent); border-color: var(--hf-accent); color: var(--hf-on-accent, #fff); }
.orded__error {
  display: flex; align-items: center; gap: 8px; margin-top: 14px;
  padding: 10px 12px; border-radius: 8px; font-size: 13px;
  background: var(--hf-danger-soft, rgba(192, 57, 43, 0.08));
  color: var(--hf-danger, #c0392b);
}
.orded__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
@media (max-width: 640px) {
  .orded__grid { grid-template-columns: 1fr; }
  .orded__actions { flex-direction: column-reverse; }
}
</style>
