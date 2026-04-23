// Feature flags. Client-side only — for server-side enforcement use
// subscription tiers / custom claims instead. Flip a flag to roll a new
// path out progressively; keep the old code path alive for one release
// so we can revert with a single edit.

// A-final (2026-04-23): all v2 flags now ON. Old HTML pages remain
// reachable by direct URL as a soak safety net for one release. Planned
// deletion tracked in KNOWLEDGE BASE/development/A_DELETION_PENDING.md.

export const FEATURE_FLAGS = {
  // Phase C — Ross is the post-login home surface.
  ROSS_IS_HOME: true,

  // Phase C — Show the OnboardingHiFi "three findings" hello step before
  // the business-data wizard for first-run users.
  ROSS_ONBOARDING_HELLO: true,

  // Phase A1 — Group Overview v2 is the primary Dashboard surface.
  GROUP_OVERVIEW_V2: true,

  // Phase A2 — Food Cost v2 is the primary Food Cost surface.
  FOOD_COST_V2: true,

  // Phase A3 — Guests v2 is the primary Guests surface.
  GUESTS_V2: true,

  // Phase A4 — Queue v2 is the primary Queue surface.
  QUEUE_V2: true,

  // Phase A5 — Weekly Brief is the primary Analytics surface.
  ANALYTICS_V2: true,

  // Phase A6 — Campaigns v2 is the primary Campaigns surface.
  CAMPAIGNS_V2: true,

  // Phase A7 — Receipts v2 is the primary Receipts surface.
  RECEIPTS_V2: true,
}

export function isEnabled(flag) {
  // Allow URL override for QA: ?flags=ROSS_IS_HOME,ROSS_ONBOARDING_HELLO
  if (typeof window !== 'undefined') {
    const override = new URLSearchParams(window.location.search).get('flags')
    if (override) {
      const on = override.split(',').map(s => s.trim())
      if (on.includes(flag)) return true
    }
  }
  return !!FEATURE_FLAGS[flag]
}
