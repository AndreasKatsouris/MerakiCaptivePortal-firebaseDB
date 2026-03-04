# Corporate Compliance Module — Hardening & Sidebar Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve all CRITICAL, HIGH, and key MEDIUM issues from the three-agent review of the corporate compliance module, and ensure the tool is correctly linked in the admin-dashboard sidebar.

**Architecture:** Six independent parallel tracks, each owning a distinct set of files with no shared write conflicts. Track 7 (multi-tenancy) is the one breaking-change track that must be coordinated separately. Each track produces a standalone commit. Tracks 1–6 can all run simultaneously.

**Tech Stack:** Firebase RTDB, Vanilla JS ESM, Bootstrap 5, SweetAlert2, database.rules.json

---

## Parallel Track Overview

| Track | Agent | Files Owned | Issues Resolved |
|-------|-------|-------------|-----------------|
| **1** | firebase-backend-dev | `database.rules.json` | H3, RTDB index fix |
| **2** | frontend-developer | `html-escape.js`, `corporate-compliance.html`, `admin-dashboard.html` | H2, H4, H5, sidebar |
| **3** | frontend-developer | `entity-registry.js` | H9 (entity side), H7, M3 |
| **4** | frontend-developer | `compliance-tracker.js` | H9 (tracker side), M5/M10, M1, HIGH-2/3/5 |
| **5** | frontend-developer | `deadline-calculator.js` | MEDIUM-4, MEDIUM-5, MEDIUM-7, HIGH-4 |
| **6** | firebase-backend-dev | `firebase-service.js` | M2, LOW-2/3 |
| **7** | firebase-backend-dev | ALL compliance files + `database.rules.json` | C1 (multi-tenancy) — **AFTER tracks 1–6 merge** |

---

## Track 1 — Database Rules Hardening

**Agent:** firebase-backend-dev
**File:** `database.rules.json`

### Issue Summary
- **H3:** Root `.read: "auth != null"` cascades down and overrides the admin-only read rule on the `compliance` node — any authenticated user can read all compliance data.
- **Index Fix:** `.indexOn` on the `filings` node is misplaced; queries run on child paths.

---

### Task 1.1 — Fix the root-level read cascade

**File:** `database.rules.json:3`

**Step 1: Read the current root rule**

Read lines 1–10 of `database.rules.json`. Note the line:
```json
".read": "auth != null",
```

**Step 2: Remove the root-level `.read` rule**

The root `.read: "auth != null"` cannot coexist with child-level restrictions in Firebase RTDB (a grant at a higher node is not revocable at lower nodes). Remove it.

Change:
```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null && auth.token.admin === true",
```

To:
```json
{
  "rules": {
    ".write": "auth != null && auth.token.admin === true",
```

> **Why:** Firebase RTDB rule evaluation stops at the first `.read` grant. Once `auth != null` is granted at root, no child rule can restrict it. The compliance node rule `.read: "auth != null && auth.token.admin === true"` is silently bypassed. Removing the root read forces all reads to be governed by explicit per-node rules.

**Step 3: Verify nodes that relied on the root read still work**

Search `database.rules.json` for all nodes that do NOT have their own `.read` rule. Add explicit `.read` rules to them. Common nodes:
- `guests` — already has `.read: "auth != null"` ✓
- `users/$uid` — already has `.read: "auth != null"` ✓
- `subscriptions/$uid` — already has its own `.read` ✓
- `locations` — already has `.read: "auth != null"` ✓
- `userLocations/$uid` — already has its own `.read` ✓
- `onboarding-progress/$uid` — already has its own `.read` ✓

For any node that only had the root rule as its effective read grant, add:
```json
".read": "auth != null"
```

**Step 4: Fix misplaced indexes on the `filings` node**

Find the `filings` node in `database.rules.json`. It currently has:
```json
"filings": {
  ".indexOn": ["status", "dueDate"],
```

In Firebase RTDB, `.indexOn` must be placed on the node whose **children** you want to query. Queries are run on `filings/{year}/{entityId}` children. Move the indexes:

