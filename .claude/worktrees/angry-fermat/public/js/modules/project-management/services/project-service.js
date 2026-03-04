/**
 * Project Management Service
 * Firebase CRUD operations for projects, tasks, and milestones
 * Uses direct fetch with Bearer token (same pattern as admin-claims.js)
 */

import { auth, rtdb, ref, get, set, update, remove, push, onValue, onAuthStateChanged } from '../../../config/firebase-config.js';

// Firebase project config for Cloud Functions URL
const FUNCTIONS_BASE_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net';

/**
 * Project Service - handles all Firebase operations for project management
 */
class ProjectService {
    constructor() {
        this.basePath = 'admin/projects';
    }

    /**
     * Get the current user's ID token
     * @returns {Promise<string>} The ID token
     */
    async getIdToken() {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('User not authenticated');
        }
        return await user.getIdToken(true);
    }

    /**
     * Make an authenticated request to a Cloud Function
     * Uses the same pattern as admin-claims.js which works correctly
     */
    async callFunction(functionName, data = {}) {
        const idToken = await this.getIdToken();
        const url = `${FUNCTIONS_BASE_URL}/${functionName}`;

        console.log(`[ProjectService] Calling ${functionName}...`);

        const response = await fetch(url, {
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
            console.error(`[ProjectService] ${functionName} error:`, errorText);
            throw new Error(`Function ${functionName} failed: ${response.status}`);
        }

        const result = await response.json();
        console.log(`[ProjectService] ${functionName} success`);
        return result.result || result;
    }

    /**
     * Create a new project via Cloud Function
     */
    async createProject(projectData) {
        try {
            const result = await this.callFunction('createProject', projectData);
            return result;
        } catch (error) {
            console.error('Error creating project:', error);
            throw error;
        }
    }

    /**
     * Update an existing project
     */
    async updateProject(projectId, updates) {
        try {
            const result = await this.callFunction('updateProject', { projectId, updates });
            return result;
        } catch (error) {
            console.error('Error updating project:', error);
            throw error;
        }
    }

    /**
     * Delete a project
     */
    async deleteProject(projectId) {
        try {
            const result = await this.callFunction('deleteProject', { projectId });
            return result;
        } catch (error) {
            console.error('Error deleting project:', error);
            throw error;
        }
    }

    /**
     * Get all projects with optional filtering
     */
    async getProjects(filters = {}) {
        try {
            console.log('[ProjectService] Fetching projects...');
            const result = await this.callFunction('getProjects', filters);
            return result.projects || [];
        } catch (error) {
            console.error('Error getting projects:', error);
            throw error;
        }
    }

    /**
     * Subscribe to real-time project updates
     */
    subscribeToProjects(callback) {
        const projectsRef = ref(rtdb, this.basePath);
        return onValue(projectsRef, (snapshot) => {
            const data = snapshot.val() || {};
            const projects = Object.values(data).sort((a, b) => b.updatedAt - a.updatedAt);
            callback(projects);
        });
    }

    /**
     * Create a task within a project
     */
    async createTask(projectId, taskData) {
        try {
            const result = await this.callFunction('manageProjectTasks', {
                projectId,
                action: 'create',
                taskData
            });
            return result;
        } catch (error) {
            console.error('Error creating task:', error);
            throw error;
        }
    }

    /**
     * Update a task
     */
    async updateTask(projectId, taskId, taskData) {
        try {
            const result = await this.callFunction('manageProjectTasks', {
                projectId,
                action: 'update',
                taskId,
                taskData
            });
            return result;
        } catch (error) {
            console.error('Error updating task:', error);
            throw error;
        }
    }

    /**
     * Delete a task
     */
    async deleteTask(projectId, taskId) {
        try {
            const result = await this.callFunction('manageProjectTasks', {
                projectId,
                action: 'delete',
                taskId
            });
            return result;
        } catch (error) {
            console.error('Error deleting task:', error);
            throw error;
        }
    }

    /**
     * Generic method to manage tasks (create, update, delete)
     */
    async manageProjectTasks(params) {
        try {
            const result = await this.callFunction('manageProjectTasks', params);
            return result;
        } catch (error) {
            console.error('Error managing tasks:', error);
            throw error;
        }
    }

    /**
     * Create a milestone
     */
    async createMilestone(projectId, milestoneData) {
        try {
            const result = await this.callFunction('manageProjectMilestones', {
                projectId,
                action: 'create',
                milestoneData
            });
            return result;
        } catch (error) {
            console.error('Error creating milestone:', error);
            throw error;
        }
    }

    /**
     * Update a milestone
     */
    async updateMilestone(projectId, milestoneId, milestoneData) {
        try {
            const result = await this.callFunction('manageProjectMilestones', {
                projectId,
                action: 'update',
                milestoneId,
                milestoneData
            });
            return result;
        } catch (error) {
            console.error('Error updating milestone:', error);
            throw error;
        }
    }

    /**
     * Delete a milestone
     */
    async deleteMilestone(projectId, milestoneId) {
        try {
            const result = await this.callFunction('manageProjectMilestones', {
                projectId,
                action: 'delete',
                milestoneId
            });
            return result;
        } catch (error) {
            console.error('Error deleting milestone:', error);
            throw error;
        }
    }

    /**
     * Generic method to manage milestones (create, update, delete)
     */
    async manageProjectMilestones(params) {
        try {
            const result = await this.callFunction('manageProjectMilestones', params);
            return result;
        } catch (error) {
            console.error('Error managing milestones:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const projectService = new ProjectService();
export default projectService;
