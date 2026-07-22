# CRIT-09 — Receipt image public-exposure remediation (design)

**Date:** 2026-07-22 · **Status:** DRAFT for operator review · **Severity:** Critical (unauthenticated internet exposure of guest PII)
**Supersedes:** the 2026-06-15 audit's CRIT-09 remediation ("tighten `storage.rules` on `/receipts/`") — that fix would neither break nor close anything (public GCS ACLs bypass Storage rules entirely; see the 2026-07-21 LESSONS entry `gcs/public-acl-vs-rules`).
**Corrects:** one load-bearing claim in the 2026-07-21 backlog row and `public/kb/features/RECEIPT_PROCESSING.md:27` — see §2.3.

---

## 1. Threat model (verified ground truth, 2026-07-22)

Every WhatsApp receipt image ever OCR'd is:

1. **World-readable, no account required** — `functions/receiptProcessor.js:440` calls `file.makePublic()` (an `allUsers:READ` object ACL). Requests to `storage.googleapis.com` are served by GCS directly and never evaluate Firebase Storage rules, so `storage.rules` (`/receipts/` read = `auth != null`, write = `false`) is not in the request path at all.
2. **Enumerable** — object names are `receipts/{Date.now()}_receipt.jpg` (`receiptProcessor.js:420-421`); a cheap unauthenticated HEAD sweep over a plausible epoch window walks the corpus.
3. **Unbounded** — no retention or prune exists for these objects; the set grows monotonically since feature inception (quota signals: 50–500 receipts/mo/tenant, `RECEIPT_PROCESSING.md:213-215`).

Contents: photographed till slips tied to guest phone numbers upstream — POPIA-relevant.

## 2. Ground truth that reshapes the fix

Full producer/consumer map: 2026-07-22 Explore census (verified by hand against the code before this spec was written).

### 2.1 The public objects are ORPHANED

The GCS public URL is generated **only to feed Vision OCR** and then discarded:
`detectReceiptText` → `downloadAndStoreImage(twilioUrl)` → upload + `makePublic()` → `client.textDetection(publicUrl)` → returns the Vision result, never the URL (`receiptProcessor.js:334-344, 415-446`).

What RTDB persists as `receipts/{id}/imageUrl` is the **original Twilio `MediaUrl0`**, threaded down from the webhook (`receiveWhatsappMessage.js:272 → :577`; `receiptProcessor.js:71/:94/:233`; saved verbatim at `:1315`). Nothing in the codebase reads a `storage.googleapis.com` receipt URL back.

### 2.2 Consumers

- Two **admin-only** surfaces render `receipts/{id}/imageUrl` (the Twilio URL): `public/js/receipt-management.js:1032-1035` (via `innerHTML` — latent XSS sink, out of scope here) and `public/js/modules/receipts/ReceiptManager.js:266`.
- No guest-facing surface renders receipt images; no WhatsApp reply embeds an image URL (text-only replies). Signed-URL expiry therefore has no message-body constraint.
- No `getDownloadURL()` call sites in `public/js` → Firebase download tokens are not a live bypass vector for receipts.
- Sibling producer `receiptTemplateManager.js:386` (`makePublic()` on template examples) is **exported but never invoked** — theoretical until wired; folded into the sweep + code fix anyway.

### 2.3 Corrections to prior records

- Backlog CRIT-09 row + `RECEIPT_PROCESSING.md:27` claim the GCS URL "is stored" as the receipt's `imageUrl`. **False** — it is discarded (§2.1). The exposure claims (public + enumerable) are **correct**.
- Consequence: the audited concern that the fix "touches every client surface rendering a receipt image" rested on that false premise. The minimal fix touches **zero** client surfaces.

### 2.4 Adjacent finding (scope decision, §4 D3)

The persisted `imageUrl` is a Twilio media URL: (a) Twilio media links are unauthenticated-by-default on most accounts → a parallel, non-enumerable exposure; (b) Twilio media is deletable/retention-bound → admin receipt images have **no durable first-party copy**. Fixing this is optional scope (D3) but fits naturally in the same code path.

## 3. Remediation — two PRs, sweep first

**PR-A (data remediation — closes the LIVE exposure; independent of all code changes, ships first):**
One-off operator-run sweep script (`functions/scripts/` or `scripts/`, Admin SDK) that iterates `receipts/*` and `receipt-templates/*` objects in `merakicaptiveportal-firebasedb.appspot.com` and **revokes the `allUsers` ACL** on each (`file.acl.remove('allUsers')` / equivalent). Requirements:

- `--dry-run` default: list + count affected objects, no mutation. Mutating run requires an explicit flag.
- Idempotent; logs per-object outcome + summary counts; PII-free logging (object names only).
- **Verification step baked in:** unauthenticated `HEAD` against a sampled object before (expect 200) and after (expect 401/403) — the empirical probe is the acceptance test, per the PR-1a precedent.
- **Revoke, do NOT delete** (fork F1, §4).

**PR-B (code — stops NEW exposure):**

1. **Bytes-direct OCR:** replace the download → re-host → `makePublic()` → public-URL flow with `client.textDetection({ image: { content: buffer } })` — we already hold the buffer (`downloadAndStoreImage` downloads it). Kills the public ACL, the enumerable name, and (absent D3) the GCS write entirely.
2. Remove/neuter `downloadAndStoreImage`'s public path; same treatment for `receiptTemplateManager.js:386` (private object + no `makePublic`), even though currently unwired.
3. Regression guard (guard-first default): a vitest source-scan test asserting no `makePublic(` call exists under `functions/` (cheapest durable shape; an integration seam isn't needed to pin this class).
4. KB corrections in the same PR: fix `RECEIPT_PROCESSING.md:27`; update the backlog row + `status:sync`.

## 4. Decision forks (operator ratifies at PR review)

| # | Fork | Recommendation | Rationale |
|---|------|----------------|-----------|
| F1 | Sweep: revoke ACLs vs delete the orphaned objects | **Revoke, don't delete** | Objects are unreferenced, but they may be the only durable copies of receipt images (stored Twilio URLs expire / depend on Twilio retention). Deletion is a separate, reversible-never decision — park it with the retention ticket. |
| F2 | D3 — persist a **private** GCS copy going forward and serve admins via short-TTL signed URLs (new small CF; update the 2 admin consumers to call it) | **Yes, as part of PR-B if appetite allows; else follow-up PR** | Fixes the Twilio-URL durability + default-public adjacency (§2.4) in the same code path we're already editing. Naming: `receipts/{receiptId}/{uuid}.jpg` — unguessable, keyed to the RTDB record. Nothing parses the current names (verified), so the change is uncoupled. |
| F3 | Template producer (`uploadTemplateImage`) — fix in place vs delete dead code | **Fix in place (1-line private upload), flag deadness in the PR** | Deleting an exported-but-unwired function is refactor scope; the security property matters if it ever gets wired. |

## 5. Sequencing & verification

1. PR-A merged → operator runs sweep (dry-run → real) → **unauthenticated probe flips 200 → 403** → CRIT-09's live exposure is CLOSED (record the probe evidence in the backlog row).
2. PR-B merged + functions deploy → send a real WhatsApp receipt → confirm OCR works and **no new object appears with a public ACL** (or, with F2, a private object appears and the admin surface renders via signed URL).
3. Only then mark CRIT-09 closed — with the empirical evidence quoted, not tool-output absence (HIGH-08 / #168 lesson).

**Explicitly out of scope:** the `receipt-management.js` innerHTML XSS sink (own bug row), CRIT-05 (`receipts` RTDB root read — separate rules-batch lane), retention windows (existing ticket).