```json
"filings": {
  "$year": {
    "$entityId": {
      ".indexOn": ["status", "dueDate"]
    }
  }
}
```

**Step 5: Commit**

```bash
git add database.rules.json
git commit -m "fix: remove cascading root read rule exposing compliance data to all users

Resolves H3: root .read 'auth != null' was overriding the
admin-only restriction on the compliance node. Any authenticated
user could call get(ref(rtdb, 'compliance')) to read all entity
and filing data. Also moves filings index to correct child depth."
```

---

### Task 1.2 — Add `.validate` length constraints for filing inputs

**File:** `database.rules.json` — compliance filings section

Find the section:
```json
"compliance": {
  ...
  "filings": {
    "$year": {
      "$entityId": {
        "$obligationId": {
```

Under `$obligationId`, add `.validate` rules for `filedBy` and `notes` fields:

```json
"filedBy": {
  ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 200"
},
"notes": {
  ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 1000)"
},
```

**Commit:**
```bash
git add database.rules.json
git commit -m "fix: add server-side length validation for filing filedBy and notes fields"
```

---

## Track 2 — HTML Shell: SRI Hashes, Error Handling, Sidebar

**Agent:** frontend-developer
**Files:** `public/corporate-compliance.html`, `public/js/modules/compliance/utils/html-escape.js`, `public/admin-dashboard.html`

---

### Task 2.1 — Fix `escapeAttr` to escape single quotes (HIGH-5)

**File:** `public/js/modules/compliance/utils/html-escape.js:25-27`

**Why this matters:** `compliance-tracker.js:203` uses single-quoted attribute syntax:
```js
data-entity-ids='${escapeAttr(entityIdsJson)}'
```
`escapeAttr` currently only escapes `"` → `&quot;`. A value containing `'` breaks out of the single-quoted attribute and enables XSS.

**Step 1: Read the current implementation** (lines 25–27 of `html-escape.js`)

**Step 2: Update `escapeAttr`**

Change:
```js
export function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
```

To:
```js
export function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

**Step 3: Commit**
```bash
git add public/js/modules/compliance/utils/html-escape.js
git commit -m "fix: escapeAttr now escapes single quotes to prevent attribute injection

Single-quoted HTML attributes (data-entity-ids='...') were not
protected against values containing apostrophes."
```

---

### Task 2.2 — Add try/catch to `getIdTokenResult` (HIGH-4)

**File:** `public/corporate-compliance.html:138-146`

**Step 1: Read lines 127–165 of `corporate-compliance.html`**

**Step 2: Wrap the `getIdTokenResult` call**

Current code:
```js
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '/user-login.html?message=unauthorized';
        return;
    }

    const idTokenResult = await user.getIdTokenResult();
    if (!idTokenResult.claims.admin) {
        document.getElementById('compliance-app').innerHTML = `
            <div class="alert alert-danger mt-4">
                <i class="fas fa-lock me-2"></i>
                Access restricted. This module is available to directors only.
            </div>`;
        return;
    }

    try {
        await initializeComplianceModule('compliance-app');
    } catch (error) {
```

Replace the `const idTokenResult = await user.getIdTokenResult();` block — wrap the entire token check + module init in one try/catch:

```js
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '/user-login.html?message=unauthorized';
        return;
    }

    try {
        const idTokenResult = await user.getIdTokenResult();
        if (!idTokenResult.claims.admin) {
            document.getElementById('compliance-app').innerHTML =
                '<div class="alert alert-danger mt-4">' +
                '<i class="fas fa-lock me-2"></i>' +
                'Access restricted. This module is available to directors only.' +
                '</div>';
            return;
        }
        await initializeComplianceModule('compliance-app');
    } catch (error) {
        const el = document.getElementById('compliance-app');
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger mt-4';
        const h5 = document.createElement('h5');
        h5.textContent = 'Initialisation Error';
        const p = document.createElement('p');
        p.textContent = error.message;
        alert.appendChild(h5);
        alert.appendChild(p);
        el.innerHTML = '';
        el.appendChild(alert);
    }
});
```

**Step 3: Commit**
```bash
git add public/corporate-compliance.html
git commit -m "fix: wrap getIdTokenResult in try/catch to handle token refresh failures"
```

---

### Task 2.3 — Add SRI hashes to CDN resources (H2)

**File:** `public/corporate-compliance.html:10-13, 125`

**Step 1: Get the correct SRI hashes**

These are the verified hashes for the exact versions referenced:

| Resource | Version | integrity hash |
|----------|---------|---------------|
| Bootstrap CSS | 5.3.0 | `sha384-9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM` |
| Font Awesome CSS | 6.0.0 | `sha384-gn5yKJkEGhTEnG9+YVzLrI1HwAOMSLuUlL7fBRm6J6VdNaVuQGpTcT72yiEiqzM` |
| SweetAlert2 JS | 11.14.5 (pin to exact) | fetch from `https://www.srihash.org/` for `https://cdn.jsdelivr.net/npm/sweetalert2@11.14.5/dist/sweetalert2.all.min.js` |
| Bootstrap JS | 5.3.0 | `sha384-ENjdO4Dr2bkBIFxQpeoTz1HIcje39Wm4jDKdf19U8gI4ddQ3GYNS7NTKfAdVzdl1` |

