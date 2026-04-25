# WhatsApp Management — Modal Embed Design

**Date:** 2026-02-23
**Branch:** feature/whatsapp-template-management

---

## Goal

Embed the WhatsApp management tool (`tools/admin/whatsapp-management.html`) inside the admin dashboard using a Bootstrap modal + iframe, so users never leave the admin dashboard to manage WhatsApp numbers or templates.

---

## Approach: iframe in Bootstrap modal

### Why

Zero refactoring of `whatsapp-management.js`. Same-origin iframe shares Firebase Auth (localStorage/IndexedDB), so authentication works without any changes. The standalone page continues to work if accessed directly. Hash routing (`#templates`) passes through to the iframe automatically.

---

## Changes

### 1. `public/admin-dashboard.html`

**Add modal** (before `</body>`):

```html
<div class="modal fade" id="whatsappManagementModal" tabindex="-1"
     aria-labelledby="whatsappManagementModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-xl" style="max-width: 92vw;">
    <div class="modal-content" style="height: 88vh;">
      <div class="modal-header py-2">
        <h5 class="modal-title" id="whatsappManagementModalLabel">
          <i class="fab fa-whatsapp text-success me-2"></i>WhatsApp Management
        </h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body p-0" style="height: calc(88vh - 49px); overflow: hidden;">
        <iframe id="waManagementFrame"
                src=""
                style="width: 100%; height: 100%; border: none;"
                title="WhatsApp Management">
        </iframe>
      </div>
    </div>
  </div>
</div>
```

**Add JS helper** (inline `<script>` before `</body>`, after Bootstrap JS):

```js
function openWAModal(hash) {
  document.getElementById('waManagementFrame').src =
    'tools/admin/whatsapp-management.html' + (hash || '');
  bootstrap.Modal.getOrCreate(
    document.getElementById('whatsappManagementModal')
  ).show();
}
document.getElementById('whatsappManagementModal')
  .addEventListener('hidden.bs.modal', function () {
    document.getElementById('waManagementFrame').src = '';
  });
```

**Replace Quick Action buttons:**

| Before | After |
|--------|-------|
| `<a href="tools/admin/whatsapp-management.html" target="_blank">Full Management</a>` | `<button onclick="openWAModal('')">Full Management</button>` |
| `<a href="tools/admin/whatsapp-management.html#templates" target="_blank">Manage Templates</a>` | `<button onclick="openWAModal('#templates')">Manage Templates</button>` |

Keep existing btn classes (`btn-outline-success w-100`, `btn-outline-primary w-100`) and icons.

---

### 2. `public/tools/admin/whatsapp-management.html`

**Detect iframe context** and hide sidebar. Add before `</head>`:

```html
<script>
  if (window.self !== window.top) {
    document.documentElement.classList.add('in-modal');
  }
</script>
<style>
  html.in-modal .sidebar { display: none !important; }
  html.in-modal .col-md-9,
  html.in-modal .col-lg-10 { flex: 0 0 100%; max-width: 100%; width: 100%; }
</style>
```

This runs synchronously before DOM paint — no flash of sidebar.

---

### 3. `public/tools/admin/whatsapp-management.js`

No changes required. `DOMContentLoaded` fires inside the iframe context normally. Firebase Auth is same-origin so auth state is shared.

---

## Files changed

| File | Change |
|------|--------|
| `public/admin-dashboard.html` | Add modal HTML, openWAModal() JS, update 2 buttons |
| `public/tools/admin/whatsapp-management.html` | Add in-modal detection + CSS (sidebar hide + full-width layout) |

---

## Definition of Done

- [ ] Clicking "Full Management" in admin dashboard opens modal with WA management tool
- [ ] Clicking "Manage Templates" opens modal with Templates tab pre-selected
- [ ] Sidebar is hidden when tool is viewed inside the modal
- [ ] Content takes full modal width when sidebar hidden
- [ ] Closing modal clears the iframe src (no background Firebase listeners)
- [ ] Direct navigation to `tools/admin/whatsapp-management.html` still works standalone
- [ ] No new test files introduced
