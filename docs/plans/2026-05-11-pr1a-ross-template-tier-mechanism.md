# ROSS Template Tier Gating Mechanism — Implementation Plan (PR 1A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the per-template tier-gating mechanism (`tier: 'free' | 'all-in'`) end-to-end — schema, server filter on `rossGetTemplates`, activate gate on `rossActivateWorkflow`, symmetric write-path validators on `rossCreateTemplate`/`rossUpdateTemplate`, audit log on denials, backfill all 13 seeded templates to `'free'`, editor field, defensive client filter. Post-merge default state: all 13 templates are Free; user-visible behavior is unchanged; the gate is functional but inert until PR 1B flips some templates to `'all-in'`.

**Architecture:** Pure tier helpers in a new `functions/ross-tier.js` module (TDD via Vitest) — composed by `functions/ross.js` Cloud Functions. RTDB `.validate` rules enforce the enum on write. Audit log node `ross/auditLog/templateActivationDenials/{pushId}` is admin-write-only / superAdmin-read. Editor + client filter wire the new field through to operators.

**Tech Stack:** Firebase Cloud Functions v7 (Node 22) + Express, Firebase RTDB, Vue 3 SFC, Vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-05-11-ross-template-tier-gating-design.md`

**Branch:** `feat/ross-template-tier-mechanism` (worktree `.worktrees/ross-template-tier-mechanism`).

---

## File Structure

| File | Action | Responsibility |
|------|--------|---|
| `functions/ross-tier.js` | **Create** | Pure helpers: `VALID_TIERS`, `validateTier(value)`, `userCanActivate(userTier, templateTier, isSuperAdmin)`, `filterTemplatesByTier(templates, userTier, isSuperAdmin)`. Zero dependencies on `admin` / `db` — pure functions over plain data. |
| `tests/unit/ross-tier.test.js` | **Create** | Vitest unit tests covering the pure helpers. |
| `functions/ross.js` | **Modify** | `rossCreateTemplate`: require + validate `tier`. `rossUpdateTemplate`: validate + allow `tier`. `rossActivateWorkflow`: read user tier, call `userCanActivate`, on deny write audit log + 403. `rossGetTemplates`: call `filterTemplatesByTier` after the existing `category` filter. New helper `readUserTier(uid)` (auth-side, talks to `db`). New helper `logActivationDenial(...)`. |
| `functions/seeds/ross-templates-seed.js` | **Modify** | Add `tier: 'free'` to every seed entry. |
| `functions/seeds/ross-templates-backfill-tier.js` | **Create** | One-shot script that reads `ross/templates/*` and writes `tier: 'free'` to any record missing the field. Idempotent. |
| `database.rules.json` | **Modify** | `.validate` rule on `ross/templates/$templateId/tier`. New `ross/auditLog/templateActivationDenials` node (admin-write-only, superAdmin-read). |
| `public/js/modules/ross/v2/playbook-store.js` | **Modify** | Export `VALID_TIERS` constant for use by the editor + render filter. |
| `public/js/modules/ross/v2/components/RossPlaybookTemplateEditor.vue` | **Modify** | Add `tier` field to form, hydrate from existing template on edit, default `'free'` on create, include in `buildPayload`. Validation: must be in `VALID_TIERS`. |
| `public/js/modules/ross/v2/components/RossPlaybook.vue` | **Modify** | Defensive render-time filter on the templates list. SuperAdmin/All-in sees all; Free sees only `tier === 'free'`. |
| `public/kb/features/ROSS.md` | **Modify** | Add Tier section to the Templates schema doc; document tier downgrade policy (activation-time gate only). |

---

## Task 1: Pure tier helpers + tests (TDD)

**Files:**
- Create: `functions/ross-tier.js`
- Test: `tests/unit/ross-tier.test.js`

- [ ] **Step 1.1: Write the failing test**

```javascript
// tests/unit/ross-tier.test.js
import { describe, test, expect } from 'vitest'
import {
  VALID_TIERS,
  validateTier,
  userCanActivate,
  filterTemplatesByTier,
} from '../../functions/ross-tier.js'

describe('VALID_TIERS', () => {
  test('exports exactly free and all-in', () => {
    expect(VALID_TIERS).toEqual(['free', 'all-in'])
  })
})

describe('validateTier', () => {
  test('returns null for free', () => {
    expect(validateTier('free')).toBeNull()
  })
  test('returns null for all-in', () => {
    expect(validateTier('all-in')).toBeNull()
  })
  test('returns error for unknown tier', () => {
    expect(validateTier('premium')).toMatch(/Invalid tier/)
  })
  test('returns error for empty string', () => {
    expect(validateTier('')).toMatch(/Invalid tier/)
  })
  test('returns error for null', () => {
    expect(validateTier(null)).toMatch(/Invalid tier/)
  })
  test('returns error for undefined', () => {
    expect(validateTier(undefined)).toMatch(/Invalid tier/)
  })
  test('returns error for non-string', () => {
    expect(validateTier(42)).toMatch(/Invalid tier/)
  })
})

describe('userCanActivate', () => {
  test('superAdmin can activate any tier', () => {
    expect(userCanActivate('free', 'all-in', true)).toBe(true)
    expect(userCanActivate('all-in', 'free', true)).toBe(true)
    expect(userCanActivate(null, 'all-in', true)).toBe(true)
  })
  test('all-in user can activate free template', () => {
    expect(userCanActivate('all-in', 'free', false)).toBe(true)
  })
  test('all-in user can activate all-in template', () => {
    expect(userCanActivate('all-in', 'all-in', false)).toBe(true)
  })
  test('free user can activate free template', () => {
    expect(userCanActivate('free', 'free', false)).toBe(true)
  })
  test('free user cannot activate all-in template', () => {
    expect(userCanActivate('free', 'all-in', false)).toBe(false)
  })
  test('missing user tier defaults to most-restrictive (free) — cannot activate all-in', () => {
    expect(userCanActivate(null, 'all-in', false)).toBe(false)
    expect(userCanActivate(undefined, 'all-in', false)).toBe(false)
  })
  test('missing user tier can still activate free template', () => {
    expect(userCanActivate(null, 'free', false)).toBe(true)
  })
})

describe('filterTemplatesByTier', () => {
  const templates = [
    { templateId: 't1', name: 'A', tier: 'free' },
    { templateId: 't2', name: 'B', tier: 'all-in' },
    { templateId: 't3', name: 'C', tier: 'free' },
  ]

  test('superAdmin sees everything', () => {
    expect(filterTemplatesByTier(templates, 'free', true)).toEqual(templates)
    expect(filterTemplatesByTier(templates, null, true)).toEqual(templates)
  })
  test('all-in user sees everything', () => {
    expect(filterTemplatesByTier(templates, 'all-in', false)).toEqual(templates)
  })
  test('free user sees only free templates', () => {
    const result = filterTemplatesByTier(templates, 'free', false)
    expect(result.map(t => t.templateId)).toEqual(['t1', 't3'])
  })
  test('missing user tier behaves as free (most-restrictive)', () => {
    const result = filterTemplatesByTier(templates, null, false)
    expect(result.map(t => t.templateId)).toEqual(['t1', 't3'])
  })
  test('templates missing tier field are excluded for free users (fail closed)', () => {
    const withMissing = [...templates, { templateId: 't4', name: 'D' }]
    const result = filterTemplatesByTier(withMissing, 'free', false)
    expect(result.map(t => t.templateId)).toEqual(['t1', 't3'])
  })
  test('templates missing tier field visible to all-in / superAdmin', () => {
    const withMissing = [...templates, { templateId: 't4', name: 'D' }]
    expect(filterTemplatesByTier(withMissing, 'all-in', false).length).toBe(4)
    expect(filterTemplatesByTier(withMissing, null, true).length).toBe(4)
  })
  test('empty input returns empty', () => {
    expect(filterTemplatesByTier([], 'free', false)).toEqual([])
  })
})
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ross-tier.test.js`
Expected: All tests FAIL with `Cannot find module '../../functions/ross-tier.js'` or similar.

- [ ] **Step 1.3: Create the helper module**

```javascript
// functions/ross-tier.js
/**
 * Pure tier-gating helpers for ROSS templates. Zero dependencies on
 * firebase-admin / db — composable into Cloud Functions, easy to test.
 *
 * Two-tier model (locked per PR #42 spec): 'free' | 'all-in'.
 * SuperAdmin bypasses tier checks at every gate point.
 * Missing user tier fails closed (treated as 'free' — the most-restrictive
 * tier — so a half-migrated user can't accidentally see All-in content).
 */

