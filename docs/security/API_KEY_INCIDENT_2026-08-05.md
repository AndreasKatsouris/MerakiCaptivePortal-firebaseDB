# Google API Key Abuse Notification — 2026-08-05

**Project:** Sparks-RM (`merakicaptiveportal-firebasedb`)
**Reported key:** `AIzaSyBf96GN…` (Firebase **web** API key)
**Reported location:** `public/js/config/firebase-config.js`
**Status:** code-side remediation complete; **console actions below are owed by the operator.**

---

## 1. What Google actually reported, and what it means

Google's scanner found a Google API key in a public GitHub repository. The key it
found is the **Firebase Web API key**.

**This key is public by design.** It ships in every browser bundle of every
Firebase web app on the internet. It is an *identifier* for the project, not a
credential — it grants no data access on its own. Anyone can read it today at
`https://merakicaptiveportal-firebasedb.web.app/js/config/firebase-config.js`.
Firebase's own documentation says so explicitly.

So: **rotating this key fixes nothing** — the replacement is equally public. Moving
it to an environment variable and injecting it at build time fixes nothing either;
it lands in the deployed bundle regardless. That would be theatre, and this repo
does not do it.

What the notification is really telling you is that the key is **unrestricted**.
An unrestricted key can be lifted and used from any origin to burn quota against
any API enabled on the project, and to hit Identity Toolkit endpoints (signup
abuse). **The fix is restriction, in the Cloud Console — not rotation, and not
code.** That is section 4.

> This was already known. `PROJECT_BACKLOG.md` logs it as **LOW-01**: *"Firebase API
> key has no HTTP referrer restriction in GCP Console — no code change; operator
> action required."* It was never actioned.

---

## 2. What the scan actually turned up

Investigating the one reported key surfaced four things, ordered by real severity —
which is **not** the order the notification implies.

### 🔴 A tracked production data export (worse than the reported key)

`merakicaptiveportal-firebasedb-default-rtdb.json` — a 60 KB RTDB export committed
at the repo root on 2026-07-21 (`ecdef10`), containing:

- 13 production RTDB nodes (`guests`, `receipts`, `consent-history`, `users`, …)
- a real guest phone number and email address
- **90 device MAC addresses** under `scanningData` — personal information under POPIA
- a **Twilio Account SID** embedded in `api.twilio.com` media URLs

An Account SID is not a credential by itself (it needs the Auth Token), but none of
this belongs in a public repository. **Removed from tracking; `.gitignore` now
blocks the pattern.** Per operator decision the git *history* was **not** rewritten,
so this data remains reachable to anyone who inspects prior commits. See §5.

### 🟠 A billable Places API key

`remoteconfig.template.json` carried a real `GOOGLE_PLACES_API_KEY`. Unlike the
Firebase web key, a Maps Platform key is **billable and abusable** — this is the one
in the repo that genuinely warranted rotation. Replaced with a placeholder;
**rotate it** (§4.3).

### 🟡 Twelve fabricated Firebase configs in deployed dead pages

Twelve `test-*.html` / `tools/dev/*.html` pages each carried their own
`firebaseConfig` literal with a **different** `apiKey`, `messagingSenderId` and
`appId`. None of the sender IDs match the real project (`899985637961`) — they are
invented values, so those pages could never have initialised Firebase at all.

They were nonetheless **served in production**: `scripts/build.js` copies all of
`public/` into `dist/`, and `dist/` is the hosting root. Twelve dead,
publicly-reachable dev pages.

The OWASP audit of **2026-05-30** already reported this as finding **H-3**
("different key / different project") with the fix "remove the inline config and
import from the shared `firebase-config.js`". It was never applied. That is why
this remediation ships a *mechanical* guard rather than another written finding.

### 🟢 The reported key itself

Public by design. No code change is appropriate. Restrict it (§4.1).

---

## 3. What changed in this branch

| Change | Files |
|---|---|
| Deleted dead pages carrying fabricated configs | 12 × `public/test-*.html`, `public/tools/dev/*.html`, `public/tools/archive/fix-phone-numbers.html` |
| Rewired the two pages that were still **linked** from live UI to the shared config module | `public/tools/dev/test-tier-access.html`, `public/tools/dev/generate-test-stock-data.html` |
| Removed a stale duplicate config from a live admin tool (now derives `projectId` from the initialised app) | `public/tools/admin/grant-admin-claims.html` |
| Untracked the RTDB export + ignore patterns | `merakicaptiveportal-firebasedb-default-rtdb.json`, `.gitignore` |
| Placeholdered the Places API key | `remoteconfig.template.json` |
| Redacted full keys quoted in the audit doc | `docs/security/owasp-audit-2026-05-30.html` |
| **Guard:** repo secret scanner | `scripts/scan-secrets.js`, `npm run security:scan` |
| **Guard:** vitest coverage of the scanner | `scripts/__tests__/scan-secrets.test.js` |
| **Guard:** CI now runs the scan before build/deploy on both PR and merge | `.github/workflows/*.yml` |

