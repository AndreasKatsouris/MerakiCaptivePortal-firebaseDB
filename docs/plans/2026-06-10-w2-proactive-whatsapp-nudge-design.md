# W2 Proactive Delivery — Deterministic WhatsApp Daily Nudge (MVP)

**Date:** 2026-06-10
**Status:** Approved design (operator-reviewed in session)
**Owner wheel:** W2 — Proactive delivery ("Ross comes to the owner"), from the 2026-06-08 launch-gate reframe
**Builds toward:** the v2 proactive `rossSweep` Agent-SDK engine (`docs/plans/2026-05-31-askross-agent-design.md` §1.1); this slice is the delivery rail it will later drive

---

## 1. Goal & staging decision

A busy owner never opens a chat tab. W2's unproven hypothesis is **distribution** — will an owner opt in, receive, read, and act on a WhatsApp nudge? — not reasoning. So the MVP is **deterministic**: a daily scheduled Cloud Function reads each opted-in owner's workflow digest, picks the most urgent findings, and sends one templated WhatsApp message with a deep link straight to the workflow that needs doing.

**Staging rationale (locked with operator 2026-06-10):**
- The delivery rail (opt-in, phone resolution, template send, cron, dedup, quiet logic) is needed by both the deterministic and LLM versions — ~90% of this slice is reusable under `rossSweep`.
- Ross's live agent tools today see only workflows/staff/runs — an LLM sweep would spend ~50¢/run to rediscover what `buildHomeWorkflowDigest` computes in one read. The LLM engine's value scales with W1 (capability breadth); build it after W1.
- An unattended LLM with a wallet (per-run billing, budget caps, exhaustion hooks) should arrive only once the delivery loop is boring and proven.
- Zero billing-code contact in this slice → no contention with the parallel ③ Payment Rail session.

When `rossSweep` arrives, it replaces only `nudge-selector.js` (the "what matters today" brain); orchestrator, formatter, channel adapters, opt-in, and idempotency all carry over.

## 2. Scope

