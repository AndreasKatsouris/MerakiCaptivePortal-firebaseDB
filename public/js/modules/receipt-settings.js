/**
 * Receipt Settings Module
 * Vue.js application for managing receipt extraction templates
 * Version: 1.0.0
 */

import { auth, rtdb, ref as dbRef, get, onAuthStateChanged } from '../config/firebase-config.js';
import { TemplateCreator } from './receipt-template-creator.js';

const { createApp } = Vue;

// Firebase Functions endpoint (adjust based on your project)
const FUNCTIONS_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net';

/**
 * API Client for Template Management
 */
class TemplateAPI {
    constructor() {
        this.baseUrl = FUNCTIONS_URL;
        this.idToken = null;
    }

    async ensureAuth() {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('User not authenticated');
        }
        this.idToken = await user.getIdToken();
    }

    async getTemplates(filters = {}) {
        await this.ensureAuth();

        const params = new URLSearchParams();
        if (filters.brandName) params.append('brandName', filters.brandName);
        if (filters.status) params.append('status', filters.status);
        if (filters.minSuccessRate !== undefined) params.append('minSuccessRate', filters.minSuccessRate);
        if (filters.sortBy) params.append('sortBy', filters.sortBy);

        const url = `${this.baseUrl}/getReceiptTemplates?${params.toString()}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.idToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to fetch templates');
        }

        return await response.json();
    }

    async getTemplate(templateId) {
        await this.ensureAuth();

        const response = await fetch(`${this.baseUrl}/getReceiptTemplate?templateId=${templateId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.idToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to fetch template');
        }

        return await response.json();
    }

    async createTemplate(templateData) {
        await this.ensureAuth();

        const response = await fetch(`${this.baseUrl}/createReceiptTemplate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(templateData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to create template');
        }

        return await response.json();
    }

    async updateTemplate(templateId, updates) {
        await this.ensureAuth();

        const response = await fetch(`${this.baseUrl}/updateReceiptTemplate`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ templateId, updates })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to update template');
        }

        return await response.json();
    }

    async deleteTemplate(templateId) {
        await this.ensureAuth();

        const response = await fetch(`${this.baseUrl}/deleteReceiptTemplate?templateId=${templateId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${this.idToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to delete template');
        }

        return await response.json();
    }

    async getPerformanceLogs(templateId, limit = 100) {
        await this.ensureAuth();

        const params = new URLSearchParams();
        if (templateId) params.append('templateId', templateId);
        params.append('limit', limit);

        const url = `${this.baseUrl}/getTemplatePerformance?${params.toString()}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.idToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to fetch performance logs');
        }

        return await response.json();
    }

    async performOCR(imageData) {
        await this.ensureAuth();

        const response = await fetch(`${this.baseUrl}/ocrReceiptForTemplate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ imageData })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to perform OCR');
        }

        return await response.json();
    }
}

