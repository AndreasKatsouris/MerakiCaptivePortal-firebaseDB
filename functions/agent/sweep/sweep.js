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
const { onSchedule } = require('firebase-functions/v2/scheduler');

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
 * Gates follow rossChat.runGates (minus balance), with the dedup check folded in
 * after the enable gate. Killswitch is checked once globally in sweepAllOwners.
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

    // NOTE: if the send succeeds but this .set() throws, no marker persists → tomorrow
    // re-sends (at-least-once). Acceptable at daily cadence; revisit if cadence tightens.
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
            // Prefer err.code: a Twilio error's .message can embed the recipient
            // phone number (PII) — its .code is a safe numeric id. Non-Twilio
            // errors here (RTDB, unknown channel) have PII-free messages.
            const detail = err.code != null ? `code=${err.code}` : err.message;
            console.error(`[rossProactiveSweep] ${uid}: error at sweep — ${detail}`);
        }
    }
    return summary;
}

// Daily 07:00 SAST — morning digest before service prep (spec §2 cadence).
const rossProactiveSweep = onSchedule(
    { schedule: '0 7 * * *', timeZone: 'Africa/Johannesburg' },
    async () => {
        const s = await sweepAllOwners(Date.now());
        console.log(`[rossProactiveSweep] done: ${JSON.stringify(s)}`);
    },
);

module.exports = {
    rossProactiveSweep,
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
