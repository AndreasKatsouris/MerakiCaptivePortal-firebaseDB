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
  ref, get, set, update, push, onAuthStateChanged,
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

// Day-zero auto-activation — best-effort, non-blocking. Called by both
// signup paths after location writes complete. Server resolves
// templateId + locationId; client only needs to authenticate.
async function seedFirstWorkflow(user) {
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
    console.warn('[Signup] Cloud function failed:', functionError)
  }

  if (registrationSuccessful) {
    await seedFirstWorkflow(freshUser)
    return { user: freshUser }
  }

  // Path B: direct RTDB writes. Verbatim port of signup.js fallback,
  // with `tier` added to userData and the dual subscription field write
  // (tier + tierId) for compat with existing readers.
  console.log('[Signup] Using fallback database write')

  const userData = {
    uid:        freshUser.uid,
    email:      freshUser.email,
    firstName:  formData.firstName,
    lastName:   formData.lastName,
    displayName:`${formData.firstName} ${formData.lastName}`,
    tier,
    businessInfo: {
      name:    formData.businessName,
      address: formData.businessAddress,
      phone:   formData.businessPhone,
      type:    formData.businessType,
    },
    isFranchise:   formData.isFranchise,
    franchiseName: formData.franchiseName,
    brandName:     formData.brandName,
    createdAt:     Date.now(),
    updatedAt:     Date.now(),
    status:        'active',
    role:          'user',
  }

  const subscriptionData = {
    userId:       freshUser.uid,
    tier,
    tierId:       tier,
    status:       'trial',
    startDate:    Date.now(),
    trialEndDate: Date.now() + (14 * 24 * 60 * 60 * 1000),
    features:     tierData.features || {},
    limits:       tierData.limits || {},
    metadata:     { signupSource: 'web', initialTier: tier },
  }

  const locationData = {
    name:          formData.businessName,
    address:       formData.businessAddress,
    phone:         formData.businessPhone,
    type:          formData.businessType,
    ownerId:       freshUser.uid,
    isFranchise:   formData.isFranchise,
    franchiseName: formData.franchiseName,
    brandName:     formData.brandName || formData.businessName,
    createdAt:     Date.now(),
    status:        'active',
  }

  // PR 2 review (Minor #4): atomic multi-path write. Read existing
  // state to preserve the merge-vs-overwrite race-condition guards from
  // the original signup.js, then commit users/subs/onboarding-progress
  // in a single root `update()` so a mid-sequence failure can't leave
  // the account half-initialised. The locations + userLocations writes
  // stay separate because they need a `push()` key.
  const userRef         = ref(rtdb, `users/${freshUser.uid}`)
  const subscriptionRef = ref(rtdb, `subscriptions/${freshUser.uid}`)
  const onboardingRef   = ref(rtdb, `onboarding-progress/${freshUser.uid}`)

  const [existingUserSnap, existingSubSnap, existingOnboardingSnap] = await Promise.all([
    get(userRef), get(subscriptionRef), get(onboardingRef),
  ])

  let userPayload = userData
  if (existingUserSnap.exists()) {
    console.log(`⚠️ [Signup] User ${freshUser.uid} already exists, merging data instead of overwriting`)
    const existingUserData = existingUserSnap.val()
    userPayload = {
      ...existingUserData,
      ...userData,
      phoneNumber:   existingUserData.phoneNumber   || userData.phoneNumber,
      phone:         existingUserData.phone         || userData.phone,
      businessPhone: existingUserData.businessPhone || userData.businessPhone,
      updatedAt:     Date.now(),
    }
  }

  let subPayload = subscriptionData
  if (existingSubSnap.exists()) {
    console.log(`⚠️ [Signup] Subscription ${freshUser.uid} already exists, merging data`)
    subPayload = {
      ...existingSubSnap.val(),
      ...subscriptionData,
      updatedAt: Date.now(),
    }
  }

  const multiWrite = {
    [`users/${freshUser.uid}`]:         userPayload,
    [`subscriptions/${freshUser.uid}`]: subPayload,
  }
  // Initialise onboarding-progress only when absent so we don't stomp a
  // wizard that has already advanced past helloSeen on a re-entry.
  if (!existingOnboardingSnap.exists()) {
    multiWrite[`onboarding-progress/${freshUser.uid}`] = {
      completed: false,
      helloSeen: false,
      createdAt: Date.now(),
    }
  }
  await update(ref(rtdb), multiWrite)

  // Locations needs its own push() key, so it lives outside the atomic
  // write above. Ordering: location node first, then the userLocations
  // pointer — never the other way (a dangling pointer is worse than a
  // detached location).
  const newLocationRef = push(ref(rtdb, 'locations'))
  await set(newLocationRef, locationData)
  await set(ref(rtdb, `userLocations/${freshUser.uid}/${newLocationRef.key}`), true)

  await seedFirstWorkflow(freshUser)
  return { user: freshUser }
}
