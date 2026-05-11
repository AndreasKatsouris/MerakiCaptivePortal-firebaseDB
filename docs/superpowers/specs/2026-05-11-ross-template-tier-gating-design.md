# ROSS Template Tier Gating — Design Spec

**Date:** 2026-05-11
**Phase:** 6 (Playbook UX enrichment + template library curation)
**Status:** Spec — awaiting approval
**Predecessor specs:** `docs/superpowers/specs/2026-05-02-ross-central-funnel-cleanup-design.md` (Phase 5)

## 1. Problem

ROSS ships with 13 seeded workflow templates spanning compliance, daily ops, weekly/monthly ops, marketing, and monthly admin. The product has two locked subscription tiers per PR #42 spec: **Free** and **All-in**. The 2026-05-02 spec Q1 lock states: *"Tier gating is a filter on the existing Templates list inside the Playbook tab, checked against `users/{uid}/tier` or `subscriptions/{uid}/tier`."*

That filter does not yet exist. Today every signed-in user sees every template, regardless of tier. Need:

- A mechanism to gate templates by tier.
- Server-side enforcement so a malicious or replayed client can't bypass.
- SuperAdmin override so curators see everything.
- An audit trail when access is denied.
- A backfill that respects current users' existing access (no surprise lockouts at deploy time).
- A defined policy for tier downgrade (do existing workflows from premium templates keep running?).

## 2. Sprint context

Phase 5 closed with PR #48 (sidebar cleanup). ROSS is now the post-login destination end-to-end. Phase 6 is the operator-facing UX + content layer on top of the already-shipped Runs server surface (`rossCreateRun`, `rossSubmitResponse`, etc.).

This spec covers **only the tier-gating mechanism** (PR 1A in the Phase 6 split below). The starter library curation (which 5 templates are Free) is a separate content PR after 1A merges.

## 3. Considered approaches

### A. Reuse v1 `feature-access-control.js` (rejected)

Treat each template ID as a feature in `platform-features.js` (`template_opening_checklist`, ...). `subscriptionTiers/{tierId}.features` map gates membership. Gate check via `featureAccessControl.checkFeatureAccess(featureId)`.

