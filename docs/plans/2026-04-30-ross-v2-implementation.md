# ROSS v2 Implementation — Gap Analysis & Phase Plan

**Status:** spec / planning, no code
**Branch:** `feature/ross-v2-spec`
**Author:** Claude (session 2026-04-30)
**Sprint goal:** Effective implementation of Hi-Fi v2, starting with ROSS

---

## 1. TL;DR

The state of ROSS v2 is **further along than the project memory implies**. The home feed is already wired to real RTDB signals behind a feature flag — only the right-rail, onboarding findings, button handlers, LLM, and the entire v1 admin redesign are still pending.

**What's left, in order:**

| # | Phase | Effort | Risk |
|---|-------|--------|------|
| 1 (this) | Spec / gap analysis | XS | None |
| 2 | Wire right-rail (`getHomeSidebar`) + first-run findings | M | Low |
| 3 | Wire button handlers on `/ross.html` (Open brief / Extend / Review draft / Snooze) | M | Medium — UI state |
| 4 | **ROSS v1 admin redesign in Hi-Fi v2** (Workflows / Builder / Templates / Staff / Reports tabs) | **L** | **Medium-high — biggest slice** |
| 5 | Wire `/onboarding-ross-hello.html` to real first-run findings | S | Low |
| 6 | `askRoss` LLM integration (Anthropic + new `rossChat` Cloud Function) | L | High — new infra, cost, eval — **deferred** |

---

## 2. What's already real (audit, not aspiration)

Verified by reading the code on master at HEAD `600172b1`.

### 2.1 Home feed (`getHomeFeed`) — **wired**

`public/js/modules/ross/v2/ross-service.js:59-87` already pulls live data when feature flag `ROSS_HOME_REAL_DATA` is on (default ON per the v2 rollout).

Three detectors run in parallel (`public/js/modules/ross/v2/detectors.js`):

| Detector | Reads | Output card |
|----------|-------|-------------|
| `detectFoodCostDrift` | `locations/{locId}/stockUsage/*` (extracts `totalCostOfUsage` + `salesTotal`) | "Food cost is tracking at X%, Ypp above target" |
| `detectLapsedVIPs` | `guests` indexed on `locationId` (uses RTDB `orderByChild`) | "N guests haven't visited in 90+ days" |
| `detectRevenueTrend` | `salesDataIndex/byLocation/{locId}/*` → `salesData/{id}/dailyData` | "Venue revenue up/down N% week-on-week" |

Behaviour:
- Each detector returns `null` when data is too thin — never fakes numbers.
- `padCards` always returns exactly 3 cards, slotting `LEARNING_MODE_CARDS` for missing detectors. Honesty over theatre.
- `buildHeadline` derives greeting from `auth.currentUser.displayName` and time of day.
- Wraps in try/catch — on any failure, falls back to fully scripted feed.

**Implication:** Phase 2 in the original plan ("wire home feed") was already done by a prior session. We don't redo it; we verify it on real tenant data and move on.

### 2.2 Auth + admin gate — **wired**

`/ross.html` and `/onboarding-ross-hello.html` already gate via `AdminClaims.verifyAdminStatus`. After PR #17 (CORS fix), this works on preview channels too.

### 2.3 Hi-Fi components — **wired**

9 components + 8 SVG charts in `public/js/design-system/hifi/`. Tokens, fonts, base styles all production-shaped.

---

## 3. What's still scripted (the actual work)

### 3.1 Right-rail (`getHomeSidebar`) — **scripted**

`ross-service.js:93-100` returns `ASK_ROSS_SAMPLE` + `LIVE_VENUES` + `ROSS_SUGGESTIONS` from `content.js` fixtures. Three pieces:

