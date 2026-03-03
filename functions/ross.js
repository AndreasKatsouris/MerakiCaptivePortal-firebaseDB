/**
 * ROSS — Restaurant OS Service Cloud Functions
 * Workflow automation engine for restaurant operators
 *
 * Auth pattern: onRequest + Bearer token (mirrors projectManagement.js)
 *
 * @version 1.0.0
 * @created 2026-02-25
 */

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

const db = admin.database();

// ============================================
// CONSTANTS
// ============================================

const VALID_CATEGORIES = ['compliance', 'operations', 'growth', 'finance', 'hr', 'maintenance'];
const VALID_RECURRENCES = ['once', 'daily', 'weekly', 'monthly', 'quarterly', 'annually'];

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

async function verifySuperAdmin(decodedToken) {
    const { uid, isSuperAdmin } = await verifyAdmin(decodedToken);
    if (!isSuperAdmin) throw new Error('Super Admin access required');
    return uid;
}

function generateId() {
    return db.ref().push().key;
}

// ============================================
// TEMPLATE OPERATIONS (Super Admin managed)
// ============================================

/**
 * Fetch all templates with optional category filter
 * Access: All admins
 */
exports.rossGetTemplates = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { category } = data || {};

            const snapshot = await db.ref('ross/templates').once('value');
            const raw = snapshot.val() || {};
            let templates = Object.values(raw);

            if (category && VALID_CATEGORIES.includes(category)) {
                templates = templates.filter(t => t.category === category);
            }

            templates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            res.json({ result: { success: true, templates } });
        } catch (error) {
            console.error('[rossGetTemplates] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
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
            await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { name, category, description, recurrence, daysBeforeAlert, subtasks, tags } = data;

            if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required' });
            if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
            if (!VALID_RECURRENCES.includes(recurrence)) return res.status(400).json({ error: 'Invalid recurrence' });

            const templateId = generateId();
            const now = Date.now();

            const templateData = {
                templateId,
                name: name.trim(),
                category,
                description: description?.trim() || '',
                recurrence,
                daysBeforeAlert: Array.isArray(daysBeforeAlert) ? daysBeforeAlert : [30, 7],
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
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
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
            await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { templateId, updates } = data;
            if (!templateId) return res.status(400).json({ error: 'Template ID is required' });

            const templateRef = db.ref(`ross/templates/${templateId}`);
            const snapshot = await templateRef.once('value');
            if (!snapshot.exists()) return res.status(404).json({ error: 'Template not found' });

            const allowedFields = ['name', 'category', 'description', 'recurrence', 'daysBeforeAlert', 'subtasks', 'tags'];
            const sanitized = { updatedAt: Date.now() };
            allowedFields.forEach(field => {
                if (updates[field] !== undefined) sanitized[field] = updates[field];
            });

            await templateRef.update(sanitized);
            res.json({ result: { success: true, templateId } });
        } catch (error) {
            console.error('[rossUpdateTemplate] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
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
            await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { templateId } = data;
            if (!templateId) return res.status(400).json({ error: 'Template ID is required' });

            await db.ref(`ross/templates/${templateId}`).remove();
            res.json({ result: { success: true, templateId } });
        } catch (error) {
            console.error('[rossDeleteTemplate] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
        }
    });
});