**Rejected because:**
- Inherits the broken `feature-access-control.js:64` dynamic-import path (Finding 2 from PR #48 — `Unknown variable dynamic import` errors on every check). Would force fixing that infrastructure bug as a prerequisite.
- Forces a content rowset (templates) into an infrastructure feature flag enum. `platform-features.js` becomes a denormalized content index that grows linearly with templates. Bureaucracy scales with content.
- Module-membership patterns are for coarse capability gates (does this tenant have the Queue module?). Templates are content rows; the model is a mismatch.

### B. `tier` field on each template doc (chosen)

`ross/templates/{templateId}.tier: 'free' | 'all-in'`. Gate fires at three points: server-side read filter, server-side activate gate, client-side render filter.

**Why chosen:**
- Independent from the broken `feature-access-control.js` path.
- Content curation co-located with content editing — superAdmin sets tier in the same `RossPlaybookTemplateEditor` where they manage name/category/tasks.
- Scales with content (one field per template). Adding a third tier is a one-line enum extension, not a structural refactor.
- The user's tier is already on `users/{uid}/tier` per signup (PR #42). No indirection needed.

### C. `allowedTiers: string[]` array (rejected — YAGNI)

Multi-select array for composable gating. Worth doing only if/when a third tier appears with non-linear membership rules. With current two-tier reality, an array adds complexity for no current benefit.

## 4. Chosen design (Option B)

### 4.1 Schema

New required field on `ross/templates/{templateId}`:

```
tier: 'free' | 'all-in'    // required; enum-validated
```

`database.rules.json` adds `.validate` on `ross/templates/$templateId/tier`:
- Must be string
- Must be `'free'` or `'all-in'`

Existing 13 seeded templates are backfilled with `tier: 'free'` as part of this PR's migration. No default-on-read fallback — the field is always present after migration.

### 4.2 Server reads — `rossGetTemplates`

Extend `functions/ross.js:152` to filter results by the requesting user's tier:

1. After `verifyAuthToken` + `verifyUserOrAdmin`, fetch `users/{uid}/tier`.
2. Determine effective access:
   - If superAdmin (`admins/{uid}.superAdmin === true`): return all templates (skip filter).
   - Else if `userTier === 'all-in'`: return all templates.
   - Else (`userTier === 'free'` or missing): return only templates where `tier === 'free'`.
3. Existing `category` filter applies after the tier filter.

**Caching:** Per architect feedback (concern #5 in the verdict), `rossGetTemplates` is currently uncached on the server but its results are cacheable client-side. Any client cache key MUST include the user's tier. Recommended: skip caching at the client store level for this endpoint (`getPlaybookTemplates()` in `playbook-service.js:117`) and rely on Firebase Hosting's per-request flow. Revisit if perf measurements show a need.

### 4.3 Server writes — `rossActivateWorkflow`

`functions/ross.js:368` gains a tier check before workflow creation:

1. After auth + template fetch, before validation, read `users/{uid}/tier`.
2. If `userTier !== 'all-in'` and `template.tier === 'all-in'`: reject with HTTP 403 and log a denial.
3. Otherwise proceed with existing activation logic.

The check is intentionally direct (read user tier, compare to template tier) — does NOT re-read `subscriptionTiers/{tierId}.features`. The architect explicitly recommended against the indirect path: it re-introduces the coupling B is escaping and creates a race where a tier-map edit silently changes template access without a template-side audit trail.

### 4.4 Server writes — `rossCreateTemplate` / `rossUpdateTemplate`

Per the PR #35 symmetric-write-path validator pattern:

1. Add `tier` to `allowedFields` in both functions (currently `['name', 'category', 'description', 'recurrence', 'daysBeforeAlert', 'subtasks', 'tags']` at `functions/ross.js:266`).
2. New `validateTier(tier)` helper that rejects values outside `['free', 'all-in']`. Called at both write paths AND in `rossActivateWorkflow` for defense in depth (a corrupt template in the DB still gets rejected at activation).
3. `rossCreateTemplate` requires `tier` (no default — must be explicit at creation).
4. `rossUpdateTemplate` validates `tier` only when present (allows updating other fields without re-specifying tier).

### 4.5 Audit log — denial trail

New RTDB node `ross/auditLog/templateActivationDenials/{pushId}`:

```
{
  uid: string,
  email: string | null,
  templateId: string,
  templateName: string,
  userTier: 'free' | 'all-in' | null,
  templateTier: 'free' | 'all-in',
  timestamp: number  // server time via admin.database.ServerValue.TIMESTAMP
}
```

Written from `rossActivateWorkflow` on every denied activation. Security rule: write-only from server (admin SDK); read restricted to superAdmin. Provides the trace the architect flagged ("the first time a customer says 'I paid for All-in, why can't I activate X?'").

### 4.6 Client editor — `RossPlaybookTemplateEditor`

Add a new field to the editor form:

- Label: **Tier**
- Control: radio group with two options — `Free` (default for new templates) and `All-in`
- Position: between `Category` and `Recurrence` in the existing field order
- Read-only display in the template card preview (chip with tier label)

No change to non-superAdmin UI — `RossPlaybookTemplateEditor` is already gated to superAdmin (PR #30).

### 4.7 Client render — `RossPlaybook.vue` template list

Defensive client-side filter as belt-and-braces:

- After fetching templates via `getPlaybookTemplates()`, filter `templates.filter(t => userTier === 'all-in' || t.tier === 'free' || isSuperAdmin)`.
- Server already filtered, but this prevents a flash-of-all-in-templates during a tier change or stale cache scenario.

Each template card shows a tier chip ("Free" / "All-in") so the operator can see what's available vs upgrade-required (a tier chip on an All-in card alongside an "Upgrade" affordance is **Phase 6 PR 1C** scope, not this PR).

### 4.8 Tier downgrade policy

**Activation-time gate only. Existing workflows from premium templates are never yanked.**

Concretely:
- The gate fires at `rossActivateWorkflow` (template → workflow).
- Once a workflow exists (in `ross/workflows/{workflowId}` per location), the template tier becomes irrelevant. The workflow runs on its own schedule until paused/deleted.
- If a user downgrades All-in → Free with 5 active workflows from All-in templates, all 5 keep running. They simply can't activate *new* All-in workflows.

This is documented in the spec, in the audit log node's purpose comment, and in `KNOWLEDGE BASE/architecture/AUTHENTICATION_FLOW.md` (or a new ROSS-specific access doc).

### 4.9 Migration

In the same PR:

1. **Seed file (`functions/seeds/ross-templates-seed.js`):** every template gets explicit `tier: 'free'`. No defaults; field is always present.
2. **Live data backfill:** one-shot script or admin SDK migration that reads `ross/templates/*`, writes `tier: 'free'` to any record missing the field. Idempotent. Run from local with `GOOGLE_APPLICATION_CREDENTIALS`.
3. **`.validate` rule** enforces field presence after backfill — any new write without `tier` is rejected.

After migration, **all 13 templates are Free**. User-visible behavior is unchanged. The mechanism is functional but inert. PR 1B (curation) flips ~8 of them to `'all-in'` in a follow-up content PR.

## 5. Out of scope (explicitly)

- **The curation decision** (which 5 templates are Free): separate PR 1B.
- **Upgrade affordance on All-in template cards** ("Get All-in" CTA, lock icon, etc.): PR 1C polish.
- **Day-zero auto-activation** (a starter workflow attached to new accounts): separate Phase 6 task per backlog #66.
- **Fixing `feature-access-control.js:64` dynamic-import bug:** still on Bug Triage Queue, separate PR.
- **Tier rename / multi-tier composability** (third tier, addon tiers): YAGNI until needed.
- **Operator-facing Run execution UI** for all 10 input types: separate Phase 6 task.
- **Email/SMS notification on tier downgrade about retained workflows:** out of scope; the audit log is the only artifact.

## 6. Risks

| Risk | Likelihood | Mitigation |
|------|------------|-----|
| `.validate` rule rejects existing data mid-deploy if backfill runs after rule deploys | Low | Deploy backfill script BEFORE deploying rules. Order matters; documented in migration steps. |
| SuperAdmin override gets missed somewhere | Low | Three explicit checks (server read, server activate, client render). Each tests `verifySuperAdmin(token)` or `admins/{uid}.superAdmin` independently. |
| Client cache serves cross-tier results | Medium | Skip caching `getPlaybookTemplates()` results at the store level. Server is uncached. Revisit only if measurable. |
| Audit log grows unbounded | Low (long-term) | Single denials per click; volume bounded by user activity. If it gets large, add a cleanup function in a future PR. Out of scope here. |
| User tier read fails (RTDB transient error) | Low | Default to most-restrictive (`'free'`) on read failure — fail closed for read filter, fail closed for activate gate. Log the read failure separately. |
| Migration backfill takes long for many tenants | Low | Currently 13 templates total in `ross/templates/` (single shared node). Migration is O(N) where N = template count, not tenant count. |

## 7. PR sequencing for Phase 6 task 1

This spec covers PR 1A only. The full Phase 6 task 1 sequence:

| # | Branch | What | Depends on |
|---|--------|------|------------|
| 1A | `feat/ross-template-tier-mechanism` | Schema + `.validate` rule + server reads filter + activate gate + symmetric write validators + audit log + editor field + render filter + backfill + downgrade-policy doc. Default state: all 13 templates Free. | — |
| 1B | `feat/ross-free-starter-curation` | Flip 8 templates to `tier: 'all-in'` in seed; run live-data migration. Operator-visible change. | 1A |
| 1C | `feat/ross-all-in-upgrade-cta` | Add upgrade affordance to All-in template cards in `RossPlaybook.vue`. | 1A + 1B |

PRs 1B and 1C are out of scope for this spec.

## 8. Open questions

None. All architect concerns from the 2026-05-11 review are addressed inline above (caching policy, downgrade semantics, explicit backfill, audit log, fail-closed read defaults).
