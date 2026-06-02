/**
 * ROSS — Restaurant OS Service Cloud Functions
 * Workflow automation engine for restaurant operators
 *
 * Auth pattern: onRequest + Bearer token (mirrors projectManagement.js)
 *
 * @version 1.1.0
 * @created 2026-02-25
 * @updated 2026-03-24 — verifyUserOrAdmin for user-dashboard access
 */

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { corsOptions } = require('./cors-allowlist');
const cors = require('cors')(corsOptions);
const { validateTier, userCanActivate, filterTemplatesByTier } = require('./ross-tier');
const { buildWorkflowRecord, buildTaskFromSubtask } = require('./ross-workflow-builder');
const { countActiveWorkflows, workflowCapStatus } = require('./ross-workflow-cap');

// Lazy db accessor — deferred so unit tests can require this module without a
// live Firebase app being initialised at load time.  All CF handlers are
// invoked asynchronously and therefore always have a live app by the time they
// call db.ref().
let _db = null;
function getDb() {
    if (!_db) _db = admin.database();
    return _db;
}
// Alias: keeps the rest of the file unchanged while individual call-sites are
// migrated.  Any place that used `db.ref(...)` now calls `getDb().ref(...)`.
const db = new Proxy({}, { get: (_t, prop) => getDb()[prop] });

// ============================================
// CONSTANTS
// ============================================

const VALID_CATEGORIES = ['compliance', 'operations', 'growth', 'finance', 'hr', 'maintenance'];
const VALID_RECURRENCES = ['once', 'daily', 'weekly', 'monthly', 'quarterly', 'annually'];
const VALID_INPUT_TYPES = [
    'checkbox', 'text', 'number', 'temperature',
    'yes_no', 'dropdown', 'timestamp', 'photo', 'signature', 'rating'
];

// ============================================
// AUTH HELPERS
// ============================================

async function verifyAuthToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No valid authorization header');
    }
    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) throw new Error('No token in authorization header');
    return await admin.auth().verifyIdToken(idToken);
}

async function verifyAdmin(decodedToken) {
    const uid = decodedToken.uid;
    const snapshot = await db.ref(`admins/${uid}`).once('value');
    const userData = snapshot.val();
    if (!userData) throw new Error('Admin access required');
    return { uid, isSuperAdmin: !!userData.superAdmin };
}

async function verifyUserOrAdmin(decodedToken) {
    const uid = decodedToken.uid;

    // Check admin first (existing path)
    const adminSnapshot = await db.ref(`admins/${uid}`).once('value');
    const adminData = adminSnapshot.val();
    if (adminData) {
        return { uid, isAdmin: true, isSuperAdmin: !!adminData.superAdmin };
    }

    // Check subscription for ROSS access
    const subSnapshot = await db.ref(`subscriptions/${uid}/features`).once('value');
    const features = subSnapshot.val();
    if (features && (features.rossBasic || features.rossAdvanced)) {
        return { uid, isAdmin: false, isSuperAdmin: false };
    }

    throw new Error('Access denied: ROSS feature not available on your subscription');
}

async function verifySuperAdmin(decodedToken) {
    const { uid, isSuperAdmin } = await verifyAdmin(decodedToken);
    if (!isSuperAdmin) throw new Error('Super Admin access required');
    return uid;
}

function generateId() {
    return db.ref().push().key;
}

/**
 * Read the calling user's subscription tier from RTDB.
 * Source-of-truth field is `users/{uid}/tier` (written at signup per
 * registerUser CF). Returns null if missing — caller fails closed.
 */
async function readUserTier(uid) {
    try {
        const snap = await db.ref(`users/${uid}/tier`).once('value');
        const val = snap.val();
        return (typeof val === 'string') ? val : null;
    } catch (_err) {
        return null;  // fail closed
    }
}

/**
 * Write an audit-log entry when a tier gate denies a template
 * activation. Stored under ross/auditLog/templateActivationDenials/{pushId}.
 * Best-effort: a failed audit-log write does NOT block the response;
 * the user still gets their 403.
 */
async function logActivationDenial({ uid, email, templateId, templateName, userTier, templateTier }) {
    try {
        const entry = {
            uid,
            email: email || null,
            templateId,
            templateName: templateName || null,
            userTier: userTier || null,
            templateTier,
            timestamp: admin.database.ServerValue.TIMESTAMP,
        };
        await db.ref('ross/auditLog/templateActivationDenials').push(entry);
    } catch (err) {
        console.warn('[logActivationDenial] audit write failed (non-blocking):', err.message);
    }
}

/**
 * Verify the caller has access to every requested location.
 * Super admins bypass — they manage the entire platform.
 * All other users must have each locationId in userLocations/{uid}.
 *
 * @param {string} uid - Authenticated user ID
 * @param {string[]} locationIds - Location IDs to verify
 * @param {boolean} isSuperAdmin - Whether the caller is a super admin
 */
async function verifyLocationAccess(uid, locationIds, isSuperAdmin) {
    if (isSuperAdmin) return;
    const snap = await db.ref(`userLocations/${uid}`).once('value');
    const allowed = snap.val() || {};
    for (const locId of locationIds) {
        if (!allowed[locId]) {
            throw new Error(`Location access denied: ${locId}`);
        }
    }
}

/**
 * Read the materialized maxWorkflows limit for a user (Phase 7 ④a §8).
 * The resolver is the sole writer of subscriptions/{uid}/limits. Absent/null
 * ⇒ unlimited (cap inert until a tier defines it). Fails open (unlimited) on
 * read error — a transient read must never wrongly block a legitimate create.
 */
async function readUserMaxWorkflows(uid) {
    try {
        const snap = await db.ref(`subscriptions/${uid}/limits/maxWorkflows`).once('value');
        const val = snap.val();
        return (typeof val === 'number') ? val : null;
    } catch (_err) {
        return null; // fail open — unlimited
    }
}

/**
 * Enforce the active-workflow cap before a create/activate. SuperAdmin bypasses.
 * Returns the workflowCapStatus result ({ allowed, limit, current, unlimited }).
 *
 * NOTE — non-atomic (TOCTOU): the count read here and the subsequent workflow
 * write in the CF are separate operations, so two concurrent creates from the
 * same user could both pass and land one over the cap. Accepted: ROSS is a
 * single-operator-session product, so concurrent creates are near-zero, and the
 * cap is a soft entitlement gate (over-by-one self-heals on the next create +
 * the daily recompute). Strict enforcement would need a Firebase transaction on
 * a per-user counter — deliberately not added for this low-stakes limit. Do NOT
 * copy this pattern to a hard/billing limit without a transaction.
 */
async function checkWorkflowCap(uid, isSuperAdmin) {
    if (isSuperAdmin) return { allowed: true, unlimited: true };
    const [maxWorkflows, workflowsSnap] = await Promise.all([
        readUserMaxWorkflows(uid),
        db.ref(`ross/workflows/${uid}`).once('value'),
    ]);
    const activeCount = countActiveWorkflows(workflowsSnap.val());
    return workflowCapStatus({ maxWorkflows, activeCount, isSuperAdmin });
}

/**
 * Audit-log a workflow-cap denial. Best-effort (never blocks the 403).
 * Mirrors logActivationDenial.
 */
async function logWorkflowCapDenial({ uid, email, limit, current }) {
    try {
        await db.ref('ross/auditLog/workflowCapDenials').push({
            uid,
            email: email || null,
            limit,
            current,
            timestamp: admin.database.ServerValue.TIMESTAMP,
        });
    } catch (err) {
        console.warn('[logWorkflowCapDenial] audit write failed (non-blocking):', err.message);
    }
}

// ============================================
// LOCATION INDEX HELPERS
// ============================================
// /ross/workflowsByLocation/{locationId}/{workflowId} = ownerUid
//
// This index lets a caller resolve a workflow's owner uid given a
// (workflowId, locationId) pair, so any user with location access can
// read a workflow even if they didn't create it. Maintained on every
// workflow create / activate / delete; consulted at the start of every
// per-location operation. Pure mirror of the canonical workflow data.

function locationIndexUpdates(workflowId, ownerUid, locationIds) {
    const updates = {};
    locationIds.forEach(locId => {
        updates[`ross/workflowsByLocation/${locId}/${workflowId}`] = ownerUid;
    });
    return updates;
}

