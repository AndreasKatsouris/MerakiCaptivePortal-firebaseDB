<script setup>
import { reactive, computed } from 'vue'
import HfButton   from '/js/design-system/hifi/components/HfButton.vue'
import HfInput    from '/js/design-system/hifi/components/HfInput.vue'
import HfSelect   from '/js/design-system/hifi/components/HfSelect.vue'
import HfCheckbox from '/js/design-system/hifi/components/HfCheckbox.vue'
import { validatePassword } from '../signup-service.js'
import { showToast } from '/js/utils/toast.js'

const props = defineProps({
  tier:       { type: Object, default: () => ({}) },
  submitting: { type: Boolean, default: false },
})
const emit = defineEmits(['back', 'submit'])

const form = reactive({
  businessName:    '',
  businessAddress: '',
  isFranchise:     false,
  franchiseName:   '',
  brandName:       '',
  businessPhone:   '',
  businessType:    '',
  firstName:       '',
  lastName:        '',
  email:           '',
  password:        '',
  confirmPassword: '',
  agreeTerms:      false,
})

const businessTypeOptions = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe',       label: 'Cafe' },
  { value: 'bar',        label: 'Bar' },
  { value: 'hotel',      label: 'Hotel' },
  { value: 'other',      label: 'Other' },
]

const passwordCheck = computed(() => validatePassword(form.password))
const passwordsMatch = computed(() =>
  form.password.length > 0 && form.password === form.confirmPassword
)

function onSubmit() {
  if (props.submitting) return
  if (form.password !== form.confirmPassword) {
    showToast('Passwords do not match', 'error'); return
  }
  if (!passwordCheck.value.ok) {
    showToast('Password does not meet requirements', 'error'); return
  }
  if (!form.agreeTerms) {
    showToast('Please agree to the terms and conditions', 'error'); return
  }
  emit('submit', { ...form })
}

const reqLabel = {
  length:    'At least 8 characters',
  uppercase: 'Uppercase letter',
  lowercase: 'Lowercase letter',
  number:    'Number',
  special:   'Special character',
}
</script>

<template>
  <section class="form-step">
    <div class="form-step__top">
      <button type="button" class="form-step__back" @click="emit('back')" :disabled="submitting">
        ← Back to plans
      </button>
      <div v-if="tier && tier.name" class="form-step__chip">
        Plan: <strong>{{ tier.name }}</strong>
      </div>
    </div>

    <form class="form-step__form" @submit.prevent="onSubmit" novalidate>
      <h2 class="form-step__heading">Create your account</h2>

      <fieldset class="form-step__group">
        <legend>Business information</legend>

        <label class="form-step__field">
          <span class="form-step__label">Restaurant / business name</span>
          <HfInput v-model="form.businessName" placeholder="e.g. Bella Vista Bistro" />
        </label>

        <label class="form-step__field">
          <span class="form-step__label">Business address</span>
          <HfInput v-model="form.businessAddress" placeholder="Street, suburb, city" />
        </label>

        <div class="form-step__field">
          <HfCheckbox v-model="form.isFranchise">
            This location is part of a franchise
          </HfCheckbox>
        </div>

        <template v-if="form.isFranchise">
          <label class="form-step__field">
            <span class="form-step__label">Franchise name</span>
            <HfInput v-model="form.franchiseName" placeholder="Franchise group" />
          </label>
          <label class="form-step__field">
            <span class="form-step__label">Brand name (if different from business name)</span>
            <HfInput v-model="form.brandName" placeholder="Brand" />
          </label>
        </template>

        <div class="form-step__row">
          <label class="form-step__field">
            <span class="form-step__label">Business phone</span>
            <HfInput v-model="form.businessPhone" type="tel" placeholder="+27…" />
          </label>
          <label class="form-step__field">
            <span class="form-step__label">Business type</span>
            <HfSelect
              v-model="form.businessType"
              :options="businessTypeOptions"
              placeholder="Select type"
            />
          </label>
        </div>
      </fieldset>

      <fieldset class="form-step__group">
        <legend>Account information</legend>
        <div class="form-step__row">
          <label class="form-step__field">
            <span class="form-step__label">First name</span>
            <HfInput v-model="form.firstName" />
          </label>
          <label class="form-step__field">
            <span class="form-step__label">Last name</span>
            <HfInput v-model="form.lastName" />
          </label>
        </div>

        <label class="form-step__field">
          <span class="form-step__label">Email address</span>
          <HfInput v-model="form.email" type="email" placeholder="you@example.com" />
        </label>

        <label class="form-step__field">
          <span class="form-step__label">Password</span>
          <HfInput v-model="form.password" type="password" />
          <ul class="form-step__pwlist">
            <li v-for="(label, key) in reqLabel"
                :key="key"
                :class="{ 'is-met': passwordCheck.requirements[key] }">
              <span aria-hidden="true">{{ passwordCheck.requirements[key] ? '✓' : '·' }}</span>
              {{ label }}
            </li>
          </ul>
        </label>

        <label class="form-step__field">
          <span class="form-step__label">Confirm password</span>
          <HfInput v-model="form.confirmPassword" type="password" />
          <p v-if="form.confirmPassword && !passwordsMatch" class="form-step__hint form-step__hint--error">
            Passwords don't match yet.
          </p>
        </label>
      </fieldset>

      <div class="form-step__field">
        <HfCheckbox v-model="form.agreeTerms">
          I agree to the <a href="/terms.html" target="_blank">Terms of Service</a>
          and <a href="/privacy" target="_blank">Privacy Policy</a>.
        </HfCheckbox>
      </div>

      <HfButton :as="'button'" type="submit" :disabled="submitting">
        {{ submitting ? 'Creating account…' : 'Create account' }}
      </HfButton>
    </form>
  </section>
</template>

<style scoped>
.form-step {
  max-width: 640px;
  margin: 0 auto;
}
.form-step__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  gap: 12px;
}
.form-step__back {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--hf-muted);
  cursor: pointer;
  font-size: 13px;
}
.form-step__back:hover { color: var(--hf-ink); }
.form-step__back:disabled { opacity: 0.4; cursor: not-allowed; }

.form-step__chip {
  font-family: var(--hf-font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hf-muted);
  background: var(--hf-paper);
  border: 1px solid var(--hf-line-2);
  padding: 6px 10px;
  border-radius: var(--hf-radius);
}
.form-step__chip strong { color: var(--hf-ink); font-weight: 600; }

.form-step__form {
  background: var(--hf-paper);
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md);
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.form-step__heading {
  font-family: var(--hf-font-display);
  font-size: 26px;
  font-weight: 400;
  letter-spacing: -0.01em;
  margin: 0;
}
.form-step__group {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form-step__group legend {
  font-family: var(--hf-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hf-muted);
  padding: 0;
  margin-bottom: 4px;
}
.form-step__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-step__label {
  font-size: 12px;
  color: var(--hf-muted);
}
.form-step__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.form-step__hint {
  font-size: 12px;
  color: var(--hf-muted);
  margin: 0;
}
.form-step__hint--error { color: var(--hf-warn); }

.form-step__pwlist {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  font-size: 12px;
  color: var(--hf-muted);
}
.form-step__pwlist li.is-met { color: var(--hf-good); }

@media (max-width: 560px) {
  .form-step__row { grid-template-columns: 1fr; }
  .form-step__pwlist { grid-template-columns: 1fr; }
  .form-step__form { padding: 22px 18px; }
}
</style>
