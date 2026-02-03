/**
 * Project Management Cloud Functions
 * Handles CRUD operations for admin project tracking
 * Super Admin access only
 * 
 * Uses onRequest with Bearer token authentication (same pattern as verifyAdminStatus)
 * 
 * @version 2.0.0
 * @updated 2026-01-25
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

// Use already initialized admin instance from index.js
const db = admin.database();

/**
 * Extract and verify user from Bearer token
 * Returns the decoded token with user info
 */
async function verifyAuthToken(req) {
    const authHeader = req.headers.authorization;
    console.log('[ProjectManagement] Auth header present:', !!authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No valid authorization header');
    }

    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) {
        throw new Error('No token in authorization header');
    }

    console.log('[ProjectManagement] Verifying ID token...');
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('[ProjectManagement] Token verified for user:', decodedToken.uid);

    return decodedToken;
}

/**
 * Verify user has Super Admin privileges
 */
async function verifySuperAdmin(decodedToken) {
    const uid = decodedToken.uid;
    console.log('[ProjectManagement] Checking Super Admin status for:', uid);

    const userRef = db.ref(`admins/${uid}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    if (!userData || !userData.superAdmin) {
        console.log('[ProjectManagement] User is not super admin:', uid);
        throw new Error('Super Admin access required');
    }

    console.log('[ProjectManagement] Super Admin verified:', uid);
    return uid;
}

/**
 * Generate unique ID for projects/tasks/milestones
 */
function generateId() {
    return db.ref().push().key;
}

// ============================================
// PROJECT OPERATIONS
// ============================================

/**
 * Create a new project
 */
exports.createProject = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const decodedToken = await verifyAuthToken(req);
            const adminId = await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { name, description, locationId, priority, dueDate, milestones } = data;

            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Project name is required' });
            }

            const projectId = generateId();
            const now = Date.now();

            const projectData = {
                projectId,
                name: name.trim(),
                description: description?.trim() || '',
                locationId: locationId || null,
                status: 'planning',
                priority: priority || 'medium',
                createdAt: now,
                updatedAt: now,
                createdBy: adminId,
                dueDate: dueDate || null,
                milestones: {},
                tasks: {}
            };

            // Add initial milestones if provided
            if (milestones && Array.isArray(milestones)) {
                milestones.forEach((milestone, index) => {
                    const milestoneId = generateId();
                    projectData.milestones[milestoneId] = {
                        name: milestone.name,
                        description: milestone.description || '',
                        status: 'pending',
                        dueDate: milestone.dueDate || null,
                        completedAt: null,
                        order: index + 1
                    };
                });
            }

            await db.ref(`admin/projects/${projectId}`).set(projectData);
            console.log(`Project created: ${projectId} by admin ${adminId}`);

            res.json({ result: { success: true, projectId, project: projectData } });
        } catch (error) {
            console.error('[createProject] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
        }
    });
});

/**
 * Update an existing project
 */
exports.updateProject = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const decodedToken = await verifyAuthToken(req);
            await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { projectId, updates } = data;

            if (!projectId) {
                return res.status(400).json({ error: 'Project ID is required' });
            }

            const projectRef = db.ref(`admin/projects/${projectId}`);
            const snapshot = await projectRef.once('value');

            if (!snapshot.exists()) {
                return res.status(404).json({ error: 'Project not found' });
            }

            const allowedFields = ['name', 'description', 'locationId', 'status', 'priority', 'dueDate'];
            const sanitizedUpdates = { updatedAt: Date.now() };

            allowedFields.forEach(field => {
                if (updates[field] !== undefined) {
                    sanitizedUpdates[field] = updates[field];
                }
            });

            await projectRef.update(sanitizedUpdates);
            res.json({ result: { success: true, projectId } });
        } catch (error) {
            console.error('[updateProject] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
        }
    });
});

/**
 * Delete a project
 */
exports.deleteProject = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const decodedToken = await verifyAuthToken(req);
            await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { projectId } = data;

            if (!projectId) {
                return res.status(400).json({ error: 'Project ID is required' });
            }

            await db.ref(`admin/projects/${projectId}`).remove();
            console.log(`Project deleted: ${projectId}`);

            res.json({ result: { success: true, projectId } });
        } catch (error) {
            console.error('[deleteProject] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
        }
    });
});

/**
 * Get all projects with optional filtering
 */
exports.getProjects = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const decodedToken = await verifyAuthToken(req);
            await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { status, locationId, limit } = data || {};

            const projectsRef = db.ref('admin/projects');
            const snapshot = await projectsRef.once('value');
            const projectsData = snapshot.val() || {};

            let projects = Object.values(projectsData);

            // Apply filters
            if (status) {
                projects = projects.filter(p => p.status === status);
            }
            if (locationId) {
                projects = projects.filter(p => p.locationId === locationId);
            }

            // Sort by updatedAt descending
            projects.sort((a, b) => b.updatedAt - a.updatedAt);

            // Apply limit
            if (limit && limit > 0) {
                projects = projects.slice(0, limit);
            }

            console.log(`[getProjects] Returning ${projects.length} projects`);
            res.json({ result: { success: true, projects } });
        } catch (error) {
            console.error('[getProjects] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
        }
    });
});

// ============================================
// TASK OPERATIONS
// ============================================

/**
 * Manage project tasks (create, update, delete)
 */
exports.manageProjectTasks = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const decodedToken = await verifyAuthToken(req);
            await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { projectId, action, taskId, taskData } = data;

            if (!projectId) {
                return res.status(400).json({ error: 'Project ID is required' });
            }

            const projectRef = db.ref(`admin/projects/${projectId}`);
            const projectSnapshot = await projectRef.once('value');

            if (!projectSnapshot.exists()) {
                return res.status(404).json({ error: 'Project not found' });
            }

            const tasksRef = db.ref(`admin/projects/${projectId}/tasks`);
            const now = Date.now();

            switch (action) {
                case 'create': {
                    const newTaskId = generateId();
                    const task = {
                        title: taskData.title?.trim() || 'Untitled Task',
                        description: taskData.description?.trim() || '',
                        status: 'todo',
                        priority: taskData.priority || 'medium',
                        assignedTo: taskData.assignedTo || null,
                        milestoneId: taskData.milestoneId || null,
                        createdAt: now,
                        completedAt: null,
                        order: taskData.order || 1
                    };
                    await tasksRef.child(newTaskId).set(task);
                    await projectRef.update({ updatedAt: now });
                    res.json({ result: { success: true, taskId: newTaskId, task } });
                    break;
                }

                case 'update': {
                    if (!taskId) {
                        return res.status(400).json({ error: 'Task ID is required for update' });
                    }
                    const updates = { ...taskData };
                    if (updates.status === 'done' && !updates.completedAt) {
                        updates.completedAt = now;
                    }
                    await tasksRef.child(taskId).update(updates);
                    await projectRef.update({ updatedAt: now });
                    res.json({ result: { success: true, taskId } });
                    break;
                }

                case 'delete': {
                    if (!taskId) {
                        return res.status(400).json({ error: 'Task ID is required for delete' });
                    }
                    await tasksRef.child(taskId).remove();
                    await projectRef.update({ updatedAt: now });
                    res.json({ result: { success: true, taskId } });
                    break;
                }

                default:
                    res.status(400).json({ error: 'Invalid action. Use create, update, or delete' });
            }
        } catch (error) {
            console.error('[manageProjectTasks] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
        }
    });
});

// ============================================
// MILESTONE OPERATIONS
// ============================================

/**
 * Manage project milestones (create, update, delete)
 */
exports.manageProjectMilestones = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        try {
            const decodedToken = await verifyAuthToken(req);
            await verifySuperAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { projectId, action, milestoneId, milestoneData } = data;

            if (!projectId) {
                return res.status(400).json({ error: 'Project ID is required' });
            }

            const projectRef = db.ref(`admin/projects/${projectId}`);
            const projectSnapshot = await projectRef.once('value');

            if (!projectSnapshot.exists()) {
                return res.status(404).json({ error: 'Project not found' });
            }

            const milestonesRef = db.ref(`admin/projects/${projectId}/milestones`);
            const now = Date.now();

            switch (action) {
                case 'create': {
                    const newMilestoneId = generateId();
                    const milestone = {
                        name: milestoneData.name?.trim() || 'Untitled Milestone',
                        description: milestoneData.description?.trim() || '',
                        status: 'pending',
                        dueDate: milestoneData.dueDate || null,
                        completedAt: null,
                        order: milestoneData.order || 1
                    };
                    await milestonesRef.child(newMilestoneId).set(milestone);
                    await projectRef.update({ updatedAt: now });
                    res.json({ result: { success: true, milestoneId: newMilestoneId, milestone } });
                    break;
                }

                case 'update': {
                    if (!milestoneId) {
                        return res.status(400).json({ error: 'Milestone ID is required for update' });
                    }
                    const updates = { ...milestoneData };
                    if (updates.status === 'completed' && !updates.completedAt) {
                        updates.completedAt = now;
                    }
                    await milestonesRef.child(milestoneId).update(updates);
                    await projectRef.update({ updatedAt: now });
                    res.json({ result: { success: true, milestoneId } });
                    break;
                }

                case 'delete': {
                    if (!milestoneId) {
                        return res.status(400).json({ error: 'Milestone ID is required for delete' });
                    }
                    await milestonesRef.child(milestoneId).remove();
                    await projectRef.update({ updatedAt: now });
                    res.json({ result: { success: true, milestoneId } });
                    break;
                }

                default:
                    res.status(400).json({ error: 'Invalid action. Use create, update, or delete' });
            }
        } catch (error) {
            console.error('[manageProjectMilestones] Error:', error.message);
            res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
        }
    });
});
