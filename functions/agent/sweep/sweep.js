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
