# ROSS (Restaurant OS Service) — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the complete ROSS workflow automation module in the admin dashboard — backend Cloud Functions, Firebase RTDB schema, security rules, and Vue 3 frontend with 6 views (Overview, Template Library, My Workflows, Workflow Builder, Reports, Staff Management).

**Architecture:** All ROSS Cloud Functions live in `functions/ross.js` and are registered in `functions/index.js` using the same `onRequest` + Bearer token pattern as `functions/projectManagement.js`. The Vue 3 frontend is mounted to `#ross-app` inside the admin dashboard, initialised lazily via `initializeRoss()` exported from `public/js/modules/ross/index.js`, following the exact same hook-up pattern as Project Management. The service layer (`ross-service.js`) mirrors `project-service.js` — a class instance that calls Cloud Functions via `fetch` with a Bearer token obtained from `auth.currentUser.getIdToken()`.

**Tech Stack:** Vue 3 (global CDN build), Bootstrap 5, Chart.js, Firebase RTDB, Firebase Cloud Functions v2 (Node.js 22), SweetAlert2, Font Awesome 6

---

## Reference Files (read before each task)

| Purpose | File |
|---------|------|
| Cloud Function pattern | `functions/projectManagement.js` |
| Service layer pattern | `public/js/modules/project-management/services/project-service.js` |
| Vue 3 module pattern | `public/js/modules/project-management/index.js` |
| Admin dashboard wiring | `public/js/admin-dashboard.js` (lines 200-435) |
| Admin dashboard HTML | `public/admin-dashboard.html` |
| RTDB security rules | `database.rules.json` |
| Functions index | `functions/index.js` (lines 3098-3107 for how PM is registered) |
| Design document | `docs/plans/2026-02-25-ross-design.md` |

---

## PHASE A — Backend Foundation

---

### Task 1: Create `functions/ross.js` — Auth helpers + Template CRUD

**Files:**
- Create: `functions/ross.js`

**Context:** Every Cloud Function in this project uses `onRequest` from `firebase-functions/v2/https` with a CORS wrapper, Bearer token verification, and a Super Admin check for privileged operations. Study `functions/projectManagement.js` lines 1-68 before writing this.

**Step 1: Create the file with module header, auth helpers, and `rossGetTemplates`**

```javascript
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
```

**Step 2: Verify the file exists and has no obvious syntax errors**

Run: `node -e "require('./functions/ross.js')" 2>&1 | head -5`

From the repo root. Expected: no output (no errors). If you see an error about `admin` not initialized, that is fine — it means the file loaded but `admin.database()` failed outside a Functions runtime. The import structure is correct.

**Step 3: Commit**

```bash
git add functions/ross.js
git commit -m "feat: add ross.js Cloud Functions file — auth helpers + template CRUD"
```

---

### Task 2: Add Workflow CRUD functions to `functions/ross.js`

**Files:**
- Modify: `functions/ross.js`

**Step 1: Append workflow CRUD functions to the end of `functions/ross.js`**

```javascript
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
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { templateId, locationIds, locationNames, name, nextDueDate, daysBeforeAlert, notifyPhone, notifyEmail } = data;

            if (!templateId) return res.status(400).json({ error: 'Template ID is required' });
            if (!Array.isArray(locationIds) || locationIds.length === 0) return res.status(400).json({ error: 'At least one location ID is required' });
            if (!nextDueDate) return res.status(400).json({ error: 'Next due date is required' });

            const templateSnap = await db.ref(`ross/templates/${templateId}`).once('value');
            if (!templateSnap.exists()) return res.status(404).json({ error: 'Template not found' });
            const template = templateSnap.val();

            const workflowId = generateId();
            const now = Date.now();

            // Build per-location records with tasks from template subtasks
            const locations = {};
            locationIds.forEach((locationId, idx) => {
                const tasks = {};
                if (Array.isArray(template.subtasks)) {
                    template.subtasks.forEach(subtask => {
                        const taskId = generateId();
                        tasks[taskId] = {
                            title: subtask.title,
                            status: 'pending',
                            dueDate: nextDueDate + ((subtask.daysOffset || 0) * 86400000),
                            completedAt: null,
                            assignedTo: null,
                            order: subtask.order || 1
                        };
                    });
                }
                locations[locationId] = {
                    locationName: (locationNames && locationNames[idx]) || locationId,
                    status: 'active',
                    nextDueDate,
                    tasks
                };
            });

            const workflowData = {
                workflowId,
                templateId,
                ownerId: uid,
                name: (name || template.name).trim(),
                category: template.category,
                recurrence: template.recurrence,
                notificationChannels: ['in_app'],
                notifyPhone: notifyPhone || null,
                notifyEmail: notifyEmail || null,
                daysBeforeAlert: daysBeforeAlert || template.daysBeforeAlert || [30, 7],
                createdAt: now,
                updatedAt: now,
                locations
            };

            await db.ref(`ross/workflows/${uid}/${workflowId}`).set(workflowData);
            res.json({ result: { success: true, workflowId, workflow: workflowData } });
        } catch (error) {
            console.error('[rossActivateWorkflow] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
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
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { name, category, recurrence, locationIds, locationNames, nextDueDate, subtasks, daysBeforeAlert, notifyPhone, notifyEmail } = data;

            if (!name || !name.trim()) return res.status(400).json({ error: 'Workflow name is required' });
            if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
            if (!VALID_RECURRENCES.includes(recurrence)) return res.status(400).json({ error: 'Invalid recurrence' });
            if (!Array.isArray(locationIds) || locationIds.length === 0) return res.status(400).json({ error: 'At least one location ID is required' });
            if (!nextDueDate) return res.status(400).json({ error: 'Next due date is required' });

            const workflowId = generateId();
            const now = Date.now();

            const locations = {};
            locationIds.forEach((locationId, idx) => {
                const tasks = {};
                if (Array.isArray(subtasks)) {
                    subtasks.forEach(subtask => {
                        const taskId = generateId();
                        tasks[taskId] = {
                            title: subtask.title?.trim() || 'Untitled Task',
                            status: 'pending',
                            dueDate: nextDueDate + ((subtask.daysOffset || 0) * 86400000),
                            completedAt: null,
                            assignedTo: null,
                            order: subtask.order || 1
                        };
                    });
                }
                locations[locationId] = {
                    locationName: (locationNames && locationNames[idx]) || locationId,
                    status: 'active',
                    nextDueDate,
                    tasks
                };
            });

            const workflowData = {
                workflowId,
                templateId: null,
                ownerId: uid,
                name: name.trim(),
                category,
                recurrence,
                notificationChannels: ['in_app'],
                notifyPhone: notifyPhone || null,
                notifyEmail: notifyEmail || null,
                daysBeforeAlert: daysBeforeAlert || [30, 7],
                createdAt: now,
                updatedAt: now,
                locations
            };

            await db.ref(`ross/workflows/${uid}/${workflowId}`).set(workflowData);
            res.json({ result: { success: true, workflowId, workflow: workflowData } });
        } catch (error) {
            console.error('[rossCreateWorkflow] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
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
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, updates } = data;
            if (!workflowId) return res.status(400).json({ error: 'Workflow ID is required' });

            const workflowRef = db.ref(`ross/workflows/${uid}/${workflowId}`);
            const snap = await workflowRef.once('value');
            if (!snap.exists()) return res.status(404).json({ error: 'Workflow not found' });

            const allowedFields = ['name', 'notificationChannels', 'notifyPhone', 'notifyEmail', 'daysBeforeAlert'];
            const sanitized = { updatedAt: Date.now() };
            allowedFields.forEach(field => {
                if (updates[field] !== undefined) sanitized[field] = updates[field];
            });

            await workflowRef.update(sanitized);
            res.json({ result: { success: true, workflowId } });
        } catch (error) {
            console.error('[rossUpdateWorkflow] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
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
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId } = data;
            if (!workflowId) return res.status(400).json({ error: 'Workflow ID is required' });

            await db.ref(`ross/workflows/${uid}/${workflowId}`).remove();
            res.json({ result: { success: true, workflowId } });
        } catch (error) {
            console.error('[rossDeleteWorkflow] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
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
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { locationId, category, status } = data || {};

            const snapshot = await db.ref(`ross/workflows/${uid}`).once('value');
            let workflows = Object.values(snapshot.val() || {});

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
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
        }
    });
});
```

**Step 2: Verify no syntax errors**

```bash
node --input-type=module < /dev/null; node -e "console.log('checking...'); try { require('./functions/ross.js'); } catch(e) { if (!e.message.includes('Cannot read')) throw e; } console.log('OK');" 2>&1 | tail -3
```

**Step 3: Commit**

```bash
git add functions/ross.js
git commit -m "feat: add ross.js workflow CRUD Cloud Functions"
```

---

### Task 3: Add Task Management + Scheduled Reminder to `functions/ross.js`

**Files:**
- Modify: `functions/ross.js`

**Step 1: Append task management and scheduler functions**

```javascript
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
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId, action, taskId, taskData } = data;
            if (!workflowId || !locationId) return res.status(400).json({ error: 'Workflow ID and Location ID are required' });

            const locationRef = db.ref(`ross/workflows/${uid}/${workflowId}/locations/${locationId}`);
            const snap = await locationRef.once('value');
            if (!snap.exists()) return res.status(404).json({ error: 'Workflow location not found' });

            const tasksRef = locationRef.child('tasks');
            const now = Date.now();

            switch (action) {
                case 'create': {
                    const newTaskId = generateId();
                    const task = {
                        title: taskData.title?.trim() || 'Untitled Task',
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
                    const allowedTaskFields = ['title', 'status', 'dueDate', 'assignedTo', 'order'];
                    const updates = {};
                    allowedTaskFields.forEach(f => { if (taskData[f] !== undefined) updates[f] = taskData[f]; });
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
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
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
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId, taskId } = data;
            if (!workflowId || !locationId || !taskId) {
                return res.status(400).json({ error: 'Workflow ID, Location ID, and Task ID are required' });
            }

            const now = Date.now();
            const taskRef = db.ref(`ross/workflows/${uid}/${workflowId}/locations/${locationId}/tasks/${taskId}`);
            const taskSnap = await taskRef.once('value');
            if (!taskSnap.exists()) return res.status(404).json({ error: 'Task not found' });

            await taskRef.update({ status: 'completed', completedAt: now });
            await db.ref(`ross/workflows/${uid}/${workflowId}`).update({ updatedAt: now });

            // Check if all tasks for this location are complete
            const locationSnap = await db.ref(`ross/workflows/${uid}/${workflowId}/locations/${locationId}`).once('value');
            const locationData = locationSnap.val();
            if (locationData && locationData.tasks) {
                const allTasks = Object.values(locationData.tasks);
                const completedCount = allTasks.filter(t => t.status === 'completed').length;
                if (completedCount === allTasks.length) {
                    const workflowSnap = await db.ref(`ross/workflows/${uid}/${workflowId}`).once('value');
                    const workflow = workflowSnap.val();
                    const cycleId = `${new Date().getFullYear()}-${workflow.recurrence}`;
                    const historyRecord = {
                        cycleId,
                        period: String(new Date().getFullYear()),
                        completedAt: now,
                        tasksTotal: allTasks.length,
                        tasksCompleted: allTasks.length,
                        completionRate: 100,
                        onTime: now <= (locationData.nextDueDate || now)
                    };
                    await db.ref(`ross/workflows/${uid}/${workflowId}/locations/${locationId}/history/${cycleId}`).set(historyRecord);
                }
            }

            res.json({ result: { success: true, taskId } });
        } catch (error) {
            console.error('[rossCompleteTask] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
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
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { locationId } = data || {};

            const workflowsSnap = await db.ref(`ross/workflows/${uid}`).once('value');
            const workflows = Object.values(workflowsSnap.val() || {});

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
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
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
        const ownersSnap = await db.ref('ross/workflows').once('value');
        const ownerMap = ownersSnap.val() || {};

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
                    console.log(`[rossScheduledReminder] Alert for workflow ${workflow.workflowId} loc ${locationId} (${daysUntilDue}d)`);
                }
            }
        }
    } catch (error) {
        console.error('[rossScheduledReminder] Error:', error);
    }
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
            await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { locationId, action, staffId, staffData } = data;
            if (!locationId) return res.status(400).json({ error: 'Location ID is required' });

            const staffRef = db.ref(`ross/staff/${locationId}`);
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
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
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
            await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { locationId } = data;
            if (!locationId) return res.status(400).json({ error: 'Location ID is required' });

            const snap = await db.ref(`ross/staff/${locationId}`).once('value');
            const staff = Object.values(snap.val() || {});
            staff.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            res.json({ result: { success: true, staff } });
        } catch (error) {
            console.error('[rossGetStaff] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
        }
    });
});
```