const VALID_TIERS = ['free', 'all-in'];

/**
 * @param {unknown} value
 * @returns {string | null} error message if invalid, null if valid
 */
function validateTier(value) {
    if (typeof value !== 'string' || !VALID_TIERS.includes(value)) {
        return `Invalid tier: ${JSON.stringify(value)}. Must be one of: ${VALID_TIERS.join(', ')}`;
    }
    return null;
}

/**
 * Pure gate: can this user activate this template?
 * @param {string|null|undefined} userTier
 * @param {string} templateTier
 * @param {boolean} isSuperAdmin
 * @returns {boolean}
 */
function userCanActivate(userTier, templateTier, isSuperAdmin) {
    if (isSuperAdmin) return true;
    if (templateTier === 'free') return true;
    return userTier === 'all-in';
}

/**
 * Filter a template list by what the calling user is allowed to see.
 * Templates missing the `tier` field are excluded from Free users
 * (fail closed) — they should only appear post-backfill.
 *
 * @param {Array<{tier?: string}>} templates
 * @param {string|null|undefined} userTier
 * @param {boolean} isSuperAdmin
 * @returns {Array}
 */
function filterTemplatesByTier(templates, userTier, isSuperAdmin) {
    if (!Array.isArray(templates)) return [];
    if (isSuperAdmin) return templates;
    if (userTier === 'all-in') return templates;
    return templates.filter(t => t && t.tier === 'free');
}

