# ROSS Starter Template Tier Curation (Phase 6 PR 1B)

**Date:** 2026-05-12
**Sprint:** Hi-Fi v2 with ROSS as central post-login surface — Phase 6 (Playbook UX enrichment + template library curation)
**Predecessor:** PR #51 (Phase 6 PR 1A — tier-gating mechanism)
**Successor:** Phase 6 next — tier-gated template list UI filter + day-zero auto-activation

---

## Context

PR #51 shipped the tier-gating mechanism: the `tier:'free'|'all-in'` field on every template, server-side filtering on `rossGetTemplates`, an activate-time gate on `rossActivateWorkflow`, symmetric validators on Create/Update Template, an editor field, and an audit log. The gate is **inert** because every existing template currently carries `tier:'free'` — both in the seed and in the backfilled prod records.

PR 1B is the content decision that activates the gate. No new code paths, no schema changes, no rules changes — only `tier` values flip on 8 of 13 existing template records, plus the seed file updates to match for fresh deploys.

## Curation principle

**Free = "Run your day on ROSS."** The Free tier covers the daily habit anchor (open + close), one weekly cadence, one monthly cadence touching an existing platform module (food cost), and one quarterly compliance template that demonstrates the SA-locale moat. The operator should land in ROSS day-zero with enough surface area that the product is *useful* before they upgrade — not crippled.

**All-in = depth + back-office + high-stakes compliance.** Entire categories sit behind the paywall (HR, growth, maintenance) so the upgrade conversation is "unlock the rest of the playbook" rather than "unlock one more weekly checklist". High-stakes annual compliance (CoA, Liquor) sits in All-in because *not forgetting it* is exactly what people pay for.

## The split

### Free (5 templates)

| Template | Category | Cadence | Role |
|---|---|---|---|
| Daily Opening Checklist | operations | daily | Daily habit anchor |
| Daily Closing Checklist | operations | daily | Daily habit anchor (pair) |
| Weekly Deep Clean Checklist | operations | weekly | Weekly cadence demonstration |
| Monthly Food Cost Review | finance | monthly | Cross-sells the existing food-cost module |
| Health & Safety Audit | compliance | quarterly | SA-locale moat taste — quarterly internal H&S |

### All-in (8 templates)

| Template | Category | Cadence | Why upgrade-gated |
|---|---|---|---|
| Certificate of Acceptability | compliance | annually | High-stakes SA regulatory; annual cadence is rare-but-painful |
| Liquor Licence Renewal | compliance | annually | Same; revenue-blocking if missed |
| Weekly Social Media Campaign | growth | weekly | Growth category — clear ROI conversation |
| Monthly Google Review Campaign | growth | monthly | Growth depth |
| Weekly Supplier Payment Run | finance | weekly | Back-office finance depth |
| Monthly Staff Meeting | hr | monthly | HR entirely behind paywall — for teams |
| Quarterly Staff Performance Review | hr | quarterly | HR depth |
| Monthly Equipment Service Check | maintenance | monthly | Maintenance category — back-office depth |

## Scope

1. **Seed update** — `functions/seeds/ross-templates-seed.js`: flip 8 of 13 `tier:'free'` → `tier:'all-in'`. Source of truth for fresh deploys.
2. **One-off update script** — `functions/seeds/ross-templates-curate-tiers.js`: idempotent script that updates the `tier` field on the 8 named templates in production RTDB. Matches on `name` (templates were seeded by name; templateId is generated per environment so name is the stable identifier across envs). Logs each update; safe to re-run.
3. **KB note** — short addendum in `public/kb/features/ROSS.md` recording the curated split + rationale, so future agents working on the playbook understand which templates sit in which tier and why.

## Explicitly out of scope

- **No client UI changes.** The Templates list inside the Playbook tab already calls `rossGetTemplates`, which already filters server-side per PR #51. Free users will simply stop seeing 8 cards once the data lands. A future PR can add a "🔒 All-in" indicator + upsell affordance, but that's separate UX work.
- **No new functions.** The gate machinery is complete.
- **No rules change.** `database.rules.json` is unaffected.
- **No tier schema migration.** Field already exists on every record.
- **No day-zero auto-activation.** That's the next Phase 6 item (auto-activate Daily Opening Checklist for new users) and gets its own PR. The auto-activation candidate is named in the Free list above but the wiring is deferred.

## Risks

- **Existing prod workflows already activated from soon-to-be-All-in templates** — operators who previously activated (say) the Quarterly Staff Performance Review template against a location still have a running workflow. Per PR #51's design, the gate is only on `rossActivateWorkflow` and `rossGetTemplates` — *running* workflows are not retroactively paused. This is intentional: we don't yank functionality from operators mid-flight. New activations of those templates require All-in; existing runs continue. The update script does not touch the `workflows` node.
- **Free users with manually edited templates** — the gate filters by `tier`, so if an admin user (us, internally) edited a template to add custom subtasks, the edit survives. Only the `tier` field changes.
- **Backfill order vs rules** — per backlog item #15, the existing backfill script lacks a pre-flight check for `.validate` on `tier`. This script faces the same risk if a future rules change adds `.validate` on `tier`. Currently no such validator exists, so safe to ship.

## Verification

1. `npm run build` clean (no code-path changes; sanity check only).
2. Run the update script against a preview / emulator RTDB; verify the 8 templates have `tier:'all-in'` and the 5 Free templates remain `tier:'free'`.
3. Spot-check `rossGetTemplates` from a Free-tier user account in preview — should see exactly 5 cards.
4. Spot-check `rossGetTemplates` from an All-in (or admin) account — should see all 13.
5. Attempt `rossActivateWorkflow` against an All-in template ID as a Free user — server should reject with the PR #51 error path; verify the audit log records the attempt.

## Files touched

- `functions/seeds/ross-templates-seed.js` — 8 single-line edits
- `functions/seeds/ross-templates-curate-tiers.js` — new file
- `functions/seeds/ross-templates-backfill-tier.js` — folded sibling fix: align databaseURL with rest of codebase
- `public/kb/features/ROSS.md` — append "Curated tier split" subsection
- `docs/plans/2026-05-12-ross-tier-curation-design.md` — this file
- `docs/plans/2026-05-12-ross-tier-curation-plan.md` — implementation plan
