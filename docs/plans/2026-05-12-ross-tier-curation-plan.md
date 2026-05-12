# ROSS Starter Template Tier Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the PR #51 tier-gate by flipping 8 of 13 ROSS starter templates from `tier:'free'` → `tier:'all-in'`, both in the seed file (fresh deploys) and in production RTDB (existing records), per the curated split in `docs/plans/2026-05-12-ross-tier-curation-design.md`.

**Architecture:** Pure content change. No new code paths, no schema changes, no rules changes, no client UI changes. PR #51 already wired the gate (server filter on `rossGetTemplates`, activate gate on `rossActivateWorkflow`, validators on Create/Update). This PR flips data only.

**Tech Stack:** Firebase RTDB, Firebase Admin SDK (Node.js), Cloud Functions seed scripts.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `functions/seeds/ross-templates-seed.js` | modify | Source of truth for fresh deploys — flip 8 `tier` values |
| `functions/seeds/ross-templates-curate-tiers.js` | create | One-off idempotent script to update existing prod RTDB records by template name |
| `public/kb/features/ROSS.md` | modify | Append "Curated tier split" subsection documenting the split + rationale |

---

## Task 1: Update the seed file (source of truth)

**Files:**
- Modify: `functions/seeds/ross-templates-seed.js`

**Context:** The seed file at the worktree root currently has all 13 templates with `tier: 'free'`. Per the design spec, 8 of them flip to `'all-in'`. The exact 8 templates by name:

- Certificate of Acceptability
- Liquor Licence Renewal
- Weekly Social Media Campaign
- Monthly Google Review Campaign
- Weekly Supplier Payment Run
- Monthly Staff Meeting
- Quarterly Staff Performance Review
- Monthly Equipment Service Check

The 5 that stay `'free'`: Daily Opening Checklist, Daily Closing Checklist, Weekly Deep Clean Checklist, Monthly Food Cost Review, Health & Safety Audit.

- [ ] **Step 1: Flip the 8 tier values**

For each of the 8 templates listed above, change the line `tier: 'free',` to `tier: 'all-in',`. The lines to change in `functions/seeds/ross-templates-seed.js` (verify with `grep -n "tier: 'free'" functions/seeds/ross-templates-seed.js` from worktree root first):

```javascript
// Certificate of Acceptability block
tier: 'all-in',

// Liquor Licence Renewal block
tier: 'all-in',

// Weekly Social Media Campaign block
tier: 'all-in',

// Monthly Google Review Campaign block
tier: 'all-in',

// Weekly Supplier Payment Run block
tier: 'all-in',

// Monthly Staff Meeting block
tier: 'all-in',

// Quarterly Staff Performance Review block
tier: 'all-in',

// Monthly Equipment Service Check block
tier: 'all-in',
```

Use targeted Edit per template (use the surrounding `name:` line to disambiguate, since `tier: 'free',` appears many times). Example for the first one:

```javascript
// old_string:
        name: 'Certificate of Acceptability',
        category: 'compliance',
        tier: 'free',
// new_string:
        name: 'Certificate of Acceptability',
        category: 'compliance',
        tier: 'all-in',
```

- [ ] **Step 2: Verify the split**

Run from the worktree root:

```bash
grep -c "tier: 'free'" functions/seeds/ross-templates-seed.js
grep -c "tier: 'all-in'" functions/seeds/ross-templates-seed.js
```

Expected: `5` and `8` respectively.

- [ ] **Step 3: Commit**

```bash
git add functions/seeds/ross-templates-seed.js
git commit -m "feat(ross): curate seed templates — 5 Free, 8 All-in (Phase 6 PR 1B)"
```

---

## Task 2: Create the one-off update script

**Files:**
- Create: `functions/seeds/ross-templates-curate-tiers.js`

**Context:** Existing prod records were created by the original seed run (all `tier:'free'`) and then backfilled by `ross-templates-backfill-tier.js` (which sets missing `tier` to `'free'`). We need to flip the same 8 records in prod. Records use generated `templateId`s, so we match by `name` — the only stable identifier across environments. Pattern mirrors the existing backfill script for consistency.

- [ ] **Step 1: Inspect the existing backfill script to mirror its shape**

Read `functions/seeds/ross-templates-backfill-tier.js` to confirm the admin init pattern, the iteration pattern, and the database URL. Reuse the same shape — this script is the next sibling.

- [ ] **Step 2: Write the new script**

Create `functions/seeds/ross-templates-curate-tiers.js` with this content:

```javascript
/**
 * ROSS Starter Templates — Tier Curation Script (Phase 6 PR 1B)
 *
 * One-off, idempotent update of existing production templates to flip 8 of 13
 * from tier:'free' to tier:'all-in' per the curated starter library split.
 * Matches by `name` (the only stable identifier across environments — templateId
 * is generated per-environment by the original seed).
 *
 * Free (untouched): Daily Opening Checklist, Daily Closing Checklist,
 *   Weekly Deep Clean Checklist, Monthly Food Cost Review, Health & Safety Audit.
 *
 * All-in (this script flips): the 8 names in TEMPLATES_TO_FLIP below.
 *
 * Run once: node functions/seeds/ross-templates-curate-tiers.js
 * Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase emulator running.
 * Safe to re-run — sets the same value each time.
 *
 * See: docs/plans/2026-05-12-ross-tier-curation-design.md
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
    });
}

const db = admin.database();

const TEMPLATES_TO_FLIP = [
    'Certificate of Acceptability',
    'Liquor Licence Renewal',
    'Weekly Social Media Campaign',
    'Monthly Google Review Campaign',
    'Weekly Supplier Payment Run',
    'Monthly Staff Meeting',
    'Quarterly Staff Performance Review',
    'Monthly Equipment Service Check'
];

async function curateTiers() {
    console.log('Reading ross/templates...');
    const snapshot = await db.ref('ross/templates').once('value');
    const templates = snapshot.val() || {};

    const updates = {};
    const found = new Set();
    let skipped = 0;

    for (const [templateId, template] of Object.entries(templates)) {
        if (!template || typeof template !== 'object') continue;
        if (TEMPLATES_TO_FLIP.includes(template.name)) {
            if (template.tier === 'all-in') {
                console.log(`  Already all-in (skip): ${template.name}`);
                skipped += 1;
                found.add(template.name);
                continue;
            }
            updates[`ross/templates/${templateId}/tier`] = 'all-in';
            updates[`ross/templates/${templateId}/updatedAt`] = Date.now();
            console.log(`  Flipping → all-in: ${template.name} (${templateId})`);
            found.add(template.name);
        }
    }

    const missing = TEMPLATES_TO_FLIP.filter(n => !found.has(n));
    if (missing.length > 0) {
        console.warn(`WARNING: ${missing.length} template name(s) not found in RTDB:`);
        missing.forEach(n => console.warn(`  - ${n}`));
    }

    const flipping = Object.keys(updates).length / 2;
    if (flipping === 0) {
        console.log(`Nothing to update (${skipped} already all-in, ${missing.length} missing).`);
        process.exit(0);
    }

    console.log(`Applying ${flipping} tier flip(s) atomically...`);
    await db.ref().update(updates);
    console.log(`Done. Flipped ${flipping}, skipped ${skipped}, missing ${missing.length}.`);
    process.exit(0);
}

curateTiers().catch(err => {
    console.error('Curate failed:', err);
    process.exit(1);
});
```

- [ ] **Step 3: Sanity check the script with `node --check`**

```bash
node --check functions/seeds/ross-templates-curate-tiers.js
```

Expected: no output (silent success).

- [ ] **Step 4: Commit**

```bash
git add functions/seeds/ross-templates-curate-tiers.js
git commit -m "feat(ross): one-off script to curate template tiers in prod RTDB"
```

---

## Task 3: Document the curated split in the KB

**Files:**
- Modify: `public/kb/features/ROSS.md`