**Step 2: Commit**

```bash
git add functions/ross.js
git commit -m "feat: add ross.js task management, reports, and scheduled reminder"
```

---

### Task 4: Register ROSS functions in `functions/index.js`

**Files:**
- Modify: `functions/index.js`

**Context:** Look at lines 3098-3107 of `functions/index.js`. The pattern is: require the module, then assign each export. Add ROSS immediately after the Project Management block.

**Step 1: Add the ROSS registration block**

Find the exact text in `functions/index.js`:
```javascript
exports.manageProjectMilestones = projectManagement.manageProjectMilestones;
```

Add immediately after it:
```javascript

// ============================================
// ROSS — RESTAURANT OS SERVICE FUNCTIONS
// ============================================
const ross = require('./ross');
exports.rossGetTemplates = ross.rossGetTemplates;
exports.rossCreateTemplate = ross.rossCreateTemplate;
exports.rossUpdateTemplate = ross.rossUpdateTemplate;
exports.rossDeleteTemplate = ross.rossDeleteTemplate;
exports.rossActivateWorkflow = ross.rossActivateWorkflow;
exports.rossCreateWorkflow = ross.rossCreateWorkflow;
exports.rossUpdateWorkflow = ross.rossUpdateWorkflow;
exports.rossDeleteWorkflow = ross.rossDeleteWorkflow;
exports.rossGetWorkflows = ross.rossGetWorkflows;
exports.rossManageTask = ross.rossManageTask;
exports.rossCompleteTask = ross.rossCompleteTask;
exports.rossGetReports = ross.rossGetReports;
exports.rossScheduledReminder = ross.rossScheduledReminder;
exports.rossManageStaff = ross.rossManageStaff;
exports.rossGetStaff = ross.rossGetStaff;
```

**Step 2: Commit**

```bash
git add functions/index.js
git commit -m "feat: register ROSS Cloud Functions in index.js (including staff management)"
```

---

### Task 5: Add ROSS security rules to `database.rules.json`

**Files:**
- Modify: `database.rules.json`

**Context:** The existing `admin` block (lines 133-167) shows the pattern. ROSS needs four rule blocks:
1. `/ross/templates/` — Super Admin write, all authenticated admins read
2. `/ross/workflows/{ownerId}/{workflowId}/` — owner read/write (global parent structure)
3. `/ross/staff/{locationId}/` — admin read/write per location
4. `/notifications/{ownerId}/` — owner read + Cloud Function write

**Step 1: Find the closing of the last existing named block in `database.rules.json`**

Find the text `"admin"` rules block. Add the following ROSS rules block as a new sibling entry inside the top-level `"rules"` object, just before the closing `}`:

```json
"ross": {
  "templates": {
    ".read": "auth != null && auth.token.admin === true",
    ".write": "auth != null && auth.token.admin === true",
    "$templateId": {
      ".validate": "newData.hasChildren(['name', 'category', 'recurrence', 'createdAt'])"
    }
  },
  "workflows": {
    "$ownerId": {
      ".read": "auth != null && (auth.uid === $ownerId || auth.token.admin === true)",
      ".write": "auth != null && (auth.uid === $ownerId || auth.token.admin === true)",
      "$workflowId": {
        ".validate": "newData.hasChildren(['name', 'category', 'recurrence', 'ownerId', 'createdAt'])",
        "locations": {
          "$locationId": {
            ".indexOn": ["status", "nextDueDate"]
          }
        }
      }
    }
  },
  "staff": {
    "$locationId": {
      ".read": "auth != null && auth.token.admin === true",
      ".write": "auth != null && auth.token.admin === true",
      ".indexOn": ["name", "role"]
    }
  }
},
"notifications": {
  "$ownerId": {
    ".read": "auth != null && (auth.uid === $ownerId || auth.token.admin === true)",
    ".write": "auth != null && auth.token.admin === true",
    ".indexOn": ["type", "read", "createdAt"]
  }
}
```

**Important:** Add a comma after the preceding rule block's closing `}` before this new block. Check `database.rules.json` carefully for proper JSON formatting — no trailing commas allowed.

**Step 2: Validate JSON is well-formed**

```bash
node -e "require('./database.rules.json'); console.log('JSON valid')"
```

Expected: `JSON valid`

**Step 3: Commit**

```bash
git add database.rules.json
git commit -m "feat: add ROSS and notifications security rules to database.rules.json"
```

---

### Task 6: Seed 13 starter templates via a seed script

**Files:**
- Create: `functions/seeds/ross-templates-seed.js`

**Context:** This is a standalone Node.js script run once against the live (or emulator) database. It uses the Firebase Admin SDK. Run it with `node functions/seeds/ross-templates-seed.js`.

**Step 1: Create the seed directory and file**

```bash
mkdir -p functions/seeds
```

**Step 2: Write the seed file**

```javascript
/**
 * ROSS Starter Templates — Seed Script
 * Run once: node functions/seeds/ross-templates-seed.js
 * Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase emulator running
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
    });
}

const db = admin.database();
const now = Date.now();

const templates = [
    {
        name: 'Certificate of Acceptability',
        category: 'compliance',
        description: 'Annual CoA renewal tracking from application through to approval.',
        recurrence: 'annually',
        daysBeforeAlert: [90, 30, 7],
        tags: ['compliance', 'legal', 'annual'],
        subtasks: [
            { order: 1, title: 'Submit application to local authority', daysOffset: -90 },
            { order: 2, title: 'Schedule inspection', daysOffset: -60 },
            { order: 3, title: 'Complete inspection requirements', daysOffset: -30 },
            { order: 4, title: 'Collect certificate', daysOffset: 0 }
        ]
    },
    {
        name: 'Liquor Licence Renewal',
        category: 'compliance',
        description: 'Annual liquor licence renewal with local authority.',
        recurrence: 'annually',
        daysBeforeAlert: [60, 30, 7],
        tags: ['compliance', 'legal', 'annual'],
        subtasks: [
            { order: 1, title: 'Prepare renewal application documents', daysOffset: -60 },
            { order: 2, title: 'Submit renewal application', daysOffset: -45 },
            { order: 3, title: 'Follow up with licensing board', daysOffset: -14 },
            { order: 4, title: 'Collect renewed licence', daysOffset: 0 }
        ]
    },
    {
        name: 'Health & Safety Audit',
        category: 'compliance',
        description: 'Quarterly internal health and safety inspection checklist.',
        recurrence: 'quarterly',
        daysBeforeAlert: [14, 7, 1],
        tags: ['compliance', 'safety', 'quarterly'],
        subtasks: [
            { order: 1, title: 'Schedule audit date with manager', daysOffset: -14 },
            { order: 2, title: 'Complete kitchen safety walkthrough', daysOffset: -1 },
            { order: 3, title: 'Check first aid kit and fire extinguishers', daysOffset: -1 },
            { order: 4, title: 'File audit report', daysOffset: 0 }
        ]
    },
    {
        name: 'Daily Opening Checklist',
        category: 'operations',
        description: 'Standard opening procedures for front-of-house and kitchen.',
        recurrence: 'daily',
        daysBeforeAlert: [0],
        tags: ['operations', 'daily', 'opening'],
        subtasks: [
            { order: 1, title: 'Check temperatures in fridges and freezers', daysOffset: 0 },
            { order: 2, title: 'Verify mise en place is complete', daysOffset: 0 },
            { order: 3, title: 'Check opening cash float', daysOffset: 0 },
            { order: 4, title: 'Briefing with floor staff', daysOffset: 0 }
        ]
    },
    {
        name: 'Daily Closing Checklist',
        category: 'operations',
        description: 'Standard closing procedures for front-of-house and kitchen.',
        recurrence: 'daily',
        daysBeforeAlert: [0],
        tags: ['operations', 'daily', 'closing'],
        subtasks: [
            { order: 1, title: 'Complete end-of-day cash-up', daysOffset: 0 },
            { order: 2, title: 'Verify kitchen is clean and surfaces sanitised', daysOffset: 0 },
            { order: 3, title: 'Check all appliances are off', daysOffset: 0 },
            { order: 4, title: 'Set alarm and lock up', daysOffset: 0 }
        ]
    },
    {
        name: 'Weekly Deep Clean Checklist',
        category: 'operations',
        description: 'Comprehensive weekly deep clean of kitchen and front-of-house.',
        recurrence: 'weekly',
        daysBeforeAlert: [2, 1],
        tags: ['operations', 'weekly', 'cleaning'],
        subtasks: [
            { order: 1, title: 'Deep clean behind fryers and grills', daysOffset: 0 },
            { order: 2, title: 'Clean extractor hood filters', daysOffset: 0 },
            { order: 3, title: 'Sanitise all food preparation surfaces', daysOffset: 0 },
            { order: 4, title: 'Clean front-of-house upholstery and floors', daysOffset: 0 }
        ]
    },
    {
        name: 'Weekly Social Media Campaign',
        category: 'growth',
        description: 'Plan, create, and post weekly social media content.',
        recurrence: 'weekly',
        daysBeforeAlert: [2],
        tags: ['growth', 'marketing', 'social-media'],
        subtasks: [
            { order: 1, title: 'Plan weekly content theme', daysOffset: -3 },
            { order: 2, title: 'Create images/video for posts', daysOffset: -2 },
            { order: 3, title: 'Schedule posts for the week', daysOffset: -1 },
            { order: 4, title: 'Respond to comments from previous week', daysOffset: 0 }
        ]
    },
    {
        name: 'Monthly Google Review Campaign',
        category: 'growth',
        description: 'Monthly outreach to encourage satisfied guests to leave Google reviews.',
        recurrence: 'monthly',
        daysBeforeAlert: [7, 1],
        tags: ['growth', 'reviews', 'monthly'],
        subtasks: [
            { order: 1, title: 'Export top guests from platform', daysOffset: -7 },
            { order: 2, title: 'Send review request via WhatsApp/email', daysOffset: -5 },
            { order: 3, title: 'Follow up with non-responders', daysOffset: -2 },
            { order: 4, title: 'Record new reviews received', daysOffset: 0 }
        ]
    },
    {
        name: 'Monthly Food Cost Review',
        category: 'finance',
        description: 'Monthly review of food cost percentage and supplier pricing.',
        recurrence: 'monthly',
        daysBeforeAlert: [7, 1],
        tags: ['finance', 'food-cost', 'monthly'],
        subtasks: [
            { order: 1, title: 'Pull food cost report from platform', daysOffset: -5 },
            { order: 2, title: 'Compare actual vs target food cost %', daysOffset: -3 },
            { order: 3, title: 'Review top 10 high-cost items', daysOffset: -2 },
            { order: 4, title: 'Document action plan for next month', daysOffset: 0 }
        ]
    },
    {
        name: 'Weekly Supplier Payment Run',
        category: 'finance',
        description: 'Weekly review and processing of outstanding supplier invoices.',
        recurrence: 'weekly',
        daysBeforeAlert: [1],
        tags: ['finance', 'suppliers', 'weekly'],
        subtasks: [
            { order: 1, title: 'Collect all supplier invoices for the week', daysOffset: -1 },
            { order: 2, title: 'Verify invoice amounts against delivery notes', daysOffset: -1 },
            { order: 3, title: 'Process payments for approved invoices', daysOffset: 0 },
            { order: 4, title: 'File invoices and update cashflow tracker', daysOffset: 0 }
        ]
    },
    {
        name: 'Monthly Staff Meeting',
        category: 'hr',
        description: 'Monthly all-staff meeting to discuss performance, updates, and goals.',
        recurrence: 'monthly',
        daysBeforeAlert: [7, 2],
        tags: ['hr', 'staff', 'monthly'],
        subtasks: [
            { order: 1, title: 'Prepare agenda', daysOffset: -7 },
            { order: 2, title: 'Share agenda with team', daysOffset: -3 },
            { order: 3, title: 'Conduct staff meeting', daysOffset: 0 },
            { order: 4, title: 'Distribute meeting notes', daysOffset: 1 }
        ]
    },
    {
        name: 'Quarterly Staff Performance Review',
        category: 'hr',
        description: 'Quarterly one-on-one performance reviews for all staff members.',
        recurrence: 'quarterly',
        daysBeforeAlert: [14, 7],
        tags: ['hr', 'performance', 'quarterly'],
        subtasks: [
            { order: 1, title: 'Prepare review forms for each staff member', daysOffset: -14 },
            { order: 2, title: 'Schedule one-on-one sessions', daysOffset: -10 },
            { order: 3, title: 'Conduct performance reviews', daysOffset: -3 },
            { order: 4, title: 'File review outcomes and set goals', daysOffset: 0 }
        ]
    },
    {
        name: 'Monthly Equipment Service Check',
        category: 'maintenance',
        description: 'Monthly inspection and service check of all kitchen equipment.',
        recurrence: 'monthly',
        daysBeforeAlert: [7, 1],
        tags: ['maintenance', 'equipment', 'monthly'],
        subtasks: [
            { order: 1, title: 'Inspect fryers and griddles for wear', daysOffset: -3 },
            { order: 2, title: 'Check refrigeration units and temperature logs', daysOffset: -2 },
            { order: 3, title: 'Test all gas connections and safety cutoffs', daysOffset: -1 },
            { order: 4, title: 'Log findings and schedule repairs if needed', daysOffset: 0 }
        ]
    }
];

async function seed() {
    console.log('Seeding ROSS templates...');
    for (const template of templates) {
        const id = db.ref().push().key;
        const record = {
            templateId: id,
            ...template,
            notificationChannels: ['in_app'],
            createdAt: now,
            updatedAt: now
        };
        await db.ref(`ross/templates/${id}`).set(record);
        console.log(`  Created: ${template.name}`);
    }
    console.log('Done. 13 templates seeded.');
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
```

