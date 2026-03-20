# Obligation Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to pick from a shared library of pre-configured obligation templates when adding obligations, while admins manage the library via the existing obligations-manager UI.

**Architecture:** A new shared Firebase path `compliance/templates/` holds template objects (same shape as obligations). The `renderObligationsManager` component gains an injectable write-service so it can be reused for templates without code duplication. The user-facing "Add Obligation" flow gains a two-step picker: choose template → pre-filled form.

**Tech Stack:** Firebase RTDB, vanilla JS ES modules, SweetAlert2, Bootstrap 5

---

### Task 1: Add database rules for `compliance/templates`

**Files:**
- Modify: `database.rules.json`

**Context:** The `compliance` node currently has `$uid` children with per-user rules. Templates live outside the UID scope at `compliance/templates/`. Admins write; all authenticated users read.

**Step 1: Add the templates rule block**

In `database.rules.json`, inside `"compliance": {` and before the closing `}`, add after the `"$uid"` block:

```json
"templates": {
  ".read": "auth != null",
  ".write": "auth != null && auth.token.admin === true",
  "$templateId": {
    ".validate": "newData.hasChildren(['name', 'category', 'deadlineRule'])",
    "name": {
      ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 200"
    },
    "category": {
      ".validate": "newData.val().matches(/^(monthly|biannual|annual|once_off)$/)"
    },
    "deadlineRule": {
      ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 60"
    },
    "fixedDeadline": {
      ".validate": "!newData.exists() || (newData.isString() && newData.val().matches(/^[0-9]{2}-[0-9]{2}$/))"
    },
    "authority": {
      ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 100)"
    },
    "defaultOwner": {
      ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 200)"
    }
  }
}
```

**Step 2: Deploy rules**

```bash
firebase deploy --only database
```
Expected: `✔  Deploy complete!`

**Step 3: Commit**

```bash
git add database.rules.json
git commit -m "feat(compliance): add shared templates path to database rules"
```

---

### Task 2: Add template service functions to `firebase-service.js`

**Files:**
- Modify: `public/js/modules/compliance/services/firebase-service.js`

**Context:** The existing service scopes all paths to `compliance/{uid}/`. Templates are at `compliance/templates/` — a fixed path, no UID. Add four new exported functions at the bottom of the file.

**Step 1: Add the four template functions**

Append to the end of `firebase-service.js`:

```js
// ---------------------------------------------------------------------------
// Shared template operations (compliance/templates/)
// ---------------------------------------------------------------------------

const TEMPLATES_PATH = 'compliance/templates';

/**
 * Load all shared obligation templates.
 * Readable by any authenticated user.
 * @returns {Promise<Object>} Map of templateId -> template object
 */
export async function loadTemplates() {
  const snapshot = await get(ref(rtdb, TEMPLATES_PATH));
  return snapshot.val() || {};
}

/**
 * Create a new shared template. Requires admin token claim.
 * @param {string} templateId
 * @param {Object} data
 * @returns {Promise<Object>} The saved template object with id attached
 */
export async function createTemplate(templateId, data) {
  const safeId = validatePathSegment(templateId, 'templateId');
  const record = { ...data, custom: true };
  await set(ref(rtdb, `${TEMPLATES_PATH}/${safeId}`), record);
  return { ...record, id: safeId };
}

/**
 * Update an existing shared template. Requires admin token claim.
 * @param {string} templateId
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export async function updateTemplate(templateId, updates) {
  const safeId = validatePathSegment(templateId, 'templateId');
  await update(ref(rtdb, `${TEMPLATES_PATH}/${safeId}`), updates);
}

/**
 * Delete a shared template. Requires admin token claim.
 * @param {string} templateId
 * @returns {Promise<void>}
 */
export async function deleteTemplate(templateId) {
  const safeId = validatePathSegment(templateId, 'templateId');
  await set(ref(rtdb, `${TEMPLATES_PATH}/${safeId}`), null);
}
```

**Step 2: Verify the file saved correctly**

Check that the four new exports appear in the file and that `TEMPLATES_PATH`, `validatePathSegment`, `rtdb`, `ref`, `get`, `set`, `update` are all already imported/defined in scope (they are — `validatePathSegment` is defined at line 36, the Firebase imports are at the top).

**Step 3: Commit**

```bash
git add public/js/modules/compliance/services/firebase-service.js
git commit -m "feat(compliance): add loadTemplates/createTemplate/updateTemplate/deleteTemplate service functions"
```

---

### Task 3: Make `renderObligationsManager` accept an injectable write service

