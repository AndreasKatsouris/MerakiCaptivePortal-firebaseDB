/**
 * Unit tests for post-login-router.
 *
 * Covers every branch of the decision matrix in
 * `public/js/auth/post-login-router.js` plus the impure wrapper's
 * navigate path and error fallback.
 *
 * Target: 100% line + branch coverage.
 */

import { vi, describe, test, expect, beforeEach } from 'vitest'
import { get } from '../../public/js/config/firebase-config.js'
import { isEnabled } from '../../public/js/config/feature-flags.js'
import {
  resolvePostLoginDestination,
  routePostLogin,
} from '../../public/js/auth/post-login-router.js'

vi.mock('../../public/js/config/feature-flags.js', () => ({
  isEnabled: vi.fn(),
}))

const LOGIN = '/user-login.html?message=unauthorized'
const WIZARD = '/onboarding-wizard.html'
const HELLO = '/onboarding-ross-hello.html'
const ROSS = '/ross.html'
const LEGACY = '/user-dashboard.html'

/**
 * Helper: build a fake RTDB snapshot.
 * `value === null` ⇒ snapshot.exists() returns false (node missing).
 */
function snap(value) {
  return {
    exists: () => value !== null && value !== undefined,
    val: () => value,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolvePostLoginDestination — auth state', () => {
  test('null user → login', async () => {
    expect(await resolvePostLoginDestination(null)).toBe(LOGIN)
  })

  test('undefined user → login', async () => {
    expect(await resolvePostLoginDestination(undefined)).toBe(LOGIN)
  })

  test('user with no uid → login', async () => {
    expect(await resolvePostLoginDestination({})).toBe(LOGIN)
  })

  test('user with empty-string uid → login', async () => {
    expect(await resolvePostLoginDestination({ uid: '' })).toBe(LOGIN)
  })
})

describe('resolvePostLoginDestination — onboarding incomplete', () => {
  test('onboarding-progress node missing → wizard', async () => {
    get.mockResolvedValueOnce(snap(null))
    expect(await resolvePostLoginDestination({ uid: 'u1' })).toBe(WIZARD)
  })

  test('onboarding-progress is non-object (corrupt) → wizard', async () => {
    get.mockResolvedValueOnce(snap('not-an-object'))
    expect(await resolvePostLoginDestination({ uid: 'u1' })).toBe(WIZARD)
  })

  test('onboarding-progress.completed missing → wizard', async () => {
    get.mockResolvedValueOnce(snap({ helloSeen: true }))
    expect(await resolvePostLoginDestination({ uid: 'u1' })).toBe(WIZARD)
  })

  test('onboarding-progress.completed === false → wizard', async () => {
    get.mockResolvedValueOnce(snap({ completed: false, helloSeen: true }))
    expect(await resolvePostLoginDestination({ uid: 'u1' })).toBe(WIZARD)
  })
})

describe('resolvePostLoginDestination — backwards-compat (helloSeen missing)', () => {
  test('completed, helloSeen missing, HELLO on, IS_HOME on → ross (treat as seen)', async () => {
    get.mockResolvedValueOnce(snap({ completed: true }))
    isEnabled.mockImplementation((flag) =>
      ({ ROSS_ONBOARDING_HELLO: true, ROSS_IS_HOME: true })[flag]
    )
    expect(await resolvePostLoginDestination({ uid: 'u1' })).toBe(ROSS)
  })

  test('completed, helloSeen missing, HELLO on, IS_HOME off → legacy', async () => {
    get.mockResolvedValueOnce(snap({ completed: true }))
    isEnabled.mockImplementation((flag) =>
      ({ ROSS_ONBOARDING_HELLO: true, ROSS_IS_HOME: false })[flag]
    )
    expect(await resolvePostLoginDestination({ uid: 'u1' })).toBe(LEGACY)
  })
})

describe('resolvePostLoginDestination — helloSeen === false', () => {
  test('HELLO flag on → hello', async () => {
    get.mockResolvedValueOnce(snap({ completed: true, helloSeen: false }))
    isEnabled.mockImplementation((flag) =>
      ({ ROSS_ONBOARDING_HELLO: true, ROSS_IS_HOME: true })[flag]
    )
    expect(await resolvePostLoginDestination({ uid: 'u1' })).toBe(HELLO)
  })

  test('HELLO flag off, IS_HOME on → ross', async () => {
    get.mockResolvedValueOnce(snap({ completed: true, helloSeen: false }))
    isEnabled.mockImplementation((flag) =>
      ({ ROSS_ONBOARDING_HELLO: false, ROSS_IS_HOME: true })[flag]
    )
    expect(await resolvePostLoginDestination({ uid: 'u1' })).toBe(ROSS)
  })

  test('HELLO flag off, IS_HOME off → legacy', async () => {
    get.mockResolvedValueOnce(snap({ completed: true, helloSeen: false }))
    isEnabled.mockImplementation((flag) =>
      ({ ROSS_ONBOARDING_HELLO: false, ROSS_IS_HOME: false })[flag]
    )
    expect(await resolvePostLoginDestination({ uid: 'u1' })).toBe(LEGACY)
  })
})

describe('resolvePostLoginDestination — helloSeen === true', () => {
  test('IS_HOME on → ross', async () => {
    get.mockResolvedValueOnce(snap({ completed: true, helloSeen: true }))
    isEnabled.mockImplementation((flag) =>
      ({ ROSS_ONBOARDING_HELLO: true, ROSS_IS_HOME: true })[flag]
    )
    expect(await resolvePostLoginDestination({ uid: 'u1' })).toBe(ROSS)
  })

  test('IS_HOME off → legacy', async () => {
    get.mockResolvedValueOnce(snap({ completed: true, helloSeen: true }))
    isEnabled.mockImplementation((flag) =>
      ({ ROSS_ONBOARDING_HELLO: true, ROSS_IS_HOME: false })[flag]
    )
    expect(await resolvePostLoginDestination({ uid: 'u1' })).toBe(LEGACY)
  })
})

describe('routePostLogin — wrapper', () => {
  test('happy path: navigates to resolved destination', async () => {
    const navigate = vi.fn()
    get.mockResolvedValueOnce(snap({ completed: true, helloSeen: true }))
    isEnabled.mockImplementation((flag) =>
      ({ ROSS_ONBOARDING_HELLO: true, ROSS_IS_HOME: true })[flag]
    )
    await routePostLogin({ uid: 'u1' }, navigate)
    expect(navigate).toHaveBeenCalledWith(ROSS)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  test('navigates with no user too (login URL)', async () => {
    const navigate = vi.fn()
    await routePostLogin(null, navigate)
    expect(navigate).toHaveBeenCalledWith(LOGIN)
  })

  test('resolver throws → falls back to legacy dashboard', async () => {
    const navigate = vi.fn()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    get.mockRejectedValueOnce(new Error('rtdb offline'))
    await routePostLogin({ uid: 'u1' }, navigate)
    expect(navigate).toHaveBeenCalledWith(LEGACY)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  test('default navigator (no injection) sets window.location.href', async () => {
    // Use a synthetic window object so we can observe the side effect
    // without depending on jsdom (config has environment: 'node').
    const stubLocation = { href: '' }
    vi.stubGlobal('window', { location: stubLocation })
    get.mockResolvedValueOnce(snap({ completed: true, helloSeen: true }))
    isEnabled.mockImplementation((flag) =>
      ({ ROSS_ONBOARDING_HELLO: true, ROSS_IS_HOME: true })[flag]
    )
    await routePostLogin({ uid: 'u1' })
    expect(stubLocation.href).toBe(ROSS)
    vi.unstubAllGlobals()
  })
})