**Step 3: Commit**

```bash
git add functions/seeds/ross-templates-seed.js
git commit -m "feat: add ROSS starter templates seed script (13 templates)"
```

---

## PHASE B — Frontend Service Layer

---

### Task 7: Create `public/js/modules/ross/services/ross-service.js`

**Files:**
- Create: `public/js/modules/ross/services/ross-service.js`

**Context:** Study `public/js/modules/project-management/services/project-service.js` in full. The ROSS service is structurally identical: a class with a `callFunction(name, data)` method that POSTs with a Bearer token, plus named methods for each Cloud Function. Export a singleton instance.

**Step 1: Create directories**

```bash
mkdir -p "public/js/modules/ross/services"
```

**Step 2: Write the service file**

```javascript
/**
 * ROSS Service
 * Firebase API client for all ROSS Cloud Function calls
 * Mirrors the pattern in project-management/services/project-service.js
 */

import { auth } from '../../../config/firebase-config.js';

const FUNCTIONS_BASE_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net';

class RossService {
    async getIdToken() {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');
        return await user.getIdToken(true);
    }

    async callFunction(functionName, data = {}) {
        const idToken = await this.getIdToken();
        const response = await fetch(`${FUNCTIONS_BASE_URL}/${functionName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ data })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${functionName} failed (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        return result.result || result;
    }

    // ---- Templates ----
    async getTemplates(category = null) {
        return this.callFunction('rossGetTemplates', category ? { category } : {});
    }

    async createTemplate(templateData) {
        return this.callFunction('rossCreateTemplate', templateData);
    }

    async updateTemplate(templateId, updates) {
        return this.callFunction('rossUpdateTemplate', { templateId, updates });
    }

    async deleteTemplate(templateId) {
        return this.callFunction('rossDeleteTemplate', { templateId });
    }

    // ---- Workflows ----
    async activateWorkflow(data) {
        return this.callFunction('rossActivateWorkflow', data);
    }

    async createWorkflow(data) {
        return this.callFunction('rossCreateWorkflow', data);
    }

    async updateWorkflow(locationId, workflowId, updates) {
        return this.callFunction('rossUpdateWorkflow', { locationId, workflowId, updates });
    }

    async deleteWorkflow(locationId, workflowId) {
        return this.callFunction('rossDeleteWorkflow', { locationId, workflowId });
    }

    async getWorkflows(locationId, filters = {}) {
        return this.callFunction('rossGetWorkflows', { locationId, ...filters });
    }

    // ---- Tasks ----
    async manageTask(locationId, workflowId, action, taskId, taskData) {
        return this.callFunction('rossManageTask', { locationId, workflowId, action, taskId, taskData });
    }

    async completeTask(locationId, workflowId, taskId) {
        return this.callFunction('rossCompleteTask', { locationId, workflowId, taskId });
    }

    // ---- Reports ----
    async getReports(locationId) {
        return this.callFunction('rossGetReports', { locationId });
    }

    async manageStaff({ locationId, action, staffId, staffData }) {
        return this.callFunction('rossManageStaff', { locationId, action, staffId, staffData });
    }

    async getStaff(locationId) {
        return this.callFunction('rossGetStaff', { locationId });
    }
}

export const rossService = new RossService();
export default rossService;
```

**Step 3: Commit**

```bash
git add "public/js/modules/ross/services/ross-service.js"
git commit -m "feat: add ROSS service layer (ross-service.js)"
```

---

## PHASE C — Frontend Vue 3 Module

---

### Task 8: Create `public/js/modules/ross/index.js` — Module scaffold + View 1 (Overview Dashboard)

**Files:**
- Create: `public/js/modules/ross/index.js`

**Context:**
- Vue 3 is loaded as a global CDN script (`vue.global.prod.js`). Use `Vue.createApp({})` — NOT `import { createApp } from 'vue'`.
- The module exports `initializeRoss()` and `cleanupRoss()`, matching the PM module's `initializeProjectManagement` / `cleanupProjectManagement` pattern.
- All user-facing confirmations use `Swal.fire()` (SweetAlert2 global).
- All HTML rendered via `innerHTML` must use `escapeHtml()`.
- State is immutable — never mutate `this.state.*` directly; always replace with a new object or array.
- The 5 views are: `overview`, `templates`, `workflows`, `builder`, `reports`.
- This task covers the scaffold, tab system, and the Overview Dashboard view.

```javascript
/**
 * ROSS — Restaurant OS Service Module
 * Vue 3 admin dashboard module — workflow automation for restaurant operators
 *
 * Mount target: #ross-app
 * Exports: initializeRoss(), cleanupRoss()
 */

import { rossService } from './services/ross-service.js';
import { auth, rtdb, ref, onValue } from '../../config/firebase-config.js';

// ============================================
// CONSTANTS
// ============================================

const CATEGORY_LABELS = {
    compliance: 'Compliance',
    operations: 'Operations',
    growth: 'Growth',
    finance: 'Finance',
    hr: 'HR & People',
    maintenance: 'Maintenance'
};

const CATEGORY_ICONS = {
    compliance: 'fa-shield-alt',
    operations: 'fa-cogs',
    growth: 'fa-chart-line',
    finance: 'fa-dollar-sign',
    hr: 'fa-users',
    maintenance: 'fa-wrench'
};

const RECURRENCE_LABELS = {
    once: 'Once',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    annually: 'Annual'
};

