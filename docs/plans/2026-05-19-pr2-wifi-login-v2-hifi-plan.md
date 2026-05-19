# WiFi Login Hi-Fi v2 Implementation Plan (PR 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `public/wifi-login.html` as a Hi-Fi-styled captive portal with Sparks-only branding, drop dead localStorage offline queue + dual schemas, add `marketingConsent` opt-in. Closes audit findings #5-8, #11 deferred from PR #73. Preserves Meraki captive-portal flow byte-for-byte.

**Architecture:** In-place rewrite of one HTML page + tightening of `merakiFirebase.js` (no Vue mount; vanilla HTML + Hi-Fi token classes). Server-side: single new field (`marketingConsent: boolean`) added to `submitWifiLogin` CF + matching `.validate` rule. Forward-compatible deploy order (CF + rules first, hosting after merge).

**Tech Stack:** Vanilla JS modules, Firebase Auth (anonymous) + Functions (v2 onCall) + RTDB (rules), Hi-Fi tokens (`--hf-*` self-hosted), native HTML `<dialog>` for modals, intlTelInput (existing).

**Spec:** `docs/plans/2026-05-19-wifi-login-v2-design.md`

---

## Files touched

| File | Change | Notes |
|---|---|---|
| `functions/index.js` | Modify `submitWifiLogin` (~5 lines) | Add `marketingConsent` to validation + record |
| `database.rules.json` | Add 1 line to wifiLogins validate block | `marketingConsent` validate rule |
| `public/wifi-login.html` | Rewrite in place (~158 → ~180 lines) | Hi-Fi card, Sparks logo, native `<dialog>` modals, marketing checkbox, privacy disclosure |
| `public/js/merakiFirebase.js` | Drop ~250 lines, restructure submit handler | Drop offline queue, dead stubs, debug logs; add marketingConsent payload; CF-error UX |
| `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md` | Update `submitWifiLogin` row | Note `marketingConsent` field |
| `public/kb/api/CLOUD_FUNCTIONS_CATALOG.md` | Same | Mirror copy |

**Token correction from spec:** spec referenced `--hf-danger`. Actual token in `public/css/hifi-tokens.css` is `--hf-warn` (terracotta `#b0553a`). Plan uses `--hf-warn` throughout.

---

## Task 1: Pre-flight verification

**Files:** none (read-only audits)

- [ ] **Step 1: Verify HfLogo SVG path is portable**

Run:
```
cat public/js/design-system/hifi/components/HfLogo.vue
```

Expected: single `<path>` element with `d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z"` (8-pointed star) + a span with text "Sparks" in `var(--hf-font-display)`. These two pieces are what we'll inline into wifi-login.html in Task 4.

- [ ] **Step 2: Verify fonts are self-hosted**

Run:
```
ls public/fonts/hifi/
```

Expected: `geist-300-latin.woff2`, `instrument-serif-400-latin.woff2`, `jetbrains-mono-400-latin.woff2` (plus `-ext` and italic variants). These are wired into `public/css/hifi-fonts.css` via `@font-face src: url(...)` declarations — loading `hifi-fonts.css` in the page is sufficient (no explicit preload needed). Reachable from the captive portal (same hosting domain — walled-garden-OK by transitivity).

- [ ] **Step 3: Confirm no other consumer of `pendingWifiLogin` or `generateSessionID`**

Run:
```
rg "pendingWifiLogin|generateSessionID" --type js --type html
```

Expected: only matches in `public/js/merakiFirebase.js` and one in `public/wifi-login.html` (the inline script defining its own `generateSessionID`). No external consumers. Safe to delete both.

- [ ] **Step 4: Confirm `customization/logoURL` consumers outside captive portal**

Run:
```
rg "logoURL" --type js --type html
```

Expected: matches in `public/js/merakiFirebase.js` (none after this PR), `public/wifi-login.html` (gone after this PR), and likely the admin tier-management / branding settings UI (untouched by this PR). Document any unexpected consumers in the PR description; otherwise proceed.

- [ ] **Step 5: Write-path verification for submitWifiLogin** (per CLAUDE.md §0 mandatory rule)

Run:
```
rg -n "submitWifiLogin|loginRecord" functions/index.js
```

Expected: confirm `loginRecord` shape currently has `{ sessionID, timestamp, name, email, phoneNumber, table, client_mac, node_mac, client_ip, active, anonUid }`. Task 2 adds `marketingConsent` to this exact object — confirm no field-name collision and that `loginRecord` is what gets persisted (not a downstream remapping).

---

## Task 2: Server — add `marketingConsent` to `submitWifiLogin` + rules

**Files:**
- Modify: `functions/index.js:1303-1395` (submitWifiLogin CF block)
- Modify: `database.rules.json:199-218` (wifiLogins validate block)

- [ ] **Step 1: Add `marketingConsent` validation + persistence in CF**

Edit `functions/index.js`. Find the line:

```js
        const table = String(data?.table || '').trim().slice(0, 24);
```

Insert directly after:

```js
        const marketingConsent = Boolean(data?.marketingConsent);
```

Then find the `loginRecord` object:

```js
        const loginRecord = {
            sessionID,
            timestamp,
            name,
            email,
            phoneNumber,
            table,
            client_mac,
            node_mac,
            client_ip,
            active: true,
            anonUid: uid
        };
```

Replace with:

```js
        const loginRecord = {
            sessionID,
            timestamp,
            name,
            email,
            phoneNumber,
            table,
            marketingConsent,
            client_mac,
            node_mac,
            client_ip,
            active: true,
            anonUid: uid
        };
```

