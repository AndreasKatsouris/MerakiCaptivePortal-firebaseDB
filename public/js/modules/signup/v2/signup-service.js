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

export async function loadTiers() {
  const snap = await get(ref(rtdb, 'subscriptionTiers'))
  const raw = snap.val() || {}
  return Object.entries(raw)
    .map(([id, tier]) => ({ id, ...tier }))
    .sort((a, b) => (a.monthlyPrice || 0) - (b.monthlyPrice || 0))
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

  const userRef         = ref(rtdb, `users/${freshUser.uid}`)
  const subscriptionRef = ref(rtdb, `subscriptions/${freshUser.uid}`)

  // Race-condition guard from original signup.js: another writer (e.g.
  // a re-entry of an existing account) may have created the node
  // between auth-create and now. Merge instead of stomping.
  const existingUserSnapshot = await get(userRef)
  if (existingUserSnapshot.exists()) {
    console.log(`⚠️ [Signup] User ${freshUser.uid} already exists, merging data instead of overwriting`)
    const existingUserData = existingUserSnapshot.val()
    const mergedUserData = {
      ...existingUserData,
      ...userData,
      phoneNumber:   existingUserData.phoneNumber   || userData.phoneNumber,
      phone:         existingUserData.phone         || userData.phone,
      businessPhone: existingUserData.businessPhone || userData.businessPhone,
      updatedAt:     Date.now(),
    }
    await update(userRef, mergedUserData)
  } else {
    await set(userRef, userData)
  }

  const existingSubscriptionSnapshot = await get(subscriptionRef)
  if (existingSubscriptionSnapshot.exists()) {
    console.log(`⚠️ [Signup] Subscription ${freshUser.uid} already exists, merging data`)
    const existingSubscriptionData = existingSubscriptionSnapshot.val()
    const mergedSubscriptionData = {
      ...existingSubscriptionData,
      ...subscriptionData,
      updatedAt: Date.now(),
    }
    await update(subscriptionRef, mergedSubscriptionData)
  } else {
    await set(subscriptionRef, subscriptionData)
  }

  const newLocationRef = push(ref(rtdb, 'locations'))
  await set(newLocationRef, locationData)
  await set(ref(rtdb, `userLocations/${freshUser.uid}/${newLocationRef.key}`), true)

  // Initialise onboarding-progress so the post-login router has clean
  // state (helloSeen=false routes new accounts through the Ross hello
  // before the wizard). Set, not update, because this branch only runs
  // for genuinely new accounts; the merge branches above handle re-entry.
  await set(ref(rtdb, `onboarding-progress/${freshUser.uid}`), {
    completed: false,
    helloSeen: false,
    createdAt: Date.now(),
  })

  return { user: freshUser }
}