// Create Vue Application
const app = createApp({
    template: `
        <div class="container-fluid mt-4">
            <!-- Header -->
            <div class="row mb-4">
                <div class="col">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h1 class="h2 mb-1">
                                <i class="fas fa-receipt me-2"></i>
                                Receipt Settings
                            </h1>
                            <p class="text-muted mb-0">
                                Manage receipt extraction templates and patterns
                            </p>
                        </div>
                        <div>
                            <button
                                class="btn btn-primary"
                                @click="openCreateTemplateModal"
                                :disabled="loading"
                            >
                                <i class="fas fa-plus me-2"></i>
                                Create Template
                            </button>
                            <button
                                class="btn btn-outline-secondary ms-2"
                                @click="refreshTemplates"
                                :disabled="loading"
                            >
                                <i class="fas fa-sync-alt" :class="{ 'fa-spin': loading }"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Overall Statistics -->
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-file-alt fa-2x text-primary mb-2"></i>
                            <h3 class="mb-0">{{ statistics.totalTemplates }}</h3>
                            <p class="text-muted mb-0">Total Templates</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-check-circle fa-2x text-success mb-2"></i>
                            <h3 class="mb-0">{{ statistics.activeTemplates }}</h3>
                            <p class="text-muted mb-0">Active Templates</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-chart-line fa-2x text-info mb-2"></i>
                            <h3 class="mb-0">{{ statistics.avgSuccessRate }}%</h3>
                            <p class="text-muted mb-0">Avg Success Rate</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-bolt fa-2x text-warning mb-2"></i>
                            <h3 class="mb-0">{{ statistics.totalUsage }}</h3>
                            <p class="text-muted mb-0">Total Usage</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Filters -->
            <div class="filter-section">
                <div class="row g-3">
                    <div class="col-md-3">
                        <label class="form-label">Filter by Brand</label>
                        <input
                            type="text"
                            class="form-control"
                            v-model="filters.brandName"
                            placeholder="Search brand name..."
                            @input="applyFilters"
                        >
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Status</label>
                        <select
                            class="form-select"
                            v-model="filters.status"
                            @change="applyFilters"
                        >
                            <option value="">All Statuses</option>
                            <option value="active">Active</option>
                            <option value="testing">Testing</option>
                            <option value="deprecated">Deprecated</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Sort By</label>
                        <select
                            class="form-select"
                            v-model="filters.sortBy"
                            @change="applyFilters"
                        >
                            <option value="priority">Priority</option>
                            <option value="successRate">Success Rate</option>
                            <option value="usageCount">Usage Count</option>
                            <option value="createdAt">Created Date</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Min Success Rate</label>
                        <input
                            type="number"
                            class="form-control"
                            v-model.number="filters.minSuccessRate"
                            min="0"
                            max="100"
                            placeholder="0"
                            @input="applyFilters"
                        >
                    </div>
                </div>
            </div>

            <!-- Loading State -->
            <div v-if="loading && templates.length === 0" class="loading-spinner">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted mt-2">Loading templates...</p>
            </div>

            <!-- Empty State -->
            <div v-else-if="!loading && filteredTemplates.length === 0" class="empty-state">
                <i class="fas fa-inbox"></i>
                <h4>No Templates Found</h4>
                <p class="text-muted">
                    {{ templates.length === 0
                        ? 'Get started by creating your first receipt template.'
                        : 'No templates match your current filters.'
                    }}
                </p>
                <button
                    v-if="templates.length === 0"
                    class="btn btn-primary"
                    @click="openCreateTemplateModal"
                >
                    <i class="fas fa-plus me-2"></i>
                    Create First Template
                </button>
            </div>

            <!-- Templates List -->
            <div v-else class="row">
                <div
                    v-for="template in filteredTemplates"
                    :key="template.id"
                    class="col-md-6 col-lg-4 mb-4"
                >
                    <div
                        class="card template-card h-100"
                        :class="'status-' + template.status"
                    >
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <div>
                                <h5 class="mb-0">{{ template.templateName }}</h5>
                                <small class="text-muted">{{ template.brandName }}</small>
                            </div>
                            <span
                                class="badge priority-badge"
                                :class="getPriorityClass(template.priority)"
                            >
                                Priority {{ template.priority }}
                            </span>
                        </div>
                        <div class="card-body">
                            <!-- Status Badge -->
                            <div class="mb-3">
                                <span
                                    class="badge"
                                    :class="getStatusBadgeClass(template.status)"
                                >
                                    {{ template.status.toUpperCase() }}
                                </span>
                                <span
                                    v-if="template.storeName"
                                    class="badge bg-secondary ms-2"
                                >
                                    {{ template.storeName }}
                                </span>
                            </div>

                            <!-- Statistics -->
                            <div class="stats-grid">
                                <div class="stat-item">
                                    <div class="stat-value">
                                        {{ template.statistics?.successRate || 0 }}%
                                    </div>
                                    <div class="stat-label">Success Rate</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">
                                        {{ template.statistics?.usageCount || 0 }}
                                    </div>
                                    <div class="stat-label">Uses</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">
                                        {{ (template.statistics?.avgConfidence * 100 || 0).toFixed(0) }}%
                                    </div>
                                    <div class="stat-label">Avg Confidence</div>
                                </div>
                            </div>

                            <!-- Description -->
                            <p
                                v-if="template.description"
                                class="text-muted mt-3 mb-0"
                                style="font-size: 0.9em;"
                            >
                                {{ template.description }}
                            </p>

                            <!-- Actions -->
                            <div class="template-actions">
                                <button
                                    class="btn btn-sm btn-primary flex-fill"
                                    @click="viewTemplate(template)"
                                >
                                    <i class="fas fa-eye me-1"></i>
                                    View
                                </button>
                                <button
                                    class="btn btn-sm btn-outline-secondary"
                                    @click="editTemplate(template)"
                                >
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button
                                    class="btn btn-sm btn-outline-info"
                                    @click="viewPerformance(template)"
                                >
                                    <i class="fas fa-chart-bar"></i>
                                </button>
                                <button
                                    v-if="template.status !== 'deprecated'"
                                    class="btn btn-sm btn-outline-danger"
                                    @click="confirmDelete(template)"
                                >
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div class="card-footer text-muted" style="font-size: 0.85em;">
                            <div>
                                <i class="fas fa-calendar-alt me-1"></i>
                                Created {{ formatDate(template.createdAt) }}
                            </div>
                            <div v-if="template.statistics?.lastUsed">
                                <i class="fas fa-clock me-1"></i>
                                Last used {{ formatDate(template.statistics.lastUsed) }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- View Template Modal -->
            <div ref="viewTemplateModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Template Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" v-if="selectedTemplate">
                            <div class="mb-3">
                                <h6>{{ selectedTemplate.templateName }}</h6>
                                <p class="text-muted">{{ selectedTemplate.brandName }} - {{ selectedTemplate.storeName || 'All Locations' }}</p>
                            </div>
                            <div class="mb-3">
                                <strong>Status:</strong>
                                <span class="badge" :class="getStatusBadgeClass(selectedTemplate.status)">{{ selectedTemplate.status }}</span>
                            </div>
                            <div class="mb-3">
                                <strong>Priority:</strong> {{ selectedTemplate.priority }}
                            </div>
                            <div class="mb-3">
                                <strong>Description:</strong>
                                <p>{{ selectedTemplate.description || 'No description' }}</p>
                            </div>
                            <div class="mb-3">
                                <strong>Patterns:</strong>
                                <pre style="max-height: 400px; overflow-y: auto; background: #f8f9fa; padding: 1rem; border-radius: 0.25rem;">{{ JSON.stringify(selectedTemplate.patterns, null, 2) }}</pre>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Performance Modal -->
            <div ref="performanceModal" class="modal fade" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Performance Analytics</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" v-if="selectedTemplate">
                            <div class="mb-4">
                                <h6>{{ selectedTemplate.templateName }}</h6>
                                <div class="row text-center my-3">
                                    <div class="col-md-3">
                                        <div class="text-muted">Success Rate</div>
                                        <h4>{{ selectedTemplate.statistics?.successRate || 0 }}%</h4>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="text-muted">Total Uses</div>
                                        <h4>{{ selectedTemplate.statistics?.usageCount || 0 }}</h4>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="text-muted">Avg Confidence</div>
                                        <h4>{{ (selectedTemplate.statistics?.avgConfidence * 100 || 0).toFixed(1) }}%</h4>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="text-muted">Last Used</div>
                                        <h4>{{ formatDate(selectedTemplate.statistics?.lastUsed) }}</h4>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <canvas ref="performanceChart" style="max-height: 400px;"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,

    data() {
        return {
            loading: false,
            templates: [],
            filteredTemplates: [],
            selectedTemplate: null,
            performanceLogs: null,
            performanceChart: null,

            filters: {
                brandName: '',
                status: '',
                sortBy: 'priority',
                minSuccessRate: 0
            },

            statistics: {
                totalTemplates: 0,
                activeTemplates: 0,
                avgSuccessRate: 0,
                totalUsage: 0
            },

            api: new TemplateAPI()
        };
    },

    computed: {
        // Statistics are calculated from templates
    },

    mounted() {
        this.initializeAuth();
    },

    methods: {
        /**
         * Initialize authentication
         */
        async initializeAuth() {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    console.log('User authenticated:', user.email);
                    await this.loadTemplates();
                } else {
                    console.warn('No user authenticated, redirecting to login...');
                    window.location.href = 'admin-login.html';
                }
            });
        },

        /**
         * Load all templates
         */
        async loadTemplates() {
            this.loading = true;
            try {
                const result = await this.api.getTemplates(this.filters);
                this.templates = result.templates || [];
                this.applyFilters();
                this.calculateStatistics();
                console.log(`Loaded ${this.templates.length} templates`);
            } catch (error) {
                console.error('Error loading templates:', error);
                this.showError('Failed to load templates', error.message);
            } finally {
                this.loading = false;
            }
        },

        /**
         * Refresh templates
         */
        async refreshTemplates() {
            await this.loadTemplates();
            this.showSuccess('Templates refreshed');
        },

        /**
         * Apply filters to templates
         */
        applyFilters() {
            let filtered = [...this.templates];

            // Filter by brand name
            if (this.filters.brandName) {
                const search = this.filters.brandName.toLowerCase();
                filtered = filtered.filter(t =>
                    t.brandName.toLowerCase().includes(search)
                );
            }

            // Filter by status
            if (this.filters.status) {
                filtered = filtered.filter(t => t.status === this.filters.status);
            }

            // Filter by min success rate
            if (this.filters.minSuccessRate > 0) {
                filtered = filtered.filter(t =>
                    (t.statistics?.successRate || 0) >= this.filters.minSuccessRate
                );
            }

            // Sort
            filtered.sort((a, b) => {
                switch (this.filters.sortBy) {
                    case 'priority':
                        return (b.priority || 0) - (a.priority || 0);
                    case 'successRate':
                        return (b.statistics?.successRate || 0) - (a.statistics?.successRate || 0);
                    case 'usageCount':
                        return (b.statistics?.usageCount || 0) - (a.statistics?.usageCount || 0);
                    case 'createdAt':
                    default:
                        return (b.createdAt || 0) - (a.createdAt || 0);
                }
            });

            this.filteredTemplates = filtered;
        },

        /**
         * Calculate overall statistics
         */
        calculateStatistics() {
            this.statistics.totalTemplates = this.templates.length;
            this.statistics.activeTemplates = this.templates.filter(t => t.status === 'active').length;

            const templatesWithStats = this.templates.filter(t => t.statistics?.usageCount > 0);

            if (templatesWithStats.length > 0) {
                const totalSuccess = templatesWithStats.reduce((sum, t) =>
                    sum + (t.statistics.successRate || 0), 0);
                this.statistics.avgSuccessRate = Math.round(totalSuccess / templatesWithStats.length);

                this.statistics.totalUsage = this.templates.reduce((sum, t) =>
                    sum + (t.statistics?.usageCount || 0), 0);
            } else {
                this.statistics.avgSuccessRate = 0;
                this.statistics.totalUsage = 0;
            }
        },

        /**
         * View template details
         */
        async viewTemplate(template) {
            try {
                this.selectedTemplate = template;

                // Wait for next tick to ensure $refs are available
                this.$nextTick(() => {
                    const modalElement = this.$refs.viewTemplateModal;

                    if (!modalElement) {
                        console.error('View template modal element not found');
                        this.showError('UI Error', 'Modal element not found in template');
                        return;
                    }

                    if (typeof bootstrap === 'undefined') {
                        console.error('Bootstrap not loaded');
                        this.showError('UI Error', 'Bootstrap library not loaded. Please refresh the page.');
                        return;
                    }

                    const modal = new bootstrap.Modal(modalElement);
                    modal.show();
                });
            } catch (error) {
                console.error('Error viewing template:', error);
                this.showError('Failed to view template', error.message);
            }
        },

        /**
         * Edit template
         */
        async editTemplate(template) {
            // Close view modal if open
            const viewModal = bootstrap.Modal.getInstance(this.$refs.viewTemplateModal);
            if (viewModal) {
                viewModal.hide();
            }

            // Simple in-app editor using Sweet Alert
            const { value: formValues } = await Swal.fire({
                title: `Edit: ${template.templateName}`,
                html: `
                    <div style="text-align: left;">
                        <div class="mb-3">
                            <label class="form-label">Template Name:</label>
                            <input id="swal-name" class="form-control" value="${template.templateName}">
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Priority (1-10):</label>
                            <input id="swal-priority" type="number" min="1" max="10" class="form-control" value="${template.priority}">
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Status:</label>
                            <select id="swal-status" class="form-select">
                                <option value="active" ${template.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="testing" ${template.status === 'testing' ? 'selected' : ''}>Testing</option>
                                <option value="deprecated" ${template.status === 'deprecated' ? 'selected' : ''}>Deprecated</option>
                            </select>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Description:</label>
                            <textarea id="swal-description" class="form-control" rows="2">${template.description || ''}</textarea>
                        </div>
                        <div class="alert alert-info mb-0">
                            <small><i class="fas fa-info-circle me-1"></i> For advanced pattern editing, use the Template Creator wizard</small>
                        </div>
                    </div>
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'Save Changes',
                width: '600px',
                preConfirm: () => {
                    return {
                        templateName: document.getElementById('swal-name').value,
                        priority: parseInt(document.getElementById('swal-priority').value),
                        status: document.getElementById('swal-status').value,
                        description: document.getElementById('swal-description').value
                    };
                }
            });

            if (formValues) {
                try {
                    // Update only the changed fields
                    const updates = {
                        templateName: formValues.templateName,
                        priority: formValues.priority,
                        status: formValues.status,
                        description: formValues.description,
                        updatedAt: Date.now()
                    };

                    await this.api.updateTemplate(template.id, updates);
                    this.showSuccess('Template updated successfully!');
                    await this.loadTemplates();
                } catch (error) {
                    console.error('Error updating template:', error);
                    this.showError('Failed to update template', error.message);
                }
            }
        },

        /**
         * Quick status change for template
         */
        async quickStatusChange(template) {
            const { value: newStatus } = await Swal.fire({
                title: 'Change Template Status',
                html: `
                    <p>Change status for: <strong>${template.templateName}</strong></p>
                `,
                input: 'select',
                inputOptions: {
                    'active': 'Active - Use in production',
                    'testing': 'Testing - Use for testing only',
                    'deprecated': 'Deprecated - Don\'t use'
                },
                inputValue: template.status,
                showCancelButton: true,
                confirmButtonText: 'Update Status',
                inputValidator: (value) => {
                    if (!value) {
                        return 'Please select a status';
                    }
                }
            });

            if (newStatus && newStatus !== template.status) {
                try {
                    // Update template status via API
                    const updatedTemplate = { ...template, status: newStatus };
                    await this.api.updateTemplate(template.id, updatedTemplate);

                    this.showSuccess(`Template status updated to "${newStatus}"`);
                    await this.loadTemplates();
                } catch (error) {
                    console.error('Error updating template status:', error);
                    this.showError('Failed to update status', error.message);
                }
            }
        },

        /**
         * View template performance
         */
        async viewPerformance(template) {
            this.selectedTemplate = template;

            try {
                const result = await this.api.getPerformanceLogs(template.id, 100);
                this.performanceLogs = result.logs || [];

                // Wait for next tick to ensure $refs are available
                this.$nextTick(() => {
                    const modalElement = this.$refs.performanceModal;

                    if (!modalElement) {
                        console.error('Performance modal element not found');
                        this.showError('UI Error', 'Modal element not found in template');
                        return;
                    }

                    if (typeof bootstrap === 'undefined') {
                        console.error('Bootstrap not loaded');
                        this.showError('UI Error', 'Bootstrap library not loaded. Please refresh the page.');
                        return;
                    }

                    const modal = new bootstrap.Modal(modalElement);
                    modal.show();

                    // Wait for modal to be visible, then render chart
                    setTimeout(() => {
                        this.renderPerformanceChart();
                    }, 300);
                });
            } catch (error) {
                console.error('Error loading performance data:', error);
                this.showError('Failed to load performance data', error.message);
            }
        },

        /**
         * Render performance chart
         */
        renderPerformanceChart() {
            if (!this.performanceLogs || this.performanceLogs.length === 0) {
                return;
            }

            const canvas = this.$refs.performanceChart;
            if (!canvas) {
                console.warn('Performance chart canvas not found');
                return;
            }

            // Destroy existing chart
            if (this.performanceChart) {
                this.performanceChart.destroy();
            }

            const ctx = canvas.getContext('2d');

            // Prepare data (last 20 logs, chronologically)
            const recentLogs = this.performanceLogs.slice(0, 20).reverse();

            const labels = recentLogs.map((log, index) => `#${index + 1}`);
            const successData = recentLogs.map(log => log.success ? 1 : 0);
            const confidenceData = recentLogs.map(log => log.confidence * 100);

            this.performanceChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Success (1=Yes, 0=No)',
                            data: successData,
                            borderColor: '#28a745',
                            backgroundColor: 'rgba(40, 167, 69, 0.1)',
                            tension: 0.1,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Confidence (%)',
                            data: confidenceData,
                            borderColor: '#007bff',
                            backgroundColor: 'rgba(0, 123, 255, 0.1)',
                            tension: 0.1,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            min: 0,
                            max: 1,
                            title: {
                                display: true,
                                text: 'Success'
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            min: 0,
                            max: 100,
                            title: {
                                display: true,
                                text: 'Confidence %'
                            },
                            grid: {
                                drawOnChartArea: false,
                            },
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: 'Recent Performance (Last 20 Uses)'
                        },
                        legend: {
                            display: true,
                            position: 'bottom'
                        }
                    }
                }
            });
        },

        /**
         * Confirm delete template
         */
        async confirmDelete(template) {
            const result = await Swal.fire({
                icon: 'warning',
                title: 'Delete Template?',
                html: `
                    <p>Are you sure you want to deprecate this template?</p>
                    <p><strong>${template.templateName}</strong></p>
                    <p class="text-muted">The template will be marked as deprecated and will no longer be used for extraction.</p>
                `,
                showCancelButton: true,
                confirmButtonText: 'Yes, Deprecate',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#dc3545'
            });

            if (result.isConfirmed) {
                await this.deleteTemplate(template);
            }
        },

        /**
         * Delete template
         */
        async deleteTemplate(template) {
            try {
                await this.api.deleteTemplate(template.id);
                this.showSuccess('Template deprecated successfully');
                await this.loadTemplates();
            } catch (error) {
                console.error('Error deleting template:', error);
                this.showError('Failed to delete template', error.message);
            }
        },

        /**
         * Open create template modal
         */
        async openCreateTemplateModal() {
            try {
                const creator = new TemplateCreator();

                // Set up callback for when template is created
                creator.onTemplateCreated = async (template) => {
                    console.log('Template created:', template);
                    // Refresh the templates list
                    await this.loadTemplates();
                    // Show success message
                    this.showSuccess('Template created successfully!');
                };

                // Show the wizard
                await creator.show();
            } catch (error) {
                console.error('Error opening template creator:', error);
                this.showError('Failed to open template creator', error.message);
            }
        },

        /**
         * Helper: Get priority class
         */
        getPriorityClass(priority) {
            if (priority >= 8) return 'priority-high';
            if (priority >= 5) return 'priority-medium';
            return 'priority-low';
        },

        /**
         * Helper: Get status badge class
         */
        getStatusBadgeClass(status) {
            switch (status) {
                case 'active':
                    return 'bg-success';
                case 'testing':
                    return 'bg-warning text-dark';
                case 'deprecated':
                    return 'bg-secondary';
                default:
                    return 'bg-secondary';
            }
        },

        /**
         * Helper: Format date
         */
        formatDate(timestamp) {
            if (!timestamp) return 'N/A';
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins} min ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;

            return date.toLocaleDateString();
        },

        /**
         * Show success message
         */
        showSuccess(message) {
            Swal.fire({
                icon: 'success',
                title: 'Success',
                text: message,
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });
        },

        /**
         * Show error message
         */
        showError(title, message) {
            Swal.fire({
                icon: 'error',
                title: title,
                text: message,
                confirmButtonText: 'OK'
            });
        }
    }
});

// Mount the app to either #app (standalone) or #receiptSettingsApp (embedded)
const mountPoint = document.getElementById('receiptSettingsApp') || document.getElementById('app');
if (mountPoint) {
    app.mount(mountPoint);
    // Store app globally for cleanup (need the app instance, not the mounted component)
    window.receiptSettingsApp = app;
    console.log('Receipt Settings Module loaded and mounted successfully');
} else {
    console.error('Receipt Settings mount point not found');
}