The scanner encodes the policy deliberately: the Firebase web key is **allowlisted**
in `public/js/config/firebase-config.js` and rejected everywhere else. It fails on
any other Google API key, any private-key block, service-account JSON, SendGrid or
Twilio secret, and any tracked database export.

> Note: the PR workflow previously ran `npm ci && npm run build` and **no tests** —
> so "CI green" never said anything about the suite. The scan is now wired directly
> into both workflows rather than relying on the untriggered test job.

---

## 4. Operator actions — owed, in order

These cannot be done from the repository. **Do §4.1 first**; it is what closes the
notification.

### 4.1 Restrict the Firebase web API key (closes the notification)

1. [Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials?project=merakicaptiveportal-firebasedb)
2. Open the key `AIzaSyBf96GN…` (it is usually named *Browser key (auto created by Firebase)*).
3. **Application restrictions → Websites**, and add exactly:
   - `merakicaptiveportal-firebasedb.web.app/*`
   - `merakicaptiveportal-firebasedb.firebaseapp.com/*`
   - your custom domain, if one is live
   - `localhost:*` — only if you rely on it for local dev
   - ⚠️ **Firebase Hosting preview channels use random subdomains**
     (`…--pr123-abc.web.app`). Referrer restrictions do not accept a wildcard that
     covers them safely. Either accept that previews break, or add
     `*.web.app/*` and accept the weaker restriction. Recommendation: restrict
     tightly and add preview domains ad hoc.
4. **API restrictions → Restrict key**, and select only what the client actually calls:
   Identity Toolkit API, Token Service API, Firebase Realtime Database Management API,
   Cloud Firestore API, Firebase Installations API, Cloud Functions (if called directly).
5. Save. Propagation takes ~5 minutes.
6. **Smoke test before you walk away:** load the live site in a private window, sign
   in, and confirm a dashboard read succeeds. An over-tight API restriction breaks
   auth immediately and visibly.

### 4.2 Enable App Check (the actual abuse control)

Referrer restrictions are trivially spoofable — they raise cost, not a wall. App
Check with reCAPTCHA Enterprise is what genuinely stops off-origin abuse of your
RTDB/Functions quota.

1. [Firebase Console → App Check](https://console.firebase.google.com/project/merakicaptiveportal-firebasedb/appcheck)
2. Register the web app with reCAPTCHA Enterprise.
3. Run in **monitoring mode** for at least a week and watch the verified/unverified split.
4. Only then enforce, per-service, starting with RTDB.

App Check is **not currently used anywhere in this codebase** — enforcing it before
the client SDK is initialised with a provider will lock out every real user. That is
a code change, and it is not in this branch. Treat it as a follow-up task.

### 4.3 Rotate the Places API key

This is the one key here that is genuinely worth rotating.

1. Credentials console → **regenerate** (or create a replacement for) the Places key.
2. Restrict it: **API restrictions → Places API** only, plus IP restrictions if it is
   called server-side.
3. Set the new value in **Firebase Remote Config → `GOOGLE_PLACES_API_KEY`**, not in
   `remoteconfig.template.json`.
4. Check billing for anomalous Places usage since 2024-02-04, the template's stated
   version date.

### 4.4 Check for actual abuse

- [Metrics Explorer](https://console.cloud.google.com/apis/dashboard?project=merakicaptiveportal-firebasedb) — look for traffic spikes from unexpected referrers.
- Firebase Auth → Users — look for unexpected signup volume (Identity Toolkit is the usual target of an unrestricted key).
- Billing → Reports — filter to Maps Platform SKUs.

### 4.5 Reply to Google

Google generally does not require a reply; the notification closes once the key is
restricted. If you want to respond, review the notification in Cloud Logging as the
mail instructs, and state: the key is a Firebase web key restricted to
`<your domains>` with an API allowlist as of `<date>`, an unrelated billable Places
key found during the review was rotated, and repository scanning is now enforced in CI.

---

## 5. Accepted residual risk

Per operator decision on 2026-08-05, git history was **not** rewritten. Therefore:

- The RTDB export — guest phone/email, 90 MAC addresses, the Twilio Account SID —
  **remains readable in commit history** to anyone who looks, for as long as the
  repository is public.
- The Places API key likewise remains in history. §4.3's rotation is what actually
  neutralises it; removing it from `HEAD` alone does not.

If the repository's public visibility is not deliberate, **making it private is the
single highest-value action available** and costs nothing. Otherwise, purging the
history later requires `git filter-repo` plus a force-push that rewrites every SHA
and breaks all existing clones and forks.
