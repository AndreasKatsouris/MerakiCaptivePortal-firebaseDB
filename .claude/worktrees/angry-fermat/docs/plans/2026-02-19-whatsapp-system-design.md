# WhatsApp System Review & Template Management Design

**Date:** 2026-02-19
**Status:** Approved
**Approach:** B — Template Config in Firebase + Admin UI Overhaul

---

## Problem Statement

The WhatsApp messaging system works at the basic level (messages send via Twilio) but template-based messaging is silently broken for most use cases:

- Only 2 of 7 templates have real Twilio ContentSids configured (`BOOKING_CONFIRMATION`, `ADMIN_NEW_BOOKING`)
- All other templates silently fall back to plain formatted text with no log evidence
- ContentSids live in `functions/.env`, requiring a file edit + redeploy to change any template
- `functions/utils/templateManager.js` is dead code — it calls Meta's Graph API directly, which is incompatible with the Twilio-based architecture
- The admin UI (`whatsapp-management.html`) has no template visibility or management capability
- The UI has structural issues: no tab navigation, a broken tier display bug, an undefined `editWhatsAppNumber` function, a hardcoded analytics placeholder, and Bootstrap version mismatch

---

## Architecture

### RTDB Schema Change

Template configuration moves from `functions/.env` to a new RTDB node:

```
whatsapp-template-config/
  booking_confirmation/
    contentSid: "HX9aa623ab6531bbfc7ff23cb32aaf490c"
    enabled: true
    label: "Booking Confirmation"
    variableCount: 9
  booking_status_update/
    contentSid: ""
    enabled: false
    label: "Booking Status Update"
    variableCount: 10
  booking_reminder/
    contentSid: ""
    enabled: false
    label: "Booking Reminder"
    variableCount: 5
  receipt_confirmation/
    contentSid: ""
    enabled: false
    label: "Receipt Confirmation"
    variableCount: 3
  welcome_message/
    contentSid: ""
    enabled: false
    label: "Welcome Message"
    variableCount: 1
  queue_manual_addition/
    contentSid: ""
    enabled: false
    label: "Queue Manual Addition"
    variableCount: 6
  admin_new_booking_notification/
    contentSid: "HXccc00689a25d811ddd062a28d10102fe"
    enabled: true
    label: "Admin New Booking Notification"
    variableCount: 10
```

This replaces `TWILIO_CONTENT_SID_*` env vars and the `USE_TWILIO_TEMPLATES` flag entirely.

### What Gets Removed

- `functions/utils/templateManager.js` — dead Meta Graph API code, never wired to Twilio path
- `TWILIO_CONTENT_SID_*` entries from `functions/.env`
- `USE_TWILIO_TEMPLATES` env var

### What Stays the Same

- `whatsappClient.js` send logic (modified to read RTDB instead of env)
- All template body definitions in `whatsappTemplates.js` (used as fallback text)
- Twilio `client.messages.create()` call

---

## Components

### Backend

1. **`functions/utils/whatsappClient.js`** — Modify `sendWhatsAppTemplate()` to read ContentSid from `whatsapp-template-config/{templateType}` in RTDB. Cache config in memory, refresh every 5 minutes to avoid per-message DB reads.

2. **New: `getWhatsAppTemplateConfig`** (HTTP, admin-only) — Returns all template config rows for the admin UI.

3. **New: `updateWhatsAppTemplateConfig`** (HTTP, admin-only) — Saves ContentSid + enabled flag for a given template key. Validates SID starts with `HX` and is 34 chars before writing.

4. **New: `sendWhatsAppTestMessage`** (HTTP, admin-only) — Fires a real template send to a test phone number with hardcoded sample variable values. Returns full Twilio response (SID on success, full error body on failure — no generic 500).

5. **`functions/utils/templateManager.js`** — Deleted.

6. **`removeWhatsAppNumberFunction`** — Security change: remove the "user owns the number" bypass. Deletion requires `isAdmin === true` only.

### Frontend

7. **`whatsapp-management.html`** — Restructured with Bootstrap 5.3.0 and 4-tab layout: Numbers | Mappings | Templates | Analytics.

8. **Templates tab** — One card per template showing:
   - Label and purpose
   - ContentSid input (editable)
   - Enabled toggle
   - Status badge: `Configured` / `Fallback` / `Disabled`
   - Test Send button (prompts for phone number, shows full Twilio result)
   - Save button (validates HX prefix client-side before calling function)

9. **Numbers tab** — Existing cards. "Migrate Existing" moved from toolbar to collapsible "Advanced" section. Delete action hidden for non-admin users (uses `admin-claims/{uid}` RTDB check, same pattern as backend).