module.exports = {
    VALID_TIERS,
    validateTier,
    userCanActivate,
    filterTemplatesByTier,
};
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ross-tier.test.js`
Expected: All ~20 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add functions/ross-tier.js tests/unit/ross-tier.test.js
git commit -m "feat(ross): add pure tier-gating helpers (VALID_TIERS, validateTier, userCanActivate, filterTemplatesByTier)"
```

---

## Task 2: Wire `validateTier` into `rossCreateTemplate`

**Files:**
- Modify: `functions/ross.js:184-231` (rossCreateTemplate)

- [ ] **Step 2.1: Add require at top of file**

In `functions/ross.js`, near the existing `const cors = ...` line, add:

```javascript
const { validateTier, userCanActivate, filterTemplatesByTier } = require('./ross-tier');
```

- [ ] **Step 2.2: Destructure `tier` from request and validate it**

Replace the destructure in `rossCreateTemplate` (around line 192):

```javascript
// BEFORE
const { name, category, description, recurrence, daysBeforeAlert, subtasks, tags } = data;

// AFTER
const { name, category, description, recurrence, daysBeforeAlert, subtasks, tags, tier } = data;
```

Add a validation check after the existing recurrence validation (after line 196):

```javascript
const tierError = validateTier(tier);
if (tierError) return res.status(400).json({ error: tierError });
```

- [ ] **Step 2.3: Include `tier` in the persisted template data**

In the `templateData` object (around line 207), add the `tier` field after `category`:

```javascript
const templateData = {
    templateId,
    name: name.trim(),
    category,
    tier,                                                  // NEW
    description: description?.trim() || '',
    recurrence,
    daysBeforeAlert: Array.isArray(daysBeforeAlert)
        ? daysBeforeAlert.filter(d => Number.isInteger(d) && d > 0)
        : [30, 7],
    subtasks: Array.isArray(subtasks) ? subtasks : [],
    notificationChannels: ['in_app'],
    tags: Array.isArray(tags) ? tags : [],
    createdAt: now,
    updatedAt: now
};
```

- [ ] **Step 2.4: Commit**

```bash
git add functions/ross.js
git commit -m "feat(ross): require tier on rossCreateTemplate"
```

---

## Task 3: Wire `validateTier` into `rossUpdateTemplate`

**Files:**
- Modify: `functions/ross.js:237-280` (rossUpdateTemplate)

- [ ] **Step 3.1: Validate `tier` when present in updates**

In `rossUpdateTemplate`, after the existing recurrence validation (line 258–260), add:

```javascript
if (updates.tier !== undefined) {
    const tierError = validateTier(updates.tier);
    if (tierError) return res.status(400).json({ error: tierError });
}
```

- [ ] **Step 3.2: Add `tier` to `allowedFields`**

Change line 266 from:

```javascript
const allowedFields = ['name', 'category', 'description', 'recurrence', 'daysBeforeAlert', 'subtasks', 'tags'];
```

To:

```javascript
const allowedFields = ['name', 'category', 'tier', 'description', 'recurrence', 'daysBeforeAlert', 'subtasks', 'tags'];
```

- [ ] **Step 3.3: Commit**

```bash
git add functions/ross.js
git commit -m "feat(ross): allow tier field in rossUpdateTemplate (symmetric with create)"
```

---

## Task 4: Activate gate + audit log on `rossActivateWorkflow`

**Files:**
- Modify: `functions/ross.js:368-447` (rossActivateWorkflow)

- [ ] **Step 4.1: Add helpers `readUserTier` + `logActivationDenial` near the auth helpers**

Insert before `// ============================================` for "AUTH HELPERS" or after the existing auth helpers (around line 100, before `verifyLocationAccess`):

```javascript
/**
 * Read the calling user's subscription tier from RTDB.
 * Source-of-truth field is `users/{uid}/tier` (written at signup per
 * registerUser CF). Returns null if missing — caller fails closed.
 */
async function readUserTier(uid) {
    try {
        const snap = await db.ref(`users/${uid}/tier`).once('value');
        const val = snap.val();
        return (typeof val === 'string') ? val : null;
    } catch (_err) {
        return null;  // fail closed
    }
}

/**
 * Write an audit-log entry when a tier gate denies a template
 * activation. Stored under ross/auditLog/templateActivationDenials/{pushId}.
 * Best-effort: a failed audit-log write does NOT block the response;
 * the user still gets their 403.
 */
async function logActivationDenial({ uid, email, templateId, templateName, userTier, templateTier }) {
    try {
        const entry = {
            uid,
            email: email || null,
            templateId,
            templateName: templateName || null,
            userTier: userTier || null,
            templateTier,
            timestamp: admin.database.ServerValue.TIMESTAMP,
        };
        await db.ref('ross/auditLog/templateActivationDenials').push(entry);
    } catch (err) {
        console.warn('[logActivationDenial] audit write failed (non-blocking):', err.message);
    }
}
```

