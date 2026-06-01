// Signup data layer.
//
// Extracted from public/js/signup.js so the Vue layer stays declarative.
// PRESERVES the dual-path behaviour from the original: try the
// `registerUser` Cloud Function first, fall back to direct RTDB writes
// if the callable fails. The fallback path also initialises
// `onboarding-progress/{uid}` so the post-login router has clean state
// to read (PR 1 contract — see CLAUDE.md and PR #39).
//
// Tier model (PR 2): the chosen tier is the RTDB-driven tier ID from
// the `subscriptionTiers` node (admin-curated via admin-dashboard's
// Tier Management UI). We write the same value to:
//   - users/{uid}/tier
//   - subscriptions/{uid}/tier        (canonical going forward)
//   - subscriptions/{uid}/tierId      (legacy field — kept in sync to
//                                      avoid breaking existing readers
//                                      until a separate audit removes it)

import {
  auth, rtdb, functions, httpsCallable,
  ref, get, onAuthStateChanged,
} from '/js/config/firebase-config.js'
import {
  createUserWithEmailAndPassword, updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'

export function validatePassword(password) {
  const requirements = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number:    /[0-9]/.test(password),
    special:   /[!@#$%^&*(),.?":{}|<>]/.test(password),
  }
  return { ok: Object.values(requirements).every(Boolean), requirements }
}

// Loads the dynamic `subscriptionTiers` RTDB node. Throws a friendly
// Error on RTDB failure so any caller (not just SignupApp) gets a
// useful message instead of the raw Firebase error.
// @throws {Error} when the RTDB read fails (auth/network/quota etc).
export async function loadTiers() {
  try {
    const snap = await get(ref(rtdb, 'subscriptionTiers'))
    const raw = snap.val() || {}
    return Object.entries(raw)
      .map(([id, tier]) => ({ id, ...tier }))
      .sort((a, b) => (a.monthlyPrice || 0) - (b.monthlyPrice || 0))
  } catch (err) {
    console.error('[Signup] loadTiers failed:', err)
    throw new Error('Could not load subscription plans. Please try again later.')
  }
}

// Day-zero auto-activation — best-effort. Called by both signup paths
// after location writes complete. Server resolves templateId +
// locationId; client only needs to authenticate. Capped at 1500ms so
// a cold-start CF can't block the post-signup redirect — if the call
// is still in flight when the cap hits, signup proceeds and the seed
// lands in the background (workflow appears on next ROSS read).
const SEED_TIMEOUT_MS = 1500
async function seedFirstWorkflow(user) {
  const work = (async () => {
    try {
      const idToken = await user.getIdToken()
      const url = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/rossSeedFirstWorkflow'
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.warn('[Signup] day-zero seed CF returned error:', res.status, json)
      } else {
        console.log('[Signup] day-zero seed result:', json.result || json)
      }
    } catch (err) {
      console.warn('[Signup] day-zero seed call failed (non-blocking):', err)
    }
  })()
  const timeout = new Promise((resolve) => setTimeout(resolve, SEED_TIMEOUT_MS))
  await Promise.race([work, timeout])
}

// Creates the auth user, runs the dual-path RTDB write, and returns the
// authenticated user object. Caller (the Vue component) handles toasts
// and routing.
export async function createAccount({ formData, tier, tierData = {} }) {
  const userCredential = await createUserWithEmailAndPassword(
    auth, formData.email, formData.password,
  )
  const user = userCredential.user

  await updateProfile(user, {
    displayName: `${formData.firstName} ${formData.lastName}`,
  })

  // Force-refresh the ID token + wait for auth state to settle, so the
  // callable below sees a populated auth context. Verbatim port of the
  // original signup.js sequence (the comment-thread of bug fixes around
  // it implies fragility — do not simplify without evidence).
  await user.getIdToken(true)
  await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.uid === user.uid) {
        unsubscribe()
        resolve()
      }
    })
  })
  const freshUser = auth.currentUser
  if (!freshUser) {
    throw new Error('User authentication failed - please try again')
  }
  await freshUser.getIdToken(true)

  // Path A: callable Cloud Function. Preferred — server-side validation
  // and idempotent onboarding-progress init (post-Q1=a deploy).
  let registrationSuccessful = false
  try {
    const registerUserFunction = httpsCallable(functions, 'registerUser')
    const result = await registerUserFunction({
      firstName:       formData.firstName,
      lastName:        formData.lastName,
      businessName:    formData.businessName,
      businessAddress: formData.businessAddress,
      businessPhone:   formData.businessPhone,
      businessType:    formData.businessType,
      isFranchise:     formData.isFranchise,
      franchiseName:   formData.franchiseName,
      brandName:       formData.brandName,
      selectedTier:    tier,
      tier,
      tierData,
    })
    if (result.data && result.data.success) {
      registrationSuccessful = true
    }
  } catch (functionError) {
    // PR4 (Q2): the Path-B client-side RTDB fallback was removed. The
    // subscriptions/$uid rule lock blocks a non-admin user from writing their
    // own subscription record (incl. features/limits), so registerUser is now
    // the SOLE provisioning path. Surface the failure loudly rather than
    // silently mis-provisioning (2026-05-12 silent-swallow anti-pattern).
    console.error('[Signup] registerUser callable failed:', functionError)
    throw new Error(
      'We could not finish setting up your account. Please try again in a moment. '
      + 'If the problem persists, please contact support.'
    )
  }

  if (registrationSuccessful) {
    await seedFirstWorkflow(freshUser)
    return { user: freshUser }
  }

  // PR4 (Q2): if the callable returned without success:true (but did not throw),
  // treat it as a hard failure. The Path-B client-side RTDB fallback was removed
  // because the subscriptions/$uid rule lock blocks a non-admin user from writing
  // their own subscription record. registerUser is the sole provisioning path.
  throw new Error('Account setup did not complete. Please try again.')
}
