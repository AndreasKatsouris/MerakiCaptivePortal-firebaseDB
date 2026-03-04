# FRONT Agent Implementation Plan
## Task #1: Nav link + Template Preview Modal + CRUD UI

**Date:** 2026-02-23
**Branch:** feature/whatsapp-template-management

---

## Analysis Summary

### Existing State
- `whatsapp-management.js` has `escapeHtml()`, `_templateConfig`, `loadTemplateTab()`, `renderTemplateCards()`, `saveTemplateConfig()`, `testTemplateSend()` already in place.
- `renderTemplateCards()` currently renders: ContentSid input, enabled toggle, Test button, Save button — no Preview or Delete.
- `init()` loads data then calls `setupEventListeners()` — no hash check yet.
- The admin-dashboard.html Quick Actions row has 4 cols: Add Number, Assign Location, View Analytics, Full Management. A 5th card (Manage Templates) needs to be added.
- `functions/utils/whatsappTemplates.js` has the `TWILIO_TEMPLATES` map with full `body` strings and `variables` arrays — available for rendering preview with sample data.
- `currentUserIsAdmin` flag is set after `checkAdminStatus()` runs in `loadInitialData()`, making it safe to gate delete UI.
- ENDPOINTS object already has `getTemplateConfig`, `updateTemplateConfig`, `testTemplateSend`. Two new entries needed: `addTemplateConfig` and `deleteTemplateConfig`.

### Constraints Applied
- `escapeHtml()` on ALL user-derived content in `innerHTML`
- ContentSid validation: `/^HX[a-f0-9]{32}$/`
- SweetAlert2 for all modals/confirms
- Bootstrap 5.3.0 for layout
- Immutable `_templateConfig` — use spread/reassign, never direct mutation

---

## Implementation Steps

### File 1: `public/admin-dashboard.html`

**Change:** Add "Manage Templates" button as a 5th column in the Quick Actions row (lines 2385-2408).

The current Quick Actions row has 4 `col-md-3` columns. Change each to `col-md-2` and add a 5th `col-md-2` for Manage Templates, OR add a new row below. Given Bootstrap 5 allows 6 col-md-2 per row, changing all 4 to col-md-3 and adding 1 more `col-md-3` (total = 5×col-md-3, wraps cleanly on smaller screens) is cleanest. Actually simplest: keep the 4 cols as-is and add the Manage Templates button as a new 5th col alongside — change each from `col-md-3` to responsive sizing or add a second row.

**Chosen approach:** Add a second row of quick-action buttons below the existing 4, containing only the Manage Templates button in `col-md-3`. This avoids touching existing button layout.

```html
<!-- After existing Quick Actions row closes -->
<div class="row mt-2">
    <div class="col-md-3">
        <a href="tools/admin/whatsapp-management.html#templates"
           class="btn btn-outline-primary w-100">
            <i class="fas fa-file-alt me-2"></i>Manage Templates
        </a>
    </div>
</div>
```

**Location:** Inside `.card-body` of Quick Actions card, after the existing `<div class="row">...</div>`.

---

### File 2: `public/tools/admin/whatsapp-management.js`

#### Change 1: Add new endpoints to ENDPOINTS object (line ~58-60)

```js
deleteTemplateConfig: `${API_BASE_URL}/deleteWhatsAppTemplateConfig`,
addTemplateConfig:    `${API_BASE_URL}/addWhatsAppTemplateConfig`
```

#### Change 2: Hash check in `init()` after `loadInitialData()` (line ~86)

After `setupEventListeners()` call:
```js
// Check URL hash to auto-switch tab
const hash = window.location.hash;
if (hash === '#templates') switchTab('templates');
```

#### Change 3: Add `TEMPLATE_BODIES` constant near top of Templates Tab section

A plain JS object mapping template keys to their body strings (copied from `whatsappTemplates.js`). This is frontend-only — the backend file uses `module.exports` which is Node.js only.

Sample data object for preview substitution:
```js
const TEMPLATE_SAMPLE_DATA = {
    '1': 'John Doe', '2': 'BK-00123', '3': '25/02/2026',
    '4': '19:00', '5': 'Sparks Grill', '6': 'Main Section',
    '7': '4', '8': 'None', '9': 'Confirmed', '10': 'None'
};
```

The `TEMPLATE_BODIES` map stores the body string per key from `whatsappTemplates.js`.

#### Change 4: Add `previewTemplate(templateKey)` function

```js
function previewTemplate(templateKey) {
    const bodyMap = { ...TEMPLATE_BODIES };
    const rawBody = bodyMap[templateKey];
    if (!rawBody) {
        Swal.fire({ icon: 'info', title: 'No Preview', text: 'No template body definition found for this key.' });
        return;
    }
    // Substitute {{N}} placeholders with sample data
    const rendered = rawBody.replace(/\{\{(\d+)\}\}/g, (_, n) => TEMPLATE_SAMPLE_DATA[n] || `{{${n}}}`);
    // Render newlines as <br>, escape HTML first on the rendered string
    const htmlBody = escapeHtml(rendered).replace(/\n/g, '<br>');
    const cfg = _templateConfig[templateKey] || {};
    Swal.fire({
        title: escapeHtml(cfg.label || templateKey),
        html: `
            <div class="text-start p-2" style="background:#f8f9fa;border-radius:8px;font-family:monospace;font-size:0.9rem;">
                ${htmlBody}
            </div>
            <div class="mt-2 text-muted small text-start">
                <i class="fas fa-info-circle"></i> Variables substituted with sample data.
            </div>`,
        width: 600,
        confirmButtonText: 'Close'
    });
}
window.previewTemplate = previewTemplate;
```