- [ ] **Step 4.2: Insert tier gate in `rossActivateWorkflow` after template fetch**

In `rossActivateWorkflow` (around line 384), after fetching the template:

```javascript
const templateSnap = await db.ref(`ross/templates/${templateId}`).once('value');
if (!templateSnap.exists()) return res.status(404).json({ error: 'Template not found' });
const template = templateSnap.val();
```

Insert immediately after that:

```javascript
// Tier gate — Phase 6 PR 1A. SuperAdmin bypasses. Missing user tier
// fails closed (treated as 'free'). Audit-log denials regardless.
const userTier = await readUserTier(uid);
if (!userCanActivate(userTier, template.tier, isSuperAdmin)) {
    await logActivationDenial({
        uid,
        email: decodedToken.email,
        templateId,
        templateName: template.name,
        userTier,
        templateTier: template.tier,
    });
    return res.status(403).json({
        error: `Template "${template.name}" requires the All-in tier`,
    });
}
```

- [ ] **Step 4.3: Commit**

```bash
git add functions/ross.js
git commit -m "feat(ross): tier gate + audit log on rossActivateWorkflow"
```

---

## Task 5: Server-side filter on `rossGetTemplates`

**Files:**
- Modify: `functions/ross.js:152-178` (rossGetTemplates)

- [ ] **Step 5.1: Replace `verifyUserOrAdmin` shape destructure to capture isSuperAdmin**

In `rossGetTemplates` (around line 157), change:

```javascript
// BEFORE
await verifyUserOrAdmin(decodedToken);
```

To:

```javascript
const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);
```

- [ ] **Step 5.2: Apply tier filter after the existing category filter**

Currently the function ends:

```javascript
if (category && VALID_CATEGORIES.includes(category)) {
    templates = templates.filter(t => t.category === category);
}

templates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
res.json({ result: { success: true, templates } });
```

Replace with:

```javascript
if (category && VALID_CATEGORIES.includes(category)) {
    templates = templates.filter(t => t.category === category);
}

// Tier filter — Phase 6 PR 1A. SuperAdmin sees all; All-in sees all;
// Free + missing-tier-user see only tier === 'free' templates.
const userTier = await readUserTier(uid);
templates = filterTemplatesByTier(templates, userTier, isSuperAdmin);

templates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
res.json({ result: { success: true, templates } });
```

- [ ] **Step 5.3: Commit**

```bash
git add functions/ross.js
git commit -m "feat(ross): tier filter on rossGetTemplates"
```

---

## Task 6: Update seed file to include `tier: 'free'`

**Files:**
- Modify: `functions/seeds/ross-templates-seed.js`

- [ ] **Step 6.1: Add `tier: 'free'` to every template entry**

For each of the 13 template object literals in `functions/seeds/ross-templates-seed.js` (Certificate of Acceptability, Liquor Licence Renewal, Health & Safety Audit, Daily Opening Checklist, Daily Closing Checklist, Weekly Deep Clean Checklist, Weekly Social Media Campaign, Monthly Google Review Campaign, Monthly Food Cost Review, Weekly Supplier Payment Run, Monthly Staff Meeting, Quarterly Staff Performance Review, Monthly Equipment Service Check), add `tier: 'free',` after the `category` field.

Example (first template):

```javascript
{
    name: 'Certificate of Acceptability',
    category: 'compliance',
    tier: 'free',                                            // NEW
    description: '...',
    recurrence: 'annually',
    daysBeforeAlert: [30, 14, 7],
    tags: [...],
    subtasks: [...]
},
```

Apply identically to all 13 entries. Field name is **exactly** `tier`, value is **exactly** `'free'`.

- [ ] **Step 6.2: Sanity check by running the seed against the Firebase emulator (optional but recommended)**

If emulators aren't running already:

```bash
npm run emulators
```

In another terminal, from the worktree root:

```bash
cd functions && GOOGLE_APPLICATION_CREDENTIALS=$FIREBASE_KEY node seeds/ross-templates-seed.js
```

Expected output: `Done. 13 templates seeded.` Then inspect `ross/templates/*` in the emulator UI to verify every record has `tier: 'free'`.

- [ ] **Step 6.3: Commit**

```bash
git add functions/seeds/ross-templates-seed.js
git commit -m "feat(ross): set tier: 'free' on every seeded template"
```

---

## Task 7: Live-data backfill script

**Files:**
- Create: `functions/seeds/ross-templates-backfill-tier.js`

- [ ] **Step 7.1: Write the backfill script**