// ============================================
// HELPERS
// ============================================

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(ts) {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

function daysUntil(ts) {
    if (!ts) return null;
    return Math.round((ts - Date.now()) / 86400000);
}

function getDueSeverity(days) {
    if (days === null) return 'secondary';
    if (days < 0) return 'danger';
    if (days <= 7) return 'danger';
    if (days <= 30) return 'warning';
    return 'success';
}

function calcProgress(tasks) {
    const list = Object.values(tasks || {});
    if (!list.length) return 0;
    return Math.round((list.filter(t => t.status === 'completed').length / list.length) * 100);
}

// ============================================
// MODULE STATE
// ============================================

const rossModuleState = {
    app: null,
    unsubscribeNotifications: null
};

// ============================================
// VUE APP
// ============================================

function createRossApp() {
    return Vue.createApp({
        data() {
            return {
                activeTab: 'overview',
                loading: false,
                error: null,

                // Data
                workflows: [],
                templates: [],
                reportData: [],

                // Location context (loaded from RTDB)
                locations: [],
                selectedLocationId: null,

                // Notifications (in-app alerts)
                alerts: []
            };
        },

        computed: {
            overdueWorkflows() {
                return this.workflows.filter(w => daysUntil(w.nextDueDate) < 0);
            },
            dueSoonWorkflows() {
                const d = daysUntil;
                return this.workflows.filter(w => {
                    const days = d(w.nextDueDate);
                    return days !== null && days >= 0 && days <= 30;
                });
            },
            categoryStats() {
                return Object.keys(CATEGORY_LABELS).map(cat => {
                    const inCat = this.workflows.filter(w => w.category === cat);
                    const total = inCat.length;
                    if (!total) return null;
                    const avgProgress = total
                        ? Math.round(inCat.reduce((sum, w) => sum + calcProgress(w.tasks), 0) / total)
                        : 0;
                    return {
                        key: cat,
                        label: CATEGORY_LABELS[cat],
                        icon: CATEGORY_ICONS[cat],
                        count: total,
                        avgProgress
                    };
                }).filter(Boolean);
            },
            todaysTasks() {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayEnd = today.getTime() + 86400000;
                const result = [];
                this.workflows.forEach(w => {
                    Object.values(w.tasks || {}).forEach(task => {
                        if (task.status !== 'completed' && task.dueDate && task.dueDate < todayEnd) {
                            result.push({ ...task, workflowName: w.name, workflowId: w.workflowId, locationId: w.locationId });
                        }
                    });
                });
                return result.sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
            }
        },

        methods: {
            switchTab(tab) {
                this.activeTab = tab;
                if (tab === 'workflows' && this.selectedLocationId) {
                    this.loadWorkflows();
                } else if (tab === 'templates') {
                    this.loadTemplates();
                } else if (tab === 'reports' && this.selectedLocationId) {
                    this.loadReports();
                }
            },

            async loadLocations() {
                try {
                    const { get, ref: dbRef } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js');
                    // Use the already-imported rtdb from firebase-config
                    const snap = await import('../../config/firebase-config.js');
                    // Locations are read directly from RTDB
                    const locRef = ref(rtdb, 'locations');
                    const snapshot = await new Promise(resolve => onValue(locRef, resolve, { onlyOnce: true }));
                    const raw = snapshot.val() || {};
                    this.locations = Object.values(raw).filter(l => l.isActive !== false);
                    if (this.locations.length > 0 && !this.selectedLocationId) {
                        this.selectedLocationId = this.locations[0].id || Object.keys(raw)[0];
                    }
                } catch (err) {
                    console.error('[ROSS] loadLocations error:', err);
                }
            },

            async loadWorkflows() {
                if (!this.selectedLocationId) return;
                this.loading = true;
                this.error = null;
                try {
                    const result = await rossService.getWorkflows(this.selectedLocationId);
                    this.workflows = result.workflows || [];
                } catch (err) {
                    this.error = 'Failed to load workflows. Please try again.';
                    console.error('[ROSS] loadWorkflows error:', err);
                } finally {
                    this.loading = false;
                }
            },

            async loadTemplates() {
                this.loading = true;
                this.error = null;
                try {
                    const result = await rossService.getTemplates();
                    this.templates = result.templates || [];
                } catch (err) {
                    this.error = 'Failed to load templates. Please try again.';
                    console.error('[ROSS] loadTemplates error:', err);
                } finally {
                    this.loading = false;
                }
            },

            async loadReports() {
                if (!this.selectedLocationId) return;
                this.loading = true;
                try {
                    const result = await rossService.getReports(this.selectedLocationId);
                    this.reportData = result.report || [];
                } catch (err) {
                    console.error('[ROSS] loadReports error:', err);
                } finally {
                    this.loading = false;
                }
            },

            getCategoryLabel(key) {
                return CATEGORY_LABELS[key] || key;
            },
            getCategoryIcon(key) {
                return CATEGORY_ICONS[key] || 'fa-circle';
            },
            getRecurrenceLabel(key) {
                return RECURRENCE_LABELS[key] || key;
            },
            formatDate,
            daysUntil,
            getDueSeverity,
            calcProgress,
            escapeHtml
        },

        async mounted() {
            await this.loadLocations();
            if (this.selectedLocationId) {
                await this.loadWorkflows();
            }
        },

        template: `
        <div class="ross-module">

            <!-- Header -->
            <div class="section-header mb-4">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div>
                        <h2><i class="fas fa-robot me-2 text-primary"></i>ROSS — Restaurant OS Service</h2>
                        <p class="text-muted mb-0">Workflow automation and compliance tracking</p>
                    </div>
                    <div class="d-flex gap-2">
                        <select v-if="locations.length > 1" class="form-select form-select-sm"
                            v-model="selectedLocationId" @change="loadWorkflows()" style="width:auto">
                            <option v-for="loc in locations" :key="loc.id" :value="loc.id">
                                {{ loc.name }}
                            </option>
                        </select>
                        <button class="btn btn-primary btn-sm" @click="switchTab('templates')">
                            <i class="fas fa-plus me-1"></i>Activate Template
                        </button>
                        <button class="btn btn-outline-primary btn-sm" @click="switchTab('builder')">
                            <i class="fas fa-pencil-alt me-1"></i>Custom Workflow
                        </button>
                    </div>
                </div>
            </div>

            <!-- Tab Nav -->
            <ul class="nav nav-tabs mb-4">
                <li class="nav-item">
                    <a class="nav-link" :class="{ active: activeTab === 'overview' }"
                        href="#" @click.prevent="switchTab('overview')">
                        <i class="fas fa-tachometer-alt me-1"></i>Overview
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{ active: activeTab === 'templates' }"
                        href="#" @click.prevent="switchTab('templates')">
                        <i class="fas fa-book me-1"></i>Template Library
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{ active: activeTab === 'workflows' }"
                        href="#" @click.prevent="switchTab('workflows')">
                        <i class="fas fa-tasks me-1"></i>My Workflows
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{ active: activeTab === 'builder' }"
                        href="#" @click.prevent="switchTab('builder')">
                        <i class="fas fa-wrench me-1"></i>Workflow Builder
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{ active: activeTab === 'reports' }"
                        href="#" @click.prevent="switchTab('reports')">
                        <i class="fas fa-chart-bar me-1"></i>Reports
                    </a>
                </li>
            </ul>

            <!-- Error Banner -->
            <div v-if="error" class="alert alert-danger alert-dismissible">
                {{ error }}
                <button class="btn-close" @click="error = null"></button>
            </div>

            <!-- Loading Spinner -->
            <div v-if="loading" class="text-center py-5">
                <div class="spinner-border text-primary"></div>
                <p class="mt-2 text-muted">Loading...</p>
            </div>

            <!-- VIEW 1: Overview Dashboard -->
            <div v-if="activeTab === 'overview' && !loading">

                <!-- Alert Strip -->
                <div v-if="overdueWorkflows.length || dueSoonWorkflows.length" class="mb-4">
                    <div v-for="w in overdueWorkflows" :key="'ov-'+w.workflowId"
                        class="alert alert-danger d-flex justify-content-between align-items-center py-2">
                        <span>
                            <i class="fas fa-exclamation-circle me-2"></i>
                            <strong>{{ w.name }}</strong> is overdue (was due {{ formatDate(w.nextDueDate) }})
                        </span>
                        <button class="btn btn-sm btn-outline-danger" @click="switchTab('workflows')">View</button>
                    </div>
                    <div v-for="w in dueSoonWorkflows" :key="'ds-'+w.workflowId"
                        class="alert alert-warning d-flex justify-content-between align-items-center py-2">
                        <span>
                            <i class="fas fa-clock me-2"></i>
                            <strong>{{ w.name }}</strong> is due in {{ daysUntil(w.nextDueDate) }} days
                        </span>
                        <button class="btn btn-sm btn-outline-warning" @click="switchTab('workflows')">View</button>
                    </div>
                </div>

                <!-- Category Summary Cards -->
                <div class="row g-3 mb-4">
                    <div v-if="!categoryStats.length" class="col-12">
                        <div class="card border-0 bg-light text-center py-5">
                            <i class="fas fa-robot fa-3x text-muted mb-3"></i>
                            <h5 class="text-muted">No active workflows yet</h5>
                            <p class="text-muted">Activate a template or build a custom workflow to get started.</p>
                            <button class="btn btn-primary mx-auto" style="width:fit-content" @click="switchTab('templates')">
                                Browse Template Library
                            </button>
                        </div>
                    </div>
                    <div v-for="stat in categoryStats" :key="stat.key" class="col-md-4 col-lg-3">
                        <div class="card border-0 shadow-sm h-100">
                            <div class="card-body">
                                <div class="d-flex align-items-center mb-2">
                                    <i :class="'fas ' + stat.icon + ' fa-lg me-2 text-primary'"></i>
                                    <strong>{{ stat.label }}</strong>
                                </div>
                                <div class="text-muted small mb-2">{{ stat.count }} workflow{{ stat.count !== 1 ? 's' : '' }}</div>
                                <div class="progress" style="height:6px">
                                    <div class="progress-bar" :style="'width:' + stat.avgProgress + '%'"
                                        :class="stat.avgProgress === 100 ? 'bg-success' : 'bg-primary'"></div>
                                </div>
                                <div class="text-muted small mt-1">{{ stat.avgProgress }}% avg completion</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Today's Tasks -->
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-white border-0">
                        <h6 class="mb-0"><i class="fas fa-calendar-day me-2"></i>Today's Tasks</h6>
                    </div>
                    <div class="card-body p-0">
                        <div v-if="!todaysTasks.length" class="text-center py-4 text-muted">
                            <i class="fas fa-check-circle fa-2x mb-2 text-success"></i>
                            <p>No tasks due today.</p>
                        </div>
                        <ul v-else class="list-group list-group-flush">
                            <li v-for="task in todaysTasks" :key="task.workflowId + '-' + task.title"
                                class="list-group-item d-flex justify-content-between align-items-center">
                                <span>
                                    <span class="badge bg-secondary me-2">{{ getCategoryLabel(task.category) }}</span>
                                    {{ task.title }}
                                    <small class="text-muted ms-2">— {{ task.workflowName }}</small>
                                </span>
                                <span :class="'badge bg-' + getDueSeverity(daysUntil(task.dueDate))">
                                    {{ daysUntil(task.dueDate) < 0 ? 'Overdue' : 'Today' }}
                                </span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- VIEW 2: Template Library (stub — Task 9) -->
            <div v-if="activeTab === 'templates' && !loading">
                <p class="text-muted">Template Library loading...</p>
            </div>

            <!-- VIEW 3: My Workflows (stub — Task 10) -->
            <div v-if="activeTab === 'workflows' && !loading">
                <p class="text-muted">Workflows loading...</p>
            </div>

            <!-- VIEW 4: Workflow Builder (stub — Task 11) -->
            <div v-if="activeTab === 'builder' && !loading">
                <p class="text-muted">Workflow Builder loading...</p>
            </div>

            <!-- VIEW 5: Reports (stub — Task 12) -->
            <div v-if="activeTab === 'reports' && !loading">
                <p class="text-muted">Reports loading...</p>
            </div>

        </div>`
    });
}

// ============================================
// EXPORTS
// ============================================

export async function initializeRoss() {
    const container = document.getElementById('ross-app');
    if (!container) {
        console.error('[ROSS] Mount target #ross-app not found');
        return null;
    }

    if (typeof Vue === 'undefined') {
        container.innerHTML = `<div class="alert alert-danger m-4">
            <h4><i class="fas fa-exclamation-triangle me-2"></i>Error</h4>
            <p>Vue.js is required for ROSS. Please refresh the page.</p>
        </div>`;
        return null;
    }

    container.innerHTML = '';
    rossModuleState.app = createRossApp().mount(container);
    return rossModuleState.app;
}

export function cleanupRoss() {
    if (rossModuleState.app) {
        rossModuleState.app.$el && rossModuleState.app.$.appContext.app.unmount();
        rossModuleState.app = null;
    }
    if (rossModuleState.unsubscribeNotifications) {
        rossModuleState.unsubscribeNotifications();
        rossModuleState.unsubscribeNotifications = null;
    }
}
```

**Step 2: Commit**

```bash
git add "public/js/modules/ross/index.js"
git commit -m "feat: add ROSS Vue 3 module scaffold — overview dashboard (View 1)"
```

---

### Task 9: Expand `index.js` — View 2 (Template Library)

**Files:**
- Modify: `public/js/modules/ross/index.js`

**Context:** Replace the View 2 stub in the template with the full Template Library view. The library shows filterable template cards. "Activate" opens a SweetAlert2 confirmation modal asking for location, start date, and optional workflow name. Super Admin users also see an "Edit" button per card.

**Step 1: Add template library data and methods to the Vue `data()` and `methods` blocks**

In the `data()` return object, add:
```javascript
templateFilter: 'all',
isSuperAdmin: false,
```

In `methods`, add:
```javascript
async checkSuperAdmin() {
    // Super admin status is indicated by the admins/{uid} record's superAdmin field
    // We read this from the token claims — simplest approach is to check the RTDB
    try {
        const user = auth.currentUser;
        if (!user) return;
        const { get: dbGet, ref: dbRef } = { get: null, ref: null };
        // Use already-imported rtdb helpers
        const snap = await new Promise(resolve => {
            onValue(ref(rtdb, `admins/${user.uid}`), resolve, { onlyOnce: true });
        });
        this.isSuperAdmin = !!(snap.val() && snap.val().superAdmin);
    } catch (e) {
        this.isSuperAdmin = false;
    }
},

filteredTemplates() {
    if (this.templateFilter === 'all') return this.templates;
    return this.templates.filter(t => t.category === this.templateFilter);
},

async activateTemplate(template) {
    if (!this.selectedLocationId) {
        Swal.fire('No Location', 'Please select a location first.', 'warning');
        return;
    }
    const { value: formValues } = await Swal.fire({
        title: 'Activate Template',
        html: `
            <p class="text-start">Activating: <strong>${escapeHtml(template.name)}</strong></p>
            <div class="mb-3 text-start">
                <label class="form-label">Workflow Name (optional)</label>
                <input id="swal-wf-name" class="swal2-input" placeholder="${escapeHtml(template.name)}" value="${escapeHtml(template.name)}">
            </div>
            <div class="mb-3 text-start">
                <label class="form-label">Next Due Date <span class="text-danger">*</span></label>
                <input id="swal-wf-date" type="date" class="swal2-input">
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Activate',
        preConfirm: () => {
            const name = document.getElementById('swal-wf-name').value.trim();
            const date = document.getElementById('swal-wf-date').value;
            if (!date) {
                Swal.showValidationMessage('Please select a due date');
                return false;
            }
            return { name: name || template.name, nextDueDate: new Date(date).getTime() };
        }
    });
    if (!formValues) return;
    try {
        await rossService.activateWorkflow({
            templateId: template.templateId,
            locationId: this.selectedLocationId,
            name: formValues.name,
            nextDueDate: formValues.nextDueDate
        });
        Swal.fire('Activated!', `${escapeHtml(template.name)} is now active.`, 'success');
        this.switchTab('workflows');
    } catch (err) {
        Swal.fire('Error', 'Failed to activate workflow. Please try again.', 'error');
    }
},

async deleteTemplate(template) {
    const confirm = await Swal.fire({
        title: 'Delete Template?',
        text: `This will permanently delete "${template.name}". Existing workflows are not affected.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#dc3545'
    });
    if (!confirm.isConfirmed) return;
    try {
        await rossService.deleteTemplate(template.templateId);
        this.templates = this.templates.filter(t => t.templateId !== template.templateId);
        Swal.fire('Deleted', 'Template removed.', 'success');
    } catch (err) {
        Swal.fire('Error', 'Failed to delete template.', 'error');
    }
}
```

**Step 2: Replace the View 2 stub in the Vue template**

Replace:
```html
<!-- VIEW 2: Template Library (stub — Task 9) -->
<div v-if="activeTab === 'templates' && !loading">
    <p class="text-muted">Template Library loading...</p>
</div>
```

With:
```html
<!-- VIEW 2: Template Library -->
<div v-if="activeTab === 'templates' && !loading">
    <!-- Category Filter Tabs -->
    <ul class="nav nav-pills mb-4 flex-wrap gap-1">
        <li v-for="cat in [{ key: 'all', label: 'All' }, ...Object.keys(CATEGORY_LABELS).map(k => ({ key: k, label: getCategoryLabel(k) }))]"
            :key="cat.key" class="nav-item">
            <a class="nav-link py-1 px-3" :class="{ active: templateFilter === cat.key }"
                href="#" @click.prevent="templateFilter = cat.key">{{ cat.label }}</a>
        </li>
    </ul>

    <div v-if="!filteredTemplates().length" class="text-center py-5 text-muted">
        <i class="fas fa-book fa-3x mb-3"></i>
        <p>No templates found.</p>
    </div>

    <div class="row g-3">
        <div v-for="tmpl in filteredTemplates()" :key="tmpl.templateId" class="col-md-6 col-lg-4">
            <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h6 class="card-title mb-0">{{ tmpl.name }}</h6>
                        <span class="badge bg-secondary ms-2">{{ getRecurrenceLabel(tmpl.recurrence) }}</span>
                    </div>
                    <p class="text-muted small mb-2">{{ tmpl.description }}</p>
                    <div class="text-muted small">
                        <i :class="'fas ' + getCategoryIcon(tmpl.category) + ' me-1'"></i>
                        {{ getCategoryLabel(tmpl.category) }}
                        &bull;
                        {{ (tmpl.subtasks || []).length }} subtasks
                    </div>
                </div>
                <div class="card-footer bg-white border-0 d-flex gap-2">
                    <button class="btn btn-primary btn-sm flex-grow-1" @click="activateTemplate(tmpl)">
                        <i class="fas fa-play me-1"></i>Activate
                    </button>
                    <button v-if="isSuperAdmin" class="btn btn-outline-secondary btn-sm"
                        @click="openEditTemplate(tmpl)" title="Edit template">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button v-if="isSuperAdmin" class="btn btn-outline-danger btn-sm"
                        @click="deleteTemplate(tmpl)" title="Delete template">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Super Admin: Add Template -->
    <div v-if="isSuperAdmin" class="mt-4">
        <button class="btn btn-outline-primary" @click="openCreateTemplate()">
            <i class="fas fa-plus me-1"></i>Add Template
        </button>
    </div>
</div>
```

Also expose `CATEGORY_LABELS` to the template by adding it to `data()`:
```javascript
CATEGORY_LABELS: CATEGORY_LABELS
```

And add stubs for `openEditTemplate` and `openCreateTemplate` in methods (full implementation is optional for Phase 1 — these can show a "Coming soon" Swal):
```javascript
async openEditTemplate(tmpl) {
    Swal.fire('Coming Soon', 'Template editing UI will be added in a future update.', 'info');
},
async openCreateTemplate() {
    Swal.fire('Coming Soon', 'Template creation UI will be added in a future update.', 'info');
}
```

Call `this.checkSuperAdmin()` inside `mounted()` before the existing calls.

**Step 3: Commit**

```bash
git add "public/js/modules/ross/index.js"
git commit -m "feat: ROSS View 2 — Template Library with activate modal"
```

---

### Task 10: Expand `index.js` — View 3 (My Workflows + Workflow Detail)

**Files:**
- Modify: `public/js/modules/ross/index.js`

**Step 1: Add workflow management state to `data()`**

```javascript
workflowFilter: { category: 'all', status: 'all' },
selectedWorkflow: null,      // null = list view; workflow object = detail view
workflowDetailTab: 'tasks'   // 'tasks' | 'history' | 'settings'
```

**Step 2: Add computed properties**

```javascript
filteredWorkflows() {
    return this.workflows.filter(w => {
        const catOk = this.workflowFilter.category === 'all' || w.category === this.workflowFilter.category;
        const statusOk = this.workflowFilter.status === 'all' || w.status === this.workflowFilter.status;
        return catOk && statusOk;
    });
},
selectedWorkflowTasks() {
    if (!this.selectedWorkflow) return [];
    return Object.entries(this.selectedWorkflow.tasks || {})
        .map(([id, t]) => ({ ...t, _taskId: id }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
},
selectedWorkflowHistory() {
    if (!this.selectedWorkflow) return [];
    return Object.values(this.selectedWorkflow.history || {})
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
}
```

**Step 3: Add workflow methods**

```javascript
openWorkflow(workflow) {
    this.selectedWorkflow = { ...workflow };
    this.workflowDetailTab = 'tasks';
},

closeWorkflowDetail() {
    this.selectedWorkflow = null;
    this.loadWorkflows();
},

async markTaskComplete(task) {
    const wf = this.selectedWorkflow;
    const confirm = await Swal.fire({
        title: 'Mark Task Complete?',
        text: task.title,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Complete'
    });
    if (!confirm.isConfirmed) return;
    try {
        await rossService.completeTask(wf.locationId, wf.workflowId, task._taskId);
        // Immutable update
        const updatedTasks = { ...wf.tasks };
        updatedTasks[task._taskId] = { ...updatedTasks[task._taskId], status: 'completed', completedAt: Date.now() };
        this.selectedWorkflow = { ...wf, tasks: updatedTasks };
    } catch (err) {
        Swal.fire('Error', 'Could not complete task. Please try again.', 'error');
    }
},

async deleteWorkflow(workflow) {
    const confirm = await Swal.fire({
        title: 'Delete Workflow?',
        text: `"${workflow.name}" and all its task history will be permanently deleted.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#dc3545'
    });
    if (!confirm.isConfirmed) return;
    try {
        await rossService.deleteWorkflow(workflow.locationId, workflow.workflowId);
        this.workflows = this.workflows.filter(w => w.workflowId !== workflow.workflowId);
        Swal.fire('Deleted', 'Workflow removed.', 'success');
    } catch (err) {
        Swal.fire('Error', 'Failed to delete workflow.', 'error');
    }
},

async pauseResumeWorkflow(workflow) {
    const newStatus = workflow.status === 'active' ? 'paused' : 'active';
    try {
        await rossService.updateWorkflow(workflow.locationId, workflow.workflowId, { status: newStatus });
        // Immutable update in list
        this.workflows = this.workflows.map(w =>
            w.workflowId === workflow.workflowId ? { ...w, status: newStatus } : w
        );
        if (this.selectedWorkflow && this.selectedWorkflow.workflowId === workflow.workflowId) {
            this.selectedWorkflow = { ...this.selectedWorkflow, status: newStatus };
        }
    } catch (err) {
        Swal.fire('Error', 'Could not update workflow status.', 'error');
    }
}
```

**Step 4: Replace the View 3 stub in the template**

Replace:
```html
<!-- VIEW 3: My Workflows (stub — Task 10) -->
<div v-if="activeTab === 'workflows' && !loading">
    <p class="text-muted">Workflows loading...</p>
</div>
```

With:
```html
<!-- VIEW 3: My Workflows -->
<div v-if="activeTab === 'workflows' && !loading">

    <!-- Workflow Detail View -->
    <div v-if="selectedWorkflow">
        <div class="d-flex align-items-center mb-3">
            <button class="btn btn-sm btn-outline-secondary me-3" @click="closeWorkflowDetail()">
                <i class="fas fa-arrow-left me-1"></i>Back
            </button>
            <h5 class="mb-0">{{ selectedWorkflow.name }}</h5>
            <span :class="'badge ms-2 ' + (selectedWorkflow.status === 'active' ? 'bg-success' : 'bg-secondary')">
                {{ selectedWorkflow.status }}
            </span>
        </div>

        <!-- Detail Sub-tabs -->
        <ul class="nav nav-tabs mb-3">
            <li class="nav-item">
                <a class="nav-link" :class="{ active: workflowDetailTab === 'tasks' }"
                    href="#" @click.prevent="workflowDetailTab = 'tasks'">Tasks</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" :class="{ active: workflowDetailTab === 'history' }"
                    href="#" @click.prevent="workflowDetailTab = 'history'">History</a>
            </li>
        </ul>

        <!-- Tasks Sub-view -->
        <div v-if="workflowDetailTab === 'tasks'">
            <div v-if="!selectedWorkflowTasks.length" class="text-center py-4 text-muted">
                No tasks configured.
            </div>
            <ul class="list-group">
                <li v-for="task in selectedWorkflowTasks" :key="task._taskId"
                    class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <span :class="task.status === 'completed' ? 'text-decoration-line-through text-muted' : ''">
                            {{ task.title }}
                        </span>
                        <br>
                        <small class="text-muted">Due: {{ formatDate(task.dueDate) }}</small>
                    </div>
                    <button v-if="task.status !== 'completed'"
                        class="btn btn-sm btn-outline-success" @click="markTaskComplete(task)">
                        <i class="fas fa-check me-1"></i>Complete
                    </button>
                    <span v-else class="badge bg-success"><i class="fas fa-check me-1"></i>Done</span>
                </li>
            </ul>
        </div>

        <!-- History Sub-view -->
        <div v-if="workflowDetailTab === 'history'">
            <div v-if="!selectedWorkflowHistory.length" class="text-center py-4 text-muted">
                No completion history yet.
            </div>
            <ul v-else class="list-group">
                <li v-for="record in selectedWorkflowHistory" :key="record.cycleId"
                    class="list-group-item d-flex justify-content-between">
                    <span>{{ record.period }}</span>
                    <span>
                        <span :class="'badge ' + (record.completionRate === 100 ? 'bg-success' : 'bg-warning text-dark')">
                            {{ record.completionRate }}%
                        </span>
                        <span v-if="record.onTime" class="badge bg-success ms-1">On Time</span>
                        <span v-else class="badge bg-danger ms-1">Late</span>
                    </span>
                </li>
            </ul>
        </div>
    </div>

    <!-- Workflow List View -->
    <div v-else>
        <!-- Filters -->
        <div class="d-flex gap-2 mb-3 flex-wrap">
            <select class="form-select form-select-sm" style="width:auto"
                v-model="workflowFilter.category" >
                <option value="all">All Categories</option>
                <option v-for="(label, key) in CATEGORY_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
            <select class="form-select form-select-sm" style="width:auto"
                v-model="workflowFilter.status">
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
            </select>
        </div>

        <div v-if="!filteredWorkflows().length" class="text-center py-5 text-muted">
            <i class="fas fa-tasks fa-3x mb-3"></i>
            <p>No workflows found.</p>
        </div>

        <div class="row g-3">
            <div v-for="wf in filteredWorkflows()" :key="wf.workflowId" class="col-md-6">
                <div class="card border-0 shadow-sm h-100"
                    :class="daysUntil(wf.nextDueDate) !== null && daysUntil(wf.nextDueDate) < 0 ? 'border-danger border-2' : ''">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="card-title mb-0">{{ wf.name }}</h6>
                            <span :class="'badge bg-' + getDueSeverity(daysUntil(wf.nextDueDate))">
                                {{ daysUntil(wf.nextDueDate) !== null && daysUntil(wf.nextDueDate) < 0
                                    ? 'Overdue'
                                    : daysUntil(wf.nextDueDate) === 0 ? 'Due Today'
                                    : 'Due in ' + daysUntil(wf.nextDueDate) + 'd' }}
                            </span>
                        </div>
                        <div class="text-muted small mb-2">
                            <i :class="'fas ' + getCategoryIcon(wf.category) + ' me-1'"></i>
                            {{ getCategoryLabel(wf.category) }}
                            &bull; {{ getRecurrenceLabel(wf.recurrence) }}
                            &bull; {{ formatDate(wf.nextDueDate) }}
                        </div>
                        <div class="progress mb-1" style="height:6px">
                            <div class="progress-bar"
                                :style="'width:' + calcProgress(wf.tasks) + '%'"
                                :class="calcProgress(wf.tasks) === 100 ? 'bg-success' : 'bg-primary'"></div>
                        </div>
                        <small class="text-muted">{{ calcProgress(wf.tasks) }}% complete</small>
                    </div>
                    <div class="card-footer bg-white border-0 d-flex gap-1">
                        <button class="btn btn-primary btn-sm flex-grow-1" @click="openWorkflow(wf)">
                            <i class="fas fa-eye me-1"></i>View
                        </button>
                        <button class="btn btn-outline-secondary btn-sm"
                            @click="pauseResumeWorkflow(wf)"
                            :title="wf.status === 'active' ? 'Pause' : 'Resume'">
                            <i :class="'fas ' + (wf.status === 'active' ? 'fa-pause' : 'fa-play')"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm" @click="deleteWorkflow(wf)" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
```

**Step 5: Commit**

```bash
git add "public/js/modules/ross/index.js"
git commit -m "feat: ROSS View 3 — My Workflows list and workflow detail/checklist"
```

---

### Task 11: Expand `index.js` — View 4 (Workflow Builder)

**Files:**
- Modify: `public/js/modules/ross/index.js`

**Step 1: Add builder state to `data()`**

```javascript
builder: {
    step: 1,
    name: '',
    category: 'operations',
    recurrence: 'monthly',
    nextDueDate: '',
    subtasks: [],
    daysBeforeAlert: [30, 7],
    notifyPhone: '',
    notifyEmail: ''
},
builderSubtaskInput: ''
```

**Step 2: Add builder methods**

```javascript
builderNextStep() {
    if (this.builder.step === 1 && !this.builder.name.trim()) {
        Swal.fire('Required', 'Please enter a workflow name.', 'warning');
        return;
    }
    if (this.builder.step === 2 && !this.builder.nextDueDate) {
        Swal.fire('Required', 'Please select a due date.', 'warning');
        return;
    }
    this.builder = { ...this.builder, step: this.builder.step + 1 };
},

builderPrevStep() {
    this.builder = { ...this.builder, step: this.builder.step - 1 };
},

builderAddSubtask() {
    const title = this.builderSubtaskInput.trim();
    if (!title) return;
    const newSubtasks = [
        ...this.builder.subtasks,
        { title, order: this.builder.subtasks.length + 1, dueDate: null }
    ];
    this.builder = { ...this.builder, subtasks: newSubtasks };
    this.builderSubtaskInput = '';
},

builderRemoveSubtask(index) {
    const newSubtasks = this.builder.subtasks.filter((_, i) => i !== index);
    this.builder = { ...this.builder, subtasks: newSubtasks };
},

builderComputedDueDate(subtask) {
    if (!this.builder.nextDueDate) return 'TBD';
    const base = new Date(this.builder.nextDueDate).getTime();
    return formatDate(base);
},

async builderSave() {
    if (!this.selectedLocationId) {
        Swal.fire('No Location', 'Please select a location first.', 'warning');
        return;
    }
    if (!this.builder.name.trim() || !this.builder.nextDueDate) {
        Swal.fire('Incomplete', 'Please complete all required fields.', 'warning');
        return;
    }
    try {
        const nextDueDate = new Date(this.builder.nextDueDate).getTime();
        const subtasks = this.builder.subtasks.map((s, i) => ({
            ...s,
            order: i + 1,
            dueDate: nextDueDate
        }));
        await rossService.createWorkflow({
            name: this.builder.name,
            category: this.builder.category,
            recurrence: this.builder.recurrence,
            locationId: this.selectedLocationId,
            nextDueDate,
            subtasks,
            daysBeforeAlert: this.builder.daysBeforeAlert,
            notifyPhone: this.builder.notifyPhone || null,
            notifyEmail: this.builder.notifyEmail || null
        });
        Swal.fire('Created!', 'Your workflow is now active.', 'success');
        // Reset builder
        this.builder = {
            step: 1, name: '', category: 'operations', recurrence: 'monthly',
            nextDueDate: '', subtasks: [], daysBeforeAlert: [30, 7],
            notifyPhone: '', notifyEmail: ''
        };
        this.switchTab('workflows');
    } catch (err) {
        Swal.fire('Error', 'Failed to create workflow. Please try again.', 'error');
    }
}
```

**Step 3: Replace the View 4 stub in the template**

Replace:
```html
<!-- VIEW 4: Workflow Builder (stub — Task 11) -->
<div v-if="activeTab === 'builder' && !loading">
    <p class="text-muted">Workflow Builder loading...</p>
</div>
```

With:
```html
<!-- VIEW 4: Workflow Builder -->
<div v-if="activeTab === 'builder' && !loading">
    <div class="card border-0 shadow-sm" style="max-width:680px">
        <div class="card-header bg-white border-0">
            <div class="d-flex justify-content-between align-items-center">
                <h6 class="mb-0"><i class="fas fa-wrench me-2"></i>Build Custom Workflow</h6>
                <span class="text-muted small">Step {{ builder.step }} of 4</span>
            </div>
            <div class="progress mt-2" style="height:4px">
                <div class="progress-bar bg-primary" :style="'width:' + (builder.step / 4 * 100) + '%'"></div>
            </div>
        </div>
        <div class="card-body">

            <!-- Step 1: Name & Category -->
            <div v-if="builder.step === 1">
                <h6 class="mb-3">Name &amp; Category</h6>
                <div class="mb-3">
                    <label class="form-label">Workflow Name <span class="text-danger">*</span></label>
                    <input class="form-control" v-model="builder.name" placeholder="e.g. Monthly Supplier Payment Run">
                </div>
                <div class="mb-3">
                    <label class="form-label">Category</label>
                    <select class="form-select" v-model="builder.category">
                        <option v-for="(label, key) in CATEGORY_LABELS" :key="key" :value="key">{{ label }}</option>
                    </select>
                </div>
            </div>

            <!-- Step 2: Recurrence & Due Date -->
            <div v-if="builder.step === 2">
                <h6 class="mb-3">Recurrence &amp; Due Date</h6>
                <div class="mb-3">
                    <label class="form-label">Recurrence</label>
                    <select class="form-select" v-model="builder.recurrence">
                        <option v-for="(label, key) in { once: 'Once', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annual' }" :key="key" :value="key">{{ label }}</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">Next Due Date <span class="text-danger">*</span></label>
                    <input type="date" class="form-control" v-model="builder.nextDueDate">
                </div>
            </div>

            <!-- Step 3: Subtasks -->
            <div v-if="builder.step === 3">
                <h6 class="mb-3">Subtasks</h6>
                <div class="input-group mb-2">
                    <input class="form-control" v-model="builderSubtaskInput"
                        placeholder="Subtask title" @keyup.enter="builderAddSubtask()">
                    <button class="btn btn-outline-primary" @click="builderAddSubtask()">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <ul class="list-group">
                    <li v-for="(st, i) in builder.subtasks" :key="i"
                        class="list-group-item d-flex justify-content-between align-items-center">
                        <span><span class="badge bg-secondary me-2">{{ i + 1 }}</span>{{ st.title }}</span>
                        <button class="btn btn-sm btn-outline-danger" @click="builderRemoveSubtask(i)">
                            <i class="fas fa-times"></i>
                        </button>
                    </li>
                </ul>
                <p v-if="!builder.subtasks.length" class="text-muted small mt-2">No subtasks yet — add at least one.</p>
            </div>

            <!-- Step 4: Notifications & Confirm -->
            <div v-if="builder.step === 4">
                <h6 class="mb-3">Notification Settings</h6>
                <div class="mb-3">
                    <label class="form-label">Alert days before due date</label>
                    <div class="form-check" v-for="days in [90, 60, 30, 14, 7, 3, 1]" :key="days">
                        <input class="form-check-input" type="checkbox" :value="days"
                            v-model="builder.daysBeforeAlert" :id="'alert-day-'+days">
                        <label class="form-check-label" :for="'alert-day-'+days">{{ days }} day{{ days !== 1 ? 's' : '' }} before</label>
                    </div>
                </div>
                <hr>
                <h6 class="mb-2 text-muted">Review</h6>
                <ul class="list-unstyled small">
                    <li><strong>Name:</strong> {{ builder.name }}</li>
                    <li><strong>Category:</strong> {{ getCategoryLabel(builder.category) }}</li>
                    <li><strong>Recurrence:</strong> {{ getRecurrenceLabel(builder.recurrence) }}</li>
                    <li><strong>Due:</strong> {{ builder.nextDueDate }}</li>
                    <li><strong>Subtasks:</strong> {{ builder.subtasks.length }}</li>
                </ul>
            </div>

        </div>
        <div class="card-footer bg-white border-0 d-flex justify-content-between">
            <button v-if="builder.step > 1" class="btn btn-outline-secondary" @click="builderPrevStep()">
                <i class="fas fa-arrow-left me-1"></i>Back
            </button>
            <div v-else></div>
            <button v-if="builder.step < 4" class="btn btn-primary" @click="builderNextStep()">
                Next <i class="fas fa-arrow-right ms-1"></i>
            </button>
            <button v-if="builder.step === 4" class="btn btn-success" @click="builderSave()">
                <i class="fas fa-check me-1"></i>Create Workflow
            </button>
        </div>
    </div>
</div>
```

**Step 4: Commit**

```bash
git add "public/js/modules/ross/index.js"
git commit -m "feat: ROSS View 4 — step-by-step Workflow Builder"
```

---

### Task 12: Expand `index.js` — View 5 (Reports skeleton)

**Files:**
- Modify: `public/js/modules/ross/index.js`

**Step 1: Replace the View 5 stub in the template**

Replace:
```html
<!-- VIEW 5: Reports (stub — Task 12) -->
<div v-if="activeTab === 'reports' && !loading">
    <p class="text-muted">Reports loading...</p>
</div>
```

With:
```html
<!-- VIEW 5: Reports -->
<div v-if="activeTab === 'reports' && !loading">
    <div v-if="!reportData.length" class="text-center py-5 text-muted">
        <i class="fas fa-chart-bar fa-3x mb-3"></i>
        <p>No workflow data to report yet.</p>
    </div>
    <div v-else>
        <h6 class="mb-3">Completion Rate by Workflow</h6>
        <div class="table-responsive">
            <table class="table table-hover align-middle">
                <thead class="table-light">
                    <tr>
                        <th>Workflow</th>
                        <th>Category</th>
                        <th>Recurrence</th>
                        <th>Tasks</th>
                        <th>Completion</th>
                        <th>Next Due</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in reportData" :key="row.workflowId">
                        <td>{{ row.name }}</td>
                        <td>
                            <span class="badge bg-secondary">{{ getCategoryLabel(row.category) }}</span>
                        </td>
                        <td>{{ getRecurrenceLabel(row.recurrence) }}</td>
                        <td>{{ row.tasksCompleted }} / {{ row.tasksTotal }}</td>
                        <td>
                            <div class="d-flex align-items-center gap-2">
                                <div class="progress flex-grow-1" style="height:8px;min-width:80px">
                                    <div class="progress-bar"
                                        :class="row.completionRate === 100 ? 'bg-success' : 'bg-primary'"
                                        :style="'width:' + row.completionRate + '%'"></div>
                                </div>
                                <span class="small text-muted">{{ row.completionRate }}%</span>
                            </div>
                        </td>
                        <td>
                            <span :class="'badge bg-' + getDueSeverity(daysUntil(row.nextDueDate))">
                                {{ formatDate(row.nextDueDate) }}
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p class="text-muted small mt-2">
            <i class="fas fa-info-circle me-1"></i>
            Advanced charts and multi-location comparison coming in Phase 3.
        </p>
    </div>
</div>
```

**Step 2: Commit**

```bash
git add "public/js/modules/ross/index.js"
git commit -m "feat: ROSS View 5 — Reports completion table skeleton"
```

---

### Task 12b: Expand `index.js` — View 6 (Staff Management)

**Files:**
- Modify: `public/js/modules/ross/index.js`

**Step 1: Add the Staff Management view template and methods to the Vue app**

Append the following to the `views` data in the Vue app (add `{ id: 'staff', label: 'Staff', icon: 'fa-users' }` to the views array), and add the staff management template + methods:

**View 6 template (add to the views render section):**
```html
<!-- View 6: Staff Management -->
<div v-if="currentView === 'staff'" class="ross-view">
  <div class="d-flex justify-content-between align-items-center mb-4">
    <h4 class="mb-0"><i class="fas fa-users me-2 text-primary"></i>Staff Management</h4>
    <button class="btn btn-primary btn-sm" @click="showAddStaffModal">
      <i class="fas fa-plus me-1"></i>Add Staff Member
    </button>
  </div>

  <!-- Location selector -->
  <div class="mb-3">
    <select class="form-select w-auto" v-model="staffLocationId" @change="loadStaff">
      <option value="">Select location...</option>
      <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
    </select>
  </div>

  <!-- Staff list -->
  <div v-if="staffLoading" class="text-center py-4">
    <div class="spinner-border text-primary"></div>
  </div>
  <div v-else-if="!staffLocationId" class="text-center py-4 text-muted">
    <i class="fas fa-map-marker-alt fa-2x mb-2"></i>
    <p>Select a location to manage staff</p>
  </div>
  <div v-else-if="staffMembers.length === 0" class="text-center py-4 text-muted">
    <i class="fas fa-users fa-2x mb-2"></i>
    <p>No staff members yet. Add your first staff member.</p>
  </div>
  <div v-else class="row g-3">
    <div v-for="member in staffMembers" :key="member.staffId" class="col-md-4">
      <div class="card h-100 shadow-sm">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h6 class="card-title mb-1">{{ member.name }}</h6>
              <span class="badge bg-secondary">{{ member.role || 'No role' }}</span>
            </div>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary" @click="editStaff(member)" title="Edit">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-outline-danger" @click="deleteStaff(member)" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="mt-2 small text-muted">
            <div v-if="member.phone"><i class="fas fa-phone me-1"></i>{{ member.phone }}</div>
            <div v-if="member.email"><i class="fas fa-envelope me-1"></i>{{ member.email }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

**Vue app state additions (add to data()):**
```javascript
staffLocationId: '',
staffMembers: [],
staffLoading: false,
```

**Methods to add:**
```javascript
async loadStaff() {
    if (!this.staffLocationId) { this.staffMembers = []; return; }
    this.staffLoading = true;
    try {
        const result = await rossService.getStaff(this.staffLocationId);
        this.staffMembers = result.staff || [];
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: escapeHtml(e.message) });
    } finally {
        this.staffLoading = false;
    }
},

async showAddStaffModal() {
    if (!this.staffLocationId) {
        return Swal.fire({ icon: 'warning', title: 'Select a location first' });
    }
    const { value } = await Swal.fire({
        title: 'Add Staff Member',
        html: `
            <div class="text-start">
                <div class="mb-2"><label class="form-label">Name *</label>
                    <input id="swal-name" class="form-control" placeholder="e.g. Sipho Dlamini"></div>
                <div class="mb-2"><label class="form-label">Role</label>
                    <input id="swal-role" class="form-control" placeholder="e.g. Floor Manager"></div>
                <div class="mb-2"><label class="form-label">Phone</label>
                    <input id="swal-phone" class="form-control" placeholder="+27821234567"></div>
                <div class="mb-2"><label class="form-label">Email</label>
                    <input id="swal-email" class="form-control" placeholder="staff@restaurant.co.za"></div>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Add',
        preConfirm: () => {
            const name = document.getElementById('swal-name').value.trim();
            if (!name) { Swal.showValidationMessage('Name is required'); return false; }
            return {
                name,
                role: document.getElementById('swal-role').value.trim(),
                phone: document.getElementById('swal-phone').value.trim() || null,
                email: document.getElementById('swal-email').value.trim() || null
            };
        }
    });
    if (!value) return;
    try {
        await rossService.manageStaff({ locationId: this.staffLocationId, action: 'create', staffData: value });
        await this.loadStaff();
        Swal.fire({ icon: 'success', title: 'Staff member added', timer: 1500, showConfirmButton: false });
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: escapeHtml(e.message) });
    }
},

async editStaff(member) {
    const { value } = await Swal.fire({
        title: 'Edit Staff Member',
        html: `
            <div class="text-start">
                <div class="mb-2"><label class="form-label">Name *</label>
                    <input id="swal-name" class="form-control" value="${escapeHtml(member.name)}"></div>
                <div class="mb-2"><label class="form-label">Role</label>
                    <input id="swal-role" class="form-control" value="${escapeHtml(member.role || '')}"></div>
                <div class="mb-2"><label class="form-label">Phone</label>
                    <input id="swal-phone" class="form-control" value="${escapeHtml(member.phone || '')}"></div>
                <div class="mb-2"><label class="form-label">Email</label>
                    <input id="swal-email" class="form-control" value="${escapeHtml(member.email || '')}"></div>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Save',
        preConfirm: () => {
            const name = document.getElementById('swal-name').value.trim();
            if (!name) { Swal.showValidationMessage('Name is required'); return false; }
            return {
                name,
                role: document.getElementById('swal-role').value.trim(),
                phone: document.getElementById('swal-phone').value.trim() || null,
                email: document.getElementById('swal-email').value.trim() || null
            };
        }
    });
    if (!value) return;
    try {
        await rossService.manageStaff({ locationId: this.staffLocationId, action: 'update', staffId: member.staffId, staffData: value });
        await this.loadStaff();
        Swal.fire({ icon: 'success', title: 'Updated', timer: 1500, showConfirmButton: false });
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: escapeHtml(e.message) });
    }
},

async deleteStaff(member) {
    const confirmed = await Swal.fire({
        title: `Delete ${escapeHtml(member.name)}?`,
        text: 'This cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        confirmButtonText: 'Delete'
    });
    if (!confirmed.isConfirmed) return;
    try {
        await rossService.manageStaff({ locationId: this.staffLocationId, action: 'delete', staffId: member.staffId });
        await this.loadStaff();
        Swal.fire({ icon: 'success', title: 'Deleted', timer: 1500, showConfirmButton: false });
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: escapeHtml(e.message) });
    }
},
```

**Step 2: Commit**
```bash
git add public/js/modules/ross/index.js
git commit -m "feat: add ross View 6 — Staff Management per location"
```

---

### Task 13: Create `public/css/ross.css`

**Files:**
- Create: `public/css/ross.css`

**Step 1: Write the CSS file**

```css
/*
 * ROSS — Restaurant OS Service
 * Module-specific styles
 */

