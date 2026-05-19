# Design — WiFi Login Hi-Fi v2 (PR 2 of 2)

**Date:** 2026-05-19
**Branch:** `feature/wifi-login-v2-hifi`
**Worktree:** `.worktrees/wifi-login-v2-hifi`
**Sequence:** PR 2 of 2 on the wifi-login pivot. PR 1 (#73, merged 2026-05-19) shipped the security hardening + `submitWifiLogin` CF + open-redirect guard. This PR is the visual + UX rewrite.

---

## Goal

Rewrite `public/wifi-login.html` as a Hi-Fi-styled captive portal that:
- Uses the platform's design system (`--hf-*` tokens, self-hosted fonts, Sparks wordmark + mark) for consistency with the v2 surfaces.
- Closes the deferred audit findings #5, #6, #7, #8, #11 from PR 1.
- Adds a marketing opt-in checkbox (`marketingConsent: boolean`) as the only new data field.
- Preserves the Meraki captive-portal flow byte-for-byte. Guest gets WiFi via the existing `base_grant_url` redirect path.

## Non-goals

- Flag-gated rollout (`customization/useV2WifiLogin`). In-place rewrite is correct for this surface — rationale below in Decisions.
- Vue mount. The page is a 5-field form; vanilla HTML + Hi-Fi token classes is sufficient and keeps the bundle small (matters on walled-garden networks).
- Multi-step wizard / editorial single-screen. Hi-Fi-ified clone of v1's shape.
- Service Worker + Background Sync for offline retry. Rejected — accept the data loss when the CF call fails.
- `updateWifiDisconnect` CF for disconnect tracking. Pre-existing backlog item from PR 1; out of scope here.
- Phone normalization to E.164 (libphonenumber). Backlog.
- Per-venue toggle for the `table` field. Use a helper-text off-ramp ("Leave blank if not seated") instead — zero schema/admin-UI cost.

---

## Decisions made during brainstorming

| # | Decision | Rationale |
|---|---|---|
| 1 | **In-place rewrite of `wifi-login.html`** (no flag, no v1 fallback) | Captive portal isn't preview-channel-testable (needs Meraki hardware). The `*-v2.html` convention's rationale ("let operators preview before flipping") doesn't fit; rollback is `git revert` + redeploy, same recovery time as a flag flip without the dual-codebase debt. File is 158 lines — clean diff. |
| 2 | **Hi-Fi-ified clone of v1's form shape** | Same 5 fields + 1 new (marketing opt-in). Lowest scope, fastest ship, no UX retraining for staff or guests. |
| 3 | **Accept data loss on CF failure** (drop localStorage offline-queue) | The PR #73 reviewer surfaced that the existing `checkAndUploadOfflineData` retry only fires on captive-portal page load, which post-Meraki-redirect users never return to in the same session. Service Worker / Background Sync was the alternative — rejected as too much complexity for the data captured. |
| 4 | **Drop venue logo entirely** — Sparks mark + wordmark (from `HfLogo`) is the captive-portal logo at every venue | Operator preference. Venue branding still surfaces via `customization/bgColor` + `bgImageUrl` (behind the card) and `customization/businessName` (in the marketing opt-in copy). Real product shift: platform-consistency wins over per-venue logo on this surface. |
| 5 | **Drop the "Admin Login" link** at the bottom of the form | Captive portal is for guests. Admin staff type the URL or bookmark `/admin-login.html`. |
| 6 | **Keep `ipinfo.io` for country auto-detection, add inline disclosure + modal** | Better UX for travellers; disclosure satisfies POPIA/GDPR. Defer-until-after-consent rejected — most users never open the country dropdown so the call rarely fires either way, and on-load is simpler. |
| 7 | **Match client-side validation to CF validation exactly** | Single source of truth. Closes finding #7 (v1 client regex rejected valid SA names like Müller and emails like `foo+bar@…`). Real validation is server-side; client is purely real-time UX feedback. |
| 8 | **CF errors become user-visible** (inline error → retry tap) instead of PR 1's silent-swallow + always-redirect | Drops localStorage queue → CF failures previously went to the queue but now have nowhere to go silently. Surfacing them lets the user retry, which raises data capture rate over PR 1's behaviour at the cost of one re-tap on the rare CF error. |
| 9 | **Drop Bootstrap entirely** | Dead weight on a walled-garden connection. Hi-Fi tokens are sufficient for the form. |
| 10 | **Drop Font Awesome** + inline only the wifi-icon on the Connect button | Field-prefix icons (`fas fa-user`/`envelope`/`utensils`) were decorative noise. |

---

## Page structure

```
┌─ <body> (Sparks bg color or venue bgColor / bgImage) ─┐
│                                                       │
│       ┌─ .wf-card (max-width 480px, --hf-paper) ─┐    │
│       │                                          │    │
│       │   ⭐ Sparks   (HfLogo inline SVG + wordmark)  │
│       │                                          │    │
│       │   Sign in for free WiFi                  │    │
│       │   (--hf-font-display)                    │    │
│       │                                          │    │
│       │   ┌─ <form id="loginForm"> ─────────┐    │    │
│       │   │ Full name        [input]       │    │    │
│       │   │ Email            [input]       │    │    │
│       │   │ Phone            [intlTelInput]│    │    │
│       │   │ Table number     [input]       │    │    │
│       │   │   Leave blank if not seated    │    │    │
│       │   │                                │    │    │
│       │   │ ☐ Send me offers from {venue}  │    │    │
│       │   │ ☐ I agree to terms (req'd)     │    │    │
│       │   │                                │    │    │
│       │   │ [error/success area]           │    │    │
│       │   │                                │    │    │
│       │   │ By submitting, you agree...    │    │    │
│       │   │ (privacy disclosure one-liner) │    │    │
│       │   │                                │    │    │
│       │   │ [ Connect to WiFi  📶  ]       │    │    │
│       │   └────────────────────────────────┘    │    │
│       │                                          │    │
│       │   Powered by Sparks Hospitality          │    │
│       └──────────────────────────────────────────┘    │
│                                                       │
└───────────────────────────────────────────────────────┘
```

Mobile-first single column. Card centers horizontally; spans full width with safe-area padding on phones. No desktop-specific layout (captive portal is rare on laptops; same card on a wider viewport is fine).

---

## File changes

### `public/wifi-login.html` — rewritten in place (~158 → ~180 lines)

- **Drop** `<link>` to `bootstrap.min.css`, `all.min.css`, intlTelInput CSS already loaded, `style.css`. Keep only the inline scoped `<style>` block (replaced) + Hi-Fi tokens + Hi-Fi base.
- **Add** `<link rel="stylesheet" href="css/hifi-tokens.css">` + `<link rel="stylesheet" href="css/hifi-base.css">` + a small inline `<style>` for the captive-portal-specific card + form layout (scoped to `.wf-*` class prefix).
- **Add** self-hosted font preloads (`/fonts/hifi/Geist-*.woff2`, `Instrument-Serif-*.woff2`).
- **Replace** the venue-logo `<img>` with inline SVG mark + wordmark span (copy of `HfLogo.vue`'s template).
- **Replace** the wifi-instructions Bootstrap card with a single `<h1 class="wf-title">` ("Sign in for free WiFi").
- **Replace** the form: same `<form id="loginForm">` ID + same input IDs (`username`, `email`, `phone`, `table`, `terms`) so `merakiFirebase.js` selectors keep working. Add `<input id="marketingConsent" type="checkbox">`.
- **Replace** the bottom Admin Login link block + version footer line with a single muted "Powered by Sparks Hospitality" line.
- **Add** a `<dialog id="privacyModal">` element containing the longer privacy copy. Native HTML `<dialog>` with `.showModal()` / `.close()` — universal browser support in 2026, no Bootstrap dependency, ESC-to-dismiss + tap-outside via `::backdrop` click handler.
- **Replace** the terms modal (`#termsModal`) Bootstrap markup with a `<dialog>` of the same shape. Identical content, same trigger link (`data-bs-toggle="modal"` attributes removed; replaced with a click handler in `merakiFirebase.js`).
- **Keep** the `<script type="module" src="js/merakiFirebase.js">` import. **Keep** the v1 page-load `customization/` reader inline `<script type="module">` block as-is — minimal change, no risk, and the reader is single-use (only this page consumes it). Drop the `<script>` block for Bootstrap bundle.

### `public/js/merakiFirebase.js` — drops ~250 lines net

- **Delete** `checkAndUploadOfflineData` + `window.load` listener that calls it.
- **Delete** `localStorage.setItem('pendingWifiLogin', ...)` block in the submit success path.
- **Delete** `localStorage.setItem('sessionID', ...)` + `localStorage.getItem('sessionID')` calls. Server-generated sessionID is authoritative (PR 1).
- **Delete** `storeUserPreferences()` (was a no-op stub post-PR-1).
- **Delete** `logUserConnection()` + `logUserDisconnection()` + the `beforeunload` listener (no-op stubs post-PR-1).
- **Delete** `generateSessionID()` (unused post-PR-1; CF generates push-key).
- **Delete** all `console.log('WiFi LOGIN DEBUG: ...')` chatter. Keep `console.error` paths (`base_grant_url` missing, host whitelist rejection, anon-auth failure, CF rejection).
- **Add** `marketingConsent` field to the CF payload: read from `#marketingConsent` checkbox, send as boolean.
- **Replace** the validate-* helper functions with the CF-matching versions:
  - `validateName(name)` → `name.trim().split(/\s+/).length >= 2` (no character-class check).
  - `validateEmail(email)` → `/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)`.
  - `validatePhone` already delegates to `phoneInput.isValidNumber()` (intlTelInput) — keep.
  - `validateTable` already returns true on any non-empty; will be relaxed to allow empty (helper text says "leave blank if not seated").
- **Add** state-machine handling: on submit, disable button + show "Connecting…" spinner; on success, 500ms delay then redirect; on CF reject, map error code → inline message and re-enable button. Open-redirect refusal unchanged (still inline error, no redirect).
- **Add** click handler for the privacy modal link + a similar one for terms modal (since Bootstrap is dropped).

### `functions/index.js` — `submitWifiLogin` gains marketingConsent

```diff
         const name = String(data?.name || '').trim().slice(0, 120);
         const email = String(data?.email || '').trim().slice(0, 254);
         const phoneNumber = String(data?.phoneNumber || '').trim().slice(0, 24);
         const table = String(data?.table || '').trim().slice(0, 24);
+        const marketingConsent = Boolean(data?.marketingConsent);
         const client_mac = String(data?.client_mac || '').trim().slice(0, 32);
         ...
         const loginRecord = {
             sessionID, timestamp, name, email, phoneNumber, table,
+            marketingConsent,
             client_mac, node_mac, client_ip, active: true, anonUid: uid
         };
```

`activeUsers` record doesn't need `marketingConsent` (it's the live-session view, not the marketing list).

### `database.rules.json` — `marketingConsent` validate

```diff
         "client_ip":   { ".validate": "newData.isString() && newData.val().length <= 45" },
         "active":      { ".validate": "newData.isBoolean()" },
         "anonUid":     { ".validate": "newData.isString() && newData.val().length <= 64" },
+        "marketingConsent": { ".validate": "newData.isBoolean()" },
         "$other":      { ".validate": false }
```

### KB docs

- `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md` + `public/kb/api/CLOUD_FUNCTIONS_CATALOG.md`: add `marketingConsent` to the `submitWifiLogin` row's accepted fields.
- No new section in `DATABASE_RULES_GUIDE.md` — the pattern is already documented from PR 1.

---

## Visual treatment detail

### Tokens used (no new tokens introduced)

| Surface | Token |
|---|---|
| Page bg fallback | `--hf-bg` |
| Card bg | `--hf-paper` |
| Card border | `--hf-line` |
| Card radius | `--hf-radius-lg` |
| Primary text | `--hf-ink` |
| Muted text | `--hf-muted` |
| Display font (Sparks wordmark, page title) | `--hf-font-display` |
| Body font (form, copy) | `--hf-font-body` |
| Primary button bg | `--hf-ink` (inverted: ink-bg, paper-fg, matches HfButton primary) |
| Input border | `--hf-line` |
| Input focus | `--hf-ink` outline |
| Error text | `--hf-danger` (verify exists in tokens; fall back to inline color if not) |

### Touch targets

All interactive elements ≥ 44px tall on mobile. Submit button is 56px tall, full-width.

### intlTelInput styling

CSS overrides scope to `.iti` and `.iti__country-list`:
- `.iti` width: 100% block (preserves v1 behaviour).
- `.iti__flag-container`: `--hf-paper` bg, `--hf-line` border.
- `.iti__country-list` (open-state popout): repaint borders + bg with `--hf-line` / `--hf-paper`. Acknowledged: full design-system parity on the open dropdown needs the custom-combobox rebuild (per the 2026-05-05 HfSelect lesson) — deferred. The chrome shown on the open list will be partially system-default; closed state matches Hi-Fi.

---

## Privacy disclosure

### Inline one-liner (below form, above submit button)

> "By submitting, you agree we can store these details with this venue's WiFi system. We detect your country (via ipinfo.io) to format your phone number. **[Privacy details]**"

`[Privacy details]` is a button-styled link that opens the modal.

### Modal copy

**Title:** What we collect

**Body:**
> When you sign in to WiFi at this venue, we store:
> - Your name, email, phone number, and (optional) table number
> - The MAC address of your device (a hardware ID your phone broadcasts to nearby WiFi networks)
> - An anonymous device identifier we generate
> - Whether you opted in to marketing messages from this venue
>
> **Who can see it:** This venue's admin staff. We don't share with third parties.
>
> **Country detection:** We call ipinfo.io once when this page loads to detect your country, so the phone-number field starts with the right dial code. We send your IP address to ipinfo.io; we don't send your name, email, or phone. Their privacy policy: https://ipinfo.io/privacy-policy
>
> **Marketing messages:** If you opt in, this venue may email or message you with offers and updates. You can opt out any time by replying to a marketing message.
>
> **Want your details removed?** Email privacy@sparkshospitality.com with the venue name and your email.

Single modal, dismiss by tap-outside or close button. No separate privacy page.

---

## State machine (submit flow)

```
            ┌──────┐
            │ idle │ ← (initial; also after error retry)
            └──┬───┘
               │ user taps Connect (terms checked, fields valid)
               ▼
       ┌─────────────────┐
       │ validate fields │ ──invalid──→ inline errors, stay idle
       └─────────┬───────┘
                 │ valid
                 ▼
     ┌─────────────────────────┐
     │ check base_grant_url    │ ──invalid host──→ inline error
     │ against Meraki whitelist│                    "Please ask staff"
     └─────────┬───────────────┘                    stay idle
               │ valid
               ▼
        ┌────────────┐
        │ submitting │  (button disabled, spinner, "Connecting…")
        └─────┬──────┘
              │ submitWifiLogin CF resolves
              ▼
         ┌─────────┐                            ┌─────────────┐
         │ success │ ──500ms──→ window.location │ Meraki page │
         └─────────┘            .href = redirect└─────────────┘
              ▲
              │ CF rejects
              │
          ┌───┴──┐
          │ error │ ──map CF code to inline copy──→ idle (button re-enabled)
          └──────┘
```

### Error code mapping

| CF error code | Inline user copy |
|---|---|
| `unauthenticated` (anon auth race) | "Almost there — please tap Connect again" |
| `resource-exhausted` (rate-limit) | "Just a moment — please wait a few seconds and try again" |
| `invalid-argument` (validation) | "Please check your details and try again" |
| `internal` / network / unknown | "We hit a snag. Tap Connect to retry." |

---

## Risks + mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Hi-Fi base CSS or self-hosted fonts not reachable through some venue's walled garden | Low | Medium — page renders unstyled but functional | Same Firebase Hosting domain as the existing wifi-login.html assets; if the page itself reaches the guest browser, the colocated `/css/*` and `/fonts/hifi/*` will too. Smoke-tested implicitly by Section 1's assertion. |
| R2 | intlTelInput open-dropdown chrome looks jarring next to Hi-Fi closed state | Medium | Low — cosmetic | Documented limit; full parity needs the custom combobox rebuild (separate backlog item). Acceptable for v2 ship. |
| R3 | Operator dislikes the Sparks-only branding decision once they see it on real venues | Medium | Medium | Reversible — restore venue-logo `<img>` is a 5-line revert. Surface to operator on smoke; collect feedback before treating as final. |
| R4 | CF-error-now-visible UX change confuses staff who saw the v1 "always succeed" behaviour | Low | Low | New behaviour strictly improves data capture rate (user retries vs silent loss). One-line note in the venue-onboarding doc when we get to that. |
| R5 | Dropping localStorage queue could mask a future spike in CF failure rate that previously went to the queue and "looked fine" | Low | Medium | Open-redirect refusals + CF errors now hit the console at error level — recommended monitoring backlog item (forward `console.error` to Cloud Logging) becomes more important post-PR-2. Flag in PR description. |
| R6 | The "Leave blank if not seated" helper text on the table field changes data shape — table is now sometimes empty in `wifiLogins/{sessionID}/table` | High (intentional) | Low | CF already validates `table` as optional string (no min-length). Admin dashboard table-filter already tolerates empty values. No migration needed. |

---

## Pre-flight checks (BEFORE code change)

- [ ] Confirm `HfLogo` SVG path + wordmark span port cleanly to inline HTML (read `HfLogo.vue`, copy verbatim).
- [ ] Confirm `--hf-danger` token exists in `public/css/hifi-tokens.css` (fall back to inline color if not).
- [ ] Confirm self-hosted Geist + Instrument Serif `.woff2` files exist at `/fonts/hifi/`.
- [ ] Grep `merakiFirebase.js` for any consumer of `pendingWifiLogin` or `generateSessionID` outside the file (none expected; sanity check).
- [ ] Grep for any other consumer of `customization/logoURL` (admin tier-management, branding settings) — confirm those are independent surfaces and the captive-portal drop doesn't affect them.

## Verification (DURING implementation)

- [ ] `npm run build` — green.
- [ ] `node -c functions/index.js` — green.
- [ ] CF deploys cleanly from worktree (per 2026-05-15 LESSON: verify with new-log-line grep after deploy).
- [ ] Rules deploy cleanly: `firebase deploy --only database` from worktree.
- [ ] Browser smoke (without Meraki): `wifi-login.html?base_grant_url=https://n100.meraki.com/splash/grant&user_continue_url=https://example.com&client_mac=AA:BB:CC:DD:EE:FF&node_mac=11:22:33:44:55:66` — page renders, form works, anon auth fires, CF call succeeds, redirect attempts (fails because we're not on real captive portal — expected).
- [ ] Browser smoke (open-redirect): change `base_grant_url` to `https://evil.com/grant` — form submits, redirect refused, inline error shown.
- [ ] Browser smoke (rate-limit): submit twice in <5s — second submit shows "Just a moment…" error.
- [ ] Browser smoke (marketing opt-in): submit with checkbox checked, verify `wifiLogins/{sessionID}/marketingConsent === true`; submit unchecked, verify `=== false`.
- [ ] Browser smoke (table empty): submit with table field empty, verify CF accepts + record stores `table: ""`.
- [ ] Browser smoke (privacy modal): tap "[Privacy details]" — modal opens, dismisses on outside-tap and close button.
- [ ] Browser smoke (terms modal): tap "terms and conditions" — modal opens.
- [ ] **Operator smoke on real Meraki venue** — gates merge.

---

## Deploy sequencing (per 2026-05-01 LESSON: CFs before client)

1. Deploy `submitWifiLogin` CF first (with the new `marketingConsent` field accepted).
2. Deploy database rules (adds `marketingConsent` validate).
3. Operator real-venue smoke.
4. Merge → hosting redeploys → new client code goes live.

Brief "submitWifiLogin will accept but ignore marketingConsent" window between CF deploy and hosting redeploy is fine (forward-compatible: old client doesn't send the field, CF defaults to `false`).

---

## Out-of-scope follow-ups (logged to backlog after merge)

These items remain from PR 1's backlog (PR 2 doesn't add to or close them):

- `updateWifiDisconnect` CF for proper disconnect tracking.
- Walled-garden audit at every deployed venue (confirm `*.cloudfunctions.net` reachable; confirm `/css/*` + `/fonts/hifi/*` reachable).
- Phone normalization to E.164 server-side (libphonenumber).
- Open-redirect refusal log forwarding to Cloud Logging (gains importance with the localStorage queue dropped — silent CF-failure is now the only data-loss vector).
- Retention/prune CF for `wifiLogins` / `activeUsers` / `userPreferences` / `rateLimitsWifi` (joins PR #70's ticket).
- Custom-combobox rebuild of intlTelInput's country-list popout (per the 2026-05-05 HfSelect lesson).

New items spawned by PR 2:

- (None expected; this is a closure PR.)