```javascript
// functions/seeds/ross-templates-backfill-tier.js
/**
 * One-shot live-data backfill: write tier: 'free' to every existing
 * ross/templates/{id} record that's missing the field.
 *
 * Idempotent — re-running is safe. Records that already have `tier`
 * set (to any value) are skipped, NOT overwritten.
 *
 * Run before deploying database.rules.json changes that add
 * .validate on ross/templates/$id/tier — otherwise the rule will
 * reject existing data.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *   node functions/seeds/ross-templates-backfill-tier.js
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb.firebaseio.com',
    });
}

const db = admin.database();

async function backfill() {
    console.log('Reading ross/templates ...');
    const snap = await db.ref('ross/templates').once('value');
    const all = snap.val() || {};
    const ids = Object.keys(all);
    console.log(`Found ${ids.length} templates.`);

    const updates = {};
    let touched = 0;
    let skipped = 0;
    for (const id of ids) {
        if (all[id] && typeof all[id].tier === 'string') {
            skipped++;
            continue;
        }
        updates[`ross/templates/${id}/tier`] = 'free';
        touched++;
    }

    if (touched === 0) {
        console.log(`Nothing to do. ${skipped} templates already had tier set.`);
        process.exit(0);
    }

    console.log(`Writing tier: 'free' to ${touched} templates (skipping ${skipped} already-set) ...`);
    await db.ref().update(updates);
    console.log('Done.');
    process.exit(0);
}

backfill().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
```

- [ ] **Step 7.2: Verify the script syntax (do not run yet against prod)**

```bash
node -c functions/seeds/ross-templates-backfill-tier.js
```

Expected: no output (silent pass). If you see a syntax error, fix it inline.

- [ ] **Step 7.3: Commit**

```bash
git add functions/seeds/ross-templates-backfill-tier.js
git commit -m "feat(ross): one-shot tier backfill script for live data"
```

---

## Task 8: RTDB security rules — `.validate` + audit log node

**Files:**
- Modify: `database.rules.json:489-518` (the `ross` block)

- [ ] **Step 8.1: Read the current `ross` block to confirm structure**

In `database.rules.json` around line 489, the current block opens:

```json
"ross": {
  "templates": {
    ".read": "auth != null",
    ".write": false
  },
  "workflows": { ... },
```

- [ ] **Step 8.2: Add `.validate` rule under `templates/$templateId/tier`**

Replace the `"templates"` block with:

```json
"templates": {
  ".read": "auth != null",
  ".write": false,
  "$templateId": {
    "tier": {
      ".validate": "newData.isString() && (newData.val() === 'free' || newData.val() === 'all-in')"
    }
  }
},
```

- [ ] **Step 8.3: Add the audit log node — superAdmin-read, server-write-only**

In the same `ross` block, after the existing `staff` entry (or another adjacent node — find a sensible location near the bottom of the `ross` block before its closing brace), add:

```json
"auditLog": {
  ".read": "auth != null && root.child('admins').child(auth.uid).child('superAdmin').val() === true",
  ".write": false,
  "templateActivationDenials": {
    "$pushId": {
      ".validate": "newData.hasChildren(['uid', 'templateId', 'templateTier', 'timestamp'])"
    }
  }
}
```

(`.write: false` blocks all client writes — only the admin SDK / Cloud Functions can write here, which is exactly what `rossActivateWorkflow`'s `logActivationDenial` does.)

- [ ] **Step 8.4: Validate the rules file is syntactically valid JSON**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('database.rules.json', 'utf8')); console.log('OK')"
```

Expected: `OK`.

- [ ] **Step 8.5: Commit**

```bash
git add database.rules.json
git commit -m "feat(ross): .validate rule on template.tier + audit log node"
```

---

## Task 9: Surface `VALID_TIERS` to the client + editor field

**Files:**
- Modify: `public/js/modules/ross/v2/playbook-store.js` (export `VALID_TIERS`)
- Modify: `public/js/modules/ross/v2/components/RossPlaybookTemplateEditor.vue`

- [ ] **Step 9.1: Export `VALID_TIERS` from `playbook-store.js`**

Find the existing `export const VALID_CATEGORIES = [...]` and `export const VALID_RECURRENCES = [...]` near the top of `public/js/modules/ross/v2/playbook-store.js`. Add a sibling export:

```javascript
export const VALID_TIERS = ['free', 'all-in']
```

(Keep duplication-with-server intentional — the client doesn't import from `functions/` and we want the enum visible to the form.)

- [ ] **Step 9.2: Import `VALID_TIERS` in the editor**

In `public/js/modules/ross/v2/components/RossPlaybookTemplateEditor.vue` line 18, change:

```javascript
import {
  usePlaybookStore, VALID_CATEGORIES, VALID_RECURRENCES,
} from '../playbook-store.js'
```

To:

```javascript
import {
  usePlaybookStore, VALID_CATEGORIES, VALID_RECURRENCES, VALID_TIERS,
} from '../playbook-store.js'
```

- [ ] **Step 9.3: Add `tier: 'free'` to `blankForm()`**

In `blankForm()` (around line 51–61), add `tier: 'free'`:

```javascript
function blankForm() {
  return {
    name: '',
    description: '',
    category: 'operations',
    tier: 'free',                                            // NEW
    recurrence: 'weekly',
    daysBeforeAlert: [7, 1],
    subtasks: [],
    tags: [],
  }
}
```

- [ ] **Step 9.4: Hydrate `tier` from existing template on edit**

In the `watch(...)` block around line 75–98 where `form.value` is set in edit mode, add `tier: t.tier === 'all-in' ? 'all-in' : 'free'` after `category`:

```javascript
form.value = {
  name: t.name || '',
  description: t.description || '',
  category: t.category || 'operations',
  tier: t.tier === 'all-in' ? 'all-in' : 'free',           // NEW
  recurrence: t.recurrence || 'weekly',
  daysBeforeAlert: Array.isArray(t.daysBeforeAlert) ? [...t.daysBeforeAlert] : [7, 1],
  // ... rest unchanged
}
```

(The conditional handles legacy templates with missing/invalid `tier` defensively — but post-backfill every template has it.)

- [ ] **Step 9.5: Add tier validation to `errors` computed**

In the `errors` computed (around line 187–205), add after the category validation:

```javascript
if (!VALID_TIERS.includes(form.value.tier)) out.tier = 'Invalid'
```

- [ ] **Step 9.6: Include `tier` in `buildPayload()`**

In `buildPayload()` (around line 208–235), add `tier` after `category`:

```javascript
return {
  name: form.value.name.trim(),
  category: form.value.category,
  tier: form.value.tier,                                    // NEW
  description: form.value.description.trim() || '',
  recurrence: form.value.recurrence,
  // ... rest unchanged
}
```

- [ ] **Step 9.7: Add the tier field to the template form template**

In the template editor markup, find the existing Category / Recurrence row (around line 300–312):

```html
<label class="tpleditor__field">
  <span class="hf-eyebrow">Category</span>
  <select v-model="form.category" class="tpleditor__select">
    <option v-for="c in categoryOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
  </select>