**In:**
- New scheduled CF `rossProactiveSweep` — daily 07:00 SAST (`0 5 * * *` UTC), silent when nothing is actionable.
- Pure selector + formatter modules; channel-adapter seam with a WhatsApp adapter over the existing `utils/whatsappClient.js`.
- Per-owner opt-in at `ross/agentConfig/{uid}/proactive` (server-only writes, slice-7 rules pattern). Seeded ON for the founder uid only.
- Idempotency marker `ross/proactiveLog/{uid}/{YYYY-MM-DD}` + RTDB rules for the new node.
- New approved WhatsApp content template (`ross_daily_digest`) registered in `whatsapp-template-config/`.
- Run-page deep-link support: `ross.html?tab=run&workflowId=…&locationId=…` (add client param handling if it doesn't exist — verify first, see §9).

**Out (deliberately):**
- The `rossSweep` LLM engine, billing, budget caps (next major slice, after W1).
- Opt-in UI toggle (widening slice, after the founder soak).
- Telegram / dedicated Ross-branded WhatsApp sender (follow-up exploration, §10).
- Evening sweep / twice-daily cadence (tunable later; cron + constants).
- New findings sources beyond the workflow digest (W1 territory).

## 3. Architecture

New directory **`functions/agent/sweep/`** — sibling to `rossChat.js`; both are consumers of the engine-agnostic agent core.

| File | Role | Pure? |
|------|------|-------|
| `sweep.js` | `rossProactiveSweep` scheduled CF (`onSchedule('0 5 * * *')`, precedent: `rossAgentPrune`) + per-owner orchestration | No (RTDB; Twilio via adapter) |
| `nudge-selector.js` | digest → ordered findings (overdue worst-first by `daysLate`, then due-today), cap 3 + "…and N more", or `null` = silent day | Yes |
| `nudge-formatter.js` | findings → message payload `{ name, countPhrase, findingsLine, link }` | Yes |
| `channels/whatsapp.js` | thin adapter: payload → `sendWhatsAppTemplate(phone, 'ross_daily_digest', vars)` | No |

The orchestrator dispatches via a small channel registry — `deliver(channelId, owner, payload)` — so Telegram later is one new adapter file. This registry is the slice's only speculative structure, kept deliberately because the sender-identity question (§10) is real.

**Per-owner gate order (mirrors `rossChat`'s `runGates`):**
1. Global kill switch `ross/config/agentKillSwitch` — halts ALL unattended Ross behaviour, everyone.
2. Per-owner opt-in `ross/agentConfig/{uid}/proactive.enabled === true`.
3. `subscriptions/{uid}/features/rossAgent === true` entitlement — super-admin skip, same as rossChat (this is what lets the founder account soak before the Free-tier flip).
4. ~~Balance~~ — not applicable; this slice spends no LLM tokens.

## 4. Data model & flow

- **Opt-in node:** `ross/agentConfig/{uid}/proactive = { enabled: true, channel: 'whatsapp' }`. Extends the existing agentConfig node; server-only writes already enforced by the slice-7 rules. Seeded for the founder uid via one-off admin write (REST PATCH per the 2026-06-02 Windows lesson).
- **Owner discovery:** read `ross/agentConfig` once, filter `proactive.enabled === true`. Linear scan — fine at founder/hundreds scale; at thousands, promote to an index node `ross/proactiveIndex/{uid}` (known scale lever, not built now).
- **Phone resolution:** `users/{uid}/phoneNumber || phone || businessPhone` (existing fallback chain, `menuLogic.js:79`), normalized via the existing helper. Missing phone → structured log + skip.
- **Findings:** `buildHomeWorkflowDigest` (`functions/ross.js`) reused byte-for-byte — same parallel workflows+runs reads the agent's `getWorkflowDigest` tool uses. Each finding already carries `locationId`, `locationName`, `nextDueDate`, `daysLate`.
- **Idempotency:** `ross/proactiveLog/{uid}/{YYYY-MM-DD} = { sentAt, findingCount, channel, messageSid, status }`, written **after** a successful send. Cron retry same day → marker exists → skip. Failed send → no marker → tomorrow's sweep covers it (daily cadence makes same-day retry machinery unnecessary). Add to `rossAgentPrune`'s sweep later if growth warrants (1 node/owner/day).
- **Flow:** cron → list opted-in owners → per owner: gates → sent-today check → digest → selector (`null` → silent skip) → formatter → channel adapter → marker write. Each owner wrapped in try/catch; one failure never kills the sweep for the rest.

## 5. Message, template & deep link

**Template `ross_daily_digest` — four variables:**

> Morning {{1}} — {{2}}: {{3}}. Tap to sort the most urgent: {{4}}

| Var | Content | Example |
|-----|---------|---------|
| 1 | First name (displayName local-part fallback) | `Andreas` |
| 2 | Count phrase; carries location spread for group owners | `3 workflows need attention across 2 locations` / `2 workflows need attention` |
| 3 | Findings line, `·`-separated, worst-first, cap 3 + `…and N more` | `Health & Safety Audit at Sea Point (11 days overdue) · Opening Checklist at The Grove (due today)` |
| 4 | Deep link to the WORST finding's run page | `https://merakicaptiveportal-firebasedb.web.app/ross.html?tab=run&workflowId=…&locationId=…` |

**Multi-location rules (locked with operator):**
- One message per owner, never per location — a 5-restaurant owner gets one digest, not 5 pings.
- Worst-first ordering is global across locations (an 11-days-overdue audit at Sea Point outranks a due-today item at The Grove).
- Group owners: per-item `at <location>` labels + `across N locations` count phrase. Single-location owners: formatter drops both — same template, different variable strings.
- Deep link targets the single most urgent finding (a run is inherently (workflow, location) — always precise). The rest are named in the body, one tap away inside Ross.

**Constraints to honour:**
- Findings line is single-line `·`-separated — WhatsApp template variables reject newlines (re-verify against live Twilio docs at build time, §9, per the 2026-06-08 external-capability lesson).
- Silent-if-empty: no actionable findings → no message. Protects channel signal — every Ross ping means something. (Heartbeat/"all clear" variant deliberately rejected for MVP; revisit in soak.)
- Template registered in `whatsapp-template-config/ross_daily_digest` with the existing freeform-fallback path for dev. **Template approval submission is the external long-pole — submit as soon as wording is final.**

## 6. Error handling & security

- Per-owner try/catch with structured logs `{ uid, stage, error }`; loop continues.
- Fail-silent on missing data (no phone / no workflows / empty digest) — log + skip, never a crash or half-message.
- **No PII in logs:** uid + counts only; never phone numbers or message bodies (OWASP H-10 discipline, matching the inbound path).
- `ross/proactiveLog`: server-only `.write`, owner-scoped `.read` — same shape as slice-7 `ross/agent*` rules. New node → no writer census needed.
- Kill switch (`ross/config/agentKillSwitch`) covers the sweep — one switch stops all unattended Ross behaviour.
- No spend risk: zero LLM calls; worst case = 1 Twilio message per opted-in owner per day, structurally capped by the idempotency marker.

## 7. Testing

- **Unit (vitest, fake-rtdb, no Twilio, no emulator):**
  - selector: ordering across locations, cap + overflow phrase, due-today vs overdue precedence, silent-day `null`, malformed digest tolerance.
  - formatter: variable shapes, single- vs multi-location phrasing, link construction, name fallback.
  - orchestrator: gate order, kill-switch halt, opt-in filter, sent-today skip, per-owner isolation (one throw doesn't stop the loop), marker written only after successful send, no-phone skip.
- **Twilio adapter:** thin enough to be deploy-smoke-only (rossChat core/shell split precedent).
- **Smoke (founder):** deploy → trigger handler directly (or near-future cron) → real WhatsApp arrives with working deep link → marker present → re-trigger → dedup skip confirmed.

## 8. Rollout

1. Build + tests green + PR + review.
2. Submit `ross_daily_digest` template for approval (parallel with review).
3. Deploy CF + rules; seed founder opt-in.
4. **Founder soak 1–2 weeks:** timing right? silent-if-empty too quiet? deep link lands on the right surface? wording natural?
5. Widen: opt-in UI toggle slice (+ allowlist option) — separate PR.
6. Later: `rossSweep` LLM engine replaces `nudge-selector.js` behind the same rail (after W1).

## 9. Build-time verifications (do FIRST, they shape tasks)

1. **Run-tab deep link:** does `ross.html?tab=run` accept `workflowId`/`locationId` params today? If not, client param handling joins this slice's scope (small, client-side).
2. **Twilio template variable constraints:** newline rejection + max variable length against current live docs, before designing the findings line cap and submitting the template.
3. **`buildHomeWorkflowDigest` export surface:** confirm callable without the CF request context (it is — agent tool already does), and verify field shapes against the live write path per the field-verify discipline.
4. **Shared single-owner files:** `database.rules.json` + `functions/index.js` are also candidates for the parallel Payment Rail session — check its in-flight branch before touching; serialize if both need them.

## 10. Follow-up exploration (non-gating): sender identity & channels

The current production WhatsApp sender is registered as **"Ocean Basket The Grove"** — fine for the founder soak, wrong for real owners (Ross messages must come from Ross). Before widening past the soak, explore:
- **Dedicated Ross WhatsApp sender** — new Twilio number + WhatsApp Business registration + Meta business verification (lead time; brand-correct; same code path).
- **Telegram bot** — no template approval regime, free-form messages, instant setup; but SA restaurant owners live on WhatsApp — likely a complement, not a substitute.
- Decision owner: operator. The channel-adapter seam (§3) means either lands as one adapter file.

## 11. Future slices (explicitly deferred)

| Slice | Trigger |
|-------|---------|
| Opt-in UI toggle (profile/settings surface) | After founder soak validates the nudge |
| `rossSweep` LLM engine (Agent SDK, per-run billing, budget caps) | After W1 adapters give Ross something to reason over |
| Evening "what didn't get done" sweep / cadence tuning | Soak feedback |
| `ross/proactiveIndex` scale index | Owner count makes the agentConfig scan material |
| Ross-branded sender / Telegram adapter | Before widening past soak |
