/**
 * ROSS Module - Restaurant Operations Support System
 * Vue 3 (CDN global) SPA mounted on #ross-app
 * Views: Overview | Template Library | My Workflows | Workflow Builder | Reports | Staff
 */

import { rossService } from './services/ross-service.js';
import { auth } from '../../config/firebase-config.js';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
const rossState = {
    app: null,
    locationId: null
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(ts) {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('en-ZA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatDateTime(ts) {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleString('en-ZA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ---------------------------------------------------------------------------
// initializeRoss
// ---------------------------------------------------------------------------
export async function initializeRoss() {
    console.log('[ROSS] Initializing...');

    const container = document.getElementById('ross-app');
    if (!container) {
        console.error('[ROSS] Container #ross-app not found');
        return null;
    }

    container.innerHTML = '';

    if (typeof Vue === 'undefined') {
        container.innerHTML = `
            <div class="alert alert-danger m-4">
                <h4><i class="fas fa-exclamation-triangle me-2"></i>Error</h4>
                <p>Vue.js is required for ROSS. Please refresh the page.</p>
            </div>`;
        return null;
    }

    // Resolve locationId from current user claims or URL param
    let locationId = null;
    try {
        const user = auth.currentUser;
        if (user) {
            const token = await user.getIdTokenResult();
            locationId = token.claims.locationId || null;
        }
    } catch (e) {
        console.warn('[ROSS] Could not read locationId from claims:', e.message);
    }
    if (!locationId) {
        const params = new URLSearchParams(window.location.search);
        locationId = params.get('locationId') || null;
    }

    rossState.locationId = locationId;

    rossState.app = Vue.createApp({
        template: `
<div class="ross-module">

    <!-- ================================================================
         Navigation Tabs
    ================================================================ -->
    <div class="ross-nav-tabs mb-4">
        <ul class="nav nav-tabs">
            <li class="nav-item">
                <button class="nav-link" :class="{ active: currentView === 'overview' }"
                    @click="switchView('overview')">
                    <i class="fas fa-tachometer-alt me-1"></i>Overview
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link" :class="{ active: currentView === 'templates' }"
                    @click="switchView('templates')">
                    <i class="fas fa-layer-group me-1"></i>Template Library
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link" :class="{ active: currentView === 'workflows' }"
                    @click="switchView('workflows')">
                    <i class="fas fa-project-diagram me-1"></i>My Workflows
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link" :class="{ active: currentView === 'builder' }"
                    @click="switchView('builder')">
                    <i class="fas fa-tools me-1"></i>Workflow Builder
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link" :class="{ active: currentView === 'reports' }"
                    @click="switchView('reports')">
                    <i class="fas fa-chart-bar me-1"></i>Reports
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link" :class="{ active: currentView === 'staff' }"
                    @click="switchView('staff')">
                    <i class="fas fa-users me-1"></i>Staff
                </button>
            </li>
        </ul>
    </div>

    <!-- ================================================================
         VIEW 1 — Overview Dashboard
    ================================================================ -->
    <div v-if="currentView === 'overview'">

        <!-- Loading -->
        <div v-if="loading" class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Loading overview...</p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="alert alert-danger">
            <i class="fas fa-exclamation-circle me-2"></i>{{ error }}
            <button class="btn btn-sm btn-outline-danger ms-3" @click="loadOverview">Retry</button>
        </div>

        <!-- Content -->
        <div v-else>

            <!-- Stat Cards -->
            <div class="row g-3 mb-4">
                <div class="col-6 col-md-3">
                    <div class="card text-center h-100 border-0 shadow-sm">
                        <div class="card-body">
                            <div class="stat-icon text-primary mb-2">
                                <i class="fas fa-project-diagram fa-2x"></i>
                            </div>
                            <h3 class="mb-0 fw-bold">{{ overviewStats.activeWorkflows }}</h3>
                            <small class="text-muted">Active Workflows</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card text-center h-100 border-0 shadow-sm">
                        <div class="card-body">
                            <div class="stat-icon text-success mb-2">
                                <i class="fas fa-check-circle fa-2x"></i>
                            </div>
                            <h3 class="mb-0 fw-bold">{{ overviewStats.completedToday }}</h3>
                            <small class="text-muted">Completed Today</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card text-center h-100 border-0 shadow-sm">
                        <div class="card-body">
                            <div class="stat-icon text-warning mb-2">
                                <i class="fas fa-clock fa-2x"></i>
                            </div>
                            <h3 class="mb-0 fw-bold">{{ overviewStats.pendingTasks }}</h3>
                            <small class="text-muted">Pending Tasks</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card text-center h-100 border-0 shadow-sm">
                        <div class="card-body">
                            <div class="stat-icon text-info mb-2">
                                <i class="fas fa-user-check fa-2x"></i>
                            </div>
                            <h3 class="mb-0 fw-bold">{{ overviewStats.staffOnDuty }}</h3>
                            <small class="text-muted">Staff On Duty</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Active Workflows Table -->
            <div class="card mb-4 shadow-sm">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0"><i class="fas fa-project-diagram me-2"></i>Active Workflows</h6>
                    <button class="btn btn-sm btn-primary" @click="switchView('workflows')">
                        <i class="fas fa-list me-1"></i>View All
                    </button>
                </div>
                <div class="card-body p-0">
                    <div v-if="activeWorkflows.length === 0" class="text-center py-4">
                        <i class="fas fa-inbox fa-2x text-muted mb-2"></i>
                        <p class="text-muted mb-0">No active workflows</p>
                        <button class="btn btn-sm btn-outline-primary mt-2" @click="switchView('templates')">
                            Start from a Template
                        </button>
                    </div>
                    <div v-else class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Workflow</th>
                                    <th>Template</th>
                                    <th style="width:180px">Progress</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="wf in activeWorkflows" :key="wf.workflowId">
                                    <td>
                                        <strong>{{ wf.name }}</strong>
                                        <div class="small text-muted">{{ formatDate(wf.createdAt) }}</div>
                                    </td>
                                    <td>
                                        <span class="badge bg-secondary">{{ wf.templateName || 'Custom' }}</span>
                                    </td>
                                    <td>
                                        <div class="d-flex align-items-center gap-2">
                                            <div class="progress flex-grow-1" style="height:8px">
                                                <div class="progress-bar"
                                                    :class="progressBarClass(wf.progress)"
                                                    :style="{ width: (wf.progress || 0) + '%' }">
                                                </div>
                                            </div>
                                            <small class="text-muted">{{ wf.progress || 0 }}%</small>
                                        </div>
                                    </td>
                                    <td>
                                        <span class="badge" :class="workflowStatusClass(wf.status)">
                                            {{ formatStatus(wf.status) }}
                                        </span>
                                    </td>
                                    <td>
                                        <button class="btn btn-sm btn-outline-primary"
                                            @click="switchView('workflows')">
                                            <i class="fas fa-eye me-1"></i>View
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Recent Activity -->
            <div class="card shadow-sm">
                <div class="card-header">
                    <h6 class="mb-0"><i class="fas fa-history me-2"></i>Recent Activity</h6>
                </div>
                <div class="card-body">
                    <div v-if="recentActivity.length === 0" class="text-center py-3">
                        <p class="text-muted mb-0">No recent activity</p>
                    </div>
                    <ul v-else class="list-group list-group-flush">
                        <li v-for="(item, idx) in recentActivity" :key="idx"
                            class="list-group-item px-0 py-2 d-flex align-items-start gap-3">
                            <span class="badge rounded-pill mt-1" :class="activityBadgeClass(item.type)">
                                <i :class="activityIcon(item.type)"></i>
                            </span>
                            <div class="flex-grow-1">
                                <div>{{ item.description }}</div>
                                <small class="text-muted">{{ formatDateTime(item.timestamp) }}</small>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

        </div>
    </div>

    <!-- ================================================================
         VIEW 2 — Template Library (placeholder, built in Task 9)
    ================================================================ -->
    <div v-if="currentView === 'templates'">
        <div class="text-center py-5">
            <div v-if="viewLoading" class="spinner-border text-primary" role="status"></div>
            <template v-else>
                <i class="fas fa-layer-group fa-3x text-muted mb-3"></i>
                <h5>Template Library</h5>
                <p class="text-muted">Coming soon...</p>
            </template>
        </div>
    </div>

    <!-- ================================================================
         VIEW 3 — My Workflows (placeholder, built in Task 10)
    ================================================================ -->
    <div v-if="currentView === 'workflows'">
        <div class="text-center py-5">
            <div v-if="viewLoading" class="spinner-border text-primary" role="status"></div>
            <template v-else>
                <i class="fas fa-project-diagram fa-3x text-muted mb-3"></i>
                <h5>My Workflows</h5>
                <p class="text-muted">Coming soon...</p>
            </template>
        </div>
    </div>

    <!-- ================================================================
         VIEW 4 — Workflow Builder (placeholder, built in Task 11)
    ================================================================ -->
    <div v-if="currentView === 'builder'">
        <div class="text-center py-5">
            <div v-if="viewLoading" class="spinner-border text-primary" role="status"></div>
            <template v-else>
                <i class="fas fa-tools fa-3x text-muted mb-3"></i>
                <h5>Workflow Builder</h5>
                <p class="text-muted">Coming soon...</p>
            </template>
        </div>
    </div>

    <!-- ================================================================
         VIEW 5 — Reports (placeholder, built in Task 12)
    ================================================================ -->
    <div v-if="currentView === 'reports'">
        <div class="text-center py-5">
            <div v-if="viewLoading" class="spinner-border text-primary" role="status"></div>
            <template v-else>
                <i class="fas fa-chart-bar fa-3x text-muted mb-3"></i>
                <h5>Reports</h5>
                <p class="text-muted">Coming soon...</p>
            </template>
        </div>
    </div>

    <!-- ================================================================
         VIEW 6 — Staff Management (placeholder, built in Task 12b)
    ================================================================ -->
    <div v-if="currentView === 'staff'">
        <div class="text-center py-5">
            <div v-if="viewLoading" class="spinner-border text-primary" role="status"></div>
            <template v-else>
                <i class="fas fa-users fa-3x text-muted mb-3"></i>
                <h5>Staff Management</h5>
                <p class="text-muted">Coming soon...</p>
            </template>
        </div>
    </div>

</div>
        `,

        data() {
            return {
                // Navigation
                currentView: 'overview',
                viewLoading: false,

                // View 1 — Overview
                loading: false,
                error: null,
                overviewStats: {
                    activeWorkflows: 0,
                    completedToday: 0,
                    pendingTasks: 0,
                    staffOnDuty: 0
                },
                activeWorkflows: [],
                recentActivity: []
            };
        },

        methods: {
            // ------------------------------------------------------------------
            // Navigation
            // ------------------------------------------------------------------
            switchView(view) {
                this.currentView = view;
                if (view === 'overview') {
                    this.loadOverview();
                }
            },

            // ------------------------------------------------------------------
            // View 1 — Overview
            // ------------------------------------------------------------------
            async loadOverview() {
                if (!rossState.locationId) {
                    this.error = 'No location selected. Please select a location first.';
                    return;
                }

                this.loading = true;
                this.error = null;

                try {
                    const workflows = await rossService.getWorkflows(rossState.locationId);
                    const workflowList = Array.isArray(workflows) ? workflows : Object.values(workflows || {});

                    const todayStart = new Date();
                    todayStart.setHours(0, 0, 0, 0);
                    const todayTs = todayStart.getTime();

                    const active = workflowList.filter(w => w.status === 'active' || w.status === 'in_progress');
                    const completedToday = workflowList.filter(
                        w => w.status === 'completed' && w.completedAt && w.completedAt >= todayTs
                    );

                    // Count pending tasks across all active workflows
                    let pendingTasks = 0;
                    for (const wf of active) {
                        const tasks = Object.values(wf.tasks || {});
                        pendingTasks += tasks.filter(t => t.status === 'pending' || t.status === 'todo').length;
                    }

                    this.overviewStats = {
                        activeWorkflows: active.length,
                        completedToday: completedToday.length,
                        pendingTasks,
                        staffOnDuty: 0  // populated by staff view; placeholder here
                    };

                    this.activeWorkflows = active.slice(0, 10).map(wf => ({
                        ...wf,
                        progress: this.calcProgress(wf)
                    }));

                    // Build recent activity from latest workflows
                    const sorted = [...workflowList].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                    this.recentActivity = sorted.slice(0, 5).map(wf => ({
                        type: wf.status,
                        description: `Workflow "${wf.name}" — ${this.formatStatus(wf.status)}`,
                        timestamp: wf.updatedAt || wf.createdAt
                    }));

                } catch (err) {
                    console.error('[ROSS] loadOverview error:', err);
                    this.error = 'Failed to load overview: ' + err.message;
                } finally {
                    this.loading = false;
                }
            },

            // ------------------------------------------------------------------
            // Helpers
            // ------------------------------------------------------------------
            calcProgress(wf) {
                const tasks = Object.values(wf.tasks || {});
                if (tasks.length === 0) return 0;
                const done = tasks.filter(t => t.status === 'completed' || t.status === 'done').length;
                return Math.round((done / tasks.length) * 100);
            },

            formatDate,
            formatDateTime,

            formatStatus(status) {
                if (!status) return 'Unknown';
                return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            },

            workflowStatusClass(status) {
                const map = {
                    active: 'bg-success',
                    in_progress: 'bg-primary',
                    completed: 'bg-secondary',
                    paused: 'bg-warning text-dark',
                    cancelled: 'bg-danger'
                };
                return map[status] || 'bg-secondary';
            },

            progressBarClass(pct) {
                if (pct >= 80) return 'bg-success';
                if (pct >= 40) return 'bg-primary';
                return 'bg-warning';
            },

            activityBadgeClass(type) {
                const map = {
                    completed: 'bg-success',
                    active: 'bg-primary',
                    in_progress: 'bg-primary',
                    paused: 'bg-warning text-dark',
                    cancelled: 'bg-danger'
                };
                return map[type] || 'bg-secondary';
            },

            activityIcon(type) {
                const map = {
                    completed: 'fas fa-check',
                    active: 'fas fa-play',
                    in_progress: 'fas fa-spinner',
                    paused: 'fas fa-pause',
                    cancelled: 'fas fa-times'
                };
                return map[type] || 'fas fa-circle';
            }
        },

        mounted() {
            console.log('[ROSS] Vue app mounted, locationId:', rossState.locationId);
            this.loadOverview();
        }
    });

    rossState.app.mount(container);
    console.log('[ROSS] Initialized successfully');
    return rossState.app;
}

// ---------------------------------------------------------------------------
// cleanupRoss
// ---------------------------------------------------------------------------
export function cleanupRoss() {
    console.log('[ROSS] Cleaning up...');

    if (rossState.app) {
        try {
            rossState.app.unmount();
        } catch (err) {
            console.error('[ROSS] Error unmounting Vue app:', err);
        }
        rossState.app = null;
    }

    rossState.locationId = null;
}