</label>

<label class="tpleditor__field">
  <span class="hf-eyebrow">Recurrence</span>
  <select v-model="form.recurrence" class="tpleditor__select">
    <option v-for="r in recurrenceOptions" :key="r.id" :value="r.id">{{ r.label }}</option>
  </select>
</label>
```

Insert a Tier field **between** Category and Recurrence:

```html
<label class="tpleditor__field">
  <span class="hf-eyebrow">Tier</span>
  <select v-model="form.tier" class="tpleditor__select">
    <option value="free">Free</option>
    <option value="all-in">All-in</option>
  </select>
  <span v-if="errors.tier" class="tpleditor__field-err">{{ errors.tier }}</span>
</label>
```

- [ ] **Step 9.8: Build to confirm no Vue compile errors**

```bash
npm run build
```

Expected: build green. The `main-home-*.js` asset hash should change (confirms the SFC recompiled).

- [ ] **Step 9.9: Commit**

```bash
git add public/js/modules/ross/v2/playbook-store.js public/js/modules/ross/v2/components/RossPlaybookTemplateEditor.vue
git commit -m "feat(ross): tier field in template editor (superAdmin-only surface)"
```

---

## Task 10: Defensive client filter on the template list

**Files:**
- Modify: `public/js/modules/ross/v2/components/RossPlaybook.vue`

This is a belt-and-braces filter — server has already filtered the response, but we want to prevent flash-of-all-in-templates during a tier change or stale cache scenario.

- [ ] **Step 10.1: Locate the templates list render in `RossPlaybook.vue`**

Run from the worktree root:

```bash
grep -n "templates" public/js/modules/ross/v2/components/RossPlaybook.vue | head -20
```

Find the computed/list that maps over `store.templates` for the Templates section render (likely a `v-for="t in templates"` or similar). The exact lines vary — read the file around the matches.

- [ ] **Step 10.2: Add an auth+tier-aware `visibleTemplates` computed**

In the `<script setup>` of `RossPlaybook.vue`, near other store-derived computeds, add (adjusting the import line if `auth`, `onAuthStateChanged`, or `VALID_TIERS` aren't already in scope):

```javascript
import { auth, onAuthStateChanged } from '/js/config/firebase-config.js'
import { onUnmounted, ref, computed } from 'vue'

const currentUserTier = ref(null)
const isSuperAdmin = computed(() => !!store.isSuperAdmin)  // existing store flag if present, else read from admins/{uid} similarly to PR #30

const unsubAuth = onAuthStateChanged(auth, async (u) => {
  if (!u) { currentUserTier.value = null; return }
  // Match the server-side readUserTier source-of-truth: users/{uid}/tier
  // Fail closed (null = treated as 'free' by the filter).
  try {
    const { get, ref: rtdbRef, rtdb } = await import('/js/config/firebase-config.js')
    const snap = await get(rtdbRef(rtdb, `users/${u.uid}/tier`))
    const val = snap.val()
    currentUserTier.value = (typeof val === 'string') ? val : null
  } catch (_) { currentUserTier.value = null }
})
onUnmounted(() => { try { unsubAuth?.() } catch (_) {} })