.ross-module .nav-tabs .nav-link {
    color: #6c757d;
    font-size: 0.9rem;
}

.ross-module .nav-tabs .nav-link.active {
    color: #0d6efd;
    font-weight: 600;
}

.ross-module .card {
    border-radius: 0.5rem;
    transition: box-shadow 0.15s ease;
}

.ross-module .card:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
}

.ross-module .progress {
    border-radius: 4px;
}

.ross-module .alert {
    border-radius: 0.5rem;
}

.ross-module .list-group-item:first-child {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
}
```

**Step 2: Commit**

```bash
git add "public/css/ross.css"
git commit -m "feat: add ross.css module styles"
```

---

## PHASE D — Dashboard Integration

---

### Task 14: Wire ROSS into `public/admin-dashboard.html`

**Files:**
- Modify: `public/admin-dashboard.html`

**Context:** The HTML needs three changes:
1. A `<link>` tag for `ross.css` in `<head>` (alongside the existing CSS links like `project-management.css`)
2. A sidebar menu entry
3. A content section div with `id="rossContent"` and a child `id="ross-app"` mount target

**Step 1: Add CSS link**

Find the line:
```html
<link href="css/project-management.css" rel="stylesheet">
```

Add immediately after it:
```html
<link href="css/ross.css" rel="stylesheet">
```

**Step 2: Add sidebar menu entry**

Find the existing Project Management sidebar entry:
```html
<a href="#" id="projectManagementMenu" class="nav-link"
    data-section="projectManagementContent">
    <i class="fas fa-tasks"></i>
    Project Management
