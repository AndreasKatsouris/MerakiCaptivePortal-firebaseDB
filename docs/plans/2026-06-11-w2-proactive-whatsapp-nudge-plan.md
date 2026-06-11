# W2 Proactive WhatsApp Nudge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily scheduled Cloud Function (`rossProactiveSweep`, 07:00 SAST) that reads each opted-in owner's workflow digest, picks the most urgent findings, and sends one templated WhatsApp message with a deep link to the worst finding's run page — silent when nothing is actionable.

**Architecture:** Deterministic delivery rail under the future `rossSweep` LLM engine (spec: `docs/plans/2026-06-10-w2-proactive-whatsapp-nudge-design.md`). Four units in `functions/agent/sweep/`: pure selector (digest → findings), pure formatter (findings → channel-neutral payload), a WhatsApp channel adapter over the existing `utils/whatsappClient.js`, and a scheduled orchestrator with rossChat-style gates and a per-day idempotency marker.

**Tech Stack:** Firebase Cloud Functions v2 (`onSchedule`), RTDB Admin SDK, Twilio content templates, vitest (run from REPO ROOT: `npx vitest run <path>`), in-memory fake RTDB (`functions/agent/__tests__/helpers/fake-rtdb.js`, exports `makeFakeRtdb(seed)`).