function locationIndexRemovals(workflowId, locationIds) {
    const updates = {};
    locationIds.forEach(locId => {
        updates[`ross/workflowsByLocation/${locId}/${workflowId}`] = null;
    });
    return updates;
}

/**
 * Resolve a workflow's owner uid from the location index.
 * Falls back to the caller's own workflows tree so legacy (pre-index)
 * workflows still work for their creator until the backfill runs.
 * Returns the owner uid string, or null if the workflow does not exist
 * at that location.
 */
async function resolveWorkflowOwner(workflowId, locationId, callerUid) {
    const indexed = await db.ref(`ross/workflowsByLocation/${locationId}/${workflowId}`).once('value');
    if (indexed.exists()) return indexed.val();
    const own = await db.ref(`ross/workflows/${callerUid}/${workflowId}/locations/${locationId}`).once('value');
    if (own.exists()) return callerUid;
    return null;
}

// =====================================================================
//  HOME WORKFLOW DIGEST helper (pure, exported for unit tests)
// =====================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HOME_DIGEST_RECENT_WINDOW_MS = MS_PER_DAY;

function _todayUTC(now) {
    return new Date(now).toISOString().slice(0, 10);
}

function _dateDiffDays(fromISO, toISO) {
    // positive when toISO > fromISO
    const f = Date.parse(fromISO + 'T00:00:00Z');
    const t = Date.parse(toISO + 'T00:00:00Z');
    if (Number.isNaN(f) || Number.isNaN(t)) return 0;
    return Math.round((t - f) / MS_PER_DAY);
}

function _latestRun(runsForPair) {
    if (!runsForPair || typeof runsForPair !== 'object') return null;
    let best = null;
    for (const r of Object.values(runsForPair)) {
        if (!r || typeof r !== 'object') continue;
        if (!best || (Number(r.startedAt) || 0) > (Number(best.startedAt) || 0)) {
            best = r;
        }
    }
    return best;
}

function _countRequiredTasks(tasks) {
    if (!tasks || typeof tasks !== 'object') return 0;
    let n = 0;
    for (const t of Object.values(tasks)) {
        if (t && t.required !== false) n++;
    }
    return n;
}

// Normalise nextDueDate to ISO date string ('YYYY-MM-DD').
//
// Existing ROSS workflows store nextDueDate as an epoch-ms NUMBER (see
// functions/ross.js lines 703, 1150, 1282, 1502 — all numeric arithmetic).
// Operator-edited values via Firebase Console may land as strings. Both
// shapes are normalised to the same ISO slice so the bucket comparisons
// (`<`, `===`, `>`) against `clientToday` work consistently.
//
// Returns null for unparseable input (caller skips with a warn).
function _normalizeNextDueDate(val) {
    if (typeof val === 'string' && val.length > 0) {
        // Accept either 'YYYY-MM-DD' or full ISO 'YYYY-MM-DDTHH:mm:ss...';
        // slice to the date portion.
        return val.slice(0, 10);
    }
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) {
        return new Date(n).toISOString().slice(0, 10);
    }
    return null;
}

// Count responses to REQUIRED tasks only. The donut on the in-progress
// card shows completed-of-required tasks; responses to optional tasks
// would inflate the numerator past 100%.
function _countCompletedRequiredTasks(run, tasks) {
    if (!run || !run.responses || typeof run.responses !== 'object') return 0;
    if (!tasks || typeof tasks !== 'object') return 0;
    let n = 0;
    for (const taskId of Object.keys(run.responses)) {
        const task = tasks[taskId];
        if (task && task.required !== false) n++;
    }
    return n;
}

