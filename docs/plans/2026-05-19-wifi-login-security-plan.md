# Plan — WiFi Login Security Hardening (PR 1 of 2)

**Date:** 2026-05-19
**Branch:** `feature/wifi-login-security`
**Worktree:** `.worktrees/wifi-login-security`
**Sequence:** PR 1 (security) → PR 2 (Hi-Fi v2 rewrite, separate branch later)

---

## Goal

Close the open-internet `.write: true` exposure on `wifiLogins` / `activeUsers` / `userPreferences` and the open-redirect vector on `base_grant_url`, **without** breaking the Meraki captive-portal flow at any deployed venue.

## Non-goals (deferred to PR 2 or backlog)

- Hi-Fi v2 visual rewrite of `wifi-login.html` — PR 2.
- `customization/useV2WifiLogin` flag schema — PR 2 (avoid speculative schema).
- Scheduled prune CF for `wifiLogins` / `activeUsers` retention — backlog (joins the same retention-policy bug-triage entry as `/scanningData` from PR #70).
- Server-side phone normalization to E.164 (libphonenumber) — backlog.
- Cleanup of the dual `activeUsers/{client_mac}` vs `activeUsers/{sessionID}` schemas — backlog (touch in PR 2 alongside the rewrite).
- `ipinfo.io` GDPR/POPIA disclosure or removal — backlog (PR 2 fits better, since the geo lookup is UX-coupled).
- `localStorage pendingWifiLogin` encryption / expiry — backlog.

---

## Audit findings closed in this PR

| # | Severity | Finding | Closure mechanism |
|---|---|---|---|
| 1 | 🔴 Critical | `wifiLogins` / `activeUsers` / `userPreferences` `.write: true` (public-internet writes) | Rules → `.write: false`; CF writes via Admin SDK only |
| 2 | 🔴 Critical | No `.validate` on those nodes; arbitrary shape/size writable | `.validate` rules added; CF-side input validation + length caps |
| 3 | 🟠 High | Open redirect via `base_grant_url` → `window.location.href` | Client-side host-pattern whitelist before redirect; inline error on mismatch |
| 4 | 🟠 High | `activeUsers/{client_mac}` overwritable by anyone who knows the MAC | Subsumed by #1 — client writes blocked; CF authenticates anon UID + rate-limits |

## Audit findings logged to backlog (deferred)

| # | Severity | Finding | Why deferred |
|---|---|---|---|
| 5 | 🟡 Medium | Dual `activeUsers` schemas (`{client_mac}` vs `{sessionID}`) | Schema-shape change; safer in PR 2 alongside the rewrite |
| 6 | 🟡 Medium | `ipinfo.io` no consent disclosure | UX-coupled; PR 2 |
| 7 | 🟡 Medium | Weak email / name regex | UX-visible; PR 2 |
| 8 | 🟡 Medium | localStorage PII unencrypted, no expiry | Touches offline-retry path; PR 2 |
| 9 | 🟢 Low | Phone not normalized to E.164 | Backlog: needs libphonenumber dep |
| 10 | 🟢 Low | `Math.random` session IDs | CF now generates push-key sessionID server-side, closes this incidentally |
| 11 | 🟢 Low | Footer "v2.0" but it's v1 | Cosmetic; PR 2 |

---

## File changes

### `functions/index.js`

Add new export `submitWifiLogin` (v2 onCall):

```js
exports.submitWifiLogin = onCall(
    { timeoutSeconds: 30, memory: '256MiB' },
    async (request) => {
        const { auth, data } = request;

        // Anonymous Firebase auth is acceptable here — captive portal
        // guests have no other identity. The anon UID gives us a
        // per-device handle for rate limiting + write attribution.
        if (!auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
        const uid = auth.uid;

        // Rate limit: simple 5s debounce per anon UID. Captive portal
        // is one-shot per device; the abuse vector is bot flooding,
        // not legitimate retries.
        const rateRef = admin.database().ref(`rateLimitsWifi/${uid}`);
        const lastSnap = await rateRef.once('value');
        const last = lastSnap.val();
        const now = Date.now();
        if (last?.lastWriteAt && now - last.lastWriteAt < 5000) {
            throw new HttpsError('resource-exhausted', 'Please wait a moment before retrying.');
        }

        // Validate shape + lengths
        const name = String(data?.name || '').trim().slice(0, 120);
        const email = String(data?.email || '').trim().slice(0, 254);
        const phoneNumber = String(data?.phoneNumber || '').trim().slice(0, 24);
        const table = String(data?.table || '').trim().slice(0, 24);
        const client_mac = String(data?.client_mac || '').trim().slice(0, 32);
        const node_mac = String(data?.node_mac || '').trim().slice(0, 32);
        const client_ip = String(data?.client_ip || '').trim().slice(0, 45);

        if (!name || name.split(/\s+/).length < 2) {
            throw new HttpsError('invalid-argument', 'Name must include first + last.');
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new HttpsError('invalid-argument', 'Invalid email.');
        }
        // Phone: accept E.164-ish (+ then digits) OR digits only
        if (!/^\+?\d{7,15}$/.test(phoneNumber.replace(/\s|-/g, ''))) {
            throw new HttpsError('invalid-argument', 'Invalid phone number.');
        }
        // MAC: optional (Meraki not always provided in dev), but if present validate
        const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
        if (client_mac && !macPattern.test(client_mac)) {
            throw new HttpsError('invalid-argument', 'Invalid client MAC.');
        }
        if (node_mac && !macPattern.test(node_mac)) {
            throw new HttpsError('invalid-argument', 'Invalid node MAC.');
        }

        // Server-generated sessionID (replaces client Math.random)
        const sessionID = admin.database().ref('wifiLogins').push().key;
        const timestamp = new Date().toISOString();

        const loginRecord = {
            sessionID, timestamp, name, email, phoneNumber, table,
            client_mac, node_mac, client_ip, active: true, anonUid: uid
        };
        const activeRecord = {
            sessionID, timestamp, lastSeen: timestamp,
            name, email, phoneNumber, anonUid: uid
        };

        // Atomic multi-path write — wifiLogins/{sessionID} +
        // activeUsers/{client_mac OR sessionID fallback if no MAC) +
        // rateLimitsWifi/{uid}
        const activeKey = client_mac || sessionID;
        const patch = {
            [`wifiLogins/${sessionID}`]: loginRecord,
            [`activeUsers/${activeKey}`]: activeRecord,
            [`rateLimitsWifi/${uid}`]: { lastWriteAt: now }
        };
        await admin.database().ref('/').update(patch);

        return { success: true, sessionID };
    }
);
```

**Why anonymous-auth + onCall (over reCAPTCHA / HMAC):**
- Anonymous Firebase Auth uses `identitytoolkit.googleapis.com` — same auth hostname family as RTDB. The current page already does RTDB writes successfully through walled gardens at every venue, which proves `*.googleapis.com` is whitelisted. Anonymous Auth will reach the same endpoint.
- Cloud Functions live at `*.cloudfunctions.net` (or a custom domain). **This is the single new walled-garden dependency.** Mitigation: client-side fallback chain (CF call → localStorage offline-queue → unconditional Meraki redirect) means CF unreachability degrades to current behavior (no security regression: client can't write to RTDB directly anymore either, so worst-case is "user gets WiFi, data captured later on retry from a non-walled-garden network").
- onCall vs onRequest: onCall lets the Firebase JS SDK handle auth-token injection + CORS automatically — fewer moving parts, fewer ways to misconfigure.

**Per-anon-UID rate limit:** 5s debounce. Stored at `rateLimitsWifi/{uid}` with single field `lastWriteAt`. Not a sliding window — abuse model is bot flooding, debounce is sufficient. Same rate-limit node should eventually be pruned by a scheduled CF (backlog item, joins the retention-policy ticket).

### `database.rules.json`

```diff
     "wifiLogins": {
-      ".read": "auth != null",
-      ".write": true
+      ".read": "auth != null && auth.token.admin === true",
+      ".write": false,
+      "$sessionId": {
+        ".validate": "newData.hasChildren(['sessionID', 'timestamp', 'name', 'email'])",
+        "name":        { ".validate": "newData.isString() && newData.val().length <= 120" },
+        "email":       { ".validate": "newData.isString() && newData.val().length <= 254" },
+        "phoneNumber": { ".validate": "newData.isString() && newData.val().length <= 24" },
+        "table":       { ".validate": "newData.isString() && newData.val().length <= 24" },
+        "client_mac":  { ".validate": "newData.isString() && newData.val().length <= 32" },
+        "node_mac":    { ".validate": "newData.isString() && newData.val().length <= 32" },
+        "client_ip":   { ".validate": "newData.isString() && newData.val().length <= 45" },
+        "sessionID":   { ".validate": "newData.isString() && newData.val().length <= 64" },
+        "timestamp":   { ".validate": "newData.isString()" },
+        "active":      { ".validate": "newData.isBoolean()" },
+        "anonUid":     { ".validate": "newData.isString() && newData.val().length <= 64" },
+        "$other":      { ".validate": false }
+      }
     },
     "activeUsers": {
-      ".read": "auth != null",
-      ".write": true
+      ".read": "auth != null && auth.token.admin === true",
+      ".write": false
     },
     "userPreferences": {
-      ".read": "auth != null",
-      ".write": true
+      ".read": "auth != null && auth.token.admin === true",
+      ".write": false
     },
+    "rateLimitsWifi": {
+      ".read": false,
+      ".write": false,
+      "$uid": {
+        ".read": "auth != null && auth.uid === $uid"
+      }
+    }
```

**Read-rule tightening note:** flipping `.read` from `auth != null` to `auth != null && auth.token.admin === true` is a SCOPE EXPANSION beyond the original PR plan. Justification: those nodes contain guest PII (name + email + phone + MAC) and were readable by ANY authenticated user (every restaurant operator could read every other restaurant's guest list, every signed-in guest could read every guest list). This is a real present-tense exposure that surfaced during the audit; closing it costs zero (no current legitimate non-admin reader). Reverting if a consumer surfaces is a one-line rules patch.

**`.validate` reachability** — per the 2026-05-12 LESSON, `.validate` rules under `.write: false` are unreachable from clients but ARE enforced when the Admin SDK uses `.set()` / `.push()`. The Admin SDK ONLY bypasses `.validate` when using transactions. Since `submitWifiLogin` uses `ref('/').update()` (a multi-path update), `.validate` rules DO fire — Firebase enforces them on all child paths in a multi-path update. So `.validate` rules here are real defense in depth, not decorative.

### `public/js/merakiFirebase.js`

Changes:

1. **Add anonymous auth on DOMContentLoaded:**
   ```js
   import { auth, signInAnonymously } from './config/firebase-config.js';
   // After existing imports
   try {
     await signInAnonymously(auth);
   } catch (e) {
     console.warn('Anonymous auth failed; CF write will be skipped, offline-queue will retry later', e);
   }
   ```

2. **Replace direct RTDB writes in `writeUserData` + `logUserConnection` with `submitWifiLogin` CF call:**
   ```js
   import { functions, httpsCallable } from './config/firebase-config.js';
   const submitWifiLogin = httpsCallable(functions, 'submitWifiLogin');
   const { data } = await submitWifiLogin({ name, email, phoneNumber, table, client_mac, node_mac, client_ip });
   const sessionID = data.sessionID;
   ```
   On error → continue to localStorage offline-queue (existing behavior) → continue to Meraki redirect.

3. **Open-redirect guard before `window.location.href = redirectURL`:**
   ```js
   const ALLOWED_MERAKI_HOST_PATTERNS = [
     /^n\d+\.meraki\.com$/i,
     /\.network-auth\.com$/i  // covers *.network-auth.com (Meraki's secondary splash host)
   ];
   function isAllowedMerakiHost(url) {
     try {
       const u = new URL(url);
       return ALLOWED_MERAKI_HOST_PATTERNS.some(p => p.test(u.hostname));
     } catch { return false; }
   }
   if (!isAllowedMerakiHost(redirectURL)) {
     displayError('Invalid network configuration. Please contact venue staff.');
     console.error('WiFi LOGIN: refused to redirect to non-Meraki host:', redirectURL);
     return; // Do NOT redirect; do NOT submit
   }
   ```
   The guard runs INSIDE the existing success path, between localStorage save and `window.location.href`.

4. **Preserve flow guarantees:**
   - Meraki redirect remains UNCONDITIONAL on every other step's success (anon auth, CF call, localStorage save can all fail — redirect still fires, except if open-redirect guard rejects).
   - `processFormData` (which does the CF call) stays in a background `.then()`/`.catch()` — never blocks the redirect.

### `public/js/config/firebase-config.js`

Verify `signInAnonymously` + `auth` are exported. If not, add minimal export (no other consumer touched).

### KB docs

- `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md` + `public/kb/api/CLOUD_FUNCTIONS_CATALOG.md`: add `submitWifiLogin` row.
- `KNOWLEDGE BASE/security/DATABASE_RULES_GUIDE.md`: section on "hardening previously-open write paths" using wifiLogins as worked example.

### `public/wifi-login.html`

**No visual changes.** PR 2 is the rewrite.

---

## Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Cloud Functions hostname (`*.cloudfunctions.net`) not in walled garden at some venue | Medium | High — CF call would fail, no rate-limit, no validation | Client-side fallback chain: CF failure → localStorage offline-queue → unconditional Meraki redirect. Data captured later when retry fires from a non-walled-garden network. NO security regression (client can't write to RTDB directly anymore). Worst case is silent data loss until retry. **Mitigation step: PR description must include operator action: confirm `*.cloudfunctions.net` is in Meraki walled garden at the test venue before validating.** |
| R2 | Anonymous auth quota/abuse | Low | Medium — bot floods anon UIDs | Per-anon-UID 5s debounce. Anon UIDs are cheap to mint but each one only gets one write per 5s. Bots would need to mint thousands of UIDs to be effective; that's a Firebase Auth abuse concern, not ours to handle here (Firebase has its own quotas). |
| R3 | Validate rules block legitimate guest writes (e.g. very long restaurant table name) | Low | Medium — guest can't get internet | Length caps generous (120 for name, 254 for email RFC-max, 24 for table). CF-side validation has same caps; failures throw `invalid-argument` → client surfaces error inline → guest can correct and retry. |
| R4 | Open-redirect whitelist too strict — rejects a legitimate Meraki host pattern not documented in the 2014 whitepaper | Medium | High — guest blocked | Two patterns to start (`n##.meraki.com` + `.network-auth.com`). If a real venue uses a third host, we add it in a one-line follow-up. Whitepaper line "Your URL may be different... never hard-code" suggests dynamism BUT only on the path/params; the host family has been stable since 2014. **Logged as backlog item: monitor `console.error("WiFi LOGIN: refused to redirect…")` after deploy to catch unknown hosts.** |
| R5 | Read-rule tightening to admin-only breaks an undiscovered consumer | Low | Medium — admin tool stops reading the data | Pre-flight grep for `wifiLogins` + `activeUsers` reads across `public/` + `functions/` (BEFORE code change). Document findings in the PR description. |
| R6 | Operator can't validate on real Meraki venue same-day | Medium | Low — PR ships with reduced confidence | PR doesn't auto-merge; operator validates on real captive portal before merging. If validation reveals walled-garden issue (R1), revert is trivial (`firebase functions:delete submitWifiLogin && git revert <rules commit>`). |

---

## Pre-flight checks (BEFORE code change)

- [ ] `rg 'wifiLogins' --type js` + `rg 'wifiLogins' --type ts` + same for `activeUsers`, `userPreferences` — list every reader; confirm all are admin-context.
- [ ] `rg '\.write.*true' database.rules.json` — confirm no other nodes have the same exposure (if yes, log as backlog, do NOT fix in this PR — scope discipline).
- [ ] Confirm `signInAnonymously` is exported from `firebase-config.js` (or stage the export change as part of this PR).
- [ ] Confirm `submitWifiLogin` CF name doesn't already exist (`rg 'submitWifiLogin'`).

## Verification

- [ ] `npm run build` green at repo root.
- [ ] `cd functions && npm install` then `node -c index.js` syntax-check green (per 2026-05-12 worktree node_modules lesson + 2026-05-15 worktree-cwd lesson).
- [ ] Functions deploy succeeds from worktree (per 2026-05-15 LESSON: verify with new-log-line grep after deploy).
- [ ] Rules deploy succeeds: `firebase deploy --only database` from worktree.
- [ ] Browser smoke (without Meraki): open `wifi-login.html?base_grant_url=https://n100.meraki.com/splash/grant&user_continue_url=https://example.com&client_mac=AA:BB:CC:DD:EE:FF&node_mac=11:22:33:44:55:66` — anon auth fires, form validates, CF call succeeds, redirect attempted (will fail because we're not on a real captive portal — that's expected).
- [ ] Browser smoke (open-redirect): change `base_grant_url` to `https://evil.com/grant` — form submits, redirect refused, inline error shown.
- [ ] **Operator smoke on real Meraki venue** — gates merge.

## Deploy sequencing (per 2026-05-01 LESSON: CFs before client)

1. Deploy `submitWifiLogin` CF first.
2. Deploy database rules (closes the open `.write: true` exposure).
3. **Then** merge the PR (client code goes live via next hosting deploy).

If client code went live first with old CF missing, the form would error → fall through to localStorage queue → user still gets WiFi via Meraki redirect → data captured on next retry. Not catastrophic but adds noise. Sequence above avoids it.

---

## Out-of-scope follow-ups (logged to backlog after merge)

- **Retention-policy ticket (joins PR #70 entry):** scheduled prune CF covering `/scanningData` + `/wifiLogins` + `/activeUsers` + `/userPreferences` + `/rateLimitsWifi`. Same chunked-delete pattern as `clearScanningData`.
- **PR 2 — Hi-Fi v2 rewrite** of `wifi-login.html` with `customization/useV2WifiLogin` flag.
- **Schema cleanup:** dual `activeUsers/{client_mac}` vs `activeUsers/{sessionID}` write paths — touch in PR 2 alongside the rewrite.
- **Phone normalization to E.164** server-side via libphonenumber.
- **`ipinfo.io` GDPR/POPIA** — disclosure banner or removal (defer to PR 2).
- **localStorage `pendingWifiLogin`** — encrypt at rest, add expiry.
- **Walled-garden audit** at every deployed venue: confirm `*.cloudfunctions.net` whitelisted, document in deployment guide.
- **Open-redirect whitelist monitoring:** scheduled review of `console.error("WiFi LOGIN: refused to redirect…")` log entries (Cloud Logging if forwarded, otherwise venue-side reports).