**Ground truth already verified (do NOT re-derive):**
- Run-tab deep link `?tab=run&workflowId=&locationId=` is LIVE — `public/js/modules/ross/v2/components/RossHome.vue:33-37` parses it, `detectors.js:416` already builds such links. No client work.
- WhatsApp template variables reject **newlines** and **>4 consecutive spaces**; template body cannot **end with a parameter**. Hence: single-line `·`-joined findings, sanitized names, body ends with "— Ross".
- `buildHomeWorkflowDigest({ workflows, runs, clientToday, now })` exported from `functions/ross.js` — but `ross.js` is HEAVY at load (registers ~22 CFs, secrets) → **lazy-require inside the function** (pattern: `functions/agent/tools.js:91`).
- `sendWhatsAppTemplate(to, templateType, contentVariables, options)` in `functions/utils/whatsappClient.js:79` — falls back to freeform `buildFallbackMessage(templateType, Object.values(vars))` when `whatsapp-template-config/{type}` is absent/disabled. `utils/whatsappClient.js` is heavy at load (Twilio client from env) → lazy-require in the adapter.
- `normalizePhoneNumber` exported from `functions/dataManagement.js:232` (also heavy → lazy-require).
- Gates precedent: `functions/agent/rossChat.js:75-98` (`runGates`). The sweep implements its OWN 3-gate variant (no balance gate — no LLM spend; super-admin probe via RTDB `admins/{uid}/superAdmin` since there's no caller token on a schedule).
- Slice-7 rules shape for `ross/agent*` nodes is fully server-only: `".read": false, ".write": false` (`database.rules.json:585-600`). `proactiveLog` mirrors it.
- Scheduled CF precedent: `functions/agent/prune.js:101-104` + export `functions/index.js:3736`.
- Constants/paths: `functions/agent/constants.js` — `agentKillSwitchPath()`, `agentConfigPath(uid)`.

**Worktree note:** `functions/node_modules` is NOT inherited by a fresh worktree — run `cd functions && npm install` (~50s) before any deploy attempt (validated 3x pattern). Unit tests run from repo root and need root `node_modules` only, plus `functions/node_modules` for `firebase-functions` imports — install both (`npm install` at root AND in `functions/`) before starting.

**Shared-file coordination:** `functions/index.js` (Task 6) and `database.rules.json` (Task 7) are single-owner files also candidate for the parallel Payment Rail session. Before editing, check its branch (`git fetch && git log origin/master..origin/<payment-branch> --name-only` or ask the operator); if contended, serialize merges and rebase.

---

### Task 1: `nudge-selector.js` — pure digest → findings selection

**Files:**
- Create: `functions/agent/sweep/nudge-selector.js`
- Test: `functions/agent/__tests__/sweep-selector.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { selectFindings, MAX_FINDINGS } = require('../sweep/nudge-selector');

// Digest item shapes copied from buildHomeWorkflowDigest (functions/ross.js):
// overdue: { workflowId, locationId, name, locationName, nextDueDate, daysLate, requiredTaskCount }
// today:   { workflowId, locationId, name, locationName, nextDueDate, subState, requiredTaskCount }
const ov = (id, daysLate, loc = 'loc1', locName = 'The Grove') => ({
    workflowId: id, locationId: loc, name: `WF ${id}`, locationName: locName,
    nextDueDate: '2026-06-01', daysLate, requiredTaskCount: 3,
});
const td = (id, loc = 'loc1', locName = 'The Grove') => ({
    workflowId: id, locationId: loc, name: `WF ${id}`, locationName: locName,
    nextDueDate: '2026-06-11', subState: 'pending', requiredTaskCount: 2,
});

describe('selectFindings', () => {
    it('returns null for an empty/quiet digest (silent day)', () => {
        expect(selectFindings({ overdue: [], today: [], recentCompletions: [] })).toBeNull();
        expect(selectFindings(null)).toBeNull();
        expect(selectFindings({})).toBeNull();
    });

    it('orders overdue worst-first (daysLate desc), then due-today', () => {
        const sel = selectFindings({ overdue: [ov('a', 2), ov('b', 11)], today: [td('c')] });
        expect(sel.findings.map((f) => f.workflowId)).toEqual(['b', 'a', 'c']);
        expect(sel.findings[0]).toMatchObject({ kind: 'overdue', daysLate: 11 });
        expect(sel.findings[2]).toMatchObject({ kind: 'today' });
    });

    it('caps at MAX_FINDINGS with overflow count, total preserved', () => {
        const sel = selectFindings({
            overdue: [ov('a', 5), ov('b', 4), ov('c', 3)],
            today: [td('d'), td('e')],
        });
        expect(MAX_FINDINGS).toBe(3);
        expect(sel.findings).toHaveLength(3);
        expect(sel.overflow).toBe(2);
        expect(sel.total).toBe(5);
    });

    it('counts distinct locations across ALL findings (pre-cap)', () => {
        const sel = selectFindings({
            overdue: [ov('a', 5, 'loc1'), ov('b', 4, 'loc2', 'Sea Point')],
            today: [td('c', 'loc3', 'Obs'), td('d', 'loc1')],
        });
        expect(sel.locationCount).toBe(3);
    });

    it('drops malformed items (missing workflowId/locationId/name) instead of crashing', () => {
        const sel = selectFindings({ overdue: [ov('a', 5), { daysLate: 9 }], today: [{}] });
        expect(sel.findings.map((f) => f.workflowId)).toEqual(['a']);
        expect(sel.total).toBe(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (repo root): `npx vitest run functions/agent/__tests__/sweep-selector.test.js`
Expected: FAIL — `Cannot find module '../sweep/nudge-selector'`

- [ ] **Step 3: Write the implementation**

```js
'use strict';

/**
 * W2 proactive nudge — pure finding selection (deterministic MVP "brain").
 * Digest → ordered actionable findings, or null for a silent day.
 * The future rossSweep LLM engine replaces THIS module only; orchestrator,
 * formatter and channel adapters stay (spec §1).
 *
 * Spec: docs/plans/2026-06-10-w2-proactive-whatsapp-nudge-design.md §3, §5
 */

const MAX_FINDINGS = 3;

/** Map a digest bucket item to a finding; null if malformed. */
function toFinding(item, kind) {
    if (!item || !item.workflowId || !item.locationId || !item.name) return null;
    return {
        workflowId: item.workflowId,
        locationId: item.locationId,
        name: item.name,
        locationName: item.locationName || '',
        kind, // 'overdue' | 'today'
        daysLate: kind === 'overdue' ? (item.daysLate || 0) : 0,
    };
}

/**
 * @param {object|null} digest - buildHomeWorkflowDigest output
 * @returns {{findings:Array, overflow:number, total:number, locationCount:number}|null}
 */
function selectFindings(digest) {
    if (!digest || typeof digest !== 'object') return null;
    const overdue = (Array.isArray(digest.overdue) ? digest.overdue : [])
        .map((i) => toFinding(i, 'overdue'))
        .filter(Boolean)
        .sort((a, b) => b.daysLate - a.daysLate);
    const today = (Array.isArray(digest.today) ? digest.today : [])
        .map((i) => toFinding(i, 'today'))
        .filter(Boolean);
    const all = [...overdue, ...today];
    if (!all.length) return null;
    return {
        findings: all.slice(0, MAX_FINDINGS),
        overflow: Math.max(0, all.length - MAX_FINDINGS),
        total: all.length,
        locationCount: new Set(all.map((f) => f.locationId)).size,
    };
}

module.exports = { selectFindings, MAX_FINDINGS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run functions/agent/__tests__/sweep-selector.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add functions/agent/sweep/nudge-selector.js functions/agent/__tests__/sweep-selector.test.js
git commit -m "feat(sweep): pure nudge finding selector (overdue worst-first, cap 3, silent-day null)"
```

---

### Task 2: `nudge-formatter.js` — pure findings → channel-neutral payload

**Files:**
- Create: `functions/agent/sweep/nudge-formatter.js`
- Test: `functions/agent/__tests__/sweep-formatter.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { formatNudge } = require('../sweep/nudge-formatter');

const sel = (findings, extra = {}) => ({
    findings, overflow: 0, total: findings.length,
    locationCount: new Set(findings.map((f) => f.locationId)).size,
    ...extra,
});
const f = (over) => ({
    workflowId: 'wf1', locationId: 'loc1', name: 'Health & Safety Audit',
    locationName: 'Sea Point', kind: 'overdue', daysLate: 11, ...over,
});

describe('formatNudge', () => {
    it('single-location: no per-item location, no "across N locations"', () => {
        const p = formatNudge({ firstName: 'Andreas', selection: sel([f(), f({ workflowId: 'wf2', name: 'Opening Checklist', kind: 'today', daysLate: 0 })]) });
        expect(p.countPhrase).toBe('2 workflows need attention');
        expect(p.findingsLine).toBe('Health & Safety Audit (11 days overdue) · Opening Checklist (due today)');
    });

    it('multi-location: per-item "at X" + "across N locations"', () => {
        const p = formatNudge({ firstName: 'Andreas', selection: sel([f(), f({ workflowId: 'wf2', locationId: 'loc2', locationName: 'The Grove', name: 'Stock Count', kind: 'today', daysLate: 0 })]) });
        expect(p.countPhrase).toBe('2 workflows need attention across 2 locations');
        expect(p.findingsLine).toBe('Health & Safety Audit at Sea Point (11 days overdue) · Stock Count at The Grove (due today)');
    });

    it('singular phrasing and 1-day overdue', () => {
        const p = formatNudge({ firstName: 'Andreas', selection: sel([f({ daysLate: 1 })]) });
        expect(p.countPhrase).toBe('1 workflow needs attention');
        expect(p.findingsLine).toBe('Health & Safety Audit (1 day overdue)');
    });

    it('overflow suffix', () => {
        const p = formatNudge({ firstName: 'A', selection: sel([f()], { overflow: 4, total: 5 }) });
        expect(p.findingsLine).toMatch(/…and 4 more$/);
        expect(p.countPhrase).toMatch(/^5 workflows/);
    });

    it('deep-link query targets the WORST (first) finding, URL-encoded', () => {
        const p = formatNudge({ firstName: 'A', selection: sel([f({ workflowId: 'wf 1&x', locationId: 'l/1' })]) });
        expect(p.linkQuery).toBe(`tab=run&workflowId=${encodeURIComponent('wf 1&x')}&locationId=${encodeURIComponent('l/1')}`);
    });

    it('sanitizes user-supplied names: newlines/multi-spaces collapsed (template vars reject them)', () => {
        const p = formatNudge({
            firstName: ' Andreas\n',
            selection: sel([f({ name: 'Audit\nwith  \t breaks', locationName: 'Sea\nPoint', locationId: 'loc1' }),
                            f({ workflowId: 'wf2', locationId: 'loc2', locationName: 'B', kind: 'today', daysLate: 0 })]),
        });
        expect(p.name).toBe('Andreas');
        expect(p.findingsLine).not.toMatch(/[\n\t]/);
        expect(p.findingsLine).not.toMatch(/ {2,}/);
    });

    it('falls back to "there" when no name', () => {
        expect(formatNudge({ firstName: '', selection: sel([f()]) }).name).toBe('there');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/agent/__tests__/sweep-formatter.test.js`
Expected: FAIL — `Cannot find module '../sweep/nudge-formatter'`

- [ ] **Step 3: Write the implementation**

```js
'use strict';

/**
 * W2 proactive nudge — pure payload formatter.
 * Channel-NEUTRAL output: { name, countPhrase, findingsLine, linkQuery } —
 * structured data, not a finished string, so each channel adapter renders
 * its own native shape (WhatsApp template vars now; Telegram/SMS later).
 *
 * Single-line discipline: WhatsApp template variables reject newlines and
 * >4 consecutive spaces (verified vs live Meta/Twilio docs 2026-06-11), and
 * workflow/location names are USER-SUPPLIED — sanitize every string.
 *
 * Spec: docs/plans/2026-06-10-w2-proactive-whatsapp-nudge-design.md §5
 */

/** Collapse all whitespace runs (incl. newlines/tabs) to single spaces. */
function sanitizeInline(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

function describeFinding(finding, multiLocation) {
    const name = sanitizeInline(finding.name);
    const at = multiLocation && finding.locationName
        ? ` at ${sanitizeInline(finding.locationName)}` : '';
    const status = finding.kind === 'overdue'
        ? `${finding.daysLate} day${finding.daysLate === 1 ? '' : 's'} overdue`
        : 'due today';
    return `${name}${at} (${status})`;
}

/**
 * @param {{firstName:string, selection:{findings:Array, overflow:number, total:number, locationCount:number}}} args
 * @returns {{name:string, countPhrase:string, findingsLine:string, linkQuery:string}}
 */
function formatNudge({ firstName, selection }) {
    const { findings, overflow, total, locationCount } = selection;
    const multiLocation = locationCount > 1;
    const plural = total !== 1;
    const countPhrase = `${total} workflow${plural ? 's' : ''} need${plural ? '' : 's'} attention`
        + (multiLocation ? ` across ${locationCount} locations` : '');
    let findingsLine = findings.map((f) => describeFinding(f, multiLocation)).join(' · ');
    if (overflow > 0) findingsLine += ` …and ${overflow} more`;
    const top = findings[0];
    const linkQuery = `tab=run&workflowId=${encodeURIComponent(top.workflowId)}`
        + `&locationId=${encodeURIComponent(top.locationId)}`;
    return { name: sanitizeInline(firstName) || 'there', countPhrase, findingsLine, linkQuery };
}

module.exports = { formatNudge, sanitizeInline };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run functions/agent/__tests__/sweep-formatter.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add functions/agent/sweep/nudge-formatter.js functions/agent/__tests__/sweep-formatter.test.js
git commit -m "feat(sweep): pure nudge formatter (channel-neutral payload, sanitized single-line)"
```

---

### Task 3: WhatsApp channel adapter

**Files:**
- Create: `functions/agent/sweep/channels/whatsapp.js`
- Test: `functions/agent/__tests__/sweep-channel-whatsapp.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { deliver, __setSenderForTests, ROSS_DAILY_DIGEST } = require('../sweep/channels/whatsapp');

describe('whatsapp channel adapter', () => {
    afterEach(() => __setSenderForTests(null));

    it('maps payload to contentVariables 1..4 and returns the message sid', async () => {
        const calls = [];
        __setSenderForTests(async (to, type, vars) => { calls.push({ to, type, vars }); return { sid: 'SM123' }; });
        const res = await deliver(
            { uid: 'u1', phone: '+27821234567' },
            { name: 'Andreas', countPhrase: '2 workflows need attention', findingsLine: 'A (due today) · B (1 day overdue)', linkQuery: 'tab=run&workflowId=w&locationId=l' },
        );
        expect(calls).toHaveLength(1);
        expect(calls[0].to).toBe('+27821234567');
        expect(calls[0].type).toBe(ROSS_DAILY_DIGEST);
        expect(calls[0].vars).toEqual({
            1: 'Andreas',
            2: '2 workflows need attention',
            3: 'A (due today) · B (1 day overdue)',
            4: 'tab=run&workflowId=w&locationId=l',
        });
        expect(res).toEqual({ ok: true, messageSid: 'SM123' });
    });

    it('propagates sender errors (orchestrator owns the catch)', async () => {
        __setSenderForTests(async () => { throw new Error('twilio down'); });
        await expect(deliver({ uid: 'u1', phone: 'x' }, { name: 'a', countPhrase: 'b', findingsLine: 'c', linkQuery: 'd' }))
            .rejects.toThrow('twilio down');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/agent/__tests__/sweep-channel-whatsapp.test.js`
Expected: FAIL — `Cannot find module '../sweep/channels/whatsapp'`

- [ ] **Step 3: Write the implementation**

```js
'use strict';

/**
 * W2 proactive nudge — WhatsApp channel adapter.
 * Owns everything WhatsApp-specific: the template type and the payload→
 * contentVariables mapping. utils/whatsappClient is heavy at load (Twilio
 * client from env) → lazy-required behind a test seam.
 *
 * Template `ross_daily_digest` (4 vars; body carries the fixed URL prefix
 * and the "— Ross" sign-off — a template body may not END with a variable):
 *   Morning {{1}} — {{2}}: {{3}}. Tap to sort the most urgent:
 *   https://merakicaptiveportal-firebasedb.web.app/ross.html?{{4}} — Ross
 */

const ROSS_DAILY_DIGEST = 'ross_daily_digest';

let _sender = null;
function getSender() {
    if (!_sender) {
        ({ sendWhatsAppTemplate: _sender } = require('../../../utils/whatsappClient'));
    }
    return _sender;
}
/** Test-only: inject a fake sendWhatsAppTemplate (null restores lazy real one). */
function __setSenderForTests(fn) { _sender = fn; }

/**
 * @param {{uid:string, phone:string}} owner
 * @param {{name:string, countPhrase:string, findingsLine:string, linkQuery:string}} payload
 * @returns {Promise<{ok:true, messageSid:string|null}>}
 */
async function deliver(owner, payload) {
    const vars = {
        1: payload.name,
        2: payload.countPhrase,
        3: payload.findingsLine,
        4: payload.linkQuery,
    };
    const message = await getSender()(owner.phone, ROSS_DAILY_DIGEST, vars);
    return { ok: true, messageSid: (message && message.sid) || null };
}

module.exports = { deliver, __setSenderForTests, ROSS_DAILY_DIGEST };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run functions/agent/__tests__/sweep-channel-whatsapp.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add functions/agent/sweep/channels/whatsapp.js functions/agent/__tests__/sweep-channel-whatsapp.test.js
git commit -m "feat(sweep): whatsapp channel adapter (ross_daily_digest template, injectable sender)"
```

---

### Task 4: `sweep.js` — pure helpers (date key, phone, first name)

**Files:**
- Create: `functions/agent/sweep/sweep.js` (helpers only this task; orchestration in Task 5)
- Test: `functions/agent/__tests__/sweep-helpers.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const { dateKeySAST, resolveOwnerPhone, resolveFirstName, __setNormalizeForTests } = require('../sweep/sweep');

describe('dateKeySAST', () => {
    it('uses SAST (UTC+2, no DST): 23:30 UTC is already tomorrow in SA', () => {
        // 2026-06-10T23:30:00Z = 2026-06-11 01:30 SAST
        expect(dateKeySAST(Date.UTC(2026, 5, 10, 23, 30))).toBe('2026-06-11');
        expect(dateKeySAST(Date.UTC(2026, 5, 10, 12, 0))).toBe('2026-06-10');
    });
});

describe('resolveOwnerPhone', () => {
    afterEach(() => __setNormalizeForTests(null));
    it('falls through phoneNumber → phone → businessPhone (menuLogic.js:79 chain), normalized', () => {
        __setNormalizeForTests((p) => `N:${p}`);
        expect(resolveOwnerPhone({ phoneNumber: '0821', phone: 'x' })).toBe('N:0821');
        expect(resolveOwnerPhone({ phone: '0832' })).toBe('N:0832');
        expect(resolveOwnerPhone({ businessPhone: '0843' })).toBe('N:0843');
    });
    it('returns null when no phone field', () => {
        expect(resolveOwnerPhone({})).toBeNull();
        expect(resolveOwnerPhone(null)).toBeNull();
    });
});

describe('resolveFirstName', () => {
    it('prefers firstName, then name/displayName first word, then email local-part', () => {
        expect(resolveFirstName({ firstName: 'Andreas' })).toBe('Andreas');
        expect(resolveFirstName({ name: 'Andreas Katsouris' })).toBe('Andreas');
        expect(resolveFirstName({ displayName: 'Andreas K' })).toBe('Andreas');
        expect(resolveFirstName({ email: 'andreas@askgroupholdings.com' })).toBe('andreas');
        expect(resolveFirstName({})).toBe('');
        expect(resolveFirstName(null)).toBe('');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/agent/__tests__/sweep-helpers.test.js`
Expected: FAIL — `Cannot find module '../sweep/sweep'`

- [ ] **Step 3: Write the implementation (sweep.js v1 — helpers + seams only)**

```js
'use strict';

/**
 * W2 proactive delivery — `rossProactiveSweep` (deterministic MVP).
 * Daily unattended sweep: per opted-in owner, read the workflow digest,
 * select+format the most urgent findings, deliver via channel adapter,
 * stamp an idempotency marker. Silent when nothing is actionable.
 *
 * Spec: docs/plans/2026-06-10-w2-proactive-whatsapp-nudge-design.md
 */

const admin = require('firebase-admin');

// SAST is UTC+2 year-round (no DST) — fixed offset is safe and avoids Intl cost.
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

// --- DB seam (matches rossChat/billing/agent) ---------------------------------
let _db = null;
function getDb() {
    if (!_db) _db = admin.database();
    return _db;
}
/** Test-only: inject an in-memory RTDB fake. */
function __setDbForTests(fake) { _db = fake; }

// --- phone normalization seam (dataManagement is heavy at load) ----------------
let _normalize = null;
function getNormalize() {
    if (!_normalize) ({ normalizePhoneNumber: _normalize } = require('../../dataManagement'));
    return _normalize;
}
function __setNormalizeForTests(fn) { _normalize = fn; }

/** Calendar date (YYYY-MM-DD) in SAST for marker keys + digest clientToday. */
function dateKeySAST(nowMs) {
    return new Date(nowMs + SAST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Owner phone via the users/{uid} fallback chain (menuLogic.js:79). Null if none. */
function resolveOwnerPhone(userData) {
    const raw = userData && (userData.phoneNumber || userData.phone || userData.businessPhone);
    if (!raw) return null;
    return getNormalize()(raw) || null;
}

/** Best-effort first name; '' lets the formatter fall back to "there". */
function resolveFirstName(userData) {
    if (!userData) return '';
    if (userData.firstName) return String(userData.firstName).trim();
    const full = userData.name || userData.displayName;
    if (full) return String(full).trim().split(/\s+/)[0];
    if (userData.email) return String(userData.email).split('@')[0];
    return '';
}

module.exports = {
    dateKeySAST,
    resolveOwnerPhone,
    resolveFirstName,
    __setDbForTests,
    __setNormalizeForTests,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run functions/agent/__tests__/sweep-helpers.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add functions/agent/sweep/sweep.js functions/agent/__tests__/sweep-helpers.test.js
git commit -m "feat(sweep): sweep helpers (SAST date key, owner phone/name resolution, db seam)"
```

---

### Task 5: `sweep.js` — orchestration (`sweepOwner` + `sweepAllOwners`)

**Files:**
- Modify: `functions/agent/sweep/sweep.js` (add orchestration + channel registry; keep Task 4 helpers)
- Test: `functions/agent/__tests__/sweep.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const sweep = require('../sweep/sweep');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

const NOW = Date.UTC(2026, 5, 11, 5, 0); // 07:00 SAST
const TODAY = '2026-06-11';

// Workflow/run shapes: minimal but field-faithful to ross/workflows/{uid} —
// nested {workflowId:{locations:{locationId:{...}}}} is FLATTENED by
// buildHomeWorkflowDigest's reader; here we exercise the REAL builder via the
// real `ross.js` lazy-require, so seed the REAL stored shape (verify against
// functions/ross.js buildHomeWorkflowDigest input contract before changing).
function seedOwner(uid, { overdueDays = 11 } = {}) {
    return {
        [`ross/agentConfig/${uid}`]: { proactive: { enabled: true, channel: 'whatsapp' } },
        [`users/${uid}`]: { firstName: 'Andreas', phoneNumber: '+27820000001' },
        [`subscriptions/${uid}/features/rossAgent`]: true,
        // NOTE TO IMPLEMENTER: build this seed by copying a digest-feeding
        // fixture from functions/agent/evals/__tests__/evals-fixtures.test.js
        // (it seeds ross/workflows + ross/runs shapes the digest builder reads).
    };
}

// To keep THIS suite independent of ross.js shapes, inject a digest seam:
describe('sweepOwner / sweepAllOwners', () => {
    let db, sent, channels;

    beforeEach(() => {
        sent = [];
        channels = { whatsapp: { deliver: async (owner, payload) => { sent.push({ owner, payload }); return { ok: true, messageSid: 'SM1' }; } } };
        sweep.__setChannelsForTests(channels);
        sweep.__setNormalizeForTests((p) => p);
        sweep.__setDigestForTests(async () => ({
            overdue: [{ workflowId: 'w1', locationId: 'l1', name: 'Audit', locationName: 'Grove', nextDueDate: '2026-05-31', daysLate: 11, requiredTaskCount: 1 }],
            today: [], recentCompletions: [], upcoming: null, hasActiveWorkflows: true, activeWorkflowCount: 1,
        }));
    });
    afterEach(() => {
        sweep.__setChannelsForTests(null);
        sweep.__setNormalizeForTests(null);
        sweep.__setDigestForTests(null);
        sweep.__setDbForTests(null);
    });

    function seed(extra = {}) {
        db = makeFakeRtdb({
            ross: {
                agentConfig: { u1: { proactive: { enabled: true, channel: 'whatsapp' } } },
                config: {},
            },
            users: { u1: { firstName: 'Andreas', phoneNumber: '+27820000001' } },
            subscriptions: { u1: { features: { rossAgent: true } } },
            ...extra,
        });
        sweep.__setDbForTests(db);
    }

    it('happy path: sends one nudge and stamps the idempotency marker', async () => {
        seed();
        const summary = await sweep.sweepAllOwners(NOW);
        expect(summary).toMatchObject({ scanned: 1, sent: 1, errors: 0 });
        expect(sent).toHaveLength(1);
        expect(sent[0].owner).toEqual({ uid: 'u1', phone: '+27820000001' });
        expect(sent[0].payload.findingsLine).toContain('Audit (11 days overdue)');
        const marker = (await db.ref(`ross/proactiveLog/u1/${TODAY}`).once('value')).val();
        expect(marker).toMatchObject({ channel: 'whatsapp', messageSid: 'SM1', findingCount: 1, status: 'sent' });
    });

    it('global kill switch halts the whole sweep before any owner work', async () => {
        seed({ });
        await db.ref('ross/config/agentKillSwitch').set(true);
        const summary = await sweep.sweepAllOwners(NOW);
        expect(summary).toMatchObject({ halted: 'killswitch', sent: 0 });
        expect(sent).toHaveLength(0);
    });

    it('skips: not opted in / agent disabled / no entitlement / no phone / already sent today', async () => {
        seed();
        // not opted in
        await db.ref('ross/agentConfig/u1/proactive/enabled').set(false);
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(0);
        await db.ref('ross/agentConfig/u1/proactive/enabled').set(true);
        // agent disabled (rossChat gate (b) analogue)
        await db.ref('ross/agentConfig/u1/enabled').set(false);
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(0);
        await db.ref('ross/agentConfig/u1/enabled').set(null);
        // entitlement off and not super-admin
        await db.ref('subscriptions/u1/features/rossAgent').set(false);
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(0);
        // super-admin bypasses entitlement
        await db.ref('admins/u1/superAdmin').set(true);
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(1);
        sent.length = 0;
        // already sent today (marker just written) → dedup skip
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(0);
        // no phone
        await db.ref(`ross/proactiveLog/u1/${TODAY}`).set(null);
        await db.ref('users/u1').set({ firstName: 'A' });
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(0);
    });

    it('silent day: empty digest → no send, NO marker (nothing to dedup)', async () => {
        seed();
        sweep.__setDigestForTests(async () => ({ overdue: [], today: [], recentCompletions: [] }));
        const summary = await sweep.sweepAllOwners(NOW);
        expect(summary).toMatchObject({ sent: 0, silent: 1 });
        expect((await db.ref(`ross/proactiveLog/u1/${TODAY}`).once('value')).val()).toBeNull();
    });

    it('per-owner isolation: one owner throwing does not stop the next', async () => {
        seed({
            users: {
                u1: { firstName: 'A', phoneNumber: '+27820000001' },
                u2: { firstName: 'B', phoneNumber: '+27820000002' },
            },
            subscriptions: {
                u1: { features: { rossAgent: true } },
                u2: { features: { rossAgent: true } },
            },
        });
        await db.ref('ross/agentConfig/u2').set({ proactive: { enabled: true, channel: 'whatsapp' } });
        channels.whatsapp.deliver = async (owner) => {
            if (owner.uid === 'u1') throw new Error('boom');
            sent.push({ owner });
            return { ok: true, messageSid: 'SM2' };
        };
        const summary = await sweep.sweepAllOwners(NOW);
        expect(summary).toMatchObject({ sent: 1, errors: 1 });
        expect(sent[0].owner.uid).toBe('u2');
        // failed owner gets NO marker → tomorrow's sweep covers them
        expect((await db.ref(`ross/proactiveLog/u1/${TODAY}`).once('value')).val()).toBeNull();
    });

    it('unknown channel → skip with error count, no throw', async () => {
        seed();
        await db.ref('ross/agentConfig/u1/proactive/channel').set('telegram');
        const summary = await sweep.sweepAllOwners(NOW);
        expect(summary).toMatchObject({ sent: 0, errors: 1 });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/agent/__tests__/sweep.test.js`
Expected: FAIL — `sweep.sweepAllOwners is not a function`

- [ ] **Step 3: Add orchestration to sweep.js**

Append to `functions/agent/sweep/sweep.js` (after the Task 4 helpers, before `module.exports`), and extend the exports:

```js
const { agentKillSwitchPath } = require('../constants');
const { selectFindings } = require('./nudge-selector');
const { formatNudge } = require('./nudge-formatter');

// --- channel registry (lazy; injectable) ---------------------------------------
let _channels = null;
function getChannels() {
    if (!_channels) _channels = { whatsapp: require('./channels/whatsapp') };
    return _channels;
}
function __setChannelsForTests(c) { _channels = c; }

// --- digest seam: ross.js is heavy at load (registers ~22 CFs + secrets) -------
let _digest = null;
function getDigestFn() {
    if (!_digest) {
        _digest = async (uid, clientToday, now) => {
            const [wfSnap, runSnap] = await Promise.all([
                getDb().ref(`ross/workflows/${uid}`).once('value'),
                getDb().ref(`ross/runs/${uid}`).once('value'),
            ]);
            const { buildHomeWorkflowDigest } = require('../../ross'); // lazy (tools.js:91 pattern)
            return buildHomeWorkflowDigest({
                workflows: wfSnap.val() || {},
                runs: runSnap.val() || {},
                clientToday,
                now,
            });
        };
    }
    return _digest;
}
function __setDigestForTests(fn) { _digest = fn; }

/**
 * Sweep ONE owner. Returns a disposition string for the summary.
 * Gates mirror rossChat.runGates minus balance (no LLM spend):
 *   killswitch is checked once globally in sweepAllOwners.
 */
async function sweepOwner(uid, cfg, now) {
    const db = getDb();
    // (b) per-owner agent enable — only explicit false disables (rossChat parity).
    if (cfg && cfg.enabled === false) return 'skipped:agent-disabled';

    // dedup: already nudged today?
    const dateKey = dateKeySAST(now);
    const marker = await db.ref(`ross/proactiveLog/${uid}/${dateKey}`).once('value');
    if (marker.exists()) return 'skipped:already-sent';

    // (c) entitlement — super-admin probe via RTDB (no caller token on a schedule).
    const [feat, superAdmin] = await Promise.all([
        db.ref(`subscriptions/${uid}/features/rossAgent`).once('value'),
        db.ref(`admins/${uid}/superAdmin`).once('value'),
    ]);
    if (feat.val() !== true && superAdmin.val() !== true) return 'skipped:not-entitled';

    // owner contact
    const userSnap = await db.ref(`users/${uid}`).once('value');
    const userData = userSnap.val();
    const phone = resolveOwnerPhone(userData);
    if (!phone) return 'skipped:no-phone';

    // findings
    const digest = await getDigestFn()(uid, dateKey, now);
    const selection = selectFindings(digest);
    if (!selection) return 'silent'; // nothing actionable — no message, no marker

    const payload = formatNudge({ firstName: resolveFirstName(userData), selection });
    const channelId = (cfg && cfg.proactive && cfg.proactive.channel) || 'whatsapp';
    const adapter = getChannels()[channelId];
    if (!adapter) throw new Error(`unknown channel '${channelId}'`);

    const result = await adapter.deliver({ uid, phone }, payload);

    await db.ref(`ross/proactiveLog/${uid}/${dateKey}`).set({
        sentAt: now,
        findingCount: selection.findings.length,
        channel: channelId,
        messageSid: result.messageSid || null,
        status: 'sent',
    });
    return 'sent';
}

/**
 * The scheduled sweep body. Per-owner try/catch — one failure never stops the
 * loop. Logs uid + disposition only (NO phone numbers / message bodies — PII).
 */
async function sweepAllOwners(now) {
    const db = getDb();
    const summary = { scanned: 0, sent: 0, silent: 0, skipped: 0, errors: 0 };

    // (a) global kill switch — one switch stops ALL unattended Ross behaviour.
    const ks = await db.ref(agentKillSwitchPath()).once('value');
    if (ks.val() === true) return { ...summary, halted: 'killswitch' };

    const cfgSnap = await db.ref('ross/agentConfig').once('value');
    const allCfg = cfgSnap.val() || {};
    for (const [uid, cfg] of Object.entries(allCfg)) {
        if (!cfg || !cfg.proactive || cfg.proactive.enabled !== true) continue;
        summary.scanned += 1;
        try {
            const disposition = await sweepOwner(uid, cfg, now);
            if (disposition === 'sent') summary.sent += 1;
            else if (disposition === 'silent') summary.silent += 1;
            else summary.skipped += 1;
            console.log(`[rossProactiveSweep] ${uid}: ${disposition}`);
        } catch (err) {
            summary.errors += 1;
            console.error(`[rossProactiveSweep] ${uid}: error at sweep — ${err.message}`);
        }
    }
    return summary;
}
```

And extend `module.exports`:

```js
module.exports = {
    dateKeySAST,
    resolveOwnerPhone,
    resolveFirstName,
    sweepOwner,
    sweepAllOwners,
    __setDbForTests,
    __setNormalizeForTests,
    __setChannelsForTests,
    __setDigestForTests,
};
```

- [ ] **Step 4: Run the new suite AND the prior sweep suites**

Run: `npx vitest run functions/agent/__tests__/sweep.test.js functions/agent/__tests__/sweep-helpers.test.js`
Expected: PASS (helpers unaffected; ~6 new tests green)

- [ ] **Step 5: Commit**

```bash
git add functions/agent/sweep/sweep.js functions/agent/__tests__/sweep.test.js
git commit -m "feat(sweep): sweep orchestration — gates, dedup marker, per-owner isolation, channel dispatch"
```

---

### Task 6: Scheduled CF + index.js export + template registration

**Files:**
- Modify: `functions/agent/sweep/sweep.js` (add `onSchedule` wrapper)
- Modify: `functions/index.js:3736` area (one export line — ⚠ SHARED FILE, check payment-rail session first)
- Modify: `functions/utils/whatsappTemplates.js` (TEMPLATE_TYPES entry + fallback case)
- Test: `functions/agent/__tests__/sweep.test.js` (export presence assertion)

- [ ] **Step 1: Add the scheduled wrapper to sweep.js**

Add near the top: `const { onSchedule } = require('firebase-functions/v2/scheduler');`
Add before `module.exports` (timeZone form — clearer than the UTC-offset cron `rossAgentPrune` uses):

```js
// Daily 07:00 SAST — morning digest before service prep (spec §2 cadence).
const rossProactiveSweep = onSchedule(
    { schedule: '0 7 * * *', timeZone: 'Africa/Johannesburg' },
    async () => {
        const s = await sweepAllOwners(Date.now());
        console.log(`[rossProactiveSweep] done: ${JSON.stringify(s)}`);
    },
);
```

Add `rossProactiveSweep` to `module.exports`.

- [ ] **Step 2: Add the test**

Append to `functions/agent/__tests__/sweep.test.js`:

```js
describe('scheduled CF', () => {
    it('exports rossProactiveSweep', () => {
        expect(require('../sweep/sweep').rossProactiveSweep).toBeTruthy();
    });
});
```

Run: `npx vitest run functions/agent/__tests__/sweep.test.js` — Expected: PASS

- [ ] **Step 3: Export from index.js** (⚠ shared file — verify no payment-rail conflict first: `git fetch origin && git log origin/master --oneline -3`, and check any open payment PR's changed files)

After line 3736 (`exports.rossAgentPrune = ...`):

```js
exports.rossProactiveSweep = require('./agent/sweep/sweep').rossProactiveSweep;
```

- [ ] **Step 4: Register the template type + fallback**

In `functions/utils/whatsappTemplates.js`:

(a) Add to `TEMPLATE_TYPES` (line 14-25):

```js
    ROSS_DAILY_DIGEST: 'ross_daily_digest'
```

(b) Add a case to `buildFallbackMessage` (line 324+) — the fallback is freeform (multi-line allowed) and is what the founder soak uses until the Twilio template is approved. `params` arrives as `Object.values(contentVariables)` = `[name, countPhrase, findingsLine, linkQuery]`:

```js
        case TEMPLATE_TYPES.ROSS_DAILY_DIGEST:
            return `☀️ Morning ${params[0]} — ${params[1]}:\n\n${params[2]}\n\nTap to sort the most urgent:\nhttps://merakicaptiveportal-firebasedb.web.app/ross.html?${params[3]}\n\n— Ross`;
```

(NOTE: confirm the production hosting domain before deploy — if a custom domain fronts ross.html, use it here AND in the Twilio template body. Single source: keep the URL only in these two places.)

- [ ] **Step 5: Full functions suite + commit**

Run: `npx vitest run functions/`
Expected: ALL PASS (no regressions — ~196 existing + ~20 new)

```bash
git add functions/agent/sweep/sweep.js functions/agent/__tests__/sweep.test.js functions/index.js functions/utils/whatsappTemplates.js
git commit -m "feat(sweep): rossProactiveSweep scheduled CF (07:00 SAST) + template registration + export"
```

---

### Task 7: RTDB rules for `ross/proactiveLog`

**Files:**
- Modify: `database.rules.json` (⚠ SHARED FILE — same coordination check as Task 6)

- [ ] **Step 1: Add the rule** — inside the `ross` block, after `agentPending` (line 597-600), mirroring the slice-7 server-only shape exactly (Admin SDK bypasses rules; CF is the only writer/reader):

```json
      "proactiveLog": {
        ".read": false,
        ".write": false
      }
```

- [ ] **Step 2: Validate the rules file parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('database.rules.json','utf8')); console.log('rules JSON ok')"`
Expected: `rules JSON ok`

(Writer census not required: brand-new node, zero existing writers — verified by `rg "proactiveLog" --include=*.js --include=*.html --include=*.vue public/` returning nothing. Run that grep anyway to confirm.)

- [ ] **Step 3: Commit**

```bash
git add database.rules.json
git commit -m "feat(rules): ross/proactiveLog server-only (mirrors slice-7 agent* nodes)"
```

---

### Task 8: Docs

**Files:**
- Modify: `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md` AND `public/kb/api/CLOUD_FUNCTIONS_CATALOG.md` if that copy exists (check: `ls public/kb/api/` — the catalog has TWO copies that must stay in sync; PR #118 lesson)
- Modify: `public/kb/features/ROSS.md`

- [ ] **Step 1: Catalog entry** (both copies) — add under the ROSS/agent section:

```markdown
| `rossProactiveSweep` | scheduled (daily 07:00 SAST) | W2 proactive nudge: per opted-in owner (`ross/agentConfig/{uid}/proactive.enabled`), reads the workflow digest, sends one WhatsApp `ross_daily_digest` template (worst-first findings, deep link to the top finding's run page). Gates: kill switch → agent enable → rossAgent entitlement (RTDB super-admin bypass). Idempotent per day via `ross/proactiveLog/{uid}/{YYYY-MM-DD}`. Silent when nothing actionable. No LLM, no billing. |
```

- [ ] **Step 2: ROSS.md** — add a short "Proactive delivery (W2 MVP)" subsection: cadence, opt-in node shape `{ proactive: { enabled, channel } }`, silent-if-empty, marker node, channel adapter seam, pointer to the spec doc.

- [ ] **Step 3: Commit**

```bash
git add "KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md" public/kb/
git commit -m "docs(sweep): catalog + ROSS.md entries for rossProactiveSweep"
```

---

### Task 9: Build + full suite + PR

- [ ] **Step 1:** `npm run build` — Expected: green (no client changes, but mandatory pre-merge bar)
- [ ] **Step 2:** `npx vitest run functions/` — Expected: ALL PASS
- [ ] **Step 3:** Pre-push self-review (CLAUDE.md Step 5b): re-read the diff; grep LESSONS for `whatsapp`, `onSchedule`, `template`; confirm every RTDB field read in sweep.js matches a verified write path; confirm no `console.log` leaks phone/message-body PII.
- [ ] **Step 4:** Push + PR with test plan; include the spec + plan doc links and the deploy/seed checklist below in the PR body.

```bash
git push -u origin <branch>
gh pr create --title "feat(sweep): W2 proactive WhatsApp daily nudge (rossProactiveSweep)" --body "<summary + test plan + deploy checklist>"
```

---

### Task 10: Deploy + seed + smoke (operator-gated — do NOT run unprompted)

Ordered checklist for the PR body / post-merge session:

1. `cd functions && npm install` (worktree gotcha — validated 3x).
2. Deploy: `firebase deploy --only functions:rossProactiveSweep` (note: any undeployed `defineSecret` anywhere blocks ALL deploys — ANTHROPIC_API_KEY etc. already provisioned; coordinate with payment session if it adds new secrets).
3. Deploy rules: `firebase deploy --only database` (AFTER confirming no contention with the payment branch).
4. Seed founder opt-in (Windows-safe REST PATCH, 2026-06-02 lesson):
   `curl -X PATCH -d '{"enabled":true,"channel":"whatsapp"}' "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com/ross/agentConfig/<FOUNDER_UID>/proactive.json?access_token=$(gcloud auth print-access-token)"`
5. Submit the Twilio content template (operator, via Twilio Console → Content Template Builder):
   - Name `ross_daily_digest`, category UTILITY, language en.
   - Body: `Morning {{1}} — {{2}}: {{3}}. Tap to sort the most urgent: https://merakicaptiveportal-firebasedb.web.app/ross.html?{{4}} — Ross`
   - On approval, seed: `whatsapp-template-config/ross_daily_digest = { "enabled": true, "contentSid": "HX…" }` (same REST PATCH form).
   - UNTIL approved: sends use the freeform fallback, which only delivers inside a 24-hour session — message the bot from the founder phone first, or wait for approval. This is the known external long-pole.
6. Smoke: temporarily trigger (`gcloud scheduler jobs run` on the sweep's job, or redeploy with a near-future cron) → WhatsApp arrives on founder phone → deep link opens the right run page → `ross/proactiveLog/<uid>/<today>` marker present → re-trigger → log shows `skipped:already-sent`.
7. Soak 1–2 weeks, then widen (separate slice).

---

## Self-review notes (done at plan time)

- **Spec coverage:** §2 in-scope items → Tasks 1–7 (selector/formatter/adapter/orchestrator/CF/rules), §5 template → Tasks 3+6+10.5, §6 error handling → Task 5 tests, §7 testing → Tasks 1–6, §8 rollout → Task 10. Deep-link client work: verified NOT needed (RossHome.vue:33). §10 channel exploration: explicitly out of build scope.
- **Type consistency:** `selection = { findings, overflow, total, locationCount }` (Task 1) consumed by `formatNudge` (Task 2) and `sweepOwner` (Task 5); payload `{ name, countPhrase, findingsLine, linkQuery }` (Task 2) consumed by the adapter (Task 3) and fallback params order (Task 6 Step 4). Verified consistent.
- **Honest gap:** the Task 5 suite uses a digest SEAM rather than the real `buildHomeWorkflowDigest` (keeps the suite independent of ross.js load weight). The real integration is covered by the deploy smoke (Task 10.6) + the digest builder's own existing tests. If the implementer wants belt-and-braces, one extra test may seed real `ross/workflows` shapes copied from `functions/agent/evals/__tests__/evals-fixtures.test.js` and run without the seam.
