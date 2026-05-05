<script setup>
import { ref, onMounted } from 'vue'
import TierSelectStep from './TierSelectStep.vue'
import SignupFormStep from './SignupFormStep.vue'
import HfLogo from '/js/design-system/hifi/components/HfLogo.vue'
import { loadTiers, createAccount } from '../signup-service.js'
import { routePostLogin } from '/js/auth/post-login-router.js'
import { showToast } from '/js/utils/toast.js'

const step          = ref('tier')
const selectedTier  = ref(null)
const tiers         = ref([])
const tiersLoading  = ref(true)
const tiersError    = ref(null)
const submitting    = ref(false)

onMounted(async () => {
  try {
    const list = await loadTiers()
    tiers.value = list
    if (list.length > 0) {
      selectedTier.value = list[0].id
    } else {
      tiersError.value = 'No subscription plans configured. Please contact support.'
    }
  } catch (err) {
    console.error('[Signup] Tier load failed:', err)
    tiersError.value = 'Could not load subscription plans. Please try again later.'
  } finally {
    tiersLoading.value = false
  }
})

function onTierSelect(id) {
  selectedTier.value = id
  step.value = 'form'
}
function onBack() {
  step.value = 'tier'
}

async function onSubmit(formData) {
  if (submitting.value) return
  submitting.value = true
  const tierId   = selectedTier.value
  const tierData = tiers.value.find(t => t.id === tierId) || {}

  try {
    const { user } = await createAccount({ formData, tier: tierId, tierData })

    showToast('Account created successfully! Redirecting…', 'success')

    // Hold the toast for ~2s while the router resolves the destination.
    // We pass a deferred navigator so the side effect (window.location)
    // fires AFTER both the timer and the resolver settle. Pattern from
    // PR #39 — see LESSONS.md "Promise.all timing bug".
    let dest = '/user-dashboard.html'
    await Promise.all([
      routePostLogin(user, (d) => { dest = d }),
      new Promise(r => setTimeout(r, 2000)),
    ])
    window.location.href = dest
  } catch (error) {
    console.error('Signup error:', error)
    if (error.code === 'auth/email-already-in-use') {
      showToast('This email is already registered. Please log in instead.', 'error')
    } else if (error.code === 'auth/weak-password') {
      showToast('Password is too weak. Please use a stronger password.', 'error')
    } else if (error.code === 'auth/invalid-email') {
      showToast('Invalid email address format.', 'error')
    } else {
      showToast('Error creating account. Please try again.', 'error')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="signup-page">
    <header class="signup-page__header">
      <div class="signup-page__brand">
        <HfLogo />
      </div>
      <h1 class="signup-page__title">Welcome to Sparks Hospitality</h1>
      <p class="signup-page__lede">
        Workflows direct every operation. Pick a plan and get started.
      </p>
    </header>

    <main class="signup-page__main">
      <div v-if="tiersLoading" class="signup-page__status">Loading plans…</div>
      <div v-else-if="tiersError" class="signup-page__status signup-page__status--error">
        {{ tiersError }}
      </div>
      <template v-else>
        <TierSelectStep
          v-if="step === 'tier'"
          :tiers="tiers"
          :selected="selectedTier"
          @select="onTierSelect"
        />
        <SignupFormStep
          v-else
          :tier="tiers.find(t => t.id === selectedTier)"
          :submitting="submitting"
          @back="onBack"
          @submit="onSubmit"
        />
      </template>
    </main>

    <footer class="signup-page__footer">
      <div>Already have an account? <a href="/user-login.html">Log in</a></div>
    </footer>
  </div>
</template>

<style scoped>
.signup-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--hf-bg);
  color: var(--hf-ink);
  font-family: var(--hf-font-body);
}
.signup-page__header {
  text-align: center;
  padding: 48px 24px 32px;
  border-bottom: 1px solid var(--hf-line);
}
.signup-page__brand { display: inline-flex; margin-bottom: 16px; }
.signup-page__title {
  font-family: var(--hf-font-display);
  font-size: 38px;
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.01em;
  margin: 0 0 8px;
}
.signup-page__lede {
  margin: 0 auto;
  max-width: 540px;
  font-size: 15px;
  color: var(--hf-muted);
}
.signup-page__main {
  flex: 1;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 40px 24px 56px;
}
.signup-page__status {
  text-align: center;
  font-size: 14px;
  color: var(--hf-muted);
  padding: 64px 0;
}
.signup-page__status--error { color: var(--hf-warn); }

.signup-page__footer {
  text-align: center;
  padding: 24px;
  border-top: 1px solid var(--hf-line);
  font-size: 13px;
  color: var(--hf-muted);
}
.signup-page__footer a { color: var(--hf-ink); text-decoration: underline; }

@media (max-width: 720px) {
  .signup-page__title { font-size: 30px; }
  .signup-page__header { padding: 32px 20px 24px; }
  .signup-page__main { padding: 24px 16px 40px; }
}
</style>