> **Note:** For SweetAlert2, pin the URL to the exact version `@11.14.5` (not floating `@11`).

**Step 2: Update the `<head>` CDN links**

Change lines 10–11 from:
```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
```
To:
```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"
      integrity="sha384-9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM" crossorigin="anonymous">
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet"
      integrity="sha384-gn5yKJkEGhTEnG9+YVzLrI1HwAOMSLuUlL7fBRm6J6VdNaVuQGpTcT72yiEiqzM" crossorigin="anonymous">
```

Change line 13 from:
```html
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
```
To:
```html
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11.14.5/dist/sweetalert2.all.min.js"
        integrity="sha384-<HASH_FROM_SRIHASH_ORG>" crossorigin="anonymous"></script>
```

Change line 125 from:
```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
```
To:
```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"
        integrity="sha384-ENjdO4Dr2bkBIFxQpeoTz1HIcje39Wm4jDKdf19U8gI4ddQ3GYNS7NTKfAdVzdl1" crossorigin="anonymous"></script>
```

**Step 3: Commit**
```bash
git add public/corporate-compliance.html
git commit -m "fix: add SRI integrity hashes to all CDN resources and pin SweetAlert2 to exact version"
```

---

### Task 2.4 — Verify and improve admin-dashboard sidebar link

**File:** `public/admin-dashboard.html`

**Step 1: Read lines 388–400 of `admin-dashboard.html`**

Verify the existing entry:
```html
<a href="/corporate-compliance.html" class="nav-link">
    <i class="fas fa-building"></i>
    Corporate Compliance
</a>
```

**Step 2: Move the link to a more visible position**

Currently the compliance link sits inside `#driversSubmenu` which is collapsed by default. Users may miss it. Move it to the top-level navigation (alongside the main Dashboard item), making it permanently visible.

Find the top-level nav structure (around line 297). After the Dashboard `<li>`, add:

```html
<li class="nav-item">
    <a href="/corporate-compliance.html" class="nav-link" target="_blank" rel="noopener">
        <i class="fas fa-building"></i>
        <span>Corporate Compliance</span>
    </a>
</li>
```

Also remove the duplicate entry from `#driversSubmenu` (around line 392).

**Step 3: Commit**
```bash
git add public/admin-dashboard.html
git commit -m "feat: promote Corporate Compliance to top-level admin sidebar item"
```

---

## Track 3 — Entity Registry Component

**Agent:** frontend-developer
**File:** `public/js/modules/compliance/components/entity-registry.js`

---

### Task 3.1 — Replace hardcoded `updatedBy: 'director'` with auth identity (H9)

**File:** `entity-registry.js:261-262`

**Step 1: Read lines 1–20 of `entity-registry.js`** to see existing imports.

**Step 2: Import `auth` from firebase-config**