**Files:**
- Modify: `public/js/modules/compliance/components/obligations-manager.js`

**Context:** The component currently imports and calls `createObligation`, `updateObligation`, `deleteObligation` directly. To reuse it for templates (different data path), inject the write functions as an optional parameter with the existing functions as the default.

**Step 1: Update the import line at the top**

Change:
```js
import { createObligation, updateObligation, deleteObligation } from '../services/firebase-service.js';
```
To:
```js
import {
  createObligation,
  updateObligation,
  deleteObligation
} from '../services/firebase-service.js';

const DEFAULT_WRITE_SERVICE = { create: createObligation, update: updateObligation, delete: deleteObligation };
```

**Step 2: Update the `renderObligationsManager` signature**

Change:
```js
export async function renderObligationsManager(containerId, obligations, activeEntities) {
```
To:
```js
export async function renderObligationsManager(containerId, obligations, activeEntities, writeService = DEFAULT_WRITE_SERVICE) {
```

**Step 3: Update the three call sites inside the function**

In `handleAddObligation`, change:
```js
const record = await createObligation(obligationId, data);
```
To:
```js
const record = await writeService.create(obligationId, data);
```

In `handleEditObligation`, change:
```js
await updateObligation(obligationId, updates);
```
To:
```js
await writeService.update(obligationId, updates);
```

In `handleDeleteObligation`, change:
```js
await deleteObligation(obligationId);
```
To:
```js
await writeService.delete(obligationId);
```

**Step 4: Verify the existing compliance module still works**

The existing call in `index.js` is `renderObligationsManager('panel-obligations-manager', obligations, activeEntities)` — no fourth argument, so it uses `DEFAULT_WRITE_SERVICE`. No change needed there.

**Step 5: Commit**

```bash
git add public/js/modules/compliance/components/obligations-manager.js
git commit -m "refactor(compliance): inject write service into renderObligationsManager for reuse"
```

---

### Task 4: Add template picker step to the user "Add Obligation" flow

**Files:**
- Modify: `public/js/modules/compliance/components/obligations-manager.js`
- Modify: `public/js/modules/compliance/services/firebase-service.js` (already done in Task 2)

**Context:** When a user clicks "Add Obligation", if templates exist they should first see a picker. If no templates exist, the blank form opens directly (current behaviour). The picker is a SweetAlert2 dialog with a radio list grouped by category, plus a "Start from scratch" option.

**Step 1: Import `loadTemplates` at the top of `obligations-manager.js`**

Add to the existing import from `firebase-service.js`:
```js
import {
  createObligation,
  updateObligation,
  deleteObligation,
  loadTemplates
} from '../services/firebase-service.js';
```

**Step 2: Add a `buildTemplatePicker` helper function**

Add after the `buildEntityCheckboxes` function (around line 288):

```js
/**
 * Build the SweetAlert2 HTML for the template picker step.
 * @param {Array<Object>} templates — Array of template objects with id attached, sorted by category
 * @returns {string} HTML
 */
function buildTemplatePicker(templates) {
  const grouped = { monthly: [], biannual: [], annual: [], once_off: [] };
  templates.forEach(t => {
    if (grouped[t.category]) grouped[t.category].push(t);
    else grouped.annual.push(t);
  });

  const LABELS = { monthly: 'Monthly', biannual: 'Bi-Annual', annual: 'Annual', once_off: 'Once-Off' };

  let rows = '';
  Object.entries(grouped).forEach(([cat, items]) => {
    if (items.length === 0) return;
    rows += `<div class="text-muted small fw-semibold mt-2 mb-1">${LABELS[cat] || cat}</div>`;
    items.forEach(t => {
      rows += `
        <div class="form-check border rounded px-3 py-2 mb-1">
          <input class="form-check-input" type="radio" name="template-picker-radio"
                 id="tpl-${escapeAttr(t.id)}" value="${escapeAttr(t.id)}">
          <label class="form-check-label w-100" for="tpl-${escapeAttr(t.id)}">
            <strong>${escapeHtml(t.name)}</strong>
            ${t.authority ? `<span class="text-muted ms-2 small">${escapeHtml(t.authority)}</span>` : ''}
          </label>
        </div>
      `;
    });
  });

  return `
    <div style="max-height: 320px; overflow-y: auto;">
      ${rows}
      <div class="form-check border rounded px-3 py-2 mb-1 mt-2">
        <input class="form-check-input" type="radio" name="template-picker-radio"
               id="tpl-scratch" value="" checked>
        <label class="form-check-label" for="tpl-scratch">
          <strong>Start from scratch</strong>
          <span class="text-muted ms-2 small">Blank form</span>
        </label>
      </div>
    </div>
  `;
}
```