| Field | Should derive from | Notes |
|-------|---------------------|-------|
| `venues` (live strip) | `tablesByLocation/{locId}` + `queueIndex/byLocation/{locId}` | Status (open/closed/setting up), covers, wait time. **Real-time** strictly speaking — single point-in-time read is acceptable for v1 of the wire-up; subscribe later. |
| `suggestions` (3 cards) | Birthday detection (`guests` with `dateOfBirth` in week), low-stock (existing `stockUsage` thresholds), shift gaps (no current data source) | First two are derivable; **shift-gap is blocked — we don't have a staff-schedule data source**. Decide: drop the card type, or feed scripted until ROSS workflow's staff data lands. |
| `askRoss.recent` | Real recent prompts and replies | Blocked by Phase 6 LLM. Until then, hide the recent strip or keep scripted. |

### 3.2 First-run findings (`getFirstRunFindings`) — **scripted**

`ross-service.js:105-119` returns three hardcoded findings (Tuesday brunch, 28 invisible regulars, patio revenue). Real version needs:

| Finding | Should derive from | Status |
|---------|---------------------|--------|
| "Best-margin service" | `salesData/{id}/dailyData` x service-window slicing | Possible; needs new aggregator |
| "Frequent unrecognised guests" | `guests` with `visitCount > N` and `nameCollected = false` | Possible if guest schema has these fields — **verify** |
| "Patio/area trending" | Revenue split by table-section attribute | **Blocked** — no current section attribute on `tablesByLocation` |

Honest fallback: keep `FINDINGS_FIRST_RUN` as a static "demo" with a bold "this is illustrative" banner until at least 2/3 detectors land. Better than fake numbers.

### 3.3 Button click handlers — **all cosmetic**

Every `HfButton` in `RossHomeDesktop.vue` / `RossHomeMobile.vue` renders and hovers but does nothing. The detectors emit cards with `actions` containing `id` + optional `href` — but no router/handler binds the `id`.

| Action ID (current detectors emit) | Should do | Existing surface to route to |
|------------------------------------|-----------|------------------------------|
| `open-food-cost` | navigate | `/food-cost-v2.html?loc=...` (already in href, just bind) |
| `ask-why` | open Ask Ross modal with seeded prompt | Phase 6 (LLM) — for now: navigate to `/ross.html#ask` and prefill |
| `see-guests` | navigate | `/guests-v2.html?filter=lapsed` (already in href) |
| `draft-winback` | open campaign composer prefilled | `/campaigns-v2.html?segment=lapsed-vip` (verify segment param accepted) |
| `see-breakdown` | navigate | `/analytics-v2.html?loc=...` (already in href) |
| `forecast` | navigate | `/analytics-v2.html?loc=...&tab=forecast` (already in href, verify tab param) |
| `extend` (scripted patio card) | open promotion editor | No real backing yet — scripted detector card removed once detector goes live |
| `snooze` (mentioned in handoff jsx, not in current cards) | mark card snoozed for 24h | New: `ross/v2Snoozes/{uid}/{cardId}` RTDB node |

Wiring strategy: a single `dispatch(action)` helper in the Vue components that interprets `action.id` and does either `window.location.href = action.href` or calls a registered handler. Snooze gets a Cloud Function (`rossV2Snooze`) so the read path can hide snoozed cards.

### 3.4 ROSS v1 admin tabs — **untouched**

The v1 ROSS module (`public/js/modules/ross/index.js` — 2397 lines) is a Vue 3 CDN app mounted in the admin-dashboard.html `rossContent` section. It implements:

- Overview tab (3 stat cards + category breakdown + workflow list)
- Workflows tab (workflow expansion → tasks → assign + complete)
- Builder tab (create workflow from scratch or template)
- Staff tab (location picker → staff list → assignments)
- Templates tab (list + in-page editor, superAdmin gated)
- Reports tab (completion reports across workflows)

**This is the biggest slice of the sprint.** It needs to be redesigned in Hi-Fi v2 — either:

- **Option A: rebuild as `/ross-admin-v2.html`** (separate page, mirrors other v2 surfaces). Pro: clean break, follows the v2 pattern. Con: two ROSS surfaces (`/ross.html` for home + `/ross-admin-v2.html` for admin) until promoted.
- **Option B: extend `/ross.html` with admin tabs** (single SPA, route via `?tab=workflows`). Pro: one ROSS URL, matches the handoff design intent (the handoff `ross.jsx` shows a unified surface). Con: bigger initial scope, more state to manage.