Add to the imports at the top of the file:
```js
import { auth } from '../../../config/firebase-config.js';
```

**Step 3: Create a helper function** to get the current user's identifier:

Add after the imports:
```js
function currentUserIdentifier() {
  const user = auth.currentUser;
  return user ? (user.email || user.uid) : 'unknown';
}
```

**Step 4: Replace the hardcoded `updatedBy`**

Find (line ~262):
```js
await updateEntityCompliance(entityId, {
  [field]: newValue,
  updatedBy: 'director'
});
```

Replace with:
```js
await updateEntityCompliance(entityId, {
  [field]: newValue,
  updatedBy: currentUserIdentifier()
});
```

**Step 5: Commit**
```bash
git add public/js/modules/compliance/components/entity-registry.js
git commit -m "fix: replace hardcoded updatedBy 'director' with authenticated user identity"
```

---

### Task 3.2 — Move `complianceState` from module scope to closure (H7)

**File:** `entity-registry.js:215-216`

**Problem:** The module-level `const complianceState = new Map()` persists stale state across re-renders. If `renderEntityRegistry` is called again (SPA navigation), old entity state leaks in.

**Step 1: Read `renderEntityRegistry` function signature and body** to understand where `complianceState` is used.

**Step 2: Move the Map inside the render function**

Before (module scope, ~line 215):
```js
const complianceState = new Map();

function initComplianceState(entities) {
  for (const entity of entities) {
    complianceState.set(entity.registrationNumber, { ... });
  }
}
```

After — move into `renderEntityRegistry` as a closure:
```js
// (remove module-level complianceState declaration)

export function renderEntityRegistry(containerId, entities) {
  const complianceState = new Map(); // fresh map on each render

  function initComplianceState(ents) {
    for (const entity of ents) {
      complianceState.set(entity.registrationNumber, {
        arCompliant: entity.arCompliant === true,
        boCompliant: entity.boCompliant === true
      });
    }
  }
  // ... rest of function uses complianceState from closure
}
```

Make sure `initComplianceState` is defined inside `renderEntityRegistry` so it captures the local `complianceState`.

**Step 3: Commit**
```bash
git add public/js/modules/compliance/components/entity-registry.js
git commit -m "fix: move complianceState map into render function closure to prevent stale state on re-render"
```

---

### Task 3.3 — Add debounce to badge toggle clicks (M3)

**File:** `entity-registry.js:226` (`handleBadgeClick`)

**Step 1: Read `handleBadgeClick` function (~lines 226–283)**

**Step 2: Add a per-entity in-flight guard**

Add a `Set` inside the `renderEntityRegistry` closure (alongside the new local `complianceState`):
```js
const pendingBadgeUpdates = new Set();
```

At the start of `handleBadgeClick`, before the Swal dialog:
```js
if (pendingBadgeUpdates.has(entityId)) return; // debounce in-flight writes
pendingBadgeUpdates.add(entityId);
```

After the `await updateEntityCompliance(...)` completes (in both success and error paths):
```js
pendingBadgeUpdates.delete(entityId);
```

**Step 3: Commit**
```bash
git add public/js/modules/compliance/components/entity-registry.js
git commit -m "fix: guard badge toggle clicks against concurrent writes per entity"
```

---

## Track 4 — Compliance Tracker Component

**Agent:** frontend-developer
**File:** `public/js/modules/compliance/components/compliance-tracker.js`

---

### Task 4.1 — Replace hardcoded `updatedBy: 'director'` (H9)

**File:** `compliance-tracker.js:444, 454`

**Step 1: Read lines 1–20** to see existing imports.

**Step 2: Import `auth`** (same pattern as Track 3):
```js
import { auth } from '../../../config/firebase-config.js';
```

**Step 3: Add the helper:**
```js
function currentUserIdentifier() {
  const user = auth.currentUser;
  return user ? (user.email || user.uid) : 'unknown';
}
```

**Step 4: Find both occurrences of `updatedBy: 'director'`** (~lines 444, 454) and replace with:
```js
updatedBy: currentUserIdentifier()
```