**Step 3: Update `handleAddObligation` to add the picker step**

Replace the existing `handleAddObligation` function body with:

```js
async function handleAddObligation() {
  // Step 1: load templates and show picker (skip if none exist)
  let prefill = null;

  try {
    const templatesMap = await loadTemplates();
    const templateList = Object.entries(templatesMap)
      .map(([id, t]) => ({ ...t, id }))
      .sort((a, b) => {
        const order = { monthly: 0, biannual: 1, annual: 2, once_off: 3 };
        const catA = order[a.category] ?? 99;
        const catB = order[b.category] ?? 99;
        return catA !== catB ? catA - catB : (a.name || '').localeCompare(b.name || '');
      });

    if (templateList.length > 0) {
      const pickerResult = await Swal.fire({
        title: 'Add Obligation',
        html: buildTemplatePicker(templateList),
        showCancelButton: true,
        confirmButtonColor: '#198754',
        confirmButtonText: 'Continue →',
        width: '560px',
        preConfirm: () => {
          const selected = document.querySelector('input[name="template-picker-radio"]:checked');
          return selected ? selected.value : '';
        }
      });

      if (!pickerResult.isConfirmed) return;

      const selectedId = pickerResult.value;
      if (selectedId) {
        prefill = templateList.find(t => t.id === selectedId) || null;
      }
    }
  } catch {
    // If templates fail to load, fall through to blank form
  }

  // Step 2: show add form (pre-filled from template or blank)
  const appliesToAll = prefill ? (prefill.appliesToAll !== false) : true;
  const deadlineRule = prefill?.deadlineRule || '';

  const result = await Swal.fire({
    title: 'Add Obligation',
    html: buildDialogForm(prefill, localActiveEntities, false),
    showCancelButton: true,
    confirmButtonColor: '#198754',
    confirmButtonText: 'Add Obligation',
    width: '600px',
    didOpen: () => wireDialogListeners(false, deadlineRule, appliesToAll),
    preConfirm: () => collectAndValidateFormValues(false)
  });

  if (!result.isConfirmed || !result.value) return;

  const formData = result.value;
  const { obligationId, ...data } = formData;

  try {
    const record = await writeService.create(obligationId, data);
    localObligations = { ...localObligations, [obligationId]: record };
    rerenderTable();
    showSuccessToast('Obligation added');
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Failed to add obligation', text: err.message });
  }
}
```

**Note:** `buildDialogForm` already handles pre-fill via `const obl = obligation || {}` — passing a template object with the same shape as an obligation works without changes.

**Step 4: Commit**

```bash
git add public/js/modules/compliance/components/obligations-manager.js
git commit -m "feat(compliance): two-step add obligation flow with template picker"
```

---

### Task 5: Add Obligation Templates section to `admin-dashboard.html`

**Files:**
- Modify: `public/admin-dashboard.html`

**Context:** Need a sidebar nav item and a content panel. Follow the exact pattern of the Corporate Compliance section at lines 305-309 (nav) and 1880-1883 (content).

**Step 1: Add sidebar nav item**

Find the Corporate Compliance nav item:
```html
<li class="nav-item">
    <a href="#" id="corporateComplianceMenu" class="nav-link dashboard-nav-link" data-section="corporateComplianceContent">
        <i class="fas fa-building"></i>
        <span>Corporate Compliance</span>
    </a>
</li>
```

Add immediately after it:
```html
<li class="nav-item">
    <a href="#" id="obligationTemplatesMenu" class="nav-link dashboard-nav-link" data-section="obligationTemplatesContent">
        <i class="fas fa-layer-group"></i>
        <span>Obligation Templates</span>
    </a>
</li>
```

**Step 2: Add content panel**

Find the Corporate Compliance content section:
```html
<!-- Corporate Compliance Section -->
<div id="corporateComplianceContent" class="content-section dashboard-content d-none">
    <div id="compliance-module-container"></div>
</div>
```

Add immediately after it:
```html
<!-- Obligation Templates Section -->
<div id="obligationTemplatesContent" class="content-section dashboard-content d-none">
    <div id="obligation-templates-container"></div>
</div>
```

**Step 3: Commit**

```bash
git add public/admin-dashboard.html
git commit -m "feat(compliance): add Obligation Templates section to admin dashboard HTML"
```

---

### Task 6: Register the templates section in `admin-dashboard.js`

