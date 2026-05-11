// FIELD CONTRACT: onboarding-progress/{uid}.helloSeen — owned by this module
// + RossOnboardingHello.vue. Any other writer must mirror the boolean
// semantics ("user has acknowledged the Ross hello") or the matrix below
// will mis-route. See public/kb/features/ROSS.md for canonical shape.

import { rtdb, ref, get } from '../config/firebase-config.js'
import { isEnabled } from '../config/feature-flags.js'

const LOGIN_URL = '/user-login.html?message=unauthorized'
const WIZARD_URL = '/onboarding-wizard.html'
const HELLO_URL = '/onboarding-ross-hello.html'
const ROSS_URL = '/ross.html'
const LEGACY_DASHBOARD_URL = '/user-dashboard.html'

/**
 * Pure decision: given an authed user, return the path they belong on.
 * Reads `onboarding-progress/{uid}` from RTDB; performs no navigation.
 *
 * The `helloSeen` field has three states with distinct semantics:
 * - `false`   → post-PR42 fresh signup, hasn't yet completed the hello.
 *               Per Phase 5 PR 6 lock: send to hello, skip the legacy wizard.
 * - `true`    → post-PR42 account that has completed the hello.
 *               Wizard is skipped entirely; route to home.
 * - missing   → legacy pre-PR42 account. Field never existed on this user.
 *               Use the original wizard-gated path: !completed → wizard.
 *
 * Decision matrix:
 *
 * | auth | helloSeen | progress.completed | HELLO flag | IS_HOME flag | →           |
 * |------|-----------|--------------------|------------|--------------|-------------|
 * | none | -         | -                  | -          | -            | login       |
 * | yes  | -         | missing node       | -          | -            | wizard      |
 * | yes  | -         | corrupt (non-obj)  | -          | -            | wizard      |
 * | yes  | false     | -                  | on         | -            | hello       |
 * | yes  | false     | -                  | off        | on           | ross        |
 * | yes  | false     | -                  | off        | off          | legacy      |
 * | yes  | true      | -                  | -          | on           | ross        |
 * | yes  | true      | -                  | -          | off          | legacy      |
 * | yes  | missing   | false/missing      | -          | -            | wizard      |
 * | yes  | missing   | true               | -          | on           | ross        |
 * | yes  | missing   | true               | -          | off          | legacy      |
 *
 * Soft impurity: `isEnabled()` reads `window.location.search` to honour
 * QA flag overrides (`?flags=ROSS_IS_HOME`). Acceptable — flag-override
 * isolation would require threading flag values through every call site
 * for negligible gain.
 *
 * @param {object|null} user - Firebase auth user (or null/undefined)
 * @returns {Promise<string>} destination path
 */
export async function resolvePostLoginDestination(user) {
  if (!user || !user.uid) return LOGIN_URL

  const snap = await get(ref(rtdb, `onboarding-progress/${user.uid}`))
  if (!snap.exists()) return WIZARD_URL

  const data = snap.val()
  if (!data || typeof data !== 'object') return WIZARD_URL

  const helloEnabled = isEnabled('ROSS_ONBOARDING_HELLO')
  const isHomeEnabled = isEnabled('ROSS_IS_HOME')
  const home = isHomeEnabled ? ROSS_URL : LEGACY_DASHBOARD_URL
  const helloSeenRaw = data.helloSeen

  // Post-PR42 fresh signup: not yet through hello.
  if (helloSeenRaw === false) return helloEnabled ? HELLO_URL : home

  // Post-PR42 account that's completed hello — wizard is skipped (PR 6 lock).
  if (helloSeenRaw === true) return home

  // Legacy pre-PR42 account (helloSeen field never set): original behaviour.
  if (!data.completed) return WIZARD_URL
  return home
}

/**
 * Impure wrapper: resolve, then navigate. On any resolver error falls
 * back to the legacy dashboard so the user never strands on the prior
 * page (e.g. signup completion screen). Failure is logged.
 *
 * `navigate` is injected for testability; callers in production code
 * pass nothing and the default sets `window.location.href`.
 *
 * @param {object|null} user
 * @param {(url: string) => void} [navigate]
 * @returns {Promise<void>}
 */
export async function routePostLogin(user, navigate = (url) => { window.location.href = url }) {
  let dest
  try {
    dest = await resolvePostLoginDestination(user)
  } catch (err) {
    console.error('[post-login-router] resolve failed, falling back to legacy dashboard:', err)
    dest = LEGACY_DASHBOARD_URL
  }
  navigate(dest)
}