const visibleTemplates = computed(() => {
  const list = store.templates || []
  if (isSuperAdmin.value) return list
  if (currentUserTier.value === 'all-in') return list
  return list.filter(t => t && t.tier === 'free')
})
```

- [ ] **Step 10.3: Update the template list `v-for` to iterate `visibleTemplates`**

Change `v-for="t in store.templates"` (or whatever the current source is) to `v-for="t in visibleTemplates"`.

If the existing render uses an intermediate computed like `filteredTemplates`, modify *that* computed to chain through `visibleTemplates` instead of `store.templates`.

- [ ] **Step 10.4: Build + verify**

```bash
npm run build
```

Expected: build green; asset hash for `main-home` changes again, confirming the SFC recompiled.

- [ ] **Step 10.5: Commit**

```bash
git add public/js/modules/ross/v2/components/RossPlaybook.vue
git commit -m "feat(ross): defensive client-side tier filter on template list"
```

---

## Task 11: Document tier downgrade policy in the KB

**Files:**
- Modify: `public/kb/features/ROSS.md`

- [ ] **Step 11.1: Add a "Tier gating" section to `ROSS.md`**

Find the existing "Templates" or "Workflows" section in `public/kb/features/ROSS.md`. Add a new section after it:

```markdown
## Tier gating (Phase 6 PR 1A — shipped 2026-05-11)

Templates carry a `tier: 'free' | 'all-in'` field (required, `.validate`-enforced).
Users have `users/{uid}/tier` written at signup. Gate fires at three points:

- **Server read (`rossGetTemplates`)**: filter response by user tier. Free users
  receive only `tier: 'free'` templates. SuperAdmin sees all.
- **Server activate (`rossActivateWorkflow`)**: reject 403 if a Free user tries
  to activate an All-in template. Denial logged to
  `ross/auditLog/templateActivationDenials/{pushId}`.
- **Client render (`RossPlaybook.vue`)**: defensive filter — same logic, prevents
  stale-cache flash-of-all-in.

### Tier downgrade policy

**Activation-time gate only.** If an All-in user downgrades to Free with active
workflows from premium templates, those workflows keep running on their own
schedule. They cannot activate *new* All-in workflows post-downgrade, but
existing work is never yanked. This is intentional — don't pull paid work out
from under operators.

### Missing tier fields (fail closed)

The server- and client-side filters treat missing `users/{uid}/tier` as `'free'`
(most-restrictive). Templates missing the `tier` field are excluded from Free
users entirely. Post-backfill (PR 1A migration) every template has `tier` set,
so this only matters during the deploy window.
```

- [ ] **Step 11.2: Commit**

```bash
git add public/kb/features/ROSS.md
git commit -m "docs(ross): tier gating + downgrade policy in feature KB"
```

---

## Task 12: Deploy, backfill, smoke test

The migration order is **critical**. Architect-flagged risk: `.validate` rejects existing data if deployed before backfill.

- [ ] **Step 12.1: Confirm `functions/` has `node_modules` (LESSON 2026-04-30)**

```bash
cd functions && npm install && cd ..
```

Expected: silent success or `up to date`. If you skip this, the next step fails with `MODULE_NOT_FOUND`.

- [ ] **Step 12.2: Deploy Cloud Functions FIRST**

```bash
firebase deploy --only functions:rossCreateTemplate,functions:rossUpdateTemplate,functions:rossActivateWorkflow,functions:rossGetTemplates
```

Expected: green deploy, no schema-validation rejection (rules still tolerant at this point).

- [ ] **Step 12.3: Run the live-data backfill (production)**

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/serviceAccount.json \
  node functions/seeds/ross-templates-backfill-tier.js
```

Expected output: `Writing tier: 'free' to 13 templates (skipping 0 already-set) ... Done.` (count may differ if any templates have been added since the seed).

Verify in Firebase console: open `ross/templates/<any-id>` — confirm `tier: 'free'` is set.

- [ ] **Step 12.4: Deploy database rules**

```bash
firebase deploy --only database
```

Expected: green deploy. (Now `.validate` is active — any future write without `tier` is rejected.)

- [ ] **Step 12.5: Deploy hosting (Vue changes)**

```bash
firebase deploy --only hosting
```

(CI also does this on PR merge; this step is for the smoke test against prod after merge.)

- [ ] **Step 12.6: Manual smoke test — Free user**

In an incognito window, log in as a Free-tier test account (or create one).
- Navigate to `/ross.html?tab=playbook` → Templates list. Expected: all 13 templates visible (because backfill set them all to Free).
- Click any template → activate against a location. Expected: succeeds.

- [ ] **Step 12.7: Manual smoke test — All-in user (or superAdmin)**

Same flow as 12.6 but as an All-in user or superAdmin. Expected: same visible list, same activate behaviour.

- [ ] **Step 12.8: Manual smoke test — denial path (synthetic)**