#### Change 5: Update `renderTemplateCards()` to add Preview and Delete buttons

In the `col-auto` button group, after the existing Save button:
```html
<button class="btn btn-sm btn-outline-info" onclick="previewTemplate('${key}')">
    <i class="fas fa-eye"></i> Preview
</button>
${currentUserIsAdmin ? `
<button class="btn btn-sm btn-outline-danger" onclick="deleteTemplateConfig('${key}')">
    <i class="fas fa-trash"></i> Delete
</button>` : ''}
```

#### Change 6: Add `deleteTemplateConfig(templateKey)` function

```js
async function deleteTemplateConfig(templateKey) {
    const cfg = _templateConfig[templateKey] || {};
    const result = await Swal.fire({
        title: 'Delete Template?',
        html: `Delete <strong>${escapeHtml(cfg.label || templateKey)}</strong>? This cannot be undone.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        confirmButtonText: 'Delete'
    });
    if (!result.isConfirmed) return;

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(ENDPOINTS.deleteTemplateConfig, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateKey })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        // Immutable: rebuild config without deleted key
        const { [templateKey]: _removed, ...remaining } = _templateConfig;
        _templateConfig = remaining;
        renderTemplateCards();
        Swal.fire({ icon: 'success', title: 'Deleted', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Delete failed', text: escapeHtml(err.message) });
    }
}
window.deleteTemplateConfig = deleteTemplateConfig;
```

#### Change 7: Add "Add Template" button + `showAddTemplateModal()` + `addTemplateConfig()`

At the top of `renderTemplateCards()`, prepend an "Add Template" button (admin-only) in the container before the cards. This is rendered via a header section:

```js
// At the top of renderTemplateCards(), before the entries loop:
const adminHeader = currentUserIsAdmin ? `
    <div class="d-flex justify-content-end mb-3">
        <button class="btn btn-success btn-sm" onclick="showAddTemplateModal()">
            <i class="fas fa-plus me-1"></i>Add Template
        </button>
    </div>` : '';
container.innerHTML = adminHeader + entries.map(...).join('');
```

`showAddTemplateModal()` uses SweetAlert2 `html` with a form:
```js
async function showAddTemplateModal() {
    const { value: formValues } = await Swal.fire({
        title: 'Add Template',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label">Template Key</label>
                    <input id="swal-key" class="form-control" placeholder="e.g. queue_manual_addition">
                    <div class="form-text">Lowercase, underscores only.</div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Display Name</label>
                    <input id="swal-name" class="form-control" placeholder="e.g. Queue Manual Addition">
                </div>
                <div class="mb-3">
                    <label class="form-label">ContentSid</label>
                    <input id="swal-sid" class="form-control font-monospace" placeholder="HX________________________________">
                </div>
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="swal-enabled" checked>
                    <label class="form-check-label" for="swal-enabled">Enabled</label>
                </div>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Add',
        preConfirm: () => {
            const key = document.getElementById('swal-key').value.trim();
            const name = document.getElementById('swal-name').value.trim();
            const sid = document.getElementById('swal-sid').value.trim();
            const enabled = document.getElementById('swal-enabled').checked;
            if (!key || !name) { Swal.showValidationMessage('Key and Display Name are required.'); return false; }
            if (!/^[a-z0-9_]+$/.test(key)) { Swal.showValidationMessage('Key must be lowercase letters, numbers, underscores only.'); return false; }
            if (sid && !/^HX[a-f0-9]{32}$/.test(sid)) { Swal.showValidationMessage('ContentSid must match HX + 32 hex chars.'); return false; }
            return { key, name, sid, enabled };
        }
    });
    if (!formValues) return;
    await addTemplateConfig(formValues);
}
window.showAddTemplateModal = showAddTemplateModal;
```

`addTemplateConfig({ key, name, sid, enabled })`:
```js
async function addTemplateConfig({ key, name, sid, enabled }) {
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(ENDPOINTS.addTemplateConfig, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateKey: key, label: name, contentSid: sid || '', enabled })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        // Immutable: add new key
        _templateConfig = { ..._templateConfig, [key]: { label: name, contentSid: sid || '', enabled } };
        renderTemplateCards();
        Swal.fire({ icon: 'success', title: 'Added', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Add failed', text: escapeHtml(err.message) });
    }
}
```

---

## Files Modified

| File | Changes |
|---|---|
| `public/admin-dashboard.html` | Add "Manage Templates" button row in Quick Actions |
| `public/tools/admin/whatsapp-management.js` | Hash check in init(), new endpoints, previewTemplate(), renderTemplateCards() updates, deleteTemplateConfig(), showAddTemplateModal(), addTemplateConfig() |

## Files NOT Modified
- `public/tools/admin/whatsapp-management.html` — no structural changes needed (Templates tab div already exists at line 288-295)
- `functions/utils/whatsappTemplates.js` — read-only source for template body definitions

---

## Risk Notes
- `_templateConfig` is declared as `let` (line 1006) — reassigning it is valid (not a const).
- `currentUserIsAdmin` is set during `loadInitialData()` which always runs before `renderTemplateCards()` is called, so conditional delete button rendering is safe.
- The `TEMPLATE_BODIES` map duplicates data from the Node.js `whatsappTemplates.js`. This is intentional — we cannot `import` a CommonJS module in a browser ES module. The data is static and won't drift.