</a>
```

Add the ROSS entry immediately after the closing `</li>` of that entry:
```html
<li class="nav-item">
    <a href="#" id="rossMenu" class="nav-link"
        data-section="rossContent">
        <i class="fas fa-robot"></i>
        ROSS
    </a>
</li>
```

**Step 3: Add content section**

Find the existing Project Management content section:
```html
<!-- Project Management Section -->
<div id="projectManagementContent" class="content-section dashboard-content d-none">
    <div id="project-management-app">
        <!-- Vue will mount here -->
    </div>
</div>
```

Add the ROSS section immediately after it:
```html
<!-- ROSS — Restaurant OS Service Section -->
<div id="rossContent" class="content-section dashboard-content d-none">
    <div id="ross-app">
        <!-- Vue will mount here -->
    </div>
</div>
```

**Step 4: Commit**

```bash
git add "public/admin-dashboard.html"
git commit -m "feat: add ROSS section and sidebar entry to admin-dashboard.html"
```

---

### Task 15: Wire ROSS into `public/js/admin-dashboard.js`

**Files:**
- Modify: `public/js/admin-dashboard.js`

**Context:** Study lines 200-435 of `admin-dashboard.js`. The pattern is: import the init/cleanup functions at the top, then register the section in the `sections.set(...)` block, then add a lazy-init `case` in the switch statement around line 1204.

**Step 1: Add import at the top**

Find:
```javascript
import { initializeProjectManagement, cleanupProjectManagement } from './modules/project-management/index.js';
```

Add immediately after it:
```javascript
import { initializeRoss, cleanupRoss } from './modules/ross/index.js';
```

**Step 2: Register the ROSS section**

Find:
```javascript
this.sections.set('projectManagementContent', {
    menuId: 'projectManagementMenu',
    contentId: 'projectManagementContent',
    init: initializeProjectManagement,
    cleanup: cleanupProjectManagement,
    parent: 'driversSubmenu'
});
```

Add immediately after the closing `});`:
```javascript
this.sections.set('rossContent', {
    menuId: 'rossMenu',
    contentId: 'rossContent',
    init: initializeRoss,
    cleanup: cleanupRoss,
    parent: 'driversSubmenu'
});
```

**Step 3: Add lazy-init case**

Find the switch block around line 1204:
```javascript
case 'projectManagementContent':
    if (!this.sectionInitialized.projectManagementContent) {
        await initializeProjectManagement();
        this.sectionInitialized.projectManagementContent = true;
    }
    break;