function buildHomeWorkflowDigest({ workflows, runs, clientToday, now }) {
    const today = clientToday || _todayUTC(now);
    const safeWorkflows = (workflows && typeof workflows === 'object') ? workflows : {};
    const safeRuns = (runs && typeof runs === 'object') ? runs : {};

    const overdue = [];
    const todayBucket = [];
    const recentCompletions = [];

    const activeWorkflowIds = new Set();
    let upcoming = null;

    for (const [workflowId, w] of Object.entries(safeWorkflows)) {
        if (!w || typeof w !== 'object') continue;
        if (w.status === 'paused') continue;
        if (!w.locations || typeof w.locations !== 'object') {
            console.warn(`[ross] skipped malformed workflow ${workflowId}: no locations`);
            continue;
        }

        let workflowCountsAsActive = false;

        for (const [locationId, loc] of Object.entries(w.locations)) {
            if (!loc || typeof loc !== 'object') continue;
            const normalizedNextDueDate = _normalizeNextDueDate(loc.nextDueDate);
            if (!normalizedNextDueDate) {
                console.warn(`[ross] skipped malformed workflow ${workflowId}/${locationId}: nextDueDate=${JSON.stringify(loc.nextDueDate)}`);
                continue;
            }

            workflowCountsAsActive = true;
            const runsForPair = (safeRuns[workflowId] && safeRuns[workflowId][locationId]) || {};
            const latestRun = _latestRun(runsForPair);
            const requiredTaskCount = _countRequiredTasks(loc.tasks);
            const completedTaskCount = _countCompletedRequiredTasks(latestRun, loc.tasks);

            // Server schema reality (functions/ross.js rossCreateRun L1378-1389,
            // rossSubmitResponse L1511): runs have NO `status` field. The
            // lifecycle is encoded via `completedAt === null` (in-progress)
            // vs non-null (completed). The runId field is `id`, not `runId`.
            const runIsInProgress = !!latestRun && !latestRun.completedAt;
            const runIsCompleted = !!latestRun && !!latestRun.completedAt;
            const runIdField = latestRun ? (latestRun.id || latestRun.runId || null) : null;

            const nextDueMs = Date.parse(normalizedNextDueDate + 'T00:00:00Z');
            const runCoversCurrentPeriod = latestRun
                && Number.isFinite(nextDueMs)
                && Number(latestRun.startedAt) >= nextDueMs;

            const daysLate = _dateDiffDays(normalizedNextDueDate, today);
            const name = w.name || 'Workflow';
            const locationName = loc.locationName || 'Venue';

            const baseEntry = {
                workflowId, locationId, name, locationName,
                nextDueDate: normalizedNextDueDate,
            };

            if (normalizedNextDueDate < today && !runCoversCurrentPeriod) {
                overdue.push({ ...baseEntry, daysLate, requiredTaskCount });
            } else if (normalizedNextDueDate === today && runIsInProgress) {
                todayBucket.push({
                    ...baseEntry,
                    subState: 'in_progress',
                    runId: runIdField,
                    startedAt: Number(latestRun.startedAt) || 0,
                    completedTaskCount,
                    requiredTaskCount,
                });
            } else if (normalizedNextDueDate === today && !runCoversCurrentPeriod) {
                todayBucket.push({
                    ...baseEntry,
                    subState: 'pending',
                    requiredTaskCount,
                });
            } else if (runIsCompleted
                && (now - Number(latestRun.completedAt)) < HOME_DIGEST_RECENT_WINDOW_MS) {
                // Derive onTime / flaggedCount from run data — server writes
                // these to the history record, not the run itself.
                const onTime = Number.isFinite(nextDueMs)
                    ? Number(latestRun.completedAt) <= (nextDueMs + MS_PER_DAY)
                    : true;
                const responses = (latestRun.responses && typeof latestRun.responses === 'object') ? latestRun.responses : {};
                const flaggedCount = Object.values(responses).filter(r => r && r.flagged).length;
                recentCompletions.push({
                    ...baseEntry,
                    runId: runIdField,
                    completedAt: Number(latestRun.completedAt) || 0,
                    onTime,
                    flaggedCount,
                });
            }

            if (normalizedNextDueDate > today) {
                if (!upcoming || normalizedNextDueDate < upcoming.nextDueDate) {
                    upcoming = { ...baseEntry };
                }
            }
        }

        if (workflowCountsAsActive) activeWorkflowIds.add(workflowId);
    }

    overdue.sort((a, b) => b.daysLate - a.daysLate);
    todayBucket.sort((a, b) => {
        if (a.subState !== b.subState) return a.subState === 'in_progress' ? -1 : 1;
        if (a.nextDueDate !== b.nextDueDate) return a.nextDueDate < b.nextDueDate ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    recentCompletions.sort((a, b) => b.completedAt - a.completedAt);

    return {
        overdue,
        today: todayBucket,
        recentCompletions,
        hasActiveWorkflows: activeWorkflowIds.size > 0,
        activeWorkflowCount: activeWorkflowIds.size,
        upcoming,
        generatedAt: now,
    };
}

// ============================================
// TEMPLATE OPERATIONS (Super Admin managed)
// ============================================

/**
 * Fetch all templates with optional category filter
 * Access: All admins and subscribed users
 */
exports.rossGetTemplates = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { category, includeLocked } = data || {};

            const snapshot = await db.ref('ross/templates').once('value');
            const raw = snapshot.val() || {};
            let templates = Object.values(raw);

            if (category && VALID_CATEGORIES.includes(category)) {
                templates = templates.filter(t => t.category === category);
            }

            // Tier filter — Phase 6 PR 1A. SuperAdmin sees all; All-in sees all;
            // Free + missing-tier-user see only tier === 'free' templates.
            // PR 1C: callers can opt in to `includeLocked: true` to receive
            // All-in templates with a `locked: true` flag instead of being
            // filtered out — used by the v2 Playbook tab for the upsell UX.
            const userTier = await readUserTier(uid);
            templates = filterTemplatesByTier(templates, userTier, isSuperAdmin, includeLocked === true);

            templates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            res.json({ result: { success: true, templates } });
        } catch (error) {
            console.error('[rossGetTemplates] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Create a new template
 * Access: Super Admin only
 */
exports.rossCreateTemplate = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const uid = await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { name, category, description, recurrence, daysBeforeAlert, subtasks, tags, tier } = data;

            if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required' });
            if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
            const tierError = validateTier(tier);
            if (tierError) return res.status(400).json({ error: tierError });
            if (!VALID_RECURRENCES.includes(recurrence)) return res.status(400).json({ error: 'Invalid recurrence' });

            // Phase 4e.2: enforce inputType enum on each subtask so the
            // type can't sneak through the template path and silently
            // fall back at activation time.
            const subtaskTypeError = validateSubtasksInputTypes(subtasks);
            if (subtaskTypeError) return res.status(400).json({ error: subtaskTypeError });

            const templateId = generateId();
            const now = Date.now();

            const templateData = {
                templateId,
                name: name.trim(),
                category,
                tier,
                description: description?.trim() || '',
                recurrence,
                daysBeforeAlert: Array.isArray(daysBeforeAlert)
                    ? daysBeforeAlert.filter(d => Number.isInteger(d) && d > 0)
                    : [30, 7],
                subtasks: Array.isArray(subtasks) ? subtasks : [],
                notificationChannels: ['in_app'],
                tags: Array.isArray(tags) ? tags : [],
                createdAt: now,
                updatedAt: now
            };

            await db.ref(`ross/templates/${templateId}`).set(templateData);
            res.json({ result: { success: true, templateId, template: templateData } });
        } catch (error) {
            console.error('[rossCreateTemplate] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Update an existing template
 * Access: Super Admin only
 */
exports.rossUpdateTemplate = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const uid = await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { templateId, updates } = data;
            if (!templateId) return res.status(400).json({ error: 'Template ID is required' });
            if (!updates || typeof updates !== 'object') {
                return res.status(400).json({ error: 'updates object is required' });
            }

            const templateRef = db.ref(`ross/templates/${templateId}`);
            const snapshot = await templateRef.once('value');
            if (!snapshot.exists()) return res.status(404).json({ error: 'Template not found' });

            if (updates.category !== undefined && !VALID_CATEGORIES.includes(updates.category)) {
                return res.status(400).json({ error: 'Invalid category' });
            }
            if (updates.recurrence !== undefined && !VALID_RECURRENCES.includes(updates.recurrence)) {
                return res.status(400).json({ error: 'Invalid recurrence' });
            }
            if (updates.subtasks !== undefined) {
                const subtaskTypeError = validateSubtasksInputTypes(updates.subtasks);
                if (subtaskTypeError) return res.status(400).json({ error: subtaskTypeError });
            }
            if (updates.tier !== undefined) {
                const tierError = validateTier(updates.tier);
                if (tierError) return res.status(400).json({ error: tierError });
            }

            const allowedFields = ['name', 'category', 'tier', 'description', 'recurrence', 'daysBeforeAlert', 'subtasks', 'tags'];
            const sanitized = { updatedAt: Date.now() };
            allowedFields.forEach(field => {
                if (updates[field] !== undefined) sanitized[field] = updates[field];
            });

            await templateRef.update(sanitized);
            res.json({ result: { success: true, templateId } });
        } catch (error) {
            console.error('[rossUpdateTemplate] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Delete a template
 * Access: Super Admin only
 */
exports.rossDeleteTemplate = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const uid = await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { templateId } = data;
            if (!templateId) return res.status(400).json({ error: 'Template ID is required' });
            const existing = await db.ref(`ross/templates/${templateId}`).once('value');
            if (!existing.exists()) return res.status(404).json({ error: 'Template not found' });

            await db.ref(`ross/templates/${templateId}`).remove();
            res.json({ result: { success: true, templateId } });
        } catch (error) {
            console.error('[rossDeleteTemplate] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

// Validate inputType enum on every subtask in an array. Returns an
// error string or null. Used at every write path that accepts
// subtasks (rossCreateWorkflow, rossCreateTemplate, rossUpdateTemplate)
// so the enum is enforceable end-to-end. Without this, a hand-crafted
// client could write subtasks with `inputType: 'frobnicate'` to a
// template; rossActivateWorkflow would silently default to 'checkbox'
// and corrupt the policy.
function validateSubtasksInputTypes(subtasks) {
    if (!Array.isArray(subtasks)) return null;
    for (const s of subtasks) {
        if (s && s.inputType !== undefined && s.inputType !== null
            && !VALID_INPUT_TYPES.includes(s.inputType)) {
            return `Invalid inputType: ${s.inputType}. Must be one of: ${VALID_INPUT_TYPES.join(', ')}`;
        }
    }
    return null;
}

// ============================================
// WORKFLOW OPERATIONS
// ============================================

/**
 * Activate a template as a workflow (global parent + per-location tracking)
 * Access: All admins
 */
exports.rossActivateWorkflow = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { templateId, locationIds, locationNames, locationAssignedTo, name, description, nextDueDate, daysBeforeAlert, notifyPhone, notifyEmail, customInterval } = data;

            if (!templateId) return res.status(400).json({ error: 'Template ID is required' });
            if (!Array.isArray(locationIds) || locationIds.length === 0) return res.status(400).json({ error: 'At least one location ID is required' });
            if (!nextDueDate) return res.status(400).json({ error: 'Next due date is required' });

            await verifyLocationAccess(uid, locationIds, isSuperAdmin);

            const templateSnap = await db.ref(`ross/templates/${templateId}`).once('value');
            if (!templateSnap.exists()) return res.status(404).json({ error: 'Template not found' });
            const template = templateSnap.val();

            // Tier gate — Phase 6 PR 1A. SuperAdmin bypasses. Missing user tier
            // fails closed (treated as 'free'). Audit-log denials regardless.
            const userTier = await readUserTier(uid);
            if (!userCanActivate(userTier, template.tier, isSuperAdmin)) {
                await logActivationDenial({
                    uid,
                    email: decodedToken.email,
                    templateId,
                    templateName: template.name,
                    userTier,
                    templateTier: template.tier,
                });
                return res.status(403).json({
                    error: 'Template requires the All-in tier',
                });
            }

            // Workflow-cap gate — Phase 7 ④a §8. SuperAdmin bypasses; unlimited
            // when no tier defines maxWorkflows. Never yanks existing workflows —
            // only blocks new ones at cap (mirrors the downgrade policy).
            const activateCap = await checkWorkflowCap(uid, isSuperAdmin);
            if (!activateCap.allowed) {
                await logWorkflowCapDenial({ uid, email: decodedToken.email, limit: activateCap.limit, current: activateCap.current });
                return res.status(403).json({
                    error: `You've reached your plan's limit of ${activateCap.limit} active workflows. Upgrade or pause a workflow to add more.`,
                    code: 'WORKFLOW_LIMIT_REACHED',
                    limit: activateCap.limit,
                    current: activateCap.current,
                    upgradeUrl: '/upgrade.html',
                });
            }

            const { workflowId, workflowData, atomicWrite } = buildWorkflowRecord({
                template,
                locationIds,
                locationNames,
                locationAssignedTo,
                nextDueDate,
                uid,
                name,
                description,
                customInterval,
                daysBeforeAlert,
                notifyPhone,
                notifyEmail,
                workflowId: generateId(),
                validInputTypes: VALID_INPUT_TYPES,
                generateTaskId: generateId,
                now: Date.now(),
            });
            await db.ref().update(atomicWrite);
            res.json({ result: { success: true, workflowId, workflow: workflowData } });
        } catch (error) {
            console.error('[rossActivateWorkflow] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Day-zero auto-activation. Called by signup-service.js immediately
 * after the user's first location is created (covers both the
 * registerUser-callable success path AND the direct-RTDB-writes fallback
 * path). Server resolves locationId from userLocations/{uid}, reads
 * ross/config/firstWorkflowTemplateId pointer, fetches the template,
 * and atomically writes a seeded workflow + idempotency marker +
 * audit-log entry.
 *
 * Idempotency: onboarding-progress/{uid}/firstWorkflowSeededAt is
 * checked before any work and written inside the atomic update. The
 * CF is safe to call multiple times — subsequent calls return
 * { skipped: true, reason: 'already_seeded' }.
 *
 * Best-effort: every skip branch returns 200 with a structured reason.
 * The CALLER (signup-service.js) wraps its fetch in try/catch and
 * never blocks the signup flow on a seed failure.
 *
 * Access: authenticated user only.
 */
exports.rossSeedFirstWorkflow = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid } = await verifyUserOrAdmin(decodedToken);

            // Idempotency pre-check.
            const seededSnap = await db.ref(`onboarding-progress/${uid}/firstWorkflowSeededAt`).once('value');
            if (seededSnap.exists()) {
                console.warn('[rossSeedFirstWorkflow] skipped:', { uid, reason: 'already_seeded' });
                return res.json({ result: { skipped: true, reason: 'already_seeded' } });
            }

            // Resolve location from userLocations/{uid} — take the first owned location.
            const userLocsSnap = await db.ref(`userLocations/${uid}`).once('value');
            const userLocs = userLocsSnap.val() || {};
            const locationIds = Object.keys(userLocs);
            if (locationIds.length === 0) {
                console.warn('[rossSeedFirstWorkflow] skipped:', { uid, reason: 'no_locations' });
                return res.json({ result: { skipped: true, reason: 'no_locations' } });
            }
            const locationId = locationIds[0];

            // Resolve location name for the workflow record.
            const locationSnap = await db.ref(`locations/${locationId}`).once('value');
            const locationName = (locationSnap.val() && locationSnap.val().name) || locationId;

            // Resolve seed template via pointer.
            const pointerSnap = await db.ref('ross/config/firstWorkflowTemplateId').once('value');
            const seedTemplateId = pointerSnap.val();
            if (!seedTemplateId) {
                console.warn('[rossSeedFirstWorkflow] skipped:', { uid, reason: 'pointer_absent' });
                return res.json({ result: { skipped: true, reason: 'pointer_absent' } });
            }

            const templateSnap = await db.ref(`ross/templates/${seedTemplateId}`).once('value');
            if (!templateSnap.exists()) {
                console.warn('[rossSeedFirstWorkflow] skipped:', { uid, reason: 'template_missing', templateId: seedTemplateId });
                return res.json({ result: { skipped: true, reason: 'template_missing' } });
            }

            const template = templateSnap.val();
            if (template.tier && template.tier !== 'free') {
                console.warn('[rossSeedFirstWorkflow] skipped:', { uid, reason: 'tier_mismatch', templateTier: template.tier });
                return res.json({ result: { skipped: true, reason: 'tier_mismatch' } });
            }

            const now = Date.now();
            const seedWorkflowId = generateId();
            const generateTaskId = generateId;

            const { workflowId, atomicWrite } = buildWorkflowRecord({
                template,
                locationIds: [locationId],
                locationNames: [locationName],
                locationAssignedTo: null,
                nextDueDate: now,
                uid,
                name: null,
                description: null,
                customInterval: null,
                daysBeforeAlert: null,
                notifyPhone: null,
                notifyEmail: null,
                workflowId: seedWorkflowId,
                validInputTypes: VALID_INPUT_TYPES,
                generateTaskId,
                now,
            });

            atomicWrite[`onboarding-progress/${uid}/firstWorkflowSeededAt`] =
                admin.database.ServerValue.TIMESTAMP;
            const auditKey = db.ref('ross/auditLog/firstWorkflowSeeded').push().key;
            atomicWrite[`ross/auditLog/firstWorkflowSeeded/${auditKey}`] = {
                uid,
                templateId: seedTemplateId,
                workflowId,
                locationId,
                seededAt: admin.database.ServerValue.TIMESTAMP,
            };

            await db.ref().update(atomicWrite);
            console.log('[rossSeedFirstWorkflow] seeded:', { uid, workflowId, templateId: seedTemplateId, locationId });
            res.json({ result: { success: true, workflowId, templateId: seedTemplateId, locationId } });
        } catch (error) {
            console.error('[rossSeedFirstWorkflow] error:', error.message);
            const statusCode = (error.message.includes('access denied') || error.message.includes('Unauthorized')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Create a custom workflow from scratch (no template)
 * Access: All admins
 */
exports.rossCreateWorkflow = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { name, description, category, recurrence, customInterval, locationIds, locationNames, locationAssignedTo, nextDueDate, subtasks, daysBeforeAlert, notifyPhone, notifyEmail } = data;

            if (!name || !name.trim()) return res.status(400).json({ error: 'Workflow name is required' });
            if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
            if (!VALID_RECURRENCES.includes(recurrence)) return res.status(400).json({ error: 'Invalid recurrence' });
            if (!Array.isArray(locationIds) || locationIds.length === 0) return res.status(400).json({ error: 'At least one location ID is required' });
            if (!nextDueDate) return res.status(400).json({ error: 'Next due date is required' });

            // Phase 4e.2: enforce inputType enum on incoming subtasks.
            const subtaskTypeError = validateSubtasksInputTypes(subtasks);
            if (subtaskTypeError) return res.status(400).json({ error: subtaskTypeError });

            await verifyLocationAccess(uid, locationIds, isSuperAdmin);

            // Workflow-cap gate — Phase 7 ④a §8. SuperAdmin bypasses; unlimited
            // when no tier defines maxWorkflows. Only blocks new creates at cap.
            const createCap = await checkWorkflowCap(uid, isSuperAdmin);
            if (!createCap.allowed) {
                await logWorkflowCapDenial({ uid, email: decodedToken.email, limit: createCap.limit, current: createCap.current });
                return res.status(403).json({
                    error: `You've reached your plan's limit of ${createCap.limit} active workflows. Upgrade or pause a workflow to add more.`,
                    code: 'WORKFLOW_LIMIT_REACHED',
                    limit: createCap.limit,
                    current: createCap.current,
                    upgradeUrl: '/upgrade.html',
                });
            }

            const workflowId = generateId();
            const now = Date.now();

            const locations = {};
            locationIds.forEach((locationId, idx) => {
                const tasks = {};
                if (Array.isArray(subtasks)) {
                    subtasks.forEach(subtask => {
                        const taskId = generateId();
                        tasks[taskId] = buildTaskFromSubtask(subtask, nextDueDate, VALID_INPUT_TYPES);
                    });
                }
                locations[locationId] = {
                    locationName: (locationNames && locationNames[idx]) || locationId,
                    locationAssignedTo: (locationAssignedTo && locationAssignedTo[locationId]) || null,
                    status: 'active',
                    nextDueDate,
                    activatedAt: now,
                    tasks
                };
            });

            const workflowData = {
                workflowId,
                templateId: null,
                ownerId: uid,
                name: name.trim(),
                description: (description || '').trim() || null,
                category,
                recurrence,
                customInterval: (Number.isInteger(customInterval) && customInterval > 0) ? customInterval : null,
                notificationChannels: ['in_app'],
                notifyPhone: notifyPhone || null,
                notifyEmail: notifyEmail || null,
                daysBeforeAlert: Array.isArray(daysBeforeAlert)
                    ? daysBeforeAlert.filter(d => Number.isInteger(d) && d > 0)
                    : [30, 7],
                createdAt: now,
                updatedAt: now,
                locations
            };

            const atomicWrite = {
                [`ross/workflows/${uid}/${workflowId}`]: workflowData,
                [`ross/ownerIndex/${uid}`]: true,
                ...locationIndexUpdates(workflowId, uid, locationIds)
            };
            await db.ref().update(atomicWrite);
            res.json({ result: { success: true, workflowId, workflow: workflowData } });
        } catch (error) {
            console.error('[rossCreateWorkflow] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Update workflow settings
 * Access: All admins (own workflows only)
 */
exports.rossUpdateWorkflow = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, updates } = data;
            if (!workflowId) return res.status(400).json({ error: 'Workflow ID is required' });
            if (!updates || typeof updates !== 'object') {
                return res.status(400).json({ error: 'updates object is required' });
            }

            const workflowRef = db.ref(`ross/workflows/${uid}/${workflowId}`);
            const snap = await workflowRef.once('value');
            if (!snap.exists()) return res.status(404).json({ error: 'Workflow not found' });

            const allowedFields = ['name', 'notificationChannels', 'notifyPhone', 'notifyEmail', 'daysBeforeAlert', 'status'];
            const sanitized = { updatedAt: Date.now() };
            allowedFields.forEach(field => {
                if (updates[field] !== undefined) sanitized[field] = updates[field];
            });

            if (sanitized.daysBeforeAlert !== undefined) {
                if (!Array.isArray(sanitized.daysBeforeAlert)) {
                    return res.status(400).json({ error: 'daysBeforeAlert must be an array of positive integers' });
                }
                sanitized.daysBeforeAlert = sanitized.daysBeforeAlert.filter(d => Number.isInteger(d) && d > 0);
            }

            if (sanitized.status !== undefined && !['active', 'paused'].includes(sanitized.status)) {
                return res.status(400).json({ error: "Invalid status value. Use 'active' or 'paused'" });
            }

            await workflowRef.update(sanitized);
            res.json({ result: { success: true, workflowId } });
        } catch (error) {
            console.error('[rossUpdateWorkflow] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Delete a workflow
 * Access: All admins (own workflows only)
 */
exports.rossDeleteWorkflow = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId } = data;
            if (!workflowId) return res.status(400).json({ error: 'Workflow ID is required' });
            const existing = await db.ref(`ross/workflows/${uid}/${workflowId}`).once('value');
            if (!existing.exists()) return res.status(404).json({ error: 'Workflow not found' });

            const workflow = existing.val() || {};
            const attachedLocationIds = Object.keys(workflow.locations || {});

            const atomicDelete = {
                [`ross/workflows/${uid}/${workflowId}`]: null,
                ...locationIndexRemovals(workflowId, attachedLocationIds)
            };
            await db.ref().update(atomicDelete);
            // Clean up ownerIndex if this was the last workflow
            const remainingSnap = await db.ref(`ross/workflows/${uid}`).once('value');
            if (!remainingSnap.exists()) {
                await db.ref(`ross/ownerIndex/${uid}`).remove();
            }
            res.json({ result: { success: true, workflowId } });
        } catch (error) {
            console.error('[rossDeleteWorkflow] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Fetch all workflows for an owner, with optional location filter
 * Access: All admins
 */
exports.rossGetWorkflows = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { locationId, category, status } = data || {};

            if (locationId) await verifyLocationAccess(uid, [locationId], isSuperAdmin);

            // Determine which locations the caller can see workflows for.
            let visibleLocationIds;
            if (locationId) {
                visibleLocationIds = [locationId];
            } else if (isSuperAdmin) {
                // Super admin without a locationId reads the entire
                // workflowsByLocation tree, then fans out N per-location
                // reads + M per-workflow dereferences. Acceptable at current
                // scale; if location count grows beyond a few thousand, add
                // a `limit` param or require locationId for super admins.
                const allLocs = await db.ref('ross/workflowsByLocation').once('value');
                visibleLocationIds = Object.keys(allLocs.val() || {});
            } else {
                const userLocsSnap = await db.ref(`userLocations/${uid}`).once('value');
                visibleLocationIds = Object.keys(userLocsSnap.val() || {});
            }

            // Resolve (workflowId -> ownerUid) across visible locations via index.
            const ownerByWorkflow = {};
            await Promise.all(visibleLocationIds.map(async (locId) => {
                const idxSnap = await db.ref(`ross/workflowsByLocation/${locId}`).once('value');
                const idxMap = idxSnap.val() || {};
                Object.entries(idxMap).forEach(([wfId, ownerUid]) => {
                    ownerByWorkflow[wfId] = ownerUid;
                });
            }));

            // Legacy fallback: include caller's own workflows even if not yet indexed
            // (handles pre-backfill state). Indexed entries take precedence.
            const ownSnap = await db.ref(`ross/workflows/${uid}`).once('value');
            const ownMap = ownSnap.val() || {};
            Object.keys(ownMap).forEach(wfId => {
                if (!ownerByWorkflow[wfId]) ownerByWorkflow[wfId] = uid;
            });

            // Dereference each workflow.
            const workflowEntries = await Promise.all(
                Object.entries(ownerByWorkflow).map(async ([wfId, ownerUid]) => {
                    const wfSnap = await db.ref(`ross/workflows/${ownerUid}/${wfId}`).once('value');
                    return wfSnap.val();
                })
            );
            let workflows = workflowEntries.filter(Boolean);

            if (category && VALID_CATEGORIES.includes(category)) {
                workflows = workflows.filter(w => w.category === category);
            }

            // Filter by location if specified
            if (locationId) {
                workflows = workflows.filter(w => w.locations && w.locations[locationId]);
                // Flatten to show only the relevant location's data
                workflows = workflows.map(w => ({
                    ...w,
                    locationStatus: w.locations[locationId].status,
                    locationNextDueDate: w.locations[locationId].nextDueDate,
                    tasks: w.locations[locationId].tasks || {}
                }));
            }

            if (status) {
                workflows = workflows.filter(w => {
                    if (locationId) return w.locationStatus === status;
                    return Object.values(w.locations || {}).some(l => l.status === status);
                });
            }

            workflows.sort((a, b) => (a.nextDueDate || a.locationNextDueDate || 0) - (b.nextDueDate || b.locationNextDueDate || 0));
            res.json({ result: { success: true, workflows } });
        } catch (error) {
            console.error('[rossGetWorkflows] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

// ============================================
// TASK OPERATIONS
// ============================================

/**
 * Manage tasks within a workflow location (create / update / delete)
 * Access: All admins
 */
exports.rossManageTask = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId, action, taskId, taskData } = data;
            if (!workflowId || !locationId) return res.status(400).json({ error: 'Workflow ID and Location ID are required' });

            await verifyLocationAccess(uid, [locationId], isSuperAdmin);

            const locationRef = db.ref(`ross/workflows/${uid}/${workflowId}/locations/${locationId}`);
            const snap = await locationRef.once('value');
            if (!snap.exists()) return res.status(404).json({ error: 'Workflow location not found' });

            const tasksRef = locationRef.child('tasks');
            const now = Date.now();

            switch (action) {
                case 'create': {
                    if (!taskData || typeof taskData !== 'object') {
                        return res.status(400).json({ error: 'taskData is required for create' });
                    }
                    const newTaskId = generateId();
                    const inputType = VALID_INPUT_TYPES.includes(taskData.inputType)
                        ? taskData.inputType
                        : 'checkbox';
                    const task = {
                        title: taskData.title?.trim() || 'Untitled Task',
                        inputType,
                        inputConfig: (taskData.inputConfig && typeof taskData.inputConfig === 'object')
                            ? taskData.inputConfig
                            : {},
                        required: taskData.required !== false,
                        status: 'pending',
                        dueDate: taskData.dueDate || null,
                        completedAt: null,
                        assignedTo: taskData.assignedTo || null,
                        order: taskData.order || 1
                    };
                    await tasksRef.child(newTaskId).set(task);
                    await db.ref(`ross/workflows/${uid}/${workflowId}`).update({ updatedAt: now });
                    return res.json({ result: { success: true, taskId: newTaskId, task } });
                }
                case 'update': {
                    if (!taskId) return res.status(400).json({ error: 'Task ID required for update' });
                    if (!taskData || typeof taskData !== 'object') {
                        return res.status(400).json({ error: 'taskData is required for update' });
                    }
                    const allowedTaskFields = ['title', 'inputType', 'inputConfig', 'required', 'status', 'dueDate', 'assignedTo', 'order'];
                    const updates = {};
                    allowedTaskFields.forEach(f => { if (taskData[f] !== undefined) updates[f] = taskData[f]; });
                    if (updates.inputType !== undefined && !VALID_INPUT_TYPES.includes(updates.inputType)) {
                        return res.status(400).json({ error: `Invalid inputType. Must be one of: ${VALID_INPUT_TYPES.join(', ')}` });
                    }
                    await tasksRef.child(taskId).update(updates);
                    await db.ref(`ross/workflows/${uid}/${workflowId}`).update({ updatedAt: now });
                    return res.json({ result: { success: true, taskId } });
                }
                case 'delete': {
                    if (!taskId) return res.status(400).json({ error: 'Task ID required for delete' });
                    await tasksRef.child(taskId).remove();
                    await db.ref(`ross/workflows/${uid}/${workflowId}`).update({ updatedAt: now });
                    return res.json({ result: { success: true, taskId } });
                }
                default:
                    return res.status(400).json({ error: 'Invalid action. Use create, update, or delete' });
            }
        } catch (error) {
            console.error('[rossManageTask] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Mark a task as complete for a specific location
 * Access: All admins
 */
exports.rossCompleteTask = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId, taskId } = data;
            if (!workflowId || !locationId || !taskId) {
                return res.status(400).json({ error: 'Workflow ID, Location ID, and Task ID are required' });
            }

            await verifyLocationAccess(uid, [locationId], isSuperAdmin);

            const ownerUid = await resolveWorkflowOwner(workflowId, locationId, uid);
            if (!ownerUid) return res.status(404).json({ error: 'Workflow not found at this location' });

            const now = Date.now();
            const locationRef = db.ref(`ross/workflows/${ownerUid}/${workflowId}/locations/${locationId}`);

            // Use a transaction to atomically update the task and check completion
            let allTasksDone = false;
            let totalTaskCount = 0;
            let taskFound = false;

            await locationRef.transaction((locationData) => {
                if (!locationData) return locationData;
                if (!locationData.tasks || !locationData.tasks[taskId]) return locationData;
                // Idempotency: skip if already completed
                if (locationData.tasks[taskId].status === 'completed') return locationData;
                taskFound = true;

                locationData.tasks[taskId].status = 'completed';
                locationData.tasks[taskId].completedAt = now;

                const allTasks = Object.values(locationData.tasks);
                totalTaskCount = allTasks.length;
                allTasksDone = allTasks.every(t => t.status === 'completed');
                return locationData;
            }, undefined, false);

            if (!taskFound) return res.status(404).json({ error: 'Task not found or already completed' });

            if (allTasksDone && totalTaskCount > 0) {
                const workflowSnap = await db.ref(`ross/workflows/${ownerUid}/${workflowId}`).once('value');
                const workflow = workflowSnap.val();
                const cycleId = `${new Date().getFullYear()}-${workflow?.recurrence || 'unknown'}`;
                const locSnap = await db.ref(`ross/workflows/${ownerUid}/${workflowId}/locations/${locationId}`).once('value');
                const locData = locSnap.val() || {};
                const historyRecord = {
                    cycleId,
                    period: String(new Date().getFullYear()),
                    completedAt: now,
                    tasksTotal: totalTaskCount,
                    tasksCompleted: totalTaskCount,
                    completionRate: 100,
                    onTime: now <= (locData.nextDueDate || now)
                };
                await db.ref(`ross/workflows/${ownerUid}/${workflowId}/locations/${locationId}/history/${cycleId}`).set(historyRecord);
            }

            await db.ref(`ross/workflows/${ownerUid}/${workflowId}`).update({ updatedAt: now });
            res.json({ result: { success: true, taskId } });
        } catch (error) {
            console.error('[rossCompleteTask] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Fetch completion reports for an owner (across all workflows + locations)
 * Access: All admins
 */
exports.rossGetReports = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { locationId } = data || {};

            if (locationId) await verifyLocationAccess(uid, [locationId], isSuperAdmin);

            // Resolve which workflows the caller can see (location-share aware).
            let visibleLocationIds;
            if (locationId) {
                visibleLocationIds = [locationId];
            } else if (isSuperAdmin) {
                const allLocs = await db.ref('ross/workflowsByLocation').once('value');
                visibleLocationIds = Object.keys(allLocs.val() || {});
            } else {
                const userLocsSnap = await db.ref(`userLocations/${uid}`).once('value');
                visibleLocationIds = Object.keys(userLocsSnap.val() || {});
            }

            const ownerByWorkflow = {};
            await Promise.all(visibleLocationIds.map(async (locId) => {
                const idxSnap = await db.ref(`ross/workflowsByLocation/${locId}`).once('value');
                const idxMap = idxSnap.val() || {};
                Object.entries(idxMap).forEach(([wfId, ownerUid]) => {
                    ownerByWorkflow[wfId] = ownerUid;
                });
            }));

            // Legacy fallback for caller's own workflows
            const ownSnap = await db.ref(`ross/workflows/${uid}`).once('value');
            const ownMap = ownSnap.val() || {};
            Object.keys(ownMap).forEach(wfId => {
                if (!ownerByWorkflow[wfId]) ownerByWorkflow[wfId] = uid;
            });

            const workflowEntries = await Promise.all(
                Object.entries(ownerByWorkflow).map(async ([wfId, ownerUid]) => {
                    const wfSnap = await db.ref(`ross/workflows/${ownerUid}/${wfId}`).once('value');
                    return wfSnap.val();
                })
            );
            const workflows = workflowEntries.filter(Boolean);

            const report = [];
            workflows.forEach(workflow => {
                const locationEntries = locationId
                    ? (workflow.locations && workflow.locations[locationId] ? { [locationId]: workflow.locations[locationId] } : {})
                    : (workflow.locations || {});

                Object.entries(locationEntries).forEach(([locId, locData]) => {
                    const tasks = locData.tasks ? Object.values(locData.tasks) : [];
                    const completedTasks = tasks.filter(t => t.status === 'completed').length;
                    const history = locData.history ? Object.values(locData.history) : [];
                    report.push({
                        workflowId: workflow.workflowId,
                        name: workflow.name,
                        category: workflow.category,
                        recurrence: workflow.recurrence,
                        locationId: locId,
                        locationName: locData.locationName,
                        status: locData.status,
                        nextDueDate: locData.nextDueDate,
                        tasksTotal: tasks.length,
                        tasksCompleted: completedTasks,
                        completionRate: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
                        history
                    });
                });
            });

            res.json({ result: { success: true, report } });
        } catch (error) {
            console.error('[rossGetReports] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

// ============================================
// SCHEDULED REMINDER (Phase 1 — in-app only)
// ============================================

/**
 * Daily scheduler — runs at 07:00 SAST (UTC+2 = 05:00 UTC)
 * Scans all active workflows and writes in-app notifications for due alerts
 */
exports.rossScheduledReminder = onSchedule('0 5 * * *', async () => {
    const now = Date.now();
    const oneDayMs = 86400000;

    try {
        const indexSnap = await db.ref('ross/ownerIndex').once('value');
        const ownerMap = {};
        if (indexSnap.exists()) {
            const ownerIds = Object.keys(indexSnap.val());
            await Promise.all(ownerIds.map(async (ownerId) => {
                const ownerSnap = await db.ref(`ross/workflows/${ownerId}`).once('value');
                if (ownerSnap.exists()) ownerMap[ownerId] = ownerSnap.val();
            }));
        }

        for (const [ownerId, ownerWorkflows] of Object.entries(ownerMap)) {
            for (const workflow of Object.values(ownerWorkflows)) {
                const locations = workflow.locations || {};
                for (const [locationId, locData] of Object.entries(locations)) {
                    if (locData.status !== 'active') continue;

                    const daysUntilDue = Math.round((locData.nextDueDate - now) / oneDayMs);
                    const alertDays = workflow.daysBeforeAlert || [30, 7, 1];

                    if (!alertDays.includes(daysUntilDue)) continue;

                    const tasks = locData.tasks ? Object.values(locData.tasks) : [];
                    const remaining = tasks.filter(t => t.status !== 'completed').length;

                    const notification = {
                        type: 'ross_reminder',
                        workflowId: workflow.workflowId,
                        workflowName: workflow.name,
                        locationId,
                        locationName: locData.locationName,
                        daysUntilDue,
                        nextDueDate: locData.nextDueDate,
                        tasksRemaining: remaining,
                        tasksTotal: tasks.length,
                        channel: 'in_app',
                        createdAt: now,
                        read: false
                    };

                    await db.ref(`notifications/${ownerId}`).push(notification);
                }
            }
        }
    } catch (error) {
        console.error('[rossScheduledReminder] Error:', error);
    }
});

// ============================================
// RUN OPERATIONS
// ============================================

/**
 * Create or return the current open run for a workflow + location.
 * Idempotent: if an open run already exists, return it.
 * Access: All admins
 */
exports.rossCreateRun = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId } = data;
            if (!workflowId || !locationId) {
                return res.status(400).json({ error: 'workflowId and locationId are required' });
            }

            await verifyLocationAccess(uid, [locationId], isSuperAdmin);

            const ownerUid = await resolveWorkflowOwner(workflowId, locationId, uid);
            if (!ownerUid) return res.status(404).json({ error: 'Workflow location not found' });

            // Verify workflow + location exist
            const locSnap = await db.ref(`ross/workflows/${ownerUid}/${workflowId}/locations/${locationId}`).once('value');
            if (!locSnap.exists()) return res.status(404).json({ error: 'Workflow location not found' });

            // Find existing open run (runs are scoped to workflow owner)
            const runsRef = db.ref(`ross/runs/${ownerUid}/${workflowId}/${locationId}`);
            const existingSnap = await runsRef.orderByChild('completedAt').equalTo(null).limitToFirst(1).once('value');
            if (existingSnap.exists()) {
                const runs = existingSnap.val();
                const runId = Object.keys(runs)[0];
                return res.json({ result: { success: true, runId, run: runs[runId], created: false } });
            }

            // Create new run
            const runId = generateId();
            const now = Date.now();
            const run = {
                id: runId,
                workflowId,
                locationId,
                startedAt: now,
                startedBy: uid,
                completedAt: null,
                completedBy: null
            };
            await runsRef.child(runId).set(run);
            res.json({ result: { success: true, runId, run, created: true } });
        } catch (error) {
            console.error('[rossCreateRun] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Validate that value matches the expected type for a given inputType.
 * Returns an error string or null.
 */
function validateResponseValue(inputType, value) {
    if (inputType === 'temperature' || inputType === 'number') {
        if (typeof value !== 'number') return `value must be a number for ${inputType} tasks`;
    } else if (inputType === 'checkbox') {
        if (typeof value !== 'boolean') return 'value must be a boolean for checkbox tasks';
    } else if (inputType === 'yes_no') {
        if (typeof value !== 'boolean') return 'value must be a boolean for yes_no tasks';
    } else if (inputType === 'rating') {
        if (typeof value !== 'number' || !Number.isInteger(value)) return 'value must be an integer for rating tasks';
    }
    return null;
}

/**
 * Check whether a value breaches the configured threshold.
 */
function isResponseFlagged(inputType, value, inputConfig) {
    if (inputType !== 'temperature' && inputType !== 'number') return false;
    if (typeof value !== 'number') return false;
    if (inputConfig.max !== undefined && value > inputConfig.max) return true;
    if (inputConfig.min !== undefined && value < inputConfig.min) return true;
    return false;
}

/**
 * Submit a typed response for one task within a run.
 * Auto-flags temperature/number breaches. Enforces requiredNote.
 * Marks run complete when all required tasks have responses.
 * Access: All admins
 */
exports.rossSubmitResponse = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId, runId, taskId, value, note } = data;
            if (!workflowId || !locationId || !runId || !taskId) {
                return res.status(400).json({ error: 'workflowId, locationId, runId, and taskId are required' });
            }

            await verifyLocationAccess(uid, [locationId], isSuperAdmin);
            if (value === undefined || value === null) {
                return res.status(400).json({ error: 'value is required' });
            }

            const ownerUid = await resolveWorkflowOwner(workflowId, locationId, uid);
            if (!ownerUid) return res.status(404).json({ error: 'Workflow location not found' });

            // Verify run exists and is open
            const runRef = db.ref(`ross/runs/${ownerUid}/${workflowId}/${locationId}/${runId}`);
            const runSnap = await runRef.once('value');
            if (!runSnap.exists()) return res.status(404).json({ error: 'Run not found' });
            const run = runSnap.val();
            if (run.completedAt) return res.status(409).json({ error: 'Run is already completed' });

            // Get task definition from workflow
            const locSnap = await db.ref(`ross/workflows/${ownerUid}/${workflowId}/locations/${locationId}`).once('value');
            if (!locSnap.exists()) return res.status(404).json({ error: 'Workflow location not found' });
            const locData = locSnap.val();
            const tasks = locData.tasks || {};
            const taskDef = tasks[taskId];
            if (!taskDef) return res.status(404).json({ error: 'Task not found in workflow' });

            const inputType = taskDef.inputType || 'checkbox';
            const inputConfig = taskDef.inputConfig || {};

            // Type-validate value against inputType
            const typeError = validateResponseValue(inputType, value);
            if (typeError) return res.status(400).json({ error: typeError });

            // Auto-flag for temperature and number breaches
            const flagged = isResponseFlagged(inputType, value, inputConfig);

            // Enforce requiredNote when flagged
            if (flagged && inputConfig.requiredNote === true && (!note || String(note).trim() === '')) {
                return res.status(422).json({
                    error: 'A note is required when the value is out of range',
                    flagged: true
                });
            }

            const now = Date.now();
            const response = {
                taskId,
                inputType,
                value,
                note: (note && String(note).trim()) ? String(note).trim() : null,
                flagged,
                respondedAt: now,
                respondedBy: uid
            };

            await runRef.child(`responses/${taskId}`).set(response);

            // Check if all required tasks now have responses → auto-complete run
            const updatedRunSnap = await runRef.once('value');
            const updatedRun = updatedRunSnap.val();
            const responses = updatedRun.responses || {};

            const requiredTaskIds = Object.entries(tasks)
                .filter(([, t]) => t.required !== false)
                .map(([id]) => id);
            const allRequiredDone = requiredTaskIds.every(id => responses[id] !== undefined);

            if (allRequiredDone) {
                await runRef.update({ completedAt: now, completedBy: uid });
                // Write history record
                const workflowSnap = await db.ref(`ross/workflows/${ownerUid}/${workflowId}`).once('value');
                const workflow = workflowSnap.val() || {};
                const cycleId = runId;
                const flaggedCount = Object.values(responses).filter(r => r.flagged).length;
                const historyRecord = {
                    cycleId,
                    runId,
                    completedAt: now,
                    completedBy: uid,
                    tasksTotal: Object.keys(tasks).length,
                    tasksRequired: requiredTaskIds.length,
                    flaggedCount,
                    onTime: now <= (locData.nextDueDate || now)
                };
                await db.ref(`ross/workflows/${ownerUid}/${workflowId}/locations/${locationId}/history/${cycleId}`).set(historyRecord);
                await db.ref(`ross/workflows/${ownerUid}/${workflowId}`).update({ updatedAt: now });
            }

            res.json({ result: { success: true, taskId, flagged, runCompleted: allRequiredDone } });
        } catch (error) {
            console.error('[rossSubmitResponse] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Get the current open run for a workflow + location.
 * Also returns the most recent completed run's responses as previousResponses.
 * Access: All admins
 */
exports.rossGetRun = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId } = data;
            if (!workflowId || !locationId) {
                return res.status(400).json({ error: 'workflowId and locationId are required' });
            }

            await verifyLocationAccess(uid, [locationId], isSuperAdmin);

            const ownerUid = await resolveWorkflowOwner(workflowId, locationId, uid);
            if (!ownerUid) return res.status(404).json({ error: 'Workflow location not found' });

            const runsRef = db.ref(`ross/runs/${ownerUid}/${workflowId}/${locationId}`);

            // Current open run
            const openSnap = await runsRef.orderByChild('completedAt').equalTo(null).limitToFirst(1).once('value');
            let currentRun = null;
            if (openSnap.exists()) {
                const runs = openSnap.val();
                const runId = Object.keys(runs)[0];
                currentRun = { ...runs[runId], runId };
            }

            // Most recent completed run (for "last time" reference)
            const completedSnap = await runsRef.orderByChild('completedAt').limitToLast(2).once('value');
            let previousResponses = {};
            if (completedSnap.exists()) {
                const allRuns = Object.values(completedSnap.val());
                const completedRuns = allRuns
                    .filter(r => r.completedAt !== null)
                    .sort((a, b) => b.completedAt - a.completedAt);
                if (completedRuns.length > 0) {
                    previousResponses = completedRuns[0].responses || {};
                }
            }

            res.json({ result: { success: true, currentRun, previousResponses } });
        } catch (error) {
            console.error('[rossGetRun] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Get paginated list of completed runs for a workflow + location.
 * Powers the Reports tab run history view.
 * Access: All admins
 */
exports.rossGetRunHistory = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId, limit: rawLimit } = data;
            if (!workflowId || !locationId) {
                return res.status(400).json({ error: 'workflowId and locationId are required' });
            }

            await verifyLocationAccess(uid, [locationId], isSuperAdmin);

            const ownerUid = await resolveWorkflowOwner(workflowId, locationId, uid);
            if (!ownerUid) return res.status(404).json({ error: 'Workflow location not found' });

            const pageLimit = Math.min(Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 20, 100);

            const runsRef = db.ref(`ross/runs/${ownerUid}/${workflowId}/${locationId}`);
            const snap = await runsRef.orderByChild('completedAt').limitToLast(pageLimit).once('value');

            const runs = snap.exists()
                ? Object.values(snap.val())
                    .filter(r => r.completedAt !== null)
                    .sort((a, b) => b.completedAt - a.completedAt)
                : [];

            res.json({ result: { success: true, runs } });
        } catch (error) {
            console.error('[rossGetRunHistory] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

// ============================================
// STAFF OPERATIONS (per location)
// ============================================

/**
 * CRUD for staff members per location
 * Access: All admins
 */
exports.rossManageStaff = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { locationId, action, staffId, staffData } = data;
            if (!locationId) return res.status(400).json({ error: 'Location ID is required' });

            await verifyLocationAccess(uid, [locationId], isSuperAdmin);

            const staffRef = db.ref(`ross/staff/${uid}/${locationId}`);
            const now = Date.now();

            switch (action) {
                case 'create': {
                    if (!staffData?.name?.trim()) return res.status(400).json({ error: 'Staff name is required' });
                    const newStaffId = generateId();
                    const member = {
                        staffId: newStaffId,
                        locationId,
                        name: staffData.name.trim(),
                        role: staffData.role?.trim() || '',
                        phone: staffData.phone || null,
                        email: staffData.email || null,
                        notificationChannels: staffData.notificationChannels || ['in_app'],
                        createdAt: now
                    };
                    await staffRef.child(newStaffId).set(member);
                    return res.json({ result: { success: true, staffId: newStaffId, member } });
                }
                case 'update': {
                    if (!staffId) return res.status(400).json({ error: 'Staff ID required for update' });
                    const allowedFields = ['name', 'role', 'phone', 'email', 'notificationChannels'];
                    const updates = { updatedAt: now };
                    allowedFields.forEach(f => { if (staffData[f] !== undefined) updates[f] = staffData[f]; });
                    await staffRef.child(staffId).update(updates);
                    return res.json({ result: { success: true, staffId } });
                }
                case 'delete': {
                    if (!staffId) return res.status(400).json({ error: 'Staff ID required for delete' });
                    await staffRef.child(staffId).remove();
                    return res.json({ result: { success: true, staffId } });
                }
                default:
                    return res.status(400).json({ error: 'Invalid action. Use create, update, or delete' });
            }
        } catch (error) {
            console.error('[rossManageStaff] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * v2 Home: snooze a single insight card for the calling user.
 * Writes ross/v2Snoozes/{uid}/{cardId} = { expiresAt, snoozedAt }.
 * The home feed read path filters out cards whose expiresAt > now.
 *
 * Per-user (not per-location): snoozing is a personal UX preference.
 * cardId is sanitised to [a-zA-Z0-9_-] to avoid path injection.
 *
 * Access: any authenticated admin or ROSS-subscribed user
 */
exports.rossV2Snooze = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { cardId, hours } = data;

            if (!cardId || typeof cardId !== 'string' || cardId.length > 80) {
                return res.status(400).json({ error: 'cardId required (string, ≤80 chars)' });
            }
            const safeId = cardId.replace(/[^a-zA-Z0-9_-]/g, '');
            if (!safeId) {
                return res.status(400).json({ error: 'cardId must contain at least one safe character' });
            }

            const hrs = Number(hours);
            if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 720) {
                return res.status(400).json({ error: 'hours must be a positive number ≤ 720 (30 days)' });
            }

            const now = Date.now();
            const expiresAt = now + Math.round(hrs * 3600_000);
            await db.ref(`ross/v2Snoozes/${uid}/${safeId}`).set({ expiresAt, snoozedAt: now });

            res.json({ result: { success: true, cardId: safeId, expiresAt } });
        } catch (error) {
            console.error('[rossV2Snooze] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

/**
 * Fetch all staff members for a location
 * Access: All admins
 */
exports.rossGetStaff = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid, isSuperAdmin } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { locationId } = data;
            if (!locationId) return res.status(400).json({ error: 'Location ID is required' });

            await verifyLocationAccess(uid, [locationId], isSuperAdmin);

            const snap = await db.ref(`ross/staff/${uid}/${locationId}`).once('value');
            const staff = Object.values(snap.val() || {});
            staff.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            res.json({ result: { success: true, staff } });
        } catch (error) {
            console.error('[rossGetStaff] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin') || error.message.includes('access denied')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});

// =====================================================================
//  rossGetHomeWorkflowDigest — concierge home active-run surfacing
//
//  Read-only digest of the caller's active workflows for /ross.html slot 1.
//  Reads ross/workflows/{uid} + ross/runs/{uid} in parallel, delegates the
//  bucketing to the pure helper buildHomeWorkflowDigest.
//
//  Auth: verifyUserOrAdmin (home is accessible to any authenticated user,
//        not just admins — mirrors rossGetWorkflows since the 2026-03-24
//        user-dashboard change).
//
//  Request body (POST): { data: { clientToday?: 'YYYY-MM-DD' } }
//  Response: res.json({ result: { success: true, ...digest } })
// =====================================================================

exports.rossGetHomeWorkflowDigest = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid } = await verifyUserOrAdmin(decodedToken);

            const data = req.body.data || req.body || {};
            const clientToday = (typeof data.clientToday === 'string' && data.clientToday)
                ? data.clientToday
                : null;

            console.log(`[rossGetHomeWorkflowDigest] uid=${uid} clientToday=${clientToday || '<utc>'}`);

            const [workflowsSnap, runsSnap] = await Promise.all([
                db.ref(`ross/workflows/${uid}`).once('value'),
                db.ref(`ross/runs/${uid}`).once('value'),
            ]);

            const digest = buildHomeWorkflowDigest({
                workflows: workflowsSnap.exists() ? workflowsSnap.val() : {},
                runs: runsSnap.exists() ? runsSnap.val() : {},
                clientToday,
                now: Date.now(),
            });

            res.json({ result: { success: true, ...digest } });
        } catch (error) {
            console.error('[rossGetHomeWorkflowDigest] Error:', error.message);
            const msg = error.message || '';
            let statusCode = 500;
            if (msg.includes('authorization') || msg.includes('token')) statusCode = 401;
            else if (msg.includes('Admin') || msg.includes('User') || msg.includes('access')) statusCode = 403;
            res.status(statusCode).json({ error: msg });
        }
    });
});

module.exports.VALID_INPUT_TYPES = VALID_INPUT_TYPES;
// Pure helper — exported for unit tests and the rossGetHomeWorkflowDigest CF (Task 2)
module.exports.buildHomeWorkflowDigest = buildHomeWorkflowDigest;