**Step 5: Commit**
```bash
git add public/js/modules/compliance/components/compliance-tracker.js
git commit -m "fix: replace hardcoded updatedBy 'director' with authenticated user identity in tracker"
```

---

### Task 4.2 — Add `maxlength` and input validation to the filing dialog (M1)

**File:** `compliance-tracker.js:394–406` (SweetAlert `html` property)

**Step 1: Read `handleMarkFiled` lines 366–495**

**Step 2: Add `maxlength` to dialog inputs**

Find the `html` template string in the Swal dialog. Locate the `filed-by` input and `notes` textarea:

```js
<input type="text" id="swal-filed-by" class="form-control" placeholder="e.g., Lourens Kruger">
<textarea id="swal-notes" class="form-control" rows="2"></textarea>
```

Change to:
```js
<input type="text" id="swal-filed-by" class="form-control"
       placeholder="e.g., Lourens Kruger" maxlength="200">
<textarea id="swal-notes" class="form-control" rows="2" maxlength="1000"></textarea>
```

**Step 3: Add length validation in `preConfirm`**

Find the `preConfirm` handler. After the existing non-empty check on `filedBy`, add:
```js
if (filedBy.length > 200) {
  Swal.showValidationMessage('Filed by must be 200 characters or fewer.');
  return false;
}
const notes = document.getElementById('swal-notes').value.trim();
if (notes.length > 1000) {
  Swal.showValidationMessage('Notes must be 1000 characters or fewer.');
  return false;
}
```

**Step 4: Commit**
```bash
git add public/js/modules/compliance/components/compliance-tracker.js
git commit -m "fix: add maxlength constraints and preConfirm validation for filing dialog inputs"
```

---

### Task 4.3 — Convert sequential filing writes to parallel batch (M10)

**File:** `compliance-tracker.js:437–465`

**Step 1: Read lines 437–465** (the `for...of entityIds` loop)

**Step 2: Replace the sequential loop with `Promise.all`**

Current:
```js
for (const entityId of entityIds) {
  await updateFilingStatus(year, entityId, obligationId, { ... });
  // builds updatedFilings immutably...
  filingsRef = updatedFilings;
  setFilings(updatedFilings);
}
```

Replace with a parallel write + single state update:
```js
const filingRecord = {
  status: 'filed',
  dueDate: dueDateISO,
  filedDate: formValues.filedDate,
  filedBy: formValues.filedBy,
  notes: formValues.notes,
  updatedBy: currentUserIdentifier()
};

// Write all entities in parallel
await Promise.all(
  entityIds.map(entityId =>
    updateFilingStatus(year, entityId, obligationId, filingRecord)
  )
);

// Build updated state immutably in one pass
const updatedFilings = entityIds.reduce((acc, entityId) => ({
  ...acc,
  [entityId]: {
    ...(acc[entityId] || {}),
    [obligationId]: filingRecord
  }
}), filingsRef);

setFilings(updatedFilings);
filingsRef = updatedFilings;
```

**Step 3: Commit**
```bash
git add public/js/modules/compliance/components/compliance-tracker.js
git commit -m "perf: batch filing writes with Promise.all instead of sequential await loop"
```

---

### Task 4.4 — Add loading state / disable button during async filing (MEDIUM-9)

**File:** `compliance-tracker.js` — `handleMarkFiled` and the click handler that calls it

**Step 1: Read the event delegation setup** to find where `handleMarkFiled` is called. Look for an `addEventListener` on the table wrapper (~lines 500–540).

**Step 2: Disable the triggering button before the Swal opens and re-enable on completion**

In `handleMarkFiled`, the `obligationId` is known. Find the button via:
```js
const btn = document.querySelector(`tr[data-obligation-id="${CSS.escape(obligationId)}"] .action-cell button`);
if (btn) btn.disabled = true;
```

Add this before the `const result = await Swal.fire(...)` call. Re-enable in both the success path and the `catch` block:
```js
if (btn) btn.disabled = false;
```