10. **Tier info bar** — Fix `updateTierInformation()` bug (currently passes `usage.tierLimits` which doesn't exist on the usage object).

11. **Fix `editWhatsAppNumber()`** — Currently called in dropdown but undefined. Add inline edit of display name.

12. **Analytics tab** — Remove hardcoded `'< 2'` response time placeholder. Show only metrics that are actually wired up.

13. **Sidebar** — Align with `admin-dashboard.html` sidebar structure.

---

## Data Flow

### Template Send (New)

```
sendWhatsAppTemplate(to, templateType, contentVariables) called
    │
    ▼
Read whatsapp-template-config/{templateType} from RTDB cache
    │
    ├─ enabled: false  → log "FALLBACK: {templateType} disabled" → send plain text
    ├─ contentSid empty → log "FALLBACK: {templateType} not configured" → send plain text
    │
    ▼
client.messages.create({ contentSid, contentVariables, from, to })
    │
    ├─ SUCCESS → log messageSid → return
    └─ ERROR   → log full Twilio error (code + message + templateType + destination)
                → log "FALLBACK USED: {templateType}"
                → send plain text formatted message
```

### Admin Saving a ContentSid

1. Frontend validates `HX` prefix + 32 hex chars
2. Calls `updateWhatsAppTemplateConfig` with auth token
3. Function validates server-side, writes to RTDB
4. No deploy required — takes effect within 5-minute cache window

### Test Send

1. Admin enters test phone number in modal
2. `sendWhatsAppTestMessage` calls Twilio with hardcoded sample variable values
3. Returns message SID (shown in success modal) or full Twilio error body (shown in error modal)

---

## Security

- **Delete WhatsApp number:** Admin-only (`isAdmin === true`). Owner of the number can no longer self-delete.
- **Get/update template config:** Admin-only functions.
- **Test send:** Admin-only function.
- **Frontend delete button:** Hidden at render time for non-admin users using `admin-claims/{uid}` RTDB check.
- **ContentSid validation:** `HX` prefix + 34 char total length enforced on both frontend and backend.

---

## Error Handling

| Scenario | Before | After |
|---|---|---|
| ContentSid is placeholder | Silent fallback, no log | Skip template, log `FALLBACK: template not configured` |
| Twilio rejects ContentSid | Silent fallback | Log full Twilio error code + message, log fallback used |
| Template disabled in RTDB | N/A | Skip immediately, no Twilio call, log `FALLBACK: disabled` |
| Template works | Works (2 of 7 SIDs only) | Works, logs message SID |
| Non-admin tries to delete number | Allowed if they own it | 403 Forbidden |

---

## Testing Plan

### Backend
- `updateWhatsAppTemplateConfig` rejects invalid ContentSids (wrong prefix, wrong length, empty)
- `updateWhatsAppTemplateConfig` rejects non-admin callers with 403
- `removeWhatsAppNumberFunction` rejects non-admin callers with 403 (even number owner)
- `sendWhatsAppTemplate` reads from RTDB cache, not env vars
- `sendWhatsAppTemplate` logs `FALLBACK:` line when ContentSid absent or disabled
- `sendWhatsAppTestMessage` returns full Twilio error body on failure

### Frontend
- Templates tab loads all 7 cards on page open
- `Configured` / `Fallback` / `Disabled` badges reflect RTDB state
- Saving a ContentSid updates RTDB and re-renders badge without page reload
- Delete action absent from dropdown for non-admin users
- Delete action present and functional for admin users (SweetAlert2 confirm)
- Test Send shows Twilio message SID or full error
- Tier info bar renders correctly (bug fix verified)
- Bootstrap 5.3.0 loads, no visual regressions on existing tabs

### Manual Smoke Test
- Set one template to `enabled: false` → confirm plain text fallback sent, `FALLBACK:` in Function logs
- Set valid ContentSid + `enabled: true` → confirm structured WhatsApp template received on phone

---

## Files Changed

| File | Change |
|---|---|
| `functions/utils/whatsappClient.js` | Read template config from RTDB cache instead of env |
| `functions/utils/whatsappTemplates.js` | Remove `TWILIO_TEMPLATE_CONFIG` / env var reads |
| `functions/utils/templateManager.js` | **Deleted** |
| `functions/whatsappManagement.js` | `removeWhatsAppNumberFunction` admin-only gate |
| `functions/index.js` | Register 3 new Cloud Functions |
| `functions/.env` | Remove `TWILIO_CONTENT_SID_*` and `USE_TWILIO_TEMPLATES` |
| `public/tools/admin/whatsapp-management.html` | Full restructure: tabs, Bootstrap 5.3.0, sidebar fix |
| `public/tools/admin/whatsapp-management.js` | Tab system, template tab, admin detection, bug fixes |
| `database.rules.json` | Add rules for `whatsapp-template-config` node (admin write, authenticated read) |
