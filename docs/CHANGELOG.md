# Changelog

## [Unreleased] — 2026-03-20

### Corporate Compliance — Obligation Templates

**Summary:** Admins can now maintain a shared library of pre-configured obligation templates. Users see a template picker when adding obligations instead of starting from a blank form.

---

#### What Changed

**`database.rules.json`**
- Added `compliance/templates/{templateId}` path
- Read: any authenticated user
- Write: admin token claim only
- Validation mirrors existing obligation rules (name, category, deadlineRule, fixedDeadline, authority, defaultOwner)

**`public/js/modules/compliance/services/firebase-service.js`**
- Added `loadTemplates()` — reads from `compliance/templates/`
- Added `createTemplate(id, data)` — writes to `compliance/templates/{id}`
- Added `updateTemplate(id, updates)` — patches a template
- Added `deleteTemplate(id)` — removes a template

**`public/js/modules/compliance/components/obligations-manager.js`**
- `renderObligationsManager` signature changed: 4th argument is now an `options` object `{ writeService, onPublishAsTemplate, panelTitle }` instead of a positional `writeService` parameter
- Added **"Publish as Template"** button (blue cloud-upload icon) to each obligation row — visible only when `onPublishAsTemplate` callback is provided (i.e. admin users only)
- Added `panelTitle` option so the same component renders as "Obligation Templates Library" when used for the templates panel
- Added `buildTemplatePicker()` — renders a grouped radio list of templates in SweetAlert2
- **"Add Obligation" flow is now two steps for users:** first a template picker dialog (skipped if no templates exist or if "Start from scratch" is chosen), then the existing pre-filled form

**`public/js/modules/compliance/index.js`**
- Checks `auth.currentUser.getIdTokenResult()` on load to determine admin status
- Admin users get a 4th panel — **"Obligation Templates Library"** — rendered below the Obligations Manager
- Passes `onPublishAsTemplate` callback to the Obligations Manager so the publish button appears for admins only
- Imports `loadTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate` from firebase-service

**`public/admin-dashboard.html`**
- Removed standalone "Obligation Templates" sidebar nav item (was added in initial plan, then moved inside the compliance module)
- Removed standalone `obligationTemplatesContent` content panel

**`public/js/admin-dashboard.js`**
- Removed `loadTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate` imports
- Removed `renderObligationsManager` import
- Removed `obligationTemplatesContent` section registration and switch case

---

#### User-Facing Behaviour

| User Type | Experience |
|-----------|-----------|
| Regular user | "Add Obligation" shows a template picker first (if templates exist). Picking a template pre-fills the form. Choosing "Start from scratch" opens a blank form. |
| Admin user | Same picker experience. Additionally sees an "Obligation Templates Library" card at the bottom of the compliance module with full add/edit/delete controls and a "Publish as Template" button on each obligation row. |

---

#### Related Documents

- Design: `docs/plans/2026-03-20-obligation-templates-design.md`
- Implementation plan: `docs/plans/2026-03-20-obligation-templates-plan.md`
