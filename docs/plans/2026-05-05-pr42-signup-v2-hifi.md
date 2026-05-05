# Implementation Plan: PR 2 — Signup v2 Hi-Fi + Tier Collapse

**Branch:** `feat/signup-v2-hifi`
**Worktree:** `C:\dev\MerakiCaptivePortal-firebaseDB\.worktrees\signup-v2-hifi`
**Phase:** 5b (depends on PR 1, already merged)
**Spec:** `docs/superpowers/specs/2026-05-02-ross-central-funnel-cleanup-design.md` §3.4 + Appendix A PR 2
**Date:** 2026-05-05

## 1. Requirements Restatement

- Rebuild `/signup.html` as Vue 3 SFCs using the Hi-Fi design system (no Bootstrap, no FF6B6B/4ECDC4 gradient, no Inter font).
- **Keep the existing dynamic `subscriptionTiers` RTDB-driven tier model** (admin curates pricing + features via admin-dashboard's existing Tier Management UI at `tier-management.js`). The "Free + All-in only" spec decision becomes a **configuration target** for the admin to maintain — not a code constant. PR 2 ships the renderer; admin handles tier curation separately.
- First tier (lowest price) is default-selected (lowest friction).
- Write the chosen `tier` (tier ID) to **both** `users/{uid}/tier` and `subscriptions/{uid}/tier` at account creation. Also write `subscriptions/{uid}/tierId` for backward compat with existing CF writes.
- Preserve all existing form fields: businessName, businessAddress, isFranchise (+ franchiseName/brandName when checked), businessPhone, businessType, firstName, lastName, email, password (+ confirmPassword), agreeTerms.
- Preserve dual-path data layer (registerUser CF preferred, direct RTDB writes as fallback) — only add the `tier` field.
- Preserve PR 1 additions verbatim: deferred-navigator post-login routing call (`signup.js:422-427`) and `onboarding-progress/{uid}` initialization with `{completed:false, helloSeen:false, createdAt:Date.now()}` (`signup.js:401-405`).
- Add new Vite entry `signup-v2` mirroring `user-dashboard` pattern.
- New SFCs: `SignupApp.vue` (orchestrator), `TierSelectStep.vue`, `SignupFormStep.vue`.
- Extract data layer to `signup-service.js` so Vue components stay declarative.
- Add `HfSelect.vue` + `HfCheckbox.vue` to the Hi-Fi kit (mirroring HfInput shape) and register in barrel.
- Fold housekeeping: `git mv` 3 plans from `docs/superpowers/plans/` → `docs/plans/`.
- No Pinia (form state is ephemeral, single-screen — local `ref/reactive`).
- No `database.rules.json` edits (already permits self-write).
- **No `constants/tiers.js`** — dynamic load from `subscriptionTiers` RTDB.

## 2. Locked Decisions (resolved 2026-05-05)

1. **Q1 = (a)** Update `registerUser` CF to accept `tier` + franchise fields, write `users/{uid}/tier`, `subscriptions/{uid}/tier`, init `onboarding-progress/{uid}` if absent.
2. **Q2/Q3 = dynamic.** Pricing + features come from `subscriptionTiers` RTDB (curated by admin via admin-dashboard's existing Tier Management UI). No hardcoded tier copy in code.
3. **Q4 = admin-handled.** Operator removes legacy tiers and re-creates Free + All-in via admin-dashboard. Out of scope for this PR.
4. **Q5 = (ii)** Write **both** `subscriptions/{uid}/tier` AND `subscriptions/{uid}/tierId` from both writers (CF + fallback). Two lines, fixes the field-name drift bug for new accounts. Existing-record migration deferred.

## 3. (Reserved — questions resolved above)

1. **`registerUser` Cloud Function gap (CRITICAL).** The CF currently does NOT write `users/{uid}/tier`, does NOT write `subscriptions/{uid}/tier` (uses `subscriptions/{uid}/tierId` instead), does NOT initialize `onboarding-progress/{uid}`, and silently drops `isFranchise/franchiseName/brandName`. **Decide:**
   - **(a)** Update the CF in this PR to accept `tier` + franchise fields, write `users/{uid}/tier` and `subscriptions/{uid}/tier`, initialize `onboarding-progress/{uid}` if absent. Costs a `functions` deploy. **Recommended** — single source of truth, removes a class of "CF path vs fallback path drift" bugs.
   - **(b)** Leave CF as-is; have the Vue/service layer perform a follow-up `update()` for the missing fields after the CF returns success. Cheaper to ship; preserves a quiet drift between paths.
   - **(c)** Remove the CF call entirely and use only the direct-RTDB fallback (which already initializes onboarding-progress and writes tier). Simplifies code; the CF currently has no validation beyond auth so this is closer to a deletion than a regression.

   **Default if no answer:** option (a).

2. **Pricing copy on the All-in card.** Spec says "economics TBD." Render as `R—/month` (em dash) with subcopy "Pricing announced soon", or `R 0 /month — beta`? **Default:** `R—/month` + "Pricing announced soon" — matches spec's "honesty over aspiration" (§3.3).

3. **Free tier feature bullets.** Phase 6 decides actual gating. For card body:
   - Free: "Full ROSS workflow UI" / "5 starter templates" / "1 location" / "Email support"
   - All-in: "Everything in Free" / "Full template library" / "Unlimited locations" / "Priority support"

   Confirm or amend.

4. **Existing `subscriptionTiers` RTDB node.** Delete in this PR or leave for separate cleanup? **Default:** leave it.

5. **`subscriptions/{uid}/tier` vs `tierId`.** CF writes `tierId`; fallback writes `tier`. Spec specifies `tier`. (i) `tier` only, (ii) both for backward compat, (iii) rename `tierId` → `tier` everywhere? **Default:** (ii) write both.

## 3. Architecture Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `public/signup.html` | Rewrite | Mount shell only: Hi-Fi CSS links + `<div id="app"></div>` + Vite entry script |
| `public/js/signup.js` | Delete | Replaced by Vite-built entry. Grep first for incoming references. |
| `public/js/modules/signup/v2/main.js` | Add | `createApp(SignupApp).use(HiFi).mount('#app')` |
| `public/js/modules/signup/v2/components/SignupApp.vue` | Add | Orchestrator: `step` ref + `selectedTier` ref + submit handler |
| `public/js/modules/signup/v2/components/TierSelectStep.vue` | Add | Two HfCard tier cards |
| `public/js/modules/signup/v2/components/SignupFormStep.vue` | Add | Form fields, Hi-Fi'd, emits submit |
| `public/js/modules/signup/v2/signup-service.js` | Add | Pure data layer: `createAccount({formData, tier})` returning `{user}` |
| ~~`constants/tiers.js`~~ | ~~Add~~ | **Removed — tiers loaded dynamically from RTDB at runtime.** |
| `public/js/design-system/hifi/components/HfSelect.vue` | Add | Mirrors HfInput shape |
| `public/js/design-system/hifi/components/HfCheckbox.vue` | Add | Mirrors HfInput shape |
| `public/js/design-system/hifi/index.js` | Modify | Register HfSelect + HfCheckbox |
| `vite.config.js` | Modify | Add `signup-v2` entry |
| `functions/index.js` (Q1=a only) | Modify | `registerUser`: accept `tier` + franchise fields, write `users/{uid}/tier`, `subscriptions/{uid}/tier`, init `onboarding-progress/{uid}` |
| `docs/plans/2026-04-21-food-cost-flag-system.md` | git mv | from `docs/superpowers/plans/` |
| `docs/plans/2026-04-30-dead-code-cleanup.md` | git mv | from `docs/superpowers/plans/` |
| `docs/plans/2026-05-02-pr39-post-login-router.md` | git mv | from `docs/superpowers/plans/` |

## 4. Implementation Phases

### Phase 0 — Worktree & Branch (L)
Already done: worktree at `.worktrees/signup-v2-hifi` on `feat/signup-v2-hifi`.

### Phase 1 — Hi-Fi Kit Additions (L)

1. `HfSelect.vue` — props `modelValue`, `options:[{value,label}]`, `placeholder`, `disabled`. Emits `update:modelValue`. Native `<select>` styled via `--hf-*` tokens.
2. `HfCheckbox.vue` — props `modelValue:Boolean`, `disabled`. Default slot for label. Native `<input type="checkbox">` + label slot.
3. `public/js/design-system/hifi/index.js` — add imports + register in plugin install + named exports.

### Phase 2 — Vite Entry + Mount Shell (L)

1. `vite.config.js`: add `'signup-v2': resolve(__dirname, 'public/signup.html')` to `rollupOptions.input`.
2. Rewrite `public/signup.html` to mount-shell pattern (mirror `public/group-overview-v2.html`):
   - `<head>`: title, viewport, favicon, Hi-Fi CSS triple.
   - `<body class="hf-body">`: `<div id="app"></div>`.
   - Bottom: `<script type="module" src="/js/modules/signup/v2/main.js"></script>`.
   - **No auth gate** — signup is for unauthenticated users.
   - Remove all inline `<style>`, `toggleFranchiseInfo` script, Bootstrap/FontAwesome/SweetAlert CDN links.
3. Add `public/js/modules/signup/v2/main.js`.

### Phase 3 — Tier Constants + Service Layer (M)

1. `constants/tiers.js`: TIERS array + `DEFAULT_TIER_ID = 'free'`.
2. `signup-service.js`:
   - Exports `createAccount({ formData, tier })` → `Promise<{ user }>`.
   - Internal flow preserves `signup.js:232-409` semantics verbatim, only adding `tier`:
     - `createUserWithEmailAndPassword` → `updateProfile` → force-refresh ID token → wait for `onAuthStateChanged` → re-grab `auth.currentUser` → second `getIdToken(true)`.
     - Try `httpsCallable(functions, 'registerUser')` with `{...formData, selectedTier: tier, tier, tierData: {}}`. On success: if Q1=b, follow-up `update()` for the missing fields. If Q1=a, no follow-up needed.
     - On CF failure: direct RTDB writes per existing fallback (`signup.js:295-405`) — extended with `tier` on userData and subscriptionData. Keep merge guards verbatim. Keep location/userLocations writes verbatim. Keep `onboarding-progress` init verbatim.
   - Returns `{ user: freshUser }`.
   - Export `validatePassword(pw)` helper (5 requirements) so the form can show live indicators and the service can re-check.

### Phase 4 — Vue Components (M)

1. `SignupApp.vue` — `step` ref, `selectedTier` ref (default 'free'), `submitting` ref. Renders `TierSelectStep` or `SignupFormStep` by step. `onSubmit(formData)`:
   ```js
   submitting.value = true
   try {
     const { user } = await createAccount({ formData, tier: selectedTier.value })
     showToast('Account created successfully! Redirecting…','success')
     let dest = '/user-dashboard.html'
     await Promise.all([
       routePostLogin(user, (d) => { dest = d }),
       new Promise(r => setTimeout(r, 2000)),
     ])
     window.location.href = dest
   } catch (error) {
     // Map auth/* error codes to friendly toasts (port signup.js:432-441)
   } finally {
     submitting.value = false
   }
   ```
2. `TierSelectStep.vue` — props `selected:String`, emits `update:selected`+`next`. Two HfCards. Card click → `emit('update:selected', tier.id); emit('next')`.
3. `SignupFormStep.vue` — props `tier:String`, `submitting:Boolean`. Emits `back`, `submit`. Local `reactive()` state for all fields. Sections: tier banner, Business Information, Account Information, agreeTerms checkbox, submit button. `onSubmit`: client-side validation (passwords match, password strength, terms), toast on failure, otherwise `emit('submit', formData)`.

### Phase 5 — registerUser CF Update (M, only if Q1=a)

1. `functions/index.js` `registerUser` (lines 474-611):
   - Destructure additional fields: `isFranchise, franchiseName, brandName, tier`.
   - Validate `tier ∈ {'free','all-in'}`; throw `invalid-argument` HttpsError otherwise.
   - Add `tier` + franchise fields to `userData`.
   - Add `tier` to `subscriptionData` (alongside legacy `tierId` per Q5 default).
   - After locations write, idempotent init via transaction:
     ```js
     await admin.database().ref(`onboarding-progress/${userId}`).transaction(cur =>
       cur || { completed:false, helloSeen:false, createdAt: admin.database.ServerValue.TIMESTAMP }
     )
     ```
   - Preserve all existing merge-guard logic.
2. Deploy: `firebase deploy --only functions:registerUser` BEFORE merging client (per LESSONS pattern from PR #35). Coordinate single-owner-at-a-time on `functions/index.js`.

### Phase 6 — Housekeeping (L)
1. `git mv docs/superpowers/plans/2026-04-21-food-cost-flag-system.md docs/plans/`
2. `git mv docs/superpowers/plans/2026-04-30-dead-code-cleanup.md docs/plans/`
3. `git mv docs/superpowers/plans/2026-05-02-pr39-post-login-router.md docs/plans/`

### Phase 7 — Build, Smoke, PR (M)

1. `npm run build` — verify signup-v2 entry compiles, `dist/signup.html` exists with hashed JS.
2. **Manual smoke (golden path):** preview channel → `/signup.html` → Free pre-selected → fill form → submit → verify redirect → verify RTDB: `users/{uid}/tier === 'free'`, `subscriptions/{uid}/tier === 'free'`, `onboarding-progress/{uid}` initialized.
3. **All-in path:** repeat with All-in selected → verify `tier === 'all-in'` in both nodes.
4. **Error paths:** mismatched passwords, weak password, terms unchecked, email already in use.
5. **Mobile (375px):** tier cards stack, form usable.
6. Commits (narrow):
   - `feat(hifi): add HfSelect and HfCheckbox to component library`
   - `feat(signup): rewrite as Vue 3 SFC + collapse to free/all-in tiers`
   - `feat(functions): registerUser writes tier and initializes onboarding-progress` (Q1=a only)
   - `chore(docs): relocate stragglers from superpowers/plans to plans`
7. `git push -u origin feat/signup-v2-hifi`
8. `gh pr create` — test plan + screenshots + preview channel URL.
9. `firebase hosting:channel:deploy signup-v2-hifi --expires 7d`

## 5. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Deleting `signup.js` breaks an unknown caller. | M | `grep -r "signup.js" public/` before deletion. |
| New Vite entry not picked up because dist is cached. | L | `scripts/build.js` already `rm`s dist before Vite. |
| HfSelect native styling looks bad. | L | Out of scope — accept native chrome. |
| CF deploy conflicts with another agent's `functions/index.js` edit. | M | CLAUDE.md flags it as single-owner-at-a-time. Coordinate. |
| Tier value drift on pre-PR records. | M | Out of scope per spec §7. Document in LESSONS.md. |
| `onboarding-progress` double-write race. | L | CF init uses atomic `transaction(cur => cur \|\| {...})`; fallback only runs on CF failure. |
| All-in selected but pricing TBD → confusion. | M | "Pricing announced soon" subcopy. No charge happens. |
| SweetAlert2 leftover references. | L | Grep `signup.html` post-rewrite. |

## 6. Test Plan

### Unit (manual, no harness for signup yet)
- `validatePassword('Abc1!def')` → all 5 pass.
- `validatePassword('weak')` → length + uppercase + number + special fail.
- `TIERS.find(t => t.default)` → Free.

### Integration (manual via preview channel)
- Free tier signup completes; both `users/{uid}/tier` and `subscriptions/{uid}/tier` show `'free'`.
- All-in tier signup completes; both nodes show `'all-in'`.
- `onboarding-progress/{uid}` initialized with `helloSeen:false`.
- Post-redirect destination matches `routePostLogin` for new account (expected: `/onboarding-ross-hello.html`).
- Franchise toggle reveals/hides + clears fields correctly.

### Error paths
- Mismatched passwords → toast, no network call.
- Weak password → toast, no network call.
- Terms unchecked → toast, no network call.
- Email already in use → friendly toast.

### Visual / responsive
- Desktop 1440 / Tablet 768 / Mobile 375 — all controls usable.

### Build
- `npm run build` exits 0 with `dist/signup.html` containing hashed `signup-v2-*.js` script.

## 7. Verification Steps (final acceptance checklist)

- [ ] `npm run build` passes
- [ ] Free tier round-trip writes both `tier` fields = `'free'`
- [ ] All-in tier round-trip writes both `tier` fields = `'all-in'`
- [ ] `onboarding-progress/{uid}` exists post-signup with `helloSeen:false`
- [ ] Post-signup lands on hello page
- [ ] No console errors during signup flow
- [ ] No Bootstrap/FontAwesome/Inter font references remain in `public/signup.html`
- [ ] `public/js/signup.js` deleted (after grep verification)
- [ ] HfSelect + HfCheckbox registered and importable from kit barrel
- [ ] Three plan files moved with `git mv` (history preserved — `git log --follow`)
- [ ] Preview channel deployed and operator click-tested
- [ ] PR opened with screenshots + test plan + preview URL

## 8. Out of Scope (explicit NOT-DOING)

- PR 3 homepage rewrite (`/index.html`).
- PR 4 router rollout to other call sites.
- PR 5 ROSS sidebar redesign.
- Phase 6 template-library tier gating.
- Migration of existing pre-PR `subscriptions/{uid}` records.
- Deletion of `subscriptionTiers` RTDB node.
- Subscription billing flow.
- Visual extension of `public/hifi/components.html` to demo new components.