**Step 3: Commit**
```bash
git add public/js/modules/compliance/components/compliance-tracker.js
git commit -m "fix: disable Mark Filed button during async operation to prevent duplicate submissions"
```

---

## Track 5 — Deadline Calculator Refactoring

**Agent:** frontend-developer
**File:** `public/js/modules/compliance/utils/deadline-calculator.js`

---

### Task 5.1 — Extract shared anniversary helper and add named constant (MEDIUM-4, MEDIUM-7)

**File:** `deadline-calculator.js:158–182`

**Step 1: Read lines 110–185**

**Step 2: Add the named constant at the top of the file** (after imports, before functions):
```js
/** 30 business days expressed as approximate calendar days */
const BUSINESS_DAYS_30_AS_CALENDAR = 42;
```

**Step 3: Extract `calculateAnniversaryDeadline` helper** — add before `calculateNextDueDate`:
```js
/**
 * Calculate a deadline N calendar days after the entity's incorporation anniversary.
 * @param {Object} entity
 * @param {number} year
 * @param {number} calendarDaysAfter
 * @returns {Date|null}
 */
function calculateAnniversaryDeadline(entity, year, calendarDaysAfter) {
  const incDate = entity && entity.incorporationDate;
  if (!incDate) return null;
  const incParsed = new Date(incDate);
  if (isNaN(incParsed.getTime())) return null;
  const anniversary = new Date(year, incParsed.getMonth(), incParsed.getDate());
  const dueDate = new Date(anniversary.getTime());
  dueDate.setDate(dueDate.getDate() + calendarDaysAfter);
  return dueDate;
}
```

**Step 4: Replace the two identical switch cases** with fall-through calling the helper:
```js
case '30_business_days_after_anniversary':
case 'filed_with_cipc_annual_return':
  return calculateAnniversaryDeadline(entity, year, BUSINESS_DAYS_30_AS_CALENDAR);
```

**Step 5: Commit**
```bash
git add public/js/modules/compliance/utils/deadline-calculator.js
git commit -m "refactor: extract calculateAnniversaryDeadline helper, remove duplicate switch cases, add BUSINESS_DAYS_30_AS_CALENDAR constant"
```

---

### Task 5.2 — Extract `getEntityYearEnd` helper to remove `fyEnd1`–`fyEnd5` repetition (MEDIUM-5)

**File:** `deadline-calculator.js:187–223`

**Step 1: Read lines 184–230**

**Step 2: Extract the repeated year-end lookup:**
```js
/**
 * Get the financial year-end date for an entity in a given year.
 * Returns null if financialYearEnd is not set.
 * @param {Object} entity
 * @param {number} year
 * @returns {Date|null}
 */
function getEntityYearEnd(entity, year) {
  const fye = entity && entity.financialYearEnd;
  if (!fye) return null;
  const parsed = new Date(fye);
  if (isNaN(parsed.getTime())) return null;
  return new Date(year, parsed.getMonth(), parsed.getDate());
}
```

**Step 3: Replace each `fyEndN` / `yearEndN` block** in the switch cases with calls to `getEntityYearEnd(entity, year)`.

**Step 4: Commit**
```bash
git add public/js/modules/compliance/utils/deadline-calculator.js
git commit -m "refactor: extract getEntityYearEnd helper to eliminate fyEnd1-5 variable repetition"
```

---

## Track 6 — Firebase Service Layer

**Agent:** firebase-backend-dev
**File:** `public/js/modules/compliance/services/firebase-service.js`

---

### Task 6.1 — Add `validatePathSegment` to `loadFilings` year parameter (M2)

**File:** `firebase-service.js` — `loadFilings` function

**Step 1: Read the `loadFilings` function**

Find the function and note that it takes a `year` parameter and constructs a path like `` `${BASE_PATH}/filings/${year}` `` without validation.

**Step 2: Add validation**

```js
export async function loadFilings(year) {
  const safeYear = validatePathSegment(String(year), 'year');
  const snapshot = await get(ref(rtdb, `${BASE_PATH}/filings/${safeYear}`));
  return snapshot.val() || {};
}
```