**Recommendation: Option B.** The handoff design clearly intends a unified ROSS console. Build admin tabs as additional Vue components inside `public/js/modules/ross/v2/` and route via URL params. Keep the v1 admin reachable at the existing `admin-dashboard.html#rossContent` route as the rollback net for the soak period.

All Cloud Functions backing the admin tabs already exist and are hardened (PRs #9–#12). Inventory:

```
rossGetWorkflows         rossActivateWorkflow     rossGetReports
rossCreateWorkflow       rossManageTask           rossCreateRun
rossUpdateWorkflow       rossCompleteTask         rossSubmitResponse
rossDeleteWorkflow       rossGetTemplates         rossGetRun
rossGetStaff             rossCreateTemplate       rossGetRunHistory
rossManageStaff          rossUpdateTemplate
                         rossDeleteTemplate
                         rossScheduledReminder (cron)
```

No new Cloud Functions needed for the admin redesign — pure UI work against a stable API.

### 3.5 LLM (`askRoss`) — **scripted, deferred**

`ross-service.js:126-137` echoes the prompt back. Replacing this needs:

- New Cloud Function `rossChat` invoking the Anthropic SDK. Use the `claude-api` skill for the build (it enforces prompt caching and current model defaults — Claude 4.6/4.7).
- Prompt structure: system context (user's location summary), user question, retrieved RTDB facts. Caching the system block hits the 90%+ cache rate target.
- Cost cap per user per day. Anthropic key in Functions config (`firebase functions:secrets:set ANTHROPIC_API_KEY`).
- Eval harness — at minimum a frozen test set of 20 prompts with golden answers before shipping.

**Deferred** to a separate sprint. Not a Phase 6 add-on; a sprint of its own.

---

## 4. Service signature ↔ backing map

For each function in `public/js/modules/ross/v2/ross-service.js`:

| Function | Current source | Target source after Phase | Phase | Notes |
|----------|---------------|---------------------------|-------|-------|
| `getHomeFeed()` | RTDB via detectors (flag ON) or `content.js` (flag OFF) | unchanged | — | **Already done.** Verify on real data; consider removing the flag once stable. |
| `getHomeSidebar()` | `content.js` fixtures | `tablesByLocation/{loc}` + `queueIndex/byLocation/{loc}` + `guests` (birthdays) + `stockUsage` (low stock) | 2 | Drop `shift-gap` suggestion type until staff-schedule data exists. |
| `getFirstRunFindings()` | `content.js` fixtures | New aggregator over `salesData` + `guests`; one finding may stay scripted until table-section data lands | 2 | Add "illustrative" banner until 2/3 detectors live. |
| `askRoss(prompt)` | Echo placeholder | `rossChat` Cloud Function (Anthropic) | 6 | Deferred. |

For each handler dispatched from a card action ID (Phase 3 work):

| Action `id` | Implementation | Backing CF / route |
|-------------|---------------|--------------------|
| `open-food-cost`, `see-guests`, `see-breakdown`, `forecast` | `window.location.href = action.href` (href already populated by detectors) | none (URL routing only) |
| `ask-why` | Open Ask Ross modal (Phase 6); for now route to a stub that echoes intent | Phase 6 |
| `draft-winback` | Navigate `/campaigns-v2.html?segment=lapsed-vip` | Verify campaigns-v2 accepts segment param |
| `snooze` | New CF `rossV2Snooze({ cardId, hours })` writes `ross/v2Snoozes/{uid}/{cardId} = { expiresAt }`; detectors filter on read | New CF + RTDB node + read-side filter |

---

## 5. Open questions (need user decision before Phase 2)

1. **Right-rail real-time vs. snapshot.** Live venue strip can be a single read on home load (cheap, OK for v1) or a live `on('value')` subscription (matches handoff intent but cost/complexity). **Recommendation: snapshot for Phase 2; subscription as a follow-up.**

2. **Shift-gap suggestion.** No data source today. Drop the card type, or keep scripted with an "illustrative" badge? **Recommendation: drop until staff-schedule data exists.**

3. **First-run findings honesty.** With only 1–2 detectors realistically buildable (best-margin service + frequent unrecognised guests, possibly), accept a mixed page (some real, one with banner)? Or hold all three behind real-data-only? **Recommendation: ship 2 real + 1 banner, with a copy-line that sets expectation. ("Once you have N+ days of patio table-section data, I'll spot trends here too.")**

4. **Phase 4 admin redesign — Option A vs. B.** Single SPA with tab routing (`/ross.html?tab=workflows`) vs. separate page (`/ross-admin-v2.html`). **Recommendation: Option B (single SPA), per §3.4.**

5. **Snooze persistence model.** Per-user (`ross/v2Snoozes/{uid}`) or per-location (`ross/v2Snoozes/{locId}`)? **Recommendation: per-user — snoozing is a personal UX concern, not an org-wide config.**

---

## 6. Phase plan (revised)

### Phase 2 — Right-rail + first-run findings
- Replace `getHomeSidebar` body with real reads against `tablesByLocation`, `queueIndex`, `guests` (birthdays), `stockUsage` (low stock).
- Drop `shift-gap` suggestion type.
- New aggregator(s) in `detectors.js` for first-run findings (or a new `findings.js`).
- Branch: `feature/ross-v2-sidebar-findings`. ETA: 1 session.

### Phase 3 — Action handlers
- Implement single `dispatch(action)` in `RossHomeDesktop.vue` / `RossHomeMobile.vue`.
- Route the four already-href'd actions; stub `ask-why`; wire `draft-winback`; build snooze (new CF + node + read filter).
- Branch: `feature/ross-v2-actions`. ETA: 1 session.

### Phase 4 — Admin redesign (single SPA)
- New tab routing in `RossHome*.vue` via `?tab=` URL param.
- New components per tab: `RossWorkflows.vue`, `RossBuilder.vue`, `RossTemplates.vue`, `RossStaff.vue`, `RossReports.vue`.
- Each tab calls existing Cloud Functions; no new CFs.
- Keep v1 admin (`admin-dashboard.html#rossContent`) reachable for rollback.
- Branch: `feature/ross-v2-admin`. ETA: 3–5 sessions (this is the bulk).

### Phase 5 — Onboarding
- Wire `/onboarding-ross-hello.html` to real `getFirstRunFindings()` from Phase 2.
- Add the "illustrative" banner where applicable.
- Branch: `feature/ross-v2-onboarding`. ETA: 1 session.

### Phase 6 — askRoss LLM (deferred to separate sprint)
- New `rossChat` Cloud Function with Anthropic SDK + prompt caching.
- Eval harness (20-prompt golden set).
- Cost cap + secrets management.
- Not part of the current sprint goal; tracked separately.

---

## 7. Out of scope for this sprint

- Touching the v1 ROSS module (`public/js/modules/ross/index.js`) other than leaving it reachable as rollback. No deletions.
- Rolling back the `ROSS_HOME_REAL_DATA` flag — leave ON.
- Multi-user real-time collaboration (presence, lock indicators).
- Admin sidebar dedup of v2 vs v1 entries (separate PR once v2 is promoted).
- Mobile-specific work beyond the existing `RossHomeMobile.vue` scaffold.

---

## 8. References

- `public/js/modules/ross/v2/ross-service.js` — the four service functions, current state
- `public/js/modules/ross/v2/detectors.js` — three real detectors against RTDB
- `public/js/modules/ross/v2/content.js` — scripted fallback fixtures + `LEARNING_MODE_CARDS`
- `public/js/modules/ross/index.js` — v1 admin Vue 3 CDN app (2397 lines)
- `functions/ross.js` — 19 Cloud Functions backing v1 admin (1364 lines)
- `public/kb/features/ROSS.md` — feature reference
- `KNOWLEDGE BASE/architecture/DATA_MODEL.md` — RTDB schema for tables, queue, guests, salesData, etc.
- `Sparks Hospitality-handoff.zip:sparks-hospitality/project/wire/ross.jsx` — handoff design intent (concierge home + command console variants)