```

Add immediately after the `break;` and before the next `case`:
```javascript
case 'rossContent':
    if (!this.sectionInitialized.rossContent) {
        await initializeRoss();
        this.sectionInitialized.rossContent = true;
    }
    break;
```

**Step 4: Commit**

```bash
git add "public/js/admin-dashboard.js"
git commit -m "feat: wire ROSS module into admin-dashboard.js"
```

---

## PHASE E — Template Seeding

---

### Task 16: Run the template seed script

**Files:** None — this is a runtime operation.

**Context:** The seed script at `functions/seeds/ross-templates-seed.js` requires Firebase Admin credentials. You have two options depending on your environment:

**Option A — Against the emulator:**

Start the emulators first:
```bash
firebase emulators:start --only database,functions
```

Then in a second terminal, set the emulator env var and run:
```bash
FIREBASE_DATABASE_EMULATOR_HOST=localhost:9000 \
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
node functions/seeds/ross-templates-seed.js
```

**Option B — Against production (be careful):**

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
node functions/seeds/ross-templates-seed.js
```

Expected output:
```
Seeding ROSS templates...
  Created: Certificate of Acceptability
  Created: Liquor Licence Renewal
  ... (13 lines total)
Done. 13 templates seeded.
```

**Verification:**

After seeding, open the Firebase console or run:
```bash
node -e "
const admin = require('./functions/firebase-admin');
admin.database().ref('ross/templates').once('value').then(snap => {
  console.log('Template count:', Object.keys(snap.val() || {}).length);
  process.exit(0);
});"
```