**Context:** Future agents working on the playbook (and Phase 6's next items — tier-gated list filter, day-zero auto-activation) need to know which templates are in which tier and why. Append a subsection to the existing ROSS KB doc.

- [ ] **Step 1: Find the right insertion point**

Read `public/kb/features/ROSS.md` and locate a section that talks about templates or tiers (likely near the Templates schema block or near a Phase 6 / tier-gating reference, depending on how the doc has evolved). Append the new subsection after the closest existing templates-related content. If no obvious anchor exists, append at the end of the file before any "Related" / "See also" footer.

- [ ] **Step 2: Append the subsection**

Add this content (adjust the surrounding heading level to match the host doc — use `##` if it's a top-level section, `###` if nested):

```markdown
## Curated tier split (Phase 6 PR 1B, 2026-05-12)

The 13 starter templates ship across two tiers. The split is enforced by the
PR #51 gate mechanism (server filter on `rossGetTemplates`, activate gate on
`rossActivateWorkflow`, validators on Create/Update Template).

**Free (5) — "Run your day on ROSS":**

| Template | Cadence | Role |
|---|---|---|
| Daily Opening Checklist | daily | Daily habit anchor |
| Daily Closing Checklist | daily | Daily habit anchor (pair) |
| Weekly Deep Clean Checklist | weekly | Weekly cadence demonstration |
| Monthly Food Cost Review | monthly | Cross-sells the food-cost module |
| Health & Safety Audit | quarterly | SA-locale compliance taste |

**All-in (8) — depth, back-office, high-stakes compliance:**

| Template | Category | Why upgrade-gated |
|---|---|---|
| Certificate of Acceptability | compliance | High-stakes SA regulatory annual |
| Liquor Licence Renewal | compliance | Revenue-blocking if missed |
| Weekly Social Media Campaign | growth | Growth category — ROI conversation |
| Monthly Google Review Campaign | growth | Growth depth |
| Weekly Supplier Payment Run | finance | Back-office finance depth |
| Monthly Staff Meeting | hr | HR entirely behind paywall — for teams |
| Quarterly Staff Performance Review | hr | HR depth |
| Monthly Equipment Service Check | maintenance | Maintenance category — back-office |

**Curation principle:** Free covers the daily habit anchor plus one template
per major cadence (weekly / monthly / quarterly), with one SA-locale
compliance taste. All-in unlocks entire categories (HR, growth, maintenance)
rather than scattered templates, so the upgrade conversation is "unlock the
rest of the playbook" rather than "unlock one more weekly checklist".

**Note on existing workflows:** The activate-time gate only affects *new*
activations. Workflows already activated before the curation flip continue
to run regardless of the source template's current tier. The one-off
update script (`functions/seeds/ross-templates-curate-tiers.js`) only
touches `ross/templates/*/tier`, never `ross/workflows`.

See `docs/plans/2026-05-12-ross-tier-curation-design.md` for the full rationale.
```

- [ ] **Step 3: Verify the doc still renders cleanly**

Skim the edited file end-to-end for heading level consistency and no broken markdown tables.

- [ ] **Step 4: Commit**

```bash
git add public/kb/features/ROSS.md
git commit -m "docs(ross): document curated Free/All-in tier split"
```

---

## Task 4: Build verification + push

**Files:** none (verification only)

- [ ] **Step 1: Run the build**

```bash
npm run build
```

Expected: clean build, no errors. (No code-path changes, but Standard Task Workflow step 5 requires it.)

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feature/ross-tier-curate
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(ross): curate starter template library — 5 Free, 8 All-in (Phase 6 PR 1B)" --body "$(cat <<'EOF'
## Summary

- Activates the PR #51 tier-gate by flipping 8 of 13 starter templates from `tier:'free'` → `tier:'all-in'`
- Seed file updated (source of truth for fresh deploys) + one-off script to flip the 8 existing prod records by name
- KB doc updated with the curated split + rationale

**Free (5):** Daily Opening, Daily Closing, Weekly Deep Clean, Monthly Food Cost Review, Health & Safety Audit
**All-in (8):** CoA, Liquor Licence, Weekly Social, Monthly Google Reviews, Weekly Supplier Pay, Monthly Staff Meeting, Quarterly Performance Review, Monthly Equipment Service

See `docs/plans/2026-05-12-ross-tier-curation-design.md` for the full rationale.

## Test plan

- [ ] `npm run build` clean
- [ ] After merge: run `node functions/seeds/ross-templates-curate-tiers.js` against prod RTDB; verify 5 free / 8 all-in via console output
- [ ] Spot-check `rossGetTemplates` from a Free-tier account in admin dashboard — exactly 5 cards visible
- [ ] Spot-check `rossGetTemplates` from an All-in / admin account — all 13 visible
- [ ] Attempt activate on an All-in template ID as a Free user — server rejects per PR #51 gate; audit log records the attempt

## Out of scope

- Tier-gated client UI affordances (🔒 indicator, upsell) — separate Phase 6 PR
- Day-zero auto-activation — separate Phase 6 PR
EOF
)"
```

- [ ] **Step 4: Capture PR URL**

Note the URL returned by `gh pr create` and surface it to the user.

---

## Post-merge (operator)

Per Standard Task Workflow step 11, after PR merge:

1. Run `node functions/seeds/ross-templates-curate-tiers.js` against prod once
2. Reflect cycle: update `KNOWLEDGE BASE/development/SELF_OPTIMIZATION.md`, `LESSONS.md`, `SCORECARD.md`, `PROJECT_BACKLOG.md`
3. Remove worktree: `git worktree remove .claude/worktrees/ross-tier-curate`