`activeRecord` is NOT modified (it's the live-session view, not the marketing list).

- [ ] **Step 2: Syntax-check the CF file**

Run:
```
cd functions && node -c index.js && echo SYNTAX_OK
```

Expected: `SYNTAX_OK`. If syntax error: read the error line, fix, re-run.

- [ ] **Step 3: Add `.validate` rule for marketingConsent**

Edit `database.rules.json`. Find:

```json
        "anonUid":     { ".validate": "newData.isString() && newData.val().length <= 64" },
        "$other":      { ".validate": false }
```

Replace with:

```json
        "anonUid":     { ".validate": "newData.isString() && newData.val().length <= 64" },
        "marketingConsent": { ".validate": "newData.isBoolean()" },
        "$other":      { ".validate": false }
```

- [ ] **Step 4: Install functions deps (worktree gotcha)**

Per the validated 3x pattern, `functions/node_modules` is NOT inherited by worktrees.

Run:
```
cd functions && npm install
```

Expected: completes in ~50s. Audit warnings can be ignored (pre-existing).

- [ ] **Step 5: Deploy CF**

Run:
```
firebase deploy --only functions:submitWifiLogin --project merakicaptiveportal-firebasedb --force
```

Expected: `Successful update operation` for `submitWifiLogin(us-central1)`. Per the 2026-05-15 LESSON, verify the new code is running by tailing logs for a sentinel string only present in the new code. New code accepts `marketingConsent` — if logs grep finds a successful invocation with the new field, deploy is real. Cold deploy may not see traffic immediately; defer the log verification to Task 7 smoke (which exercises the new path).

- [ ] **Step 6: Deploy rules**

Run:
```
firebase deploy --only database --project merakicaptiveportal-firebasedb --force
```

Expected: `rules syntax for database merakicaptiveportal-firebasedb-default-rtdb is valid` then `rules ... released successfully`. Rules are forward-compatible (old client doesn't send `marketingConsent`; CF coerces missing → `false`; `.validate` allows boolean including the implicit `false`).

- [ ] **Step 7: Commit**

```
git -C "C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi" add functions/index.js database.rules.json
git -C "C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi" commit -m "feat(wifi-login): add marketingConsent to submitWifiLogin CF + .validate

PR 2 of 2 on wifi-login pivot. Forward-compatible: old client doesn't
send the field, CF coerces missing -> false. Rules .validate accepts
the new field (true|false).

Deployed CF + rules pre-merge per 2026-05-01 lesson; client code lands
on hosting redeploy after PR merge."
```

---

## Task 3: Client — rewrite `merakiFirebase.js`

**Files:**
- Modify: `public/js/merakiFirebase.js` (~720 → ~470 lines net)

This is the biggest single file change. Approach: edit in passes, syntax-check after each.

- [ ] **Step 1: Delete the offline-queue retry path entirely**

Edit `public/js/merakiFirebase.js`. Find and DELETE the block starting at:

```js
    // Add event listener to try uploading saved data after page loads
    window.addEventListener('load', function() {
        setTimeout(checkAndUploadOfflineData, 2000);
    });

    // Function to check for and upload offline data
    function checkAndUploadOfflineData() {
```

…through the end of that `function checkAndUploadOfflineData` (about 40 lines including the closing `}`).

Also DELETE the localStorage save block inside the submit success path. Find:

```js
                try {
                    const sessionID = generateSessionID();
                    const storedData = {
                        sessionID: sessionID,
                        formData: formData,
                        client_mac: client_mac,
                        node_mac: node_mac,
                        timestamp: new Date().toISOString(),
                        base_grant_url: base_grant_url,
                        user_continue_url: user_continue_url
                    };
                    localStorage.setItem('pendingWifiLogin', JSON.stringify(storedData));
                    console.log('WiFi LOGIN DEBUG: Form data saved to localStorage with sessionID:', sessionID);
```

Replace the `try { ... localStorage.setItem('pendingWifiLogin', ...) ... }` block with a simpler bare flow that just calls the CF. See Step 5 below for the new submit-handler shape — easier to replace the whole submit handler in one pass.

- [ ] **Step 2: Delete dead stubs**

Find and DELETE these functions entirely:

```js
    // Stub: preferences are no longer persisted from the captive portal.
    async function storeUserPreferences(_macAddress, _preferences) {
```
(2-line body)

```js
    // Wire up the disconnect handler. The CF already wrote the
    // activeUsers record; this just attaches the beforeunload listener.
    async function logUserConnection(data) {
```
(~10 lines)

```js
    // Best-effort disconnect signal. Post-rules-tightening this is a
    async function logUserDisconnection(_sessionID) {
```
(3 lines)

Also DELETE any caller of `storeUserPreferences`, `logUserConnection`, `logUserDisconnection`, and the `beforeunload` listener registration. Specifically check:

```js
            // Store user preferences if provided
            if (formData.preferences) {
```
DELETE that block entirely.

```js
            // Log connection for analytics
            console.log('WiFi LOGIN DEBUG: Logging user connection...');
            try {
                await logUserConnection({
```
DELETE through the matching `}` of that `try`.

- [ ] **Step 3: Delete client `generateSessionID` + localStorage sessionID reads**

Find and DELETE:

```js
    // Function to generate a session ID
    function generateSessionID() {
        return 'session-' + Math.random().toString(36).substr(2, 9);
    }
```

Server generates push-key sessionID; client doesn't need its own.

Also DELETE any `localStorage.setItem('sessionID', ...)` and `localStorage.getItem('sessionID')` calls.

- [ ] **Step 4: Replace validation helpers with CF-matching shape**

Find:

```js
    // Validation functions
    function validateName(name) {
        name = name.trim();
        const nameParts = name.split(/\s+/);
        return nameParts.length >= 2 && nameParts.every(part => /^[a-zA-Z'-]+$/.test(part));
    }

    function validateEmail(email) {
        const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        return emailPattern.test(email);
    }

    function validateTable(table) {
        return table.trim() !== "";
    }
```

Replace with:

```js
    // Validation helpers — match the submitWifiLogin CF exactly (functions/index.js
    // lines starting at the `name.split(/\s+/).length >= 2` check). Client validation
    // here is purely real-time UX feedback; the server is the source of truth.
    function validateName(name) {
        return name.trim().split(/\s+/).length >= 2;
    }

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validateTable(_table) {
        // Optional field; helper text says "Leave blank if not seated".
        return true;
    }
```

- [ ] **Step 5: Rewrite the submit handler**

This is the biggest single change. Find:

```js
    // Handle form submission
    if (form) {
        form.addEventListener('submit', function(event) {
```

DELETE everything from that line through the closing `});` of the outer submit listener (about 145 lines — includes validate-each-field block, the localStorage save, the redirect, the `processFormData` background-then-catch block).

Replace the whole submit handler with:

```js
    // Handle form submission. State machine: idle -> validate -> submitting
    // -> (success -> redirect) | (error -> idle).
    //
    // The Meraki redirect is the sacred step; we only fire it on CF success
    // (or when the user chooses to retry after a transient error). The
    // open-redirect guard rejects unknown hosts before the redirect, never
    // after, so the only way bad input gets past it is operator config.
    let isSubmitting = false;

    if (form) {
        form.addEventListener('submit', async function(event) {
            event.preventDefault();
            if (isSubmitting) return;

            // Clear any existing error
            if (errorContainer) errorContainer.style.display = 'none';

            // Validate all fields
            let isValid = true;
            if (nameInput) {
                isValid = validateField(nameInput, validateName(nameInput.value),
                    'Please enter your full name (first name and surname)') && isValid;
            }
            if (emailInput) {
                isValid = validateField(emailInput, validateEmail(emailInput.value),
                    'Please enter a valid email address') && isValid;
            }
            if (phoneInputField && phoneInput) {
                isValid = validateField(phoneInputField, phoneInput.isValidNumber(),
                    'Please enter a valid phone number with country code') && isValid;
            }
            if (tableInput) {
                isValid = validateField(tableInput, validateTable(tableInput.value),
                    'Please enter your table number') && isValid;
            }
            if (termsCheckbox) {
                const termsValid = termsCheckbox.checked;
                const feedbackElement = document.querySelector('#termsValidationMessage');
                if (!termsValid) {
                    isValid = false;
                    if (feedbackElement) {
                        feedbackElement.textContent = 'You must agree to the terms and conditions';
                        feedbackElement.style.display = 'block';
                    }
                } else if (feedbackElement) {
                    feedbackElement.style.display = 'none';
                }
            }

            if (!isValid) {
                displayError('Please correct the errors in the form before submitting.');
                return;
            }

            // Open-redirect guard BEFORE the CF call (per spec state machine).
            // base_grant_url must be a known Meraki host; otherwise we refuse to
            // redirect later, so refuse now and tell the user.
            if (!base_grant_url) {
                displayError('Connection information is missing. Please refresh and try again.');
                return;
            }
            const redirectURL = constructRedirectURL(base_grant_url, user_continue_url);
            if (!isAllowedMerakiHost(redirectURL)) {
                console.error('WiFi LOGIN: refused to redirect to non-Meraki host:', redirectURL);
                displayError('This venue’s WiFi configuration looks unusual. Please ask venue staff for help.');
                return;
            }

            // Begin submitting state
            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = 'Connecting…';
            }

            const marketingConsentEl = document.querySelector('#marketingConsent');
            const payload = {
                name: nameInput ? nameInput.value : '',
                email: emailInput ? emailInput.value : '',
                phoneNumber: phoneInput ? phoneInput.getNumber() : '',
                table: tableInput ? tableInput.value : '',
                marketingConsent: !!(marketingConsentEl && marketingConsentEl.checked),
                client_mac: client_mac || '',
                node_mac: node_mac || '',
                client_ip: client_ip || ''
            };

            try {
                await submitWifiLoginCF(payload);
                // Success: hold the spinner briefly so the user sees confirmation,
                // then fire the Meraki redirect. We DO NOT redirect on error
                // (operator decision in spec) -- user retries via the inline error.
                displaySuccess('Connecting to WiFi network…');
                setTimeout(() => { window.location.href = redirectURL; }, 500);
            } catch (err) {
                console.error('WiFi LOGIN: submitWifiLogin CF rejected:', err);
                displayError(mapCfErrorToUserCopy(err));
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHtml;
                }
                isSubmitting = false;
            }
        });
    }

    // Map CF error codes (Firebase callable HttpsError) to user-facing copy.
    function mapCfErrorToUserCopy(err) {
        const code = err && err.code ? String(err.code) : '';
        if (code.endsWith('unauthenticated')) {
            return 'Almost there — please tap Connect again.';
        }
        if (code.endsWith('resource-exhausted')) {
            return 'Just a moment — please wait a few seconds and try again.';
        }
        if (code.endsWith('invalid-argument')) {
            return 'Please check your details and try again.';
        }
        return 'We hit a snag. Tap Connect to retry.';
    }
```

Notes:
- The submit handler is now `async` so the `await` on the CF works cleanly.
- `isSubmitting` flag guards against double-submit during the await window.
- The button HTML is captured before edit and restored on error (preserves any icon markup the HTML put inside the `<button>`).
- `…` is the literal `…` ellipsis (avoid string-escape ambiguity in the file).
- `’` is the literal `'` curly apostrophe.

- [ ] **Step 6: Add modal click handlers for `<dialog>` modals**

Find the existing `if (termsCheckbox) { termsCheckbox.addEventListener('change', ...) }` block. After it (still inside `DOMContentLoaded`), add:

```js
    // Bind native <dialog> open/close for the privacy + terms modals.
    // Page HTML uses <dialog id="privacyModal"> and <dialog id="termsModal">
    // with trigger elements [data-open-modal="privacyModal"] etc. PR 2 drops
    // Bootstrap's data-bs-toggle in favour of these handlers.
    document.querySelectorAll('[data-open-modal]').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const id = trigger.getAttribute('data-open-modal');
            const dialog = document.getElementById(id);
            if (dialog && typeof dialog.showModal === 'function') {
                dialog.showModal();
            }
        });
    });
    document.querySelectorAll('dialog [data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('dialog')?.close());
    });
    // Tap-outside dismiss: native <dialog> emits a click on the dialog itself
    // (not the inner content) when the user taps the ::backdrop.
    document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.close();
        });
    });
```

- [ ] **Step 7: Delete debug console.log chatter**

Use multi-line regex (or careful pass) to delete every line matching the pattern `console.log('=== WiFi LOGIN DEBUG: ...` and `console.log('WiFi LOGIN DEBUG: ...`. Keep `console.warn` and `console.error` paths intact (operational signals).

- [ ] **Step 8: Verify the file is still syntactically valid**

Run:
```
cd public/js && node --check merakiFirebase.js && echo OK_MERAKI_JS
```

Wait — `merakiFirebase.js` is an ES module with browser-only imports (`./config/firebase-config.js`). `node --check` will fail on the imports. Use a syntax-only check that doesn't resolve imports:

```
node -e "require('fs').readFileSync('public/js/merakiFirebase.js', 'utf8'); console.log('READ_OK')" && node --check --input-type=module < public/js/merakiFirebase.js && echo SYNTAX_OK
```

Actually the cleanest portable check is to rely on the existing `npm run build` (Task 5) to catch syntax errors. Skip an interim syntax check for this file; build will catch it. Move on to Task 4.

- [ ] **Step 9: Commit interim**

```
git -C "C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi" add public/js/merakiFirebase.js
git -C "C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi" commit -m "refactor(wifi-login): drop offline queue + dead stubs + debug spam; add marketingConsent + CF-error UX

- Delete checkAndUploadOfflineData + window.load listener (post-Meraki-
  redirect users don't return to captive portal in same session, so
  the queue's retry path never fires per the PR #73 reviewer note).
- Delete pendingWifiLogin localStorage save (closes finding #8).
- Delete storeUserPreferences, logUserConnection, logUserDisconnection
  stubs (no-op post-PR #73; cleanup).
- Delete client generateSessionID + localStorage sessionID reads
  (server generates push-key sessionID per PR #73).
- Delete WiFi LOGIN DEBUG console.log chatter (keep console.warn /
  console.error for ops visibility).
- Replace v1 client validation regex with CF-matching shape (closes
  finding #7: v1 rejected valid SA names like Müller).
- Add marketingConsent field to CF payload.
- Rewrite submit handler as async state machine: idle -> validate ->
  submitting -> (success -> redirect) | (error -> idle). CF errors
  now user-visible inline (spec decision #8); Meraki redirect fires
  only on CF success.
- Add native <dialog> open/close bindings (Bootstrap modal replaced
  by HTML <dialog> in Task 4)."
```

---

## Task 4: Client — rewrite `public/wifi-login.html`

**Files:**
- Modify: `public/wifi-login.html` (in-place rewrite, ~158 → ~180 lines)

- [ ] **Step 1: Replace the entire file**

The new file is short enough to write in one pass. Overwrite the file with:

```html
<!DOCTYPE html>
<html lang='en'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1, viewport-fit=cover'>
    <meta name='description' content='Guest WiFi login powered by Sparks Hospitality'>
    <title>Guest WiFi - Sparks Hospitality</title>
    <meta name='theme-color' content='#1a1812'>
    <link rel='manifest' href='manifest.json'>

    <!-- Hi-Fi fonts + tokens + base (self-hosted, walled-garden friendly).
         hifi-fonts.css contains the @font-face declarations; fonts are
         loaded on first use without explicit preload. Matches ross.html's
         link order so the cascade behaves identically across v2 surfaces. -->
    <link rel='stylesheet' href='css/hifi-fonts.css'>
    <link rel='stylesheet' href='css/hifi-tokens.css'>
    <link rel='stylesheet' href='css/hifi-base.css'>

    <!-- intlTelInput stays for the phone field -->
    <link rel='stylesheet' href='css/intlTelInput.css'>

    <style>
      /* Captive-portal-specific layout (scoped via .wf- prefix) */
      body {
        min-height: 100dvh;
        margin: 0;
        background-color: var(--hf-bg);
        color: var(--hf-ink);
        font-family: var(--hf-font-body);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        padding: var(--hf-space-5) var(--hf-space-4);
        box-sizing: border-box;
      }
      .wf-card {
        width: 100%;
        max-width: 480px;
        background: var(--hf-paper);
        border: 1px solid var(--hf-line);
        border-radius: var(--hf-radius-lg);
        box-shadow: var(--hf-shadow-2);
        padding: var(--hf-space-6) var(--hf-space-5);
        margin-top: var(--hf-space-5);
        box-sizing: border-box;
      }
      .wf-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--hf-space-2);
        margin-bottom: var(--hf-space-5);
      }
      .wf-logo__wordmark {
        font-family: var(--hf-font-display);
        font-size: 26px;
        line-height: 1;
        letter-spacing: -0.01em;
        color: var(--hf-ink);
      }
      .wf-title {
        font-family: var(--hf-font-display);
        font-size: 22px;
        font-weight: 400;
        text-align: center;
        margin: 0 0 var(--hf-space-5) 0;
        color: var(--hf-ink-2);
      }
      .wf-field { margin-bottom: var(--hf-space-4); }
      .wf-field__label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--hf-ink-2);
        margin-bottom: var(--hf-space-1);
      }
      .wf-field__hint {
        display: block;
        font-size: 12px;
        color: var(--hf-muted);
        margin-top: var(--hf-space-1);
      }
      .wf-input {
        width: 100%;
        min-height: 44px;
        padding: 10px 12px;
        border: 1px solid var(--hf-line);
        border-radius: var(--hf-radius-md);
        background: var(--hf-paper);
        color: var(--hf-ink);
        font: inherit;
        font-size: 16px; /* iOS no-zoom on focus */
        box-sizing: border-box;
        transition: border-color var(--hf-transition);
      }
      .wf-input:focus {
        outline: none;
        border-color: var(--hf-ink);
      }
      .wf-input.is-invalid { border-color: var(--hf-warn); }
      .wf-error {
        display: none;
        color: var(--hf-warn);
        font-size: 12px;
        margin-top: var(--hf-space-1);
      }
      .wf-input.is-invalid + .wf-error { display: block; }
      .wf-check {
        display: flex;
        align-items: flex-start;
        gap: var(--hf-space-2);
        margin-bottom: var(--hf-space-3);
        font-size: 14px;
        line-height: 1.4;
      }
      .wf-check input[type='checkbox'] {
        width: 20px; height: 20px; margin: 0; flex-shrink: 0;
        accent-color: var(--hf-ink);
      }
      .wf-check a, .wf-check button.wf-linklike {
        color: var(--hf-ink);
        text-decoration: underline;
        background: none;
        border: 0;
        padding: 0;
        font: inherit;
        cursor: pointer;
      }
      .wf-disclosure {
        font-size: 12px;
        color: var(--hf-muted);
        line-height: 1.45;
        margin: var(--hf-space-4) 0;
      }
      .wf-disclosure .wf-linklike { color: var(--hf-ink-2); }
      .wf-status {
        display: none;
        padding: 10px 12px;
        border-radius: var(--hf-radius-md);
        font-size: 14px;
        margin-bottom: var(--hf-space-3);
      }
      .wf-status--error {
        display: block;
        background: rgba(176, 85, 58, 0.08);
        color: var(--hf-warn);
        border: 1px solid rgba(176, 85, 58, 0.25);
      }
      .wf-status--success {
        display: block;
        background: rgba(92, 122, 74, 0.08);
        color: var(--hf-good);
        border: 1px solid rgba(92, 122, 74, 0.25);
      }
      .wf-submit {
        width: 100%;
        min-height: 56px;
        padding: 14px 20px;
        background: var(--hf-ink);
        color: var(--hf-paper);
        border: 0;
        border-radius: var(--hf-radius-md);
        font: inherit;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: opacity var(--hf-transition);
      }
      .wf-submit:hover:not(:disabled) { opacity: 0.92; }
      .wf-submit:disabled { opacity: 0.55; cursor: progress; }
      .wf-footer {
        text-align: center;
        font-size: 12px;
        color: var(--hf-muted);
        margin: var(--hf-space-5) 0 var(--hf-space-3) 0;
        padding-bottom: env(safe-area-inset-bottom);
      }
      /* intlTelInput visual tweaks (closed state only; open dropdown
         retains some native chrome -- known limit, documented in spec) */
      .iti { width: 100%; display: block; }
      .iti__flag-container { background: var(--hf-paper); }

      /* Native <dialog> styling */
      dialog.wf-modal {
        border: 1px solid var(--hf-line);
        border-radius: var(--hf-radius-lg);
        padding: var(--hf-space-5);
        max-width: 480px;
        width: calc(100% - var(--hf-space-5));
        background: var(--hf-paper);
        color: var(--hf-ink);
        font-family: var(--hf-font-body);
        line-height: 1.5;
      }
      dialog.wf-modal::backdrop {
        background: rgba(10, 8, 4, 0.45);
      }
      dialog.wf-modal h2 {
        font-family: var(--hf-font-display);
        font-size: 20px;
        margin: 0 0 var(--hf-space-3) 0;
      }
      dialog.wf-modal p { margin: var(--hf-space-2) 0; font-size: 14px; }
      dialog.wf-modal ul { padding-left: var(--hf-space-5); font-size: 14px; }
      dialog.wf-modal .wf-modal__close {
        margin-top: var(--hf-space-4);
        min-height: 44px;
        padding: 10px 18px;
        background: var(--hf-ink);
        color: var(--hf-paper);
        border: 0;
        border-radius: var(--hf-radius-md);
        font: inherit;
        cursor: pointer;
      }
    </style>
</head>
<body>
    <main class='wf-card'>
        <!-- Sparks logo (inline SVG mark + wordmark; matches HfLogo.vue) -->
        <div class='wf-logo' aria-label='Sparks Hospitality'>
            <svg width='28' height='28' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                <path d='M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z' fill='var(--hf-ink)'/>
            </svg>
            <span class='wf-logo__wordmark'>Sparks</span>
        </div>

        <h1 class='wf-title'>Sign in for free WiFi</h1>

        <div id='error-container' class='wf-status' role='alert' aria-live='polite'></div>

        <form id='loginForm' novalidate>
            <div class='wf-field'>
                <label class='wf-field__label' for='username'>Full name</label>
                <input type='text' class='wf-input' id='username' placeholder='First and last name' required autocomplete='name' />
                <div class='wf-error' id='nameValidationMessage'></div>
            </div>

            <div class='wf-field'>
                <label class='wf-field__label' for='email'>Email</label>
                <input type='email' class='wf-input' id='email' placeholder='you@example.com' required autocomplete='email' inputmode='email' />
                <div class='wf-error' id='emailValidationMessage'></div>
            </div>

            <div class='wf-field'>
                <label class='wf-field__label' for='phone'>Phone</label>
                <input id='phone' type='tel' class='wf-input' placeholder='Phone number' required autocomplete='tel' inputmode='tel' />
                <div class='wf-error' id='phoneValidationMessage'></div>
            </div>

            <div class='wf-field'>
                <label class='wf-field__label' for='table'>Table number</label>
                <input type='text' class='wf-input' id='table' placeholder='e.g. 12' autocomplete='off' inputmode='numeric' />
                <span class='wf-field__hint'>Leave blank if you’re not seated at a table.</span>
                <div class='wf-error' id='tableValidationMessage'></div>
            </div>

            <label class='wf-check' for='marketingConsent'>
                <input type='checkbox' id='marketingConsent'>
                <span>Send me offers and updates from this venue.</span>
            </label>

            <label class='wf-check' for='terms'>
                <input type='checkbox' id='terms' required>
                <span>I agree to the <button type='button' class='wf-linklike' data-open-modal='termsModal'>terms and conditions</button>.</span>
            </label>
            <div class='wf-error' id='termsValidationMessage'></div>

            <p class='wf-disclosure'>
                By submitting, you agree we can store these details with this venue’s WiFi system. We detect your country (via ipinfo.io) to format your phone number.
                <button type='button' class='wf-linklike' data-open-modal='privacyModal'>Privacy details</button>
            </p>

            <button type='submit' class='wf-submit'>Connect to WiFi</button>
        </form>

        <p class='wf-footer'>Powered by Sparks Hospitality</p>
    </main>

    <!-- Privacy modal -->
    <dialog id='privacyModal' class='wf-modal'>
        <h2>What we collect</h2>
        <p>When you sign in to WiFi at this venue, we store:</p>
        <ul>
            <li>Your name, email, phone number, and (optional) table number</li>
            <li>The MAC address of your device (a hardware ID your phone broadcasts to nearby WiFi networks)</li>
            <li>An anonymous device identifier we generate</li>
            <li>Whether you opted in to marketing messages from this venue</li>
        </ul>
        <p><strong>Who can see it:</strong> This venue’s admin staff. We don’t share with third parties.</p>
        <p><strong>Country detection:</strong> We call ipinfo.io once when this page loads to detect your country, so the phone field starts with the right dial code. We send your IP address to ipinfo.io; we don’t send your name, email, or phone. Their privacy policy: ipinfo.io/privacy-policy.</p>
        <p><strong>Marketing messages:</strong> If you opt in, this venue may email or message you with offers and updates. You can opt out any time by replying to a marketing message.</p>
        <p><strong>Want your details removed?</strong> Email privacy@sparkshospitality.com with the venue name and your email.</p>
        <button type='button' class='wf-modal__close' data-close-modal>Close</button>
    </dialog>

    <!-- Terms modal -->
    <dialog id='termsModal' class='wf-modal'>
        <h2>Terms of use</h2>
        <p>By connecting to this WiFi network you agree to use it lawfully and at your own risk. The venue is not responsible for the security of your connection or the integrity of data you transmit.</p>
        <p>The venue may suspend access at its discretion. Connection metadata (timestamps, device MAC address) is retained for the venue’s operational and compliance purposes.</p>
        <button type='button' class='wf-modal__close' data-close-modal>Close</button>
    </dialog>

    <!-- Customization reader: applies per-venue branding overrides on top
         of the Sparks defaults. Same shape as v1; only the logoURL bit
         is removed since v2 is Sparks-only branding. -->
    <script type='module'>
        import { rtdb, ref, get } from './js/config/firebase-config.js';
        document.addEventListener('DOMContentLoaded', function () {
            get(ref(rtdb, 'customization/'))
                .then(function(snapshot) {
                    const settings = snapshot.val();
                    if (!settings) return;
                    if (settings.bgColor) document.body.style.backgroundColor = settings.bgColor;
                    if (settings.bgImageUrl) {
                        document.body.style.backgroundImage = 'url(' + settings.bgImageUrl + ')';
                        document.body.style.backgroundSize = 'cover';
                        document.body.style.backgroundPosition = 'center';
                        document.body.style.backgroundRepeat = 'no-repeat';
                    }
                })
                .catch(function(error) {
                    console.error('Error fetching customization settings:', error);
                });
        });
    </script>

    <!-- intlTelInput stays for the phone field -->
    <script src='js/intlTelInput.min.js'></script>
    <!-- Main captive-portal logic (anonymous auth + submitWifiLogin CF) -->
    <script type='module' src='js/merakiFirebase.js'></script>
    <!-- Service worker -->
    <script src='js/service-worker-registration.js'></script>
</body>
</html>
```

Notes:
- `’` ⟶ literal `'` (right single quotation mark); kept as escape to avoid copy-paste glitches in the plan file. Engineer should replace with the literal character in the actual edit if preferred.
- The page mounts entirely vanilla; no Vue. Hi-Fi token classes provide visual treatment.
- `marketingConsent` is an unchecked checkbox by default; `terms` is required.
- Both `<dialog>` elements (privacy + terms) have `data-close-modal` on their close button + tap-outside dismiss wired by `merakiFirebase.js` modal handler.
- The customization reader inline script reads `customization/{bgColor, bgImageUrl}` only — `logoURL` and `font` and `fontSize` overrides are dropped (Sparks-only branding per spec).

- [ ] **Step 2: Update `displayError` + `displaySuccess` to use new wf-status classes**

`merakiFirebase.js` already has `displayError(message)` and `displaySuccess(message)`. They use `errorContainer.className = 'alert alert-danger mt-3'` (Bootstrap classes that don't exist anymore). Update both functions in `public/js/merakiFirebase.js`.

Find:

```js
    function displayError(message) {
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.style.display = 'block';
            errorContainer.className = 'alert alert-danger mt-3';

            errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });

            setTimeout(() => {
                errorContainer.style.display = 'none';
            }, 6000);
        } else {
            console.error('Error container not found:', message);
        }
    }
```

Replace with:

```js
    function displayError(message) {
        if (!errorContainer) {
            console.error('Error container not found:', message);
            return;
        }
        errorContainer.textContent = message;
        errorContainer.className = 'wf-status wf-status--error';
        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Auto-hide after 6s so the user can re-tap without the stale error
        setTimeout(() => {
            if (errorContainer.classList.contains('wf-status--error')) {
                errorContainer.className = 'wf-status';
            }
        }, 6000);
    }
```

Find:

```js
    function displaySuccess(message) {
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.className = 'alert alert-success mt-3';
            errorContainer.style.display = 'block';
        }
    }
```

Replace with:

```js
    function displaySuccess(message) {
        if (!errorContainer) return;
        errorContainer.textContent = message;
        errorContainer.className = 'wf-status wf-status--success';
    }
```

Also update `validateField` to use `wf-input.is-invalid` instead of Bootstrap's `is-invalid` (the class name is the same `is-invalid` — but verify the CSS in Step 1 above defines `.wf-input.is-invalid`). Update the line:

```js
            inputElement.classList.add('is-invalid');
            inputElement.classList.remove('is-valid');
```

If `is-valid` is no longer styled (v2 has no green-checkmark state), drop `is-valid` adds entirely. Simplify the function — find:

```js
    function validateField(inputElement, isValid, errorMessage) {
        const feedbackElement = inputElement.nextElementSibling;

        if (!isValid) {
            inputElement.classList.add('is-invalid');
            inputElement.classList.remove('is-valid');
            if (feedbackElement) {
                feedbackElement.textContent = errorMessage;
                feedbackElement.style.display = 'block';
            }
        } else {
            inputElement.classList.remove('is-invalid');
            inputElement.classList.add('is-valid');
            if (feedbackElement) {
                feedbackElement.style.display = 'none';
            }
        }

        return isValid;
    }
```

Replace with:

```js
    function validateField(inputElement, isValid, errorMessage) {
        const feedbackElement = inputElement.nextElementSibling;
        if (!isValid) {
            inputElement.classList.add('is-invalid');
            if (feedbackElement && feedbackElement.classList.contains('wf-error')) {
                feedbackElement.textContent = errorMessage;
            }
        } else {
            inputElement.classList.remove('is-invalid');
        }
        return isValid;
    }
```

(Display of `.wf-error` is now controlled by CSS sibling selector `.wf-input.is-invalid + .wf-error { display: block; }`, so explicit `style.display` toggling is unnecessary.)

- [ ] **Step 3: Commit interim**

```
git -C "C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi" add public/wifi-login.html public/js/merakiFirebase.js
git -C "C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi" commit -m "feat(wifi-login): Hi-Fi v2 rewrite of wifi-login.html + visual UX updates

In-place rewrite. Sparks-branded card (inline SVG logo + wordmark)
on Hi-Fi tokens. Drops Bootstrap, Font Awesome, venue logoURL,
admin login link, version footer string. Adds marketing opt-in
checkbox and inline privacy disclosure that opens a native
<dialog> with the longer copy. Terms modal also moved to native
<dialog>.

displayError / displaySuccess / validateField rewritten for the
new .wf-* class system (no Bootstrap alert classes).

Closes audit findings #5-8 and #11 from the PR #73 backlog +
the offline-queue retry-path gap surfaced by the PR #73 reviewer
(closed by removal of the queue, per spec decision #3)."
```

---

## Task 5: KB docs + build verify

**Files:**
- Modify: `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md`
- Modify: `public/kb/api/CLOUD_FUNCTIONS_CATALOG.md`

- [ ] **Step 1: Update both CLOUD_FUNCTIONS_CATALOG copies**

Find this row in each file:

```
| `submitWifiLogin` | Callable (v2 onCall) | Anonymous Firebase Auth | Server-side write path for guest captive-portal login. Validates name/email/phone/MAC, 5s/UID rate-limit, atomic multi-path write to `wifiLogins/{sessionID}` + `activeUsers/{client_mac\|sessionID}` + `rateLimitsWifi/{uid}`. Replaced the prior direct-client RTDB writes that required `.write:true` (public-internet exposure). Returns `{ success, sessionID }`. |
```

Replace with:

```
| `submitWifiLogin` | Callable (v2 onCall) | Anonymous Firebase Auth | Server-side write path for guest captive-portal login. Validates name/email/phone/MAC, 5s/UID rate-limit, atomic multi-path write to `wifiLogins/{sessionID}` + `activeUsers/{client_mac\|sessionID}` + `rateLimitsWifi/{uid}`. Accepts: `{ name, email, phoneNumber, table, marketingConsent: bool, client_mac, node_mac, client_ip }`. Replaced the prior direct-client RTDB writes that required `.write:true` (public-internet exposure). Returns `{ success, sessionID }`. |
```

(Add the `Accepts:` clause; `marketingConsent` is the only new field since PR #73 shipped.)

- [ ] **Step 2: Run npm run build at repo root**

Run:
```
cd C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi && npm run build
```

Expected: completes in ~3-5s, ends with `✓ built in N.NNs` + `[build] Done! Deploy dist/ to Firebase Hosting.`. No errors.

If errors:
- Vite build error → read the file:line in the error, fix the syntax in `public/wifi-login.html` or `public/js/merakiFirebase.js`, re-run.
- Missing-file error (e.g. missing font file) → `ls public/fonts/hifi/` and confirm font filenames match the preload `<link>` tags in `wifi-login.html`.

- [ ] **Step 3: Commit**

```
git -C "C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi" add "KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md" public/kb/api/CLOUD_FUNCTIONS_CATALOG.md
git -C "C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi" commit -m "docs(catalog): note marketingConsent field on submitWifiLogin

Mirrors the field shape added in Task 2 (commit feat(wifi-login):
add marketingConsent...). Both KB copies updated for consistency."
```

---

## Task 6: Browser smoke (without real Meraki)

**Files:** none (browser-only verification)

The captive portal can't be tested without real Meraki hardware in the loop, but we can smoke the form + CF call + open-redirect guard in any browser by passing synthetic Meraki params via URL.

- [ ] **Step 1: Spin up a local server**

Run (in a separate shell):
```
cd C:/dev/MerakiCaptivePortal-firebaseDB && npx serve dist -p 5180
```

(Or any local static server pointed at `dist/`.)

- [ ] **Step 2: Smoke (happy path)**

Open in browser:
```
http://localhost:5180/wifi-login.html?base_grant_url=https%3A%2F%2Fn100.meraki.com%2Fsplash%2Fgrant&user_continue_url=https%3A%2F%2Fexample.com&client_mac=AA:BB:CC:DD:EE:FF&node_mac=11:22:33:44:55:66&client_ip=10.0.0.5
```

Expected:
- Page renders with Sparks logo + "Sign in for free WiFi" title.
- Form has 5 fields + 2 checkboxes (marketing + terms).
- Inline privacy disclosure block visible with `Privacy details` link.
- Tapping `Privacy details` opens a native modal with the longer copy.
- Tapping `terms and conditions` opens a native modal with terms copy.
- Both modals dismiss on tap-outside + close button.
- Form submit (after filling valid name/email/phone/checking terms) shows "Connecting…" then attempts `window.location.href` redirect (will fail because we're not on real captive portal — that's expected).
- DevTools network tab shows a successful POST to `submitWifiLogin` CF.
- RTDB console shows new record at `wifiLogins/{sessionID}` with `marketingConsent: true` (if checked) or `false` (if unchecked).

- [ ] **Step 3: Smoke (open-redirect rejection)**

Open in browser:
```
http://localhost:5180/wifi-login.html?base_grant_url=https%3A%2F%2Fevil.com%2Fgrant&user_continue_url=https%3A%2F%2Fexample.com&client_mac=AA:BB:CC:DD:EE:FF
```

Fill form, check terms, submit.

Expected: inline error "This venue's WiFi configuration looks unusual. Please ask venue staff for help." No CF call fires (the guard runs before the CF). DevTools network tab: no `submitWifiLogin` POST.

- [ ] **Step 4: Smoke (rate-limit)**

On the happy-path URL, submit twice within 5 seconds.

Expected: second submit returns `resource-exhausted` from the CF → inline error "Just a moment — please wait a few seconds and try again." Submit button re-enabled after the error displays.

- [ ] **Step 5: Smoke (validation)**

On the happy-path URL, submit with:
- Empty name → inline error "Please enter your full name (first name and surname)"
- Single-word name (e.g. "Bob") → same inline error
- Müller, José, or any Unicode name → accepted (regex relaxed from v1).
- Empty email → inline error "Please enter a valid email address"
- `foo+bar@example.museum` → accepted (regex relaxed from v1).
- Empty table field → accepted (now optional per helper text).
- Unchecked terms → inline error "You must agree to the terms and conditions"

- [ ] **Step 6: Smoke (mobile viewport)**

DevTools → toggle device emulation → iPhone 13 (or any 390x844 viewport). Verify:
- Form fits without horizontal scroll.
- All touch targets ≥ 44px (eyeball-test).
- Privacy + terms modals fit within viewport.
- iOS doesn't zoom on input focus (because `font-size: 16px` on `.wf-input`).

---

## Task 7: Pre-push self-review (per CLAUDE.md §5 mandatory rule)

**Files:** none (review-only)

- [ ] **Step 1: Diff re-read**

Run:
```
git -C "C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi" diff master..HEAD
```

Read every hunk with fresh eyes. Specifically check:

- **Shape contradictions:** does any field name/type/lifecycle in the diff contradict a recent LESSON or the actual CF write path?
  - `marketingConsent` is added in both CF (Task 2) AND client (Task 3) — confirm spelling matches exactly.
  - `loginRecord` shape in CF: confirm `marketingConsent` is in the persisted object, not just validated then dropped.
  - `.validate` rule key: confirm it matches the field name in CF.

- **Mock-vs-server divergence:** N/A (no new tests).

- **Scope-discipline boundary:** does fix-X make any previously-dead bug-Y newly reachable? Specifically:
  - The CF-error-now-visible UX change (spec decision #8). Does this newly surface any CF error that previously went silent? Yes — `invalid-argument` from the CF's stricter validation (Müller name should now pass, but a single-name "Bob" still throws `invalid-argument`). Confirm the error mapping for `invalid-argument` says "Please check your details" — yes, mapped in Step 5 of Task 3.

- **Automated-review pre-rehearsal:** what would the automated reviewer flag?
  - Counter-fragility: does the submit-handler `isSubmitting` flag race with the await? Single-tab, single-form — no. Documented.
  - Dead code: confirm all deleted functions in Task 3 actually have no remaining references (`rg "checkAndUploadOfflineData\|storeUserPreferences\|logUserConnection\|logUserDisconnection\|generateSessionID" public/js/merakiFirebase.js` — expected output: nothing matches).
  - Doc-vs-LESSON drift: this PR doesn't add new doc claims about Firebase behaviour, so the 2026-05-19 LESSON about Admin SDK + .validate doesn't fire here. (The .validate rule we add IS future-proofing for admin client SDK writes per the corrected DATABASE_RULES_GUIDE — consistent.)
  - Info-disclosure in error strings: the CF doesn't return any new strings; `mapCfErrorToUserCopy` produces user-facing copy from the CF's `code`, not from any `message` that might leak. Safe.

- [ ] **Step 2: Final greps**

Run:
```
rg "checkAndUploadOfflineData|storeUserPreferences|logUserConnection|logUserDisconnection|pendingWifiLogin" public/js/merakiFirebase.js
```

Expected: no matches (all dead-code deletions complete).

Run:
```
rg "logoURL" public/wifi-login.html
```

Expected: no matches (Sparks-only branding).

Run:
```
rg "WiFi LOGIN DEBUG" public/js/merakiFirebase.js
```

Expected: no matches (debug log chatter removed).

Run:
```
rg "fas fa-\|bootstrap" public/wifi-login.html
```

Expected: no matches (Font Awesome + Bootstrap dropped).

If any of these greps return matches, finish the cleanup in the appropriate file before push.

---

## Task 8: Push + PR

**Files:** none (git + GitHub only)

- [ ] **Step 1: Push the branch**

Run:
```
git -C "C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi" push -u origin feature/wifi-login-v2-hifi
```

- [ ] **Step 2: Open the PR**

Run from inside the worktree:
```
cd C:/dev/MerakiCaptivePortal-firebaseDB/.worktrees/wifi-login-v2-hifi
gh pr create --title "feat(wifi-login): Hi-Fi v2 rewrite (PR 2 of 2) — marketingConsent + dead-code cleanup" --body "$(cat docs/plans/2026-05-19-wifi-login-v2-design.md | head -50)

## Test plan

- [x] npm run build green
- [x] Pre-flight greps clean
- [x] Browser smoke (happy path) — form submits, CF returns sessionID, redirect attempts
- [x] Browser smoke (open-redirect) — non-Meraki host rejected with inline error, no CF call
- [x] Browser smoke (rate-limit) — second submit in <5s returns resource-exhausted
- [x] Browser smoke (validation) — Unicode names accepted, '+' emails accepted, empty table accepted
- [x] Browser smoke (mobile viewport) — 390x844 fits, touch targets 44px+, no iOS focus-zoom
- [ ] **Operator smoke on real Meraki venue (gates merge):** clean signup -> form submits -> guest gets WiFi -> wifiLogins/{sessionID} record visible in RTDB with marketingConsent field present

## Deploy sequencing (done pre-merge)

- [x] submitWifiLogin CF deployed (forward-compatible — old client doesn't send marketingConsent, CF defaults to false)
- [x] database.rules.json deployed (adds marketingConsent validate; forward-compatible)
- [ ] **Hosting redeploy after merge (you):** firebase deploy --only hosting --project merakicaptiveportal-firebasedb"
```

(The above `gh pr create` uses a bash here-string to embed the first 50 lines of the spec — adjust to your shell if running from PowerShell.)

- [ ] **Step 3: Surface to operator**

Tell the operator: PR is open at the URL from the previous command's output. Operator's smoke on real Meraki venue gates merge. After merge, operator runs `firebase deploy --only hosting` to close the brief "no marketingConsent field captured" window.

---

## Self-review

(Plan author runs this BEFORE handoff.)

**Spec coverage:**
- ✅ Decision 1 (in-place rewrite, no flag) — Task 4 rewrites wifi-login.html in place.
- ✅ Decision 2 (Hi-Fi-ified clone of v1) — Task 4 form preserves 5 fields + adds marketing opt-in.
- ✅ Decision 3 (accept data loss; drop offline queue) — Task 3 Step 1 deletes the queue.
- ✅ Decision 4 (Sparks-only branding) — Task 4 inline SVG logo, no `customization/logoURL` reader.
- ✅ Decision 5 (drop admin login link) — Task 4 file has no admin link.
- ✅ Decision 6 (keep ipinfo.io, add disclosure) — Task 4 disclosure block + privacy modal.
- ✅ Decision 7 (match client validation to CF) — Task 3 Step 4.
- ✅ Decision 8 (CF errors user-visible) — Task 3 Step 5 (catch block displays inline; no redirect on error).
- ✅ Decision 9 (drop Bootstrap) — Task 4 removes Bootstrap link + script.
- ✅ Decision 10 (drop Font Awesome) — Task 4 has no FA link; inline SVG only.
- ✅ marketingConsent schema (CF + rules + client) — Tasks 2 + 3.
- ✅ Native <dialog> modals — Task 4 + Task 3 Step 6 handlers.
- ✅ State machine — Task 3 Step 5.
- ✅ Error code mapping — Task 3 Step 5 `mapCfErrorToUserCopy`.
- ✅ Touch targets 44px+ — Task 4 CSS.
- ✅ Privacy modal copy — Task 4 file content.
- ✅ Deploy sequencing (CF + rules first) — Task 2 Steps 5-6, before client tasks.
- ✅ Pre-push self-review — Task 7 (per CLAUDE.md §5 mandatory rule).
- ✅ Write-path verification — Task 1 Step 5 (per CLAUDE.md §0 mandatory rule).

**Placeholder scan:** none.

**Type consistency:**
- `marketingConsent: boolean` used identically in CF (`Boolean(data?.marketingConsent)`), rules (`newData.isBoolean()`), and client payload (`!!(marketingConsentEl && marketingConsentEl.checked)`). Consistent.
- `loginRecord` field order: timestamp, name, email, phoneNumber, table, marketingConsent, client_mac, ... — consistent with the spec diff.
- `submitWifiLoginCF` is a `httpsCallable` handle imported at top of `merakiFirebase.js` from PR 1; payload shape sent matches CF expectation.

No gaps found.