Expected: `Template count: 13`

**Step 1: Commit (no code change needed — seed is already committed)**

If the seed ran successfully, the data is in the database. No commit needed for this step.

---

## PHASE F — Verification

---

### Task 17: Manual smoke test checklist

Open `public/admin-dashboard.html` in the browser (with the emulator running or pointed at the live Firebase project).

**Checklist:**

1. Log in as a Super Admin user
2. Click "ROSS" in the sidebar — confirm the module loads without console errors
3. Overview tab shows empty state (no workflows yet) with "Browse Template Library" CTA
4. Click "Template Library" tab — confirm 13 template cards load
5. Click "Activate" on "Daily Opening Checklist" — confirm the SweetAlert modal appears with name + date fields
6. Select a location and date, click "Activate" — confirm redirect to My Workflows
7. My Workflows tab shows the activated workflow card with progress bar
8. Click "View" on the workflow — confirm detail view with task checklist
9. Click "Complete" on a task — confirm task is crossed out and marked done
10. Click back arrow — confirm return to workflow list, workflow progress bar updated
11. Click "Custom Workflow" button — confirm step 1 of the builder appears
12. Fill in name → Next → fill recurrence/date → Next → add 2 subtasks → Next → tick alert days → Create Workflow
13. Confirm new workflow appears in My Workflows
14. Click Reports tab — confirm workflow completion table renders

**If any step fails:**
- Check browser console for errors
- Verify the Cloud Function is deployed: `firebase functions:list | grep ross`
- Verify RTDB rules are deployed: `firebase database:rules:get`

---

### Task 18: Deploy to Firebase

**Step 1: Deploy Cloud Functions**

```bash
firebase deploy --only functions:rossGetTemplates,functions:rossCreateTemplate,functions:rossUpdateTemplate,functions:rossDeleteTemplate,functions:rossActivateWorkflow,functions:rossCreateWorkflow,functions:rossUpdateWorkflow,functions:rossDeleteWorkflow,functions:rossGetWorkflows,functions:rossManageTask,functions:rossCompleteTask,functions:rossGetReports,functions:rossScheduledReminder
```

Expected: All 13 functions deploy successfully.

**Step 2: Deploy Database Rules**

```bash
firebase deploy --only database
```

**Step 3: Deploy Hosting (frontend)**

```bash
firebase deploy --only hosting
```

**Step 4: Run the seed against production** (if not already done)

```bash
node functions/seeds/ross-templates-seed.js
```

**Step 5: Final commit with deployment note**

```bash
git add -A
git commit -m "feat: ROSS Phase 1 — Admin MVP complete and deployed"
```

---

## Summary of Files Created / Modified

| Action | File |
|--------|------|
| Create | `functions/ross.js` |
| Create | `functions/seeds/ross-templates-seed.js` |
| Create | `public/js/modules/ross/services/ross-service.js` |
| Create | `public/js/modules/ross/index.js` |
| Create | `public/css/ross.css` |
| Modify | `functions/index.js` — add ROSS require/exports block |
| Modify | `database.rules.json` — add `/ross/` and `/notifications/` rules |
| Modify | `public/admin-dashboard.html` — CSS link + sidebar entry + content section |
| Modify | `public/js/admin-dashboard.js` — import + sections.set + switch case |

## Phase 2 Pointers (do not implement now)

- Upgrade `rossScheduledReminder` to send Twilio WhatsApp messages (pattern: `functions/whatsappManagement.js`)
- Upgrade scheduler to send SendGrid emails
- Add per-workflow notification settings UI in View 3 Settings sub-tab
- Multi-location workflow activation flow (one workflow → multiple location instances)

## Open Questions Before Phase 2

Refer to `docs/plans/2026-02-25-ross-design.md` Section "Open Questions" for the four items to resolve before Phase 2 begins.
