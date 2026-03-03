/**
 * ROSS Module - Restaurant Operations Support System
 * Vue 3 (CDN global) SPA mounted on #ross-app
 * Views: Overview | Template Library | My Workflows | Workflow Builder | Reports | Staff
 */

import { auth, rtdb, ref, onValue } from '../../config/firebase-config.js';
import { rossService } from './services/ross-service.js';

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

const CATEGORY_LABELS = {
    compliance:  'Compliance',
    operations:  'Operations',
    growth:      'Growth',
    finance:     'Finance',
    hr:          'HR & People',
    maintenance: 'Maintenance'
};

const CATEGORY_ICONS = {
    compliance:  'fa-shield-alt',
    operations:  'fa-cogs',
    growth:      'fa-chart-line',
    finance:     'fa-dollar-sign',
    hr:          'fa-users',
    maintenance: 'fa-wrench'
};

const RECURRENCE_LABELS = {
    once:      'Once',
    daily:     'Daily',
    weekly:    'Weekly',
    monthly:   'Monthly',
    quarterly: 'Quarterly',
    annually:  'Annual'
};

// ---------------------------------------------------------------------------
// initializeRoss
// ---------------------------------------------------------------------------
export async function initializeRoss() {
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
                <button class="nav-link" :class="{ active: currentTab === 'overview' }"
                    @click="switchTab('overview')">
                    <i class="fas fa-tachometer-alt me-1"></i>Overview
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link" :class="{ active: currentTab === 'templates' }"
                    @click="switchTab('templates')">
                    <i class="fas fa-layer-group me-1"></i>Template Library
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link" :class="{ active: currentTab === 'workflows' }"
                    @click="switchTab('workflows')">
                    <i class="fas fa-project-diagram me-1"></i>My Workflows
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link" :class="{ active: currentTab === 'builder' }"
                    @click="switchTab('builder')">
                    <i class="fas fa-tools me-1"></i>Workflow Builder
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link" :class="{ active: currentTab === 'reports' }"
                    @click="switchTab('reports')">
                    <i class="fas fa-chart-bar me-1"></i>Reports
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link" :class="{ active: currentTab === 'staff' }"
                    @click="switchTab('staff')">
                    <i class="fas fa-users me-1"></i>Staff
                </button>
            </li>
        </ul>
    </div>

    <!-- ================================================================
         VIEW 1 — Overview Dashboard
    ================================================================ -->
    <div v-if="currentTab === 'overview'">

        <!-- Loading -->
        <div v-if="overviewLoading" class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Loading overview...</p>
        </div>

        <!-- Error -->
        <div v-else-if="overviewError" class="alert alert-danger">
            <i class="fas fa-exclamation-circle me-2"></i>{{ overviewError }}
            <button class="btn btn-sm btn-outline-danger ms-3" @click="loadOverview">Retry</button>
        </div>

        <!-- Content -->
        <div v-else>

            <!-- Section A: Alert strip — overdue (red) + due-soon (amber) -->
            <div v-if="visibleAlerts.length > 0" class="mb-4">
                <div v-for="alert in visibleAlerts" :key="alert.taskId"
                    class="alert alert-dismissible fade show mb-2"
                    :class="alert.type === 'overdue' ? 'alert-danger' : 'alert-warning'"
                    role="alert">
                    <i class="me-2"
                        :class="alert.type === 'overdue' ? 'fas fa-exclamation-circle' : 'fas fa-clock'"></i>
                    <strong v-if="alert.type === 'overdue'">Overdue:</strong>
                    <strong v-else>Due Soon:</strong>
                    {{ alert.taskName }} &mdash; <em>{{ alert.workflowName }}</em>
                    <span class="ms-2 text-muted small">({{ formatDate(alert.dueDate) }})</span>
                    <button type="button" class="btn-close" @click="dismissAlert(alert.taskId)"></button>
                </div>
            </div>

            <!-- Section B: Category summary cards (6) -->
            <div class="row g-3 mb-4">
                <div v-for="cat in categoryStats" :key="cat.name" class="col-6 col-md-4 col-lg-2">
                    <div class="card text-center h-100 border-0 shadow-sm">
                        <div class="card-body py-3">
                            <i :class="[cat.icon, 'fa-lg', 'mb-2',
                                cat.activeCount > 0 ? 'text-primary' : 'text-muted']"></i>
                            <div class="fw-bold small mb-1">{{ cat.name }}</div>
                            <div class="h5 mb-0">{{ cat.activeCount }}</div>
                            <small class="text-muted">active</small>
                            <div class="progress mt-2" style="height:4px">
                                <div class="progress-bar bg-success"
                                    :style="{ width: cat.completionPct + '%' }"></div>
                            </div>
                            <small class="text-muted">{{ cat.completionPct }}% done</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section C: Today's Tasks quick list -->
            <div class="card mb-4 shadow-sm">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">
                        <i class="fas fa-calendar-day me-2"></i>Today's Tasks
                    </h6>
                    <span class="badge bg-primary">{{ todayTasks.length }}</span>
                </div>
                <div class="card-body p-0">
                    <div v-if="todayTasks.length === 0" class="text-center py-4">
                        <i class="fas fa-check-circle fa-2x text-success mb-2"></i>
                        <p class="text-muted mb-0">No tasks due today</p>
                    </div>
                    <div v-else class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Task</th>
                                    <th>Workflow</th>
                                    <th>Status</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="task in todayTasks" :key="task.taskId">
                                    <td>{{ task.title }}</td>
                                    <td class="text-muted small">{{ task.workflowName }}</td>
                                    <td>
                                        <span class="badge" :class="taskStatusClass(task.status)">
                                            {{ formatStatus(task.status) }}
                                        </span>
                                    </td>
                                    <td>
                                        <button v-if="task.status !== 'completed'"
                                            class="btn btn-sm btn-outline-success"
                                            :disabled="task.completing"
                                            @click="completeTask(task)">
                                            <span v-if="task.completing"
                                                class="spinner-border spinner-border-sm me-1"></span>
                                            <i v-else class="fas fa-check me-1"></i>Complete
                                        </button>
                                        <span v-else class="text-success small">
                                            <i class="fas fa-check-circle me-1"></i>Done
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Section D: Quick-action buttons -->
            <div class="d-flex gap-3">
                <button class="btn btn-primary" @click="switchTab('templates')">
                    <i class="fas fa-layer-group me-2"></i>Activate Template
                </button>
                <button class="btn btn-outline-primary" @click="switchTab('builder')">
                    <i class="fas fa-tools me-2"></i>Create Workflow
                </button>
            </div>

        </div>
    </div>

    <!-- ================================================================
         VIEW 2 — Template Library
    ================================================================ -->
    <div v-if="currentTab === 'templates'">

        <!-- Loading -->
        <div v-if="tabLoading" class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Loading templates...</p>
        </div>

        <!-- Content -->
        <div v-else>

            <!-- Category filter pills -->
            <ul class="nav nav-pills mb-4 flex-wrap gap-1">
                <li class="nav-item">
                    <button class="nav-link py-1 px-3"
                        :class="{ active: templateFilter === 'all' }"
                        @click="templateFilter = 'all'">All</button>
                </li>
                <li v-for="(label, key) in CATEGORY_LABELS" :key="key" class="nav-item">
                    <button class="nav-link py-1 px-3"
                        :class="{ active: templateFilter === key }"
                        @click="templateFilter = key">{{ label }}</button>
                </li>
            </ul>

            <!-- Empty state -->
            <div v-if="filteredTemplates().length === 0" class="text-center py-5 text-muted">
                <i class="fas fa-book fa-3x mb-3"></i>
                <p>No templates found.</p>
            </div>

            <!-- Template cards -->
            <div class="row g-3">
                <div v-for="tmpl in filteredTemplates()" :key="tmpl.templateId"
                    class="col-md-6 col-lg-4">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <h6 class="card-title mb-0">{{ tmpl.name }}</h6>
                                <span class="badge bg-secondary ms-2">
                                    {{ getRecurrenceLabel(tmpl.recurrence) }}
                                </span>
                            </div>
                            <p class="text-muted small mb-2">{{ tmpl.description }}</p>
                            <div class="text-muted small">
                                <i :class="['fas', getCategoryIcon(tmpl.category), 'me-1']"></i>
                                {{ getCategoryLabel(tmpl.category) }}
                                &bull;
                                {{ (tmpl.subtasks || []).length }} subtasks
                            </div>
                        </div>
                        <div class="card-footer bg-white border-0 d-flex gap-2">
                            <button class="btn btn-primary btn-sm flex-grow-1"
                                @click="activateTemplate(tmpl)">
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

            <!-- Super Admin: add template -->
            <div v-if="isSuperAdmin" class="mt-4">
                <button class="btn btn-outline-primary" @click="openCreateTemplate()">
                    <i class="fas fa-plus me-1"></i>Add Template
                </button>
            </div>

        </div>
    </div>

    <!-- ================================================================
         VIEW 3 — My Workflows (placeholder, built in Task 10)
    ================================================================ -->
    <div v-if="currentTab === 'workflows'">
        <div class="text-center py-5">
            <div v-if="tabLoading" class="spinner-border text-primary" role="status"></div>
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
    <div v-if="currentTab === 'builder'">
        <div class="text-center py-5">
            <div v-if="tabLoading" class="spinner-border text-primary" role="status"></div>
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
    <div v-if="currentTab === 'reports'">
        <div class="text-center py-5">
            <div v-if="tabLoading" class="spinner-border text-primary" role="status"></div>
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
    <div v-if="currentTab === 'staff'">
        <div class="text-center py-5">
            <div v-if="tabLoading" class="spinner-border text-primary" role="status"></div>
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
                currentTab: 'overview',
                tabLoading: false,

                // Shared across views (populated in mounted + per-tab loaders)
                locations: [],
                templates: [],
                workflows: [],
                staff: [],

                // View 1 — Overview
                overviewLoading: false,
                overviewError: null,
                overdueAlerts: [],
                categoryStats: [],
                todayTasks: [],
                dismissedAlerts: [],

                // View 2 — Template Library
                templateFilter: 'all',
                isSuperAdmin: false,
                CATEGORY_LABELS
            };
        },

        computed: {
            visibleAlerts() {
                return this.overdueAlerts
                    .filter(a => !this.dismissedAlerts.includes(a.taskId))
                    .slice(0, 5);
            }
        },

        methods: {
            // ------------------------------------------------------------------
            // Navigation
            // ------------------------------------------------------------------
            switchTab(tab) {
                this.currentTab = tab;
                if (tab === 'overview') {
                    this.loadOverview();
                } else if (tab === 'templates') {
                    this.loadTemplates();
                }
            },

            // ------------------------------------------------------------------
            // View 1 — Overview
            // ------------------------------------------------------------------
            async loadOverview() {
                if (!rossState.locationId) {
                    this.overviewError = 'No location selected. Please select a location first.';
                    return;
                }

                this.overviewLoading = true;
                this.overviewError = null;

                try {
                    const raw = await rossService.getWorkflows(rossState.locationId);
                    const workflowList = Array.isArray(raw) ? raw : Object.values(raw || {});
                    this.workflows = workflowList;

                    this.overdueAlerts = this.buildAlerts(workflowList);
                    this.categoryStats = this.buildCategoryStats(workflowList);
                    this.todayTasks = this.buildTodayTasks(workflowList);

                } catch (err) {
                    console.error('[ROSS] loadOverview error:', err);
                    this.overviewError = 'Failed to load overview: ' + err.message;
                } finally {
                    this.overviewLoading = false;
                }
            },

            buildAlerts(workflowList) {
                const now = Date.now();
                const soon = now + 24 * 60 * 60 * 1000;
                const alerts = [];

                for (const wf of workflowList) {
                    const entries = Object.entries(wf.tasks || {});
                    for (const [taskId, task] of entries) {
                        if (!task.dueDate || task.status === 'completed') continue;
                        if (task.dueDate < now) {
                            alerts.push({
                                taskId,
                                taskName: task.title || task.name || 'Unnamed task',
                                workflowName: wf.name || 'Unnamed workflow',
                                dueDate: task.dueDate,
                                type: 'overdue'
                            });
                        } else if (task.dueDate <= soon) {
                            alerts.push({
                                taskId,
                                taskName: task.title || task.name || 'Unnamed task',
                                workflowName: wf.name || 'Unnamed workflow',
                                dueDate: task.dueDate,
                                type: 'soon'
                            });
                        }
                    }
                }

                // Overdue first, then soon; ascending by dueDate within each group
                return alerts.sort((a, b) => {
                    if (a.type !== b.type) return a.type === 'overdue' ? -1 : 1;
                    return a.dueDate - b.dueDate;
                });
            },

            buildCategoryStats(workflowList) {
                return Object.keys(CATEGORY_LABELS).map(cat => {
                    const catWfs = workflowList.filter(wf => (wf.category || '') === cat);
                    const active = catWfs.filter(
                        wf => wf.status === 'active' || wf.status === 'in_progress'
                    );
                    let totalTasks = 0;
                    let doneTasks = 0;
                    for (const wf of catWfs) {
                        const tasks = Object.values(wf.tasks || {});
                        totalTasks += tasks.length;
                        doneTasks += tasks.filter(
                            t => t.status === 'completed' || t.status === 'done'
                        ).length;
                    }
                    return {
                        name: CATEGORY_LABELS[cat],
                        icon: 'fas ' + (CATEGORY_ICONS[cat] || 'fa-folder'),
                        activeCount: active.length,
                        completionPct: totalTasks > 0
                            ? Math.round((doneTasks / totalTasks) * 100)
                            : 0
                    };
                });
            },

            buildTodayTasks(workflowList) {
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const todayEnd = new Date();
                todayEnd.setHours(23, 59, 59, 999);
                const ts = todayStart.getTime();
                const te = todayEnd.getTime();

                const tasks = [];
                for (const wf of workflowList) {
                    const entries = Object.entries(wf.tasks || {});
                    for (const [taskId, task] of entries) {
                        if (task.dueDate && task.dueDate >= ts && task.dueDate <= te) {
                            tasks.push({
                                taskId,
                                workflowId: wf.workflowId || wf.id,
                                workflowName: wf.name || 'Unnamed workflow',
                                title: task.title || task.name || 'Unnamed task',
                                status: task.status || 'pending',
                                dueDate: task.dueDate,
                                completing: false
                            });
                        }
                    }
                }
                return tasks.sort((a, b) => a.dueDate - b.dueDate);
            },

            async completeTask(task) {
                if (!rossState.locationId) return;

                // Immutable flag update
                this.todayTasks = this.todayTasks.map(t =>
                    t.taskId === task.taskId ? { ...t, completing: true } : t
                );

                try {
                    await rossService.completeTask(
                        rossState.locationId,
                        task.workflowId,
                        task.taskId
                    );
                    await Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: 'Task completed',
                        showConfirmButton: false,
                        timer: 2000
                    });
                    await this.loadOverview();
                } catch (err) {
                    console.error('[ROSS] completeTask error:', err);
                    await Swal.fire('Error', 'Failed to complete task: ' + err.message, 'error');
                    this.todayTasks = this.todayTasks.map(t =>
                        t.taskId === task.taskId ? { ...t, completing: false } : t
                    );
                }
            },

            dismissAlert(taskId) {
                this.dismissedAlerts = [...this.dismissedAlerts, taskId];
            },

            // ------------------------------------------------------------------
            // View 2 — Template Library
            // ------------------------------------------------------------------
            async loadTemplates() {
                this.tabLoading = true;
                try {
                    const raw = await rossService.getTemplates();
                    this.templates = Array.isArray(raw)
                        ? raw
                        : Array.isArray(raw?.templates)
                            ? raw.templates
                            : Object.values(raw || {});
                } catch (err) {
                    console.error('[ROSS] loadTemplates error:', err);
                    await Swal.fire('Error', 'Failed to load templates: ' + err.message, 'error');
                } finally {
                    this.tabLoading = false;
                }
            },

            async checkSuperAdmin() {
                try {
                    const user = auth.currentUser;
                    if (!user) return;
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
                if (!rossState.locationId) {
                    await Swal.fire('No Location', 'Please select a location first.', 'warning');
                    return;
                }
                const { value: formValues } = await Swal.fire({
                    title: 'Activate Template',
                    html: `
                        <p class="text-start mb-3">Activating: <strong>${escapeHtml(template.name)}</strong></p>
                        <div class="mb-3 text-start">
                            <label class="form-label fw-semibold">Workflow Name (optional)</label>
                            <input id="swal-wf-name" class="swal2-input"
                                placeholder="${escapeHtml(template.name)}"
                                value="${escapeHtml(template.name)}">
                        </div>
                        <div class="mb-3 text-start">
                            <label class="form-label fw-semibold">Next Due Date <span class="text-danger">*</span></label>
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
                        locationId: rossState.locationId,
                        name: formValues.name,
                        nextDueDate: formValues.nextDueDate
                    });
                    await Swal.fire('Activated!', `${escapeHtml(template.name)} is now active.`, 'success');
                    this.switchTab('workflows');
                } catch (err) {
                    console.error('[ROSS] activateTemplate error:', err);
                    await Swal.fire('Error', 'Failed to activate workflow. Please try again.', 'error');
                }
            },

            async deleteTemplate(template) {
                const result = await Swal.fire({
                    title: 'Delete Template?',
                    text: `This will permanently delete "${template.name}". Existing workflows are not affected.`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Delete',
                    confirmButtonColor: '#dc3545'
                });
                if (!result.isConfirmed) return;
                try {
                    await rossService.deleteTemplate(template.templateId);
                    this.templates = this.templates.filter(t => t.templateId !== template.templateId);
                    await Swal.fire('Deleted', 'Template removed.', 'success');
                } catch (err) {
                    console.error('[ROSS] deleteTemplate error:', err);
                    await Swal.fire('Error', 'Failed to delete template.', 'error');
                }
            },

            async openEditTemplate() {
                await Swal.fire('Coming Soon', 'Template editing will be added in a future update.', 'info');
            },

            async openCreateTemplate() {
                await Swal.fire('Coming Soon', 'Template creation will be added in a future update.', 'info');
            },

            // ------------------------------------------------------------------
            // Helpers
            // ------------------------------------------------------------------
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
            formatDateTime,
            escapeHtml,

            formatStatus(status) {
                if (!status) return 'Unknown';
                return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            },

            taskStatusClass(status) {
                const map = {
                    completed: 'bg-success',
                    done:       'bg-success',
                    in_progress:'bg-primary',
                    pending:    'bg-secondary',
                    todo:       'bg-secondary',
                    blocked:    'bg-danger'
                };
                return map[status] || 'bg-secondary';
            }
        },

        mounted() {
            this.checkSuperAdmin();
            this.loadOverview();
        }
    });

    rossState.app.mount(container);
    return rossState.app;
}

// ---------------------------------------------------------------------------
// cleanupRoss
// ---------------------------------------------------------------------------
export function cleanupRoss() {
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
