# Obligation Templates — Design Document
_2026-03-20_

## Problem

New users start with an empty obligations list and must build it from scratch. The admin account has a set of well-configured obligations; there is no way for users to bootstrap from a shared library.

## Solution

A shared obligation template library stored in Firebase RTDB at `compliance/templates/`. Admins manage the library via a reused UI component. Users select from templates when adding a new obligation, with the existing form pre-filled from the chosen template.

---

## Data

**Path:** `compliance/templates/{templateId}`

**Shape:** identical to a regular obligation object — no structural changes needed.

```
compliance/
  templates/
    vat201_monthly_return/
      name: "VAT201 Monthly Return"
      category: "monthly"
      authority: "SARS"
      deadlineRule: "last_business_day_of_month_following_period"
      appliesToAll: true
      defaultOwner: "Finance Manager"
      ...
```

**Security rules** (additions to `database.rules.json`):
- `compliance/templates`: read — any authenticated user; write — `auth.token.admin === true`

---

## Admin Side

### New sidebar section in `admin-dashboard.html`
- Nav item: "Obligation Templates" (icon: `fa-layer-group`)
- Content panel: `<div id="obligationTemplatesContent">` containing `<div id="obligation-templates-container">`

### New service functions in `firebase-service.js`
```
loadTemplates()           → GET compliance/templates
createTemplate(id, data)  → SET compliance/templates/{id}
updateTemplate(id, data)  → UPDATE compliance/templates/{id}
deleteTemplate(id)        → SET compliance/templates/{id} null (+ cascade filings cleanup not needed — templates have no filings)
```

### Component reuse
Mount `renderObligationsManager('obligation-templates-container', templates, [])` when the section is activated. The component already handles add/edit/delete — it just operates on a different data path via the new service functions.

> **Note:** `renderObligationsManager` currently imports `createObligation / updateObligation / deleteObligation` directly. For templates, we pass the service functions as dependencies (or add a thin adapter) so the same component can write to either path.

---

## User Side

### Step 1 — Template picker dialog

Triggered by the existing "Add Obligation" button. Shows a SweetAlert2 dialog with:
- A scrollable radio list of all templates (grouped by category), showing name + authority
- A "Start from scratch" option at the bottom (always present)
- Confirm button: "Continue →"

If no templates exist, skip step 1 and open the blank form directly.

### Step 2 — Pre-filled obligation form

The existing `buildDialogForm` / `handleAddObligation` flow opens with fields pre-filled from the chosen template. The user can edit any field before saving.

Saving copies the template data into `compliance/{uid}/obligations/{newId}` — the template itself is never modified.

---

## Files Changed

| File | Change |
|------|--------|
| `database.rules.json` | Add read/write rules for `compliance/templates` |
| `functions/index.js` (if seeding) | Optional: seed default templates on first deploy |
| `public/js/modules/compliance/services/firebase-service.js` | Add `loadTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate` |
| `public/js/modules/compliance/components/obligations-manager.js` | Accept injectable write-service; add template picker step to `handleAddObligation` |
| `public/admin-dashboard.html` | Add sidebar nav item + content panel for templates |
| `public/js/admin-dashboard.js` | Register section, lazy-init with `renderObligationsManager` |

---

## Out of Scope

- Versioning or changelogs for templates
- Per-user customisation of a template without creating a full copy
- Template categories / tagging beyond the existing `category` field