Temporarily flip one template to `tier: 'all-in'` via the editor (or directly in the Firebase console). Repeat 12.6 as Free user.
- Templates list: that one template should now be **absent** from the Free user's list.
- Try to activate it via direct API call (e.g. via the network tab replay or `curl`):
  ```bash
  curl -X POST -H "Authorization: Bearer $FREE_USER_ID_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"templateId":"<the-id>","locationIds":["<loc>"],"nextDueDate":1763000000000}' \
    https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/rossActivateWorkflow
  ```
  Expected: HTTP 403 with `error: "Template \"...\" requires the All-in tier"`.
- Verify the denial was logged: read `ross/auditLog/templateActivationDenials` in the Firebase console as a superAdmin.

Flip the test template back to `tier: 'free'` after the smoke test.

---

## Task 13: Update PR description + open for review

- [ ] **Step 13.1: Push the branch (if not already)**

```bash
git push -u origin feat/ross-template-tier-mechanism
```

- [ ] **Step 13.2: Open the PR**

```bash
gh pr create --base master --head feat/ross-template-tier-mechanism \
  --title "feat(ross): template tier-gating mechanism (Phase 6 PR 1A)" \
  --body "$(cat <<'EOF'
## Summary

Implements the tier-gating mechanism for ROSS templates per spec #50.
Post-merge state: all 13 templates remain Free; user-visible behaviour
unchanged; the gate is functional but inert until PR 1B flips ~8
templates to All-in.

## Files changed

- **New:** `functions/ross-tier.js` (pure helpers), `tests/unit/ross-tier.test.js` (~20 vitest tests), `functions/seeds/ross-templates-backfill-tier.js` (one-shot live-data backfill).
- **Modified:** `functions/ross.js` (`rossCreateTemplate`, `rossUpdateTemplate`, `rossActivateWorkflow`, `rossGetTemplates`), `functions/seeds/ross-templates-seed.js` (every template gets `tier: 'free'`), `database.rules.json` (`.validate` rule + audit log node), `public/js/modules/ross/v2/playbook-store.js` (`VALID_TIERS` export), `RossPlaybookTemplateEditor.vue` (Tier field), `RossPlaybook.vue` (defensive client filter), `public/kb/features/ROSS.md` (tier downgrade policy).

## Verification

- `npx vitest run tests/unit/ross-tier.test.js` — all helper tests pass
- `npm run build` — green
- Manual smoke test against preview: see PR test plan below

## Test plan

- [ ] Free user logs in, sees all 13 templates (all backfilled to `tier: 'free'`), can activate any
- [ ] All-in user logs in, same behaviour
- [ ] SuperAdmin opens template editor, sees the new Tier field
- [ ] SuperAdmin creates a new template — Tier field is required
- [ ] SuperAdmin flips one template to All-in, Free user no longer sees it
- [ ] Direct API call to activate an All-in template as a Free user → 403; check audit log entry
- [ ] Reset the test template back to Free

## Out of scope (per spec §5)

- Curation decision — which templates ship Free vs All-in (PR 1B)
- Upgrade CTA on All-in cards (PR 1C)
- `feature-access-control.js:64` dynamic-import bug (separate PR; on Bug Triage Queue)
EOF
)"
```

- [ ] **Step 13.3: After CI green, request operator review on the preview channel**

---

## Self-Review

**Spec coverage check** (against `docs/superpowers/specs/2026-05-11-ross-template-tier-gating-design.md`):

- §4.1 Schema (`tier` required + enum) → Task 8 (`.validate` rule) + Task 2/3 (server enforcement) ✓
- §4.2 Server reads filter → Task 5 ✓
- §4.3 Server activate gate → Task 4 ✓
- §4.4 Symmetric write-path validators → Tasks 2, 3 ✓
- §4.5 Audit log node → Tasks 4, 8 ✓
- §4.6 Client editor field → Task 9 ✓
- §4.7 Client render filter → Task 10 ✓
- §4.8 Downgrade policy doc → Task 11 ✓
- §4.9 Migration (seed + backfill, order) → Tasks 6, 7, 12 ✓
- §6 Risks: rule-before-backfill → Task 12 explicit order ✓
- §6 Risks: fail-closed on read failure → Task 4 `readUserTier` catch returns null; Task 1 helpers default null → free ✓
- §6 Risks: superAdmin override at all three points → Tasks 4, 5, 10 ✓

No spec gaps.

**Placeholder scan:** no TBDs, no "implement later", every code step has actual code.

**Type consistency check:**
- Helper names match across tasks: `validateTier`, `userCanActivate`, `filterTemplatesByTier`, `readUserTier`, `logActivationDenial` ✓
- `VALID_TIERS = ['free', 'all-in']` consistent in `functions/ross-tier.js` (Task 1) and `playbook-store.js` (Task 9) ✓
- Audit log path consistent: `ross/auditLog/templateActivationDenials` in Task 4 (write), Task 8 (security rule), Task 12 (smoke test read) ✓
- `tier` field name consistent everywhere ✓