**Files:**
- Modify: `public/js/admin-dashboard.js`

**Step 1: Import the template service functions**

Find the existing compliance import (around line 207):
```js
import { initializeComplianceModule } from './modules/compliance/index.js';
```

Add a new import line after it:
```js
import { loadTemplates, createTemplate, updateTemplate, deleteTemplate } from './modules/compliance/services/firebase-service.js';
import { renderObligationsManager } from './modules/compliance/components/obligations-manager.js';
```

**Step 2: Add `obligationTemplatesContent` to `sectionInitialized`**

Find the `sectionInitialized` object (around line 279):
```js
this.sectionInitialized = {
    foodCostContent: false,
```

Add:
```js
obligationTemplatesContent: false,
```

**Step 3: Register the section**

Find the `corporateComplianceContent` section registration (around line 595):
```js
this.sections.set('corporateComplianceContent', {
    menuId: 'corporateComplianceMenu',
    contentId: 'corporateComplianceContent',
    init: () => initializeComplianceModule('compliance-module-container')
});
```

Add immediately after it:
```js
this.sections.set('obligationTemplatesContent', {
    menuId: 'obligationTemplatesMenu',
    contentId: 'obligationTemplatesContent',
    init: async () => {
        const templates = await loadTemplates();
        const templateWriteService = {
            create: createTemplate,
            update: updateTemplate,
            delete: deleteTemplate
        };
        await renderObligationsManager(
            'obligation-templates-container',
            templates,
            [],
            templateWriteService
        );
    }
});
```

**Step 4: Add the `switch` case**

Find the `corporateComplianceContent` case (around line 1466):
```js
case 'corporateComplianceContent':
    await initializeComplianceModule('compliance-module-container');
    this.sectionInitialized.corporateComplianceContent = true;
    break;
```

Add immediately after it:
```js
case 'obligationTemplatesContent': {
    const templates = await loadTemplates();
    const templateWriteService = {
        create: createTemplate,
        update: updateTemplate,
        delete: deleteTemplate
    };
    await renderObligationsManager(
        'obligation-templates-container',
        templates,
        [],
        templateWriteService
    );
    this.sectionInitialized.obligationTemplatesContent = true;
    break;
}
```

**Step 5: Commit**

```bash
git add public/js/admin-dashboard.js
git commit -m "feat(compliance): register Obligation Templates section in admin dashboard"
```

---

### Task 7: Smoke test the full flow

**Step 1: Start the Firebase emulator**

```bash
firebase emulators:start --only hosting,database,functions
```

**Step 2: Test the admin side**

1. Sign in as an admin user
2. Click "Obligation Templates" in the sidebar
3. Verify the Obligations Manager table renders (empty initially)
4. Click "Add Obligation" — verify the standard form opens (no template picker since there are no templates yet)
5. Add a template: Name = "VAT201 Monthly Return", Category = Monthly, Authority = SARS, Deadline Rule = "Last business day after period end (VAT)", Applies To = All Entities
6. Verify it appears in the table
7. Edit it — change the default owner to "Finance Manager" — verify it saves
8. Verify the template still shows in the table with the updated owner

**Step 3: Test the user side**

1. Sign in as a non-admin user
2. Navigate to Corporate Compliance (via `corporate-compliance.html`)
3. Scroll to Obligations Manager
4. Click "Add Obligation"
5. Verify the template picker appears first, listing "VAT201 Monthly Return"
6. Select it and click "Continue →"
7. Verify the form opens pre-filled with name, authority, deadline rule
8. Change the Obligation ID to something unique if needed
9. Click "Add Obligation"
10. Verify it appears in the user's obligations table

**Step 4: Test fallback (no templates)**

1. As admin, delete the template created in Step 2
2. As user, click "Add Obligation"
3. Verify the blank form opens directly (no picker shown)

**Step 5: Commit any fixes needed, then final commit**

```bash
git add -A
git commit -m "fix(compliance): obligation templates smoke test fixes"
```

---

## Summary of Changes

| File | Type | What changed |
|------|------|-------------|
| `database.rules.json` | Rules | Added `compliance/templates` read/write rules |
| `public/js/modules/compliance/services/firebase-service.js` | Feature | 4 new template CRUD functions |
| `public/js/modules/compliance/components/obligations-manager.js` | Refactor + Feature | Injectable write service; two-step add flow with template picker |
| `public/admin-dashboard.html` | UI | Sidebar nav item + content panel for templates |
| `public/js/admin-dashboard.js` | Feature | Import + section registration + switch case |