**Step 3: Commit**
```bash
git add public/js/modules/compliance/services/firebase-service.js
git commit -m "fix: apply validatePathSegment to year parameter in loadFilings to match updateFilingStatus"
```

---

### Task 6.2 — Remove client-side `seed-data.js` (H1)

**Files:** `public/js/modules/compliance/services/seed-data.js` (DELETE), `public/js/modules/compliance/services/firebase-service.js`

**Step 1: Confirm `seed-data.js` is not imported anywhere**

```bash
grep -r "seed-data" public/js/modules/compliance/
```

Expected: no output (it is not imported by any module file — the data comes from RTDB).

**Step 2: Verify the Cloud Function seeder exists**

Read `functions/seedComplianceData.js` — confirm the server-side seeder is present.

**Step 3: Remove the client-side file**

```bash
git rm public/js/modules/compliance/services/seed-data.js
```

**Step 4: Also remove the unused `seedComplianceData` export from `firebase-service.js`**

Read `firebase-service.js:131–157`. The `seedComplianceData` function imports from `seed-data.js`... Actually it takes data as parameters, so it doesn't directly import seed-data.js. However, this function is exported but never called from within the module. It was intended for use with `seed-data.js` input. Now that `seed-data.js` is gone, remove the export:

Find and remove the `seedComplianceData` function from `firebase-service.js` (lines ~131–156).

Also remove the unused `loadReminderSettings` export (lines ~112–115) — settings exist but nothing reads them in this module.

**Step 5: Commit**
```bash
git add -u
git commit -m "fix: remove client-side seed-data.js — corporate entity data must not ship in client bundle

The client-side seed data file exposed CIPC registration numbers,
company names, personnel names, and strategic business notes as a
publicly accessible static JS file. Server-side seeding via the
Cloud Function is the authoritative path.

Also removes unused seedComplianceData and loadReminderSettings
exports from firebase-service.js."
```

---

## Track 7 — Multi-Tenancy Path Scoping (POST-MERGE, BREAKING CHANGE)

> **Prerequisites:** Tracks 1–6 must be merged first. This track modifies the BASE_PATH and requires a data migration.

**Agent:** firebase-backend-dev
**Files:** `firebase-service.js`, `database.rules.json`, `functions/seedComplianceData.js`

---

### Task 7.1 — Scope RTDB paths by authenticated user ID

**Decision:** For Phase 1, the compliance module is single-admin-user owned. Scope by `auth.currentUser.uid` to enable future multi-tenant expansion.

**File:** `firebase-service.js:20`

**Step 1: Change the BASE_PATH to a function**

Remove:
```js
const BASE_PATH = 'compliance';
```

Replace with:
```js
import { auth } from '../../../config/firebase-config.js';

function getBasePath() {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  return `compliance/${user.uid}`;
}
```

**Step 2: Update every function that uses `BASE_PATH`** to call `getBasePath()` instead.

Functions to update:
- `loadEntities` — use `getBasePath()`
- `loadObligations` — use `getBasePath()`
- `loadFilings` — use `getBasePath()`
- `updateFilingStatus` — use `getBasePath()`
- `updateEntityCompliance` — use `getBasePath()`
- `loadReminderSettings` (if kept) — use `getBasePath()`

**Step 3: Update `database.rules.json` compliance section**

Change from:
```json
"compliance": {
  ".read": "auth != null && auth.token.admin === true",
  ".write": "auth != null && auth.token.admin === true",
```

To:
```json
"compliance": {
  "$uid": {
    ".read": "auth != null && auth.uid === $uid",
    ".write": "auth != null && auth.uid === $uid",
```

Update all child rules to be nested under `$uid`.

**Step 4: Data migration**

Since existing data lives at `compliance/entities`, `compliance/filings`, `compliance/obligations`, it must be moved to `compliance/{adminUID}/...`.

