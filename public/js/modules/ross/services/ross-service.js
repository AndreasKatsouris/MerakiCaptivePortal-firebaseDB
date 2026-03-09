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
        return await user.getIdToken();
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

    async updateWorkflow(workflowId, updates) {
        return this.callFunction('rossUpdateWorkflow', { workflowId, updates });
    }

    async deleteWorkflow(workflowId) {
        return this.callFunction('rossDeleteWorkflow', { workflowId });
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

    // ---- Staff ----
    async manageStaff({ locationId, action, staffId, staffData }) {
        return this.callFunction('rossManageStaff', { locationId, action, staffId, staffData });
    }

    async getStaff(locationId) {
        return this.callFunction('rossGetStaff', { locationId });
    }
}

export const rossService = new RossService();
export default rossService;
