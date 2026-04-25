# WhatsApp Template Management — Implementation Design

**Date:** 2026-02-23
**Branch:** feature/whatsapp-template-management
**Status:** In progress — implementation sprint

---

## Context

The WhatsApp template management feature is partially implemented. The foundation exists:
- `functions/utils/whatsappTemplates.js` — template definitions, param builders, fallbacks
- `functions/whatsappManagement.js` — `getWhatsAppTemplateConfig`, `updateWhatsAppTemplateConfig`, `sendWhatsAppTestMessage`
- `public/tools/admin/whatsapp-management.html` — 4-tab layout (Numbers, Mappings, Templates, Analytics)
- `public/tools/admin/whatsapp-management.js` — template tab loads ContentSid per template + test-send

## Gaps to Fill

### 1. Navigation link missing
The admin dashboard has no visible link to the WhatsApp Template Manager. The Templates tab is buried inside `tools/admin/whatsapp-management.html`.

**Fix:** Add a shortcut card/link in `public/admin-dashboard.html` within the WhatsApp Management content section that opens `tools/admin/whatsapp-management.html#templates`.

### 2. Template Preview
Users cannot see what a rendered template looks like before sending.

**Fix:** Add a "Preview" button per template card in `whatsapp-management.js`. Clicking it opens a SweetAlert2 modal showing the template body with sample data substituted in (e.g., `{{1}}` → `"John Doe"`).

### 3. Full Template CRUD
Currently, only ContentSid editing is supported. Cannot add new template types or delete unused ones.

**Fix:**
- Backend: Add `addWhatsAppTemplateConfig` and `deleteWhatsAppTemplateConfig` Cloud Functions in `functions/whatsappManagement.js`
- Frontend: Add "Add Template" button (form for key/name/contentSid/enabled) and "Delete" button per card in the Templates tab

### 4. Integration with Booking / Queue / Rewards
The template definitions exist but are not used in actual message-sending paths.

**Integration points:**
- `functions/queueWhatsAppIntegration.js` → use `TEMPLATE_TYPES.QUEUE_MANUAL_ADDITION` when template enabled + ContentSid set
- Booking confirmation handler → use `TEMPLATE_TYPES.BOOKING_CONFIRMATION`, `BOOKING_STATUS_UPDATE`, `BOOKING_REMINDER`
- Rewards/voucher notification → use `TEMPLATE_TYPES.REWARD_NOTIFICATION`, `POINTS_UPDATE`

**Pattern:** Check `twilio-templates/{templateType}/enabled && contentSid` from RTDB; if yes, use `sendWhatsAppMessage` with `contentSid` and Twilio Content Variables; else fall back to `buildFallbackMessage`.

---

## Architecture

### RTDB Schema
```
twilio-templates/{templateKey}: {
  contentSid: "HXabc...",   // Twilio Content SID
  enabled: true,
  name: "Booking Confirmation",
  updatedAt: timestamp,
  updatedBy: uid
}
```

### Cloud Functions
| Function | Purpose |
|---|---|
| `getWhatsAppTemplateConfig` | GET all templates config from RTDB |
| `updateWhatsAppTemplateConfig` | PUT single template ContentSid + enabled |
| `addWhatsAppTemplateConfig` | POST new template entry (new) |
| `deleteWhatsAppTemplateConfig` | DELETE template entry (new) |
| `sendWhatsAppTestMessage` | Send test message using template |

### Frontend Components
- Template card: ContentSid input + enabled toggle + Preview button + Test-send button + Save button + Delete button (admin only)
- Preview modal: Renders template body with sample variable values
- Add Template modal: templateKey, displayName, contentSid, enabled

---

## Team Assignment

| Agent | Files | Scope |
|---|---|---|
| FRONT | `public/admin-dashboard.html`, `public/tools/admin/whatsapp-management.html`, `public/tools/admin/whatsapp-management.js` | Nav link, preview modal, add/delete CRUD UI |
| BACK | `functions/whatsappManagement.js`, `functions/queueWhatsAppIntegration.js`, booking/rewards handlers | New Cloud Functions, template integration |
| QA | All test artifact files in repo root + `public/test-*.html` | Cleanup, verification |

---

## Security Constraints
- Add/delete template config: admin-only (check `admin-claims/{uid}`)
- Update ContentSid: authenticated user who owns the account
- XSS: all template key/name/contentSid values must go through `escapeHtml()`
- ContentSid validation: must match `/^HX[a-f0-9]{32}$/` before save

## Definition of Done
- [ ] Nav link visible in admin dashboard WhatsApp section
- [ ] Template preview modal shows rendered body with sample data
- [ ] Add/delete template config works (admin only)
- [ ] Queue manual addition uses template when enabled
- [ ] Booking confirmation/update/reminder uses templates when enabled
- [ ] Reward notification uses template when enabled
- [ ] No test HTML/JS/CJS/screenshot files in repo root or `public/`
- [ ] All modified files pass lint hooks