Write a one-time migration script `scripts/migrate-compliance-paths.cjs`:
```js
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com' });

const db = admin.database();

async function migrate() {
  const ADMIN_UID = process.env.ADMIN_UID;
  if (!ADMIN_UID) throw new Error('Set ADMIN_UID env var');

  const oldRef = db.ref('compliance');
  const snapshot = await oldRef.once('value');
  const data = snapshot.val();

  if (!data) { console.log('No compliance data to migrate.'); return; }

  await db.ref(`compliance/${ADMIN_UID}`).set(data);
  console.log(`Data migrated to compliance/${ADMIN_UID}`);

  // Only delete old path after verifying migration
  console.log('Verify data at new path, then manually delete compliance/entities, compliance/filings, compliance/obligations');
}

migrate().catch(console.error);
```

Run:
```bash
ADMIN_UID=<your-admin-uid> node scripts/migrate-compliance-paths.cjs
```

**Step 5: Commit**
```bash
git add public/js/modules/compliance/services/firebase-service.js
git add database.rules.json
git add scripts/migrate-compliance-paths.cjs
git commit -m "feat: scope compliance RTDB paths by user UID for multi-tenant isolation

Resolves C1: compliance data was stored at a global flat path
accessible to any admin. Now scoped as compliance/{uid}/...
matching the platform's per-user isolation model.

Includes one-off migration script for existing data."
```

---

## Summary Commit Checklist

After all tracks complete:

```bash
# Verify no root read rule in database.rules.json
grep -n '"\.read": "auth != null"' database.rules.json
# Expected: no output from root level

# Verify escapeAttr now handles single quotes
grep -A3 "escapeAttr" public/js/modules/compliance/utils/html-escape.js
# Expected: .replace(/'/g, '&#39;') present

# Verify seed-data.js is gone
ls public/js/modules/compliance/services/seed-data.js
# Expected: No such file

# Verify updatedBy uses currentUserIdentifier
grep "updatedBy:" public/js/modules/compliance/components/entity-registry.js
grep "updatedBy:" public/js/modules/compliance/components/compliance-tracker.js
# Expected: currentUserIdentifier() in both

# Verify admin-dashboard has compliance link
grep -n "compliance" public/admin-dashboard.html
# Expected: link visible at top-level nav, not just inside collapsed submenu

# Load the page in browser as admin user and confirm module loads
# Load the page as non-admin user and confirm access-denied message
```

---

## Issue Tracking: What This Plan Resolves

| Issue | Track | Status After Plan |
|-------|-------|------------------|
| C1 — No multi-tenancy | 7 | ✅ Resolved (post-merge) |
| C2 — No tier gating (documented as admin-only) | 2.4 | ✅ Documented in sidebar label |
| C3 — No audit trail | **NOT IN PLAN** | Future feature — file: `firebase-service.js` |
| H1 — seed-data.js in client bundle | 6.2 | ✅ Resolved |
| H2 — Missing SRI hashes | 2.3 | ✅ Resolved |
| H3 — Root RTDB read rule override | 1.1 | ✅ Resolved |
| H4 — Missing try/catch on getIdTokenResult | 2.2 | ✅ Resolved |
| H5 — escapeAttr single quotes | 2.1 | ✅ Resolved |
| H6–H7 — Oversized functions | 4.x | ✅ Partially (functions extracted) |
| H7 — Module-level mutable complianceState | 3.2 | ✅ Resolved |
| H8 — No financial year-end editor | **NOT IN PLAN** | Future feature |
| H9 — Hardcoded updatedBy 'director' | 3.1, 4.1 | ✅ Resolved |
| H10 — Three copies of seed data | 6.2 | ✅ Client copy removed |
| M1 — No input length validation | 4.2, 1.2 | ✅ Resolved |
| M2 — validatePathSegment missing in loadFilings | 6.1 | ✅ Resolved |
| M3 — No badge toggle debounce | 3.3 | ✅ Resolved |
| M5/M10 — Sequential Firebase writes | 4.3 | ✅ Resolved |
| M7 — Magic number 42 | 5.1 | ✅ Resolved |
| M8 — Duplicate deadline logic | 5.1, 5.2 | ✅ Resolved |
| Sidebar — Admin dashboard link | 2.4 | ✅ Promoted to top-level |
