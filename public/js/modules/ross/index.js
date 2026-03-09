/**
 * ROSS Module - Restaurant Operations Support System
 * Vue 3 (CDN global) SPA mounted on #ross-app
 * Views: Overview | Template Library | My Workflows | Workflow Builder | Reports | Staff
 */

import { auth, rtdb, ref, get, onValue } from '../../config/firebase-config.js';
import { rossService } from './services/ross-service.js';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
const rossState = {
    app: null,
    locationId: null,
    authUnsubscribe: null
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
    if (rossState.app) {
        cleanupRoss();
    }

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
        console.error('[ROSS] Could not read locationId from claims:', e.message);
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
         Location Picker (shown when admin has no locationId claim)
    ================================================================ -->
    <div v-if="showLocationPicker" class="card shadow-sm mb-4 border-warning">
        <div class="card-body d-flex align-items-center gap-3 flex-wrap">
            <i class="fas fa-map-marker-alt text-warning fa-lg"></i>
            <span class="fw-semibold">Select Location:</span>
            <select class="form-select w-auto" v-model="pickedLocationId" @change="applyPickedLocation">
                <option value="">-- choose a location --</option>
                <option v-for="loc in availableLocations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
            </select>
            <span v-if="locationsLoading" class="text-muted small">
                <span class="spinner-border spinner-border-sm me-1"></span>Loading...
            </span>
        </div>
    </div>

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
        <div v-if="templatesLoading" class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Loading templates...</p>
        </div>

        <!-- Template Editor Panel -->
        <div v-else-if="templateEditor" class="card shadow-sm border-0 mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h6 class="mb-0">
                    <i class="fas fa-edit me-2"></i>
                    {{ templateEditor.mode === 'create' ? 'New Template' : 'Edit Template' }}
                </h6>
                <button class="btn btn-sm btn-outline-secondary" @click="cancelTemplateEdit()">
                    <i class="fas fa-times me-1"></i>Cancel
                </button>
            </div>
            <div class="card-body">
                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label fw-semibold">Name <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" v-model="templateEditor.form.name"
                            placeholder="e.g. Monthly Fire Safety Check">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-semibold">Category</label>
                        <select class="form-select" v-model="templateEditor.form.category">
                            <option v-for="(label, key) in CATEGORY_LABELS" :key="key" :value="key">
                                {{ label }}
                            </option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label fw-semibold">Recurrence</label>
                        <select class="form-select" v-model="templateEditor.form.recurrence">
                            <option v-for="(label, key) in RECURRENCE_LABELS" :key="key" :value="key">
                                {{ label }}
                            </option>
                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label fw-semibold">Description</label>
                        <textarea class="form-control" rows="2" v-model="templateEditor.form.description"
                            placeholder="Brief description of this workflow template"></textarea>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-semibold">Alert Days Before Due</label>
                        <input type="text" class="form-control" v-model="templateEditor.form.daysBeforeAlertRaw"
                            placeholder="e.g. 90, 30, 7">
                        <div class="form-text">Comma-separated days (e.g. 90, 30, 7)</div>
                    </div>
                </div>

                <!-- Subtasks -->
                <div class="mt-4">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0">Subtasks</h6>
                        <button class="btn btn-sm btn-outline-primary" @click="addTemplateSubtask()">
                            <i class="fas fa-plus me-1"></i>Add Subtask
                        </button>
                    </div>
                    <div v-if="templateEditor.form.subtasks.length === 0" class="text-muted small py-2">
                        No subtasks yet. Add at least one.
                    </div>
                    <div v-for="(sub, idx) in templateEditor.form.subtasks" :key="idx"
                        class="d-flex align-items-center gap-2 mb-2">
                        <span class="text-muted small" style="min-width:20px">{{ idx + 1 }}.</span>
                        <input type="text" class="form-control form-control-sm" v-model="sub.title"
                            placeholder="Subtask title">
                        <input type="number" class="form-control form-control-sm" v-model.number="sub.daysOffset"
                            style="width:100px" title="Days offset from due date (negative = before)">
                        <small class="text-muted text-nowrap">days offset</small>
                        <button class="btn btn-sm btn-outline-danger" @click="removeTemplateSubtask(idx)">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div class="mt-4 d-flex gap-2">
                    <button class="btn btn-primary" @click="saveTemplate()" :disabled="templateSaving">
                        <span v-if="templateSaving" class="spinner-border spinner-border-sm me-1"></span>
                        {{ templateEditor.mode === 'create' ? 'Create Template' : 'Save Changes' }}
                    </button>
                    <button class="btn btn-outline-secondary" @click="cancelTemplateEdit()">Cancel</button>
                </div>
            </div>
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
            <div v-if="filteredTemplates.length === 0" class="text-center py-5 text-muted">
                <i class="fas fa-book fa-3x mb-3"></i>
                <p>No templates found.</p>
            </div>

            <!-- Template cards -->
            <div class="row g-3">
                <div v-for="tmpl in filteredTemplates" :key="tmpl.templateId"
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
                            <button class="btn btn-outline-secondary btn-sm"
                                @click="openEditTemplate(tmpl)" title="Edit template">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm"
                                @click="deleteTemplate(tmpl)" title="Delete template">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Super Admin: add template -->
            <div class="mt-4">
                <button class="btn btn-outline-primary" @click="openCreateTemplate()">
                    <i class="fas fa-plus me-1"></i>Add Template
                </button>
            </div>

        </div>
    </div>

    <!-- ================================================================
         VIEW 3 — My Workflows
    ================================================================ -->
    <div v-if="currentTab === 'workflows'">

        <!-- Loading -->
        <div v-if="workflowsLoading" class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Loading workflows...</p>
        </div>

        <!-- Workflow Detail View -->
        <div v-else-if="selectedWorkflow">
            <div class="d-flex align-items-center mb-3">
                <button class="btn btn-sm btn-outline-secondary me-3" @click="closeWorkflowDetail()">
                    <i class="fas fa-arrow-left me-1"></i>Back
                </button>
                <h5 class="mb-0">{{ selectedWorkflow.name }}</h5>
                <span class="badge ms-2"
                    :class="selectedWorkflow.status === 'active' ? 'bg-success' : 'bg-secondary'">
                    {{ selectedWorkflow.status }}
                </span>
            </div>

            <!-- Detail Sub-tabs -->
            <ul class="nav nav-tabs mb-3">
                <li class="nav-item">
                    <button class="nav-link"
                        :class="{ active: workflowDetailTab === 'tasks' }"
                        @click="workflowDetailTab = 'tasks'">Tasks</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link"
                        :class="{ active: workflowDetailTab === 'history' }"
                        @click="workflowDetailTab = 'history'">History</button>
                </li>
            </ul>

            <!-- Tasks Sub-view -->
            <div v-if="workflowDetailTab === 'tasks'">
                <div v-if="!selectedWorkflowTasks.length" class="text-center py-4 text-muted">
                    No tasks configured.
                </div>
                <ul v-else class="list-group">
                    <li v-for="task in selectedWorkflowTasks" :key="task._taskId"
                        class="list-group-item d-flex justify-content-between align-items-center gap-2">
                        <div class="flex-grow-1">
                            <span :class="task.status === 'completed'
                                ? 'text-decoration-line-through text-muted' : ''">
                                {{ task.title }}
                            </span>
                            <br>
                            <small class="text-muted">Due: {{ formatDate(task.dueDate) }}</small>
                            <small v-if="task.assignedTo" class="text-primary ms-2">
                                <i class="fas fa-user me-1"></i>{{ staffName(task.assignedTo) }}
                            </small>
                        </div>
                        <select class="form-select form-select-sm w-auto"
                            :value="task.assignedTo || ''"
                            @change="assignTask(task, $event.target.value)">
                            <option value="">Unassigned</option>
                            <option v-for="m in staffMembers" :key="m.staffId" :value="m.staffId">
                                {{ m.name }}
                            </option>
                        </select>
                        <button v-if="task.status !== 'completed'"
                            class="btn btn-sm btn-outline-success"
                            @click="markTaskComplete(task)">
                            <i class="fas fa-check me-1"></i>Complete
                        </button>
                        <span v-else class="badge bg-success">
                            <i class="fas fa-check me-1"></i>Done
                        </span>
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
                            <span :class="'badge ' + (record.completionRate === 100
                                ? 'bg-success' : 'bg-warning text-dark')">
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
                    v-model="workflowFilter.category">
                    <option value="all">All Categories</option>
                    <option v-for="(label, key) in CATEGORY_LABELS" :key="key" :value="key">
                        {{ label }}
                    </option>
                </select>
                <select class="form-select form-select-sm" style="width:auto"
                    v-model="workflowFilter.status">
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                </select>
            </div>

            <div v-if="!filteredWorkflows.length" class="text-center py-5 text-muted">
                <i class="fas fa-tasks fa-3x mb-3"></i>
                <p>No workflows found.</p>
            </div>

            <div class="row g-3">
                <div v-for="wf in filteredWorkflows" :key="wf.workflowId" class="col-md-6">
                    <div class="card border-0 shadow-sm h-100">
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
                                <i :class="['fas', getCategoryIcon(wf.category), 'me-1']"></i>
                                {{ getCategoryLabel(wf.category) }}
                                &bull; {{ getRecurrenceLabel(wf.recurrence) }}
                                &bull; {{ formatDate(wf.nextDueDate) }}
                            </div>
                            <div class="progress mb-1" style="height:6px">
                                <div class="progress-bar"
                                    :style="'width:' + calcProgress(wf.tasks) + '%'"
                                    :class="calcProgress(wf.tasks) === 100 ? 'bg-success' : 'bg-primary'">
                                </div>
                            </div>
                            <small class="text-muted">{{ calcProgress(wf.tasks) }}% complete</small>
                        </div>
                        <div class="card-footer bg-white border-0 d-flex gap-1">
                            <button class="btn btn-primary btn-sm flex-grow-1"
                                @click="openWorkflow(wf)">
                                <i class="fas fa-eye me-1"></i>View
                            </button>
                            <button class="btn btn-outline-secondary btn-sm"
                                @click="pauseResumeWorkflow(wf)"
                                :title="wf.status === 'active' ? 'Pause' : 'Resume'">
                                <i :class="'fas ' + (wf.status === 'active' ? 'fa-pause' : 'fa-play')"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm"
                                @click="deleteWorkflow(wf)" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ================================================================
         VIEW 4 — Workflow Builder
    ================================================================ -->
    <div v-if="currentTab === 'builder'">
        <div class="card border-0 shadow-sm" style="max-width:680px">
            <div class="card-header bg-white border-0">
                <div class="d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">
                        <i class="fas fa-tools me-2"></i>Build Custom Workflow
                    </h6>
                    <span class="text-muted small">Step {{ builder.step }} of 4</span>
                </div>
                <div class="progress mt-2" style="height:4px">
                    <div class="progress-bar bg-primary"
                        :style="'width:' + (builder.step / 4 * 100) + '%'"></div>
                </div>
            </div>
            <div class="card-body">

                <!-- Step 1: Name & Category -->
                <div v-if="builder.step === 1">
                    <h6 class="mb-3">Name &amp; Category</h6>
                    <div class="mb-3">
                        <label class="form-label">Workflow Name <span class="text-danger">*</span></label>
                        <input class="form-control" v-model="builder.name"
                            placeholder="e.g. Monthly Supplier Payment Run">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Category</label>
                        <select class="form-select" v-model="builder.category">
                            <option v-for="(label, key) in CATEGORY_LABELS" :key="key" :value="key">
                                {{ label }}
                            </option>
                        </select>
                    </div>
                </div>

                <!-- Step 2: Recurrence & Due Date -->
                <div v-if="builder.step === 2">
                    <h6 class="mb-3">Recurrence &amp; Due Date</h6>
                    <div class="mb-3">
                        <label class="form-label">Recurrence</label>
                        <select class="form-select" v-model="builder.recurrence">
                            <option value="once">Once</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="annually">Annual</option>
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
                            <span>
                                <span class="badge bg-secondary me-2">{{ i + 1 }}</span>
                                {{ st.title }}
                            </span>
                            <button class="btn btn-sm btn-outline-danger"
                                @click="builderRemoveSubtask(i)">
                                <i class="fas fa-times"></i>
                            </button>
                        </li>
                    </ul>
                    <p v-if="!builder.subtasks.length" class="text-muted small mt-2">
                        No subtasks yet — add at least one.
                    </p>
                </div>

                <!-- Step 4: Notifications & Confirm -->
                <div v-if="builder.step === 4">
                    <h6 class="mb-3">Notification Settings</h6>
                    <div class="mb-3">
                        <label class="form-label">Alert days before due date</label>
                        <div v-for="days in [90, 60, 30, 14, 7, 3, 1]" :key="days" class="form-check">
                            <input class="form-check-input" type="checkbox" :value="days"
                                v-model="builder.daysBeforeAlert" :id="'alert-day-' + days">
                            <label class="form-check-label" :for="'alert-day-' + days">
                                {{ days }} day{{ days !== 1 ? 's' : '' }} before
                            </label>
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
                <button v-if="builder.step > 1" class="btn btn-outline-secondary"
                    @click="builderPrevStep()">
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

    <!-- ================================================================
         VIEW 5 — Reports
    ================================================================ -->
    <div v-if="currentTab === 'reports'">

        <!-- Loading -->
        <div v-if="reportsLoading" class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Loading reports...</p>
        </div>

        <!-- Content -->
        <div v-else>
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
                                    <span class="badge bg-secondary">
                                        {{ getCategoryLabel(row.category) }}
                                    </span>
                                </td>
                                <td>{{ getRecurrenceLabel(row.recurrence) }}</td>
                                <td>{{ row.tasksCompleted }} / {{ row.tasksTotal }}</td>
                                <td>
                                    <div class="d-flex align-items-center gap-2">
                                        <div class="progress flex-grow-1"
                                            style="height:8px;min-width:80px">
                                            <div class="progress-bar"
                                                :class="row.completionRate === 100
                                                    ? 'bg-success' : 'bg-primary'"
                                                :style="'width:' + row.completionRate + '%'">
                                            </div>
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
    </div>

    <!-- ================================================================
         VIEW 6 — Staff Management
    ================================================================ -->
    <div v-if="currentTab === 'staff'">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h5 class="mb-0">
                <i class="fas fa-users me-2 text-primary"></i>Staff Management
            </h5>
            <button class="btn btn-primary btn-sm" @click="showAddStaffModal()">
                <i class="fas fa-plus me-1"></i>Add Staff Member
            </button>
        </div>

        <!-- Location selector (auto-populated from current session location) -->
        <div v-if="!staffLocationId" class="alert alert-warning">
            No location detected. Please ensure you are logged in with a location assigned.
        </div>

        <!-- Staff list -->
        <div v-if="staffLoading" class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
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
                <div class="card h-100 border-0 shadow-sm">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <h6 class="card-title mb-1">{{ member.name }}</h6>
                                <span class="badge bg-secondary">{{ member.role || 'No role' }}</span>
                            </div>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary"
                                    @click="editStaff(member)" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-outline-danger"
                                    @click="deleteStaff(member)" title="Delete">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div class="mt-2 small text-muted">
                            <div v-if="member.phone">
                                <i class="fas fa-phone me-1"></i>{{ member.phone }}
                            </div>
                            <div v-if="member.email">
                                <i class="fas fa-envelope me-1"></i>{{ member.email }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

</div>
        `,

        data() {
            return {
                // Module state
                locationId: rossState.locationId,

                // Navigation
                currentTab: 'overview',
                tabVersion: 0,
                workflowsLoading: false,
                templatesLoading: false,
                reportsLoading: false,
                staffLoading: false,

                // Location picker (for admins without a locationId claim)
                availableLocations: [],
                locationsLoading: false,
                pickedLocationId: '',

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
                CATEGORY_LABELS,
                RECURRENCE_LABELS,
                templateEditor: null, // null = closed | { mode, templateId?, form }
                templateSaving: false,

                // View 3 — My Workflows
                workflowFilter: { category: 'all', status: 'all' },
                selectedWorkflow: null,
                workflowDetailTab: 'tasks',

                // View 4 — Workflow Builder
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
                builderSubtaskInput: '',

                // View 5 — Reports
                reportData: [],

                // View 6 — Staff Management
                staffLocationId: '',
                staffMembers: [],
                staffLoading: false
            };
        },

        computed: {
            showLocationPicker() {
                return !this.locationId;
            },
            visibleAlerts() {
                return this.overdueAlerts
                    .filter(a => !this.dismissedAlerts.includes(a.taskId))
                    .slice(0, 5);
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
            },
            filteredTemplates() {
                if (this.templateFilter === 'all') return this.templates;
                return this.templates.filter(t => t.category === this.templateFilter);
            },
            filteredWorkflows() {
                return this.workflows.filter(w => {
                    const catOk = this.workflowFilter.category === 'all'
                        || w.category === this.workflowFilter.category;
                    const statusOk = this.workflowFilter.status === 'all'
                        || w.status === this.workflowFilter.status;
                    return catOk && statusOk;
                });
            }
        },

        methods: {
            // ------------------------------------------------------------------
            // Navigation
            // ------------------------------------------------------------------
            switchTab(tab) {
                this.currentTab = tab;
                const version = ++this.tabVersion;
                if (tab === 'overview') {
                    this.loadOverview().then(() => {
                        if (version !== this.tabVersion) return;
                    });
                } else if (tab === 'templates') {
                    this.loadTemplates().then(() => {
                        if (version !== this.tabVersion) return;
                    });
                } else if (tab === 'workflows') {
                    this.selectedWorkflow = null;
                    this.loadWorkflows().then(() => {
                        if (version !== this.tabVersion) return;
                    });
                } else if (tab === 'reports') {
                    this.loadReports().then(() => {
                        if (version !== this.tabVersion) return;
                    });
                } else if (tab === 'staff') {
                    this.loadStaff().then(() => {
                        if (version !== this.tabVersion) return;
                    });
                }
            },

            // ------------------------------------------------------------------
            // View 1 — Overview
            // ------------------------------------------------------------------
            async loadOverview() {
                if (!this.locationId) {
                    this.overviewError = 'No location selected. Please select a location first.';
                    return;
                }

                this.overviewLoading = true;
                this.overviewError = null;

                try {
                    const raw = await rossService.getWorkflows(this.locationId);
                    const rawList = Array.isArray(raw) ? raw
                        : Array.isArray(raw?.workflows) ? raw.workflows
                        : Object.values(raw || {});
                    const workflowList = rawList.map(w => ({
                        ...w,
                        nextDueDate: w.locationNextDueDate ?? w.nextDueDate,
                        status: w.locationStatus ?? w.status
                    }));
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

                const alerts = workflowList.flatMap(wf =>
                    Object.entries(wf.tasks || {}).flatMap(([taskId, task]) => {
                        if (!task.dueDate || task.status === 'completed') return [];
                        const base = {
                            taskId,
                            taskName: task.title || task.name || 'Unnamed task',
                            workflowName: wf.name || 'Unnamed workflow',
                            dueDate: task.dueDate
                        };
                        if (task.dueDate < now) return [{ ...base, type: 'overdue' }];
                        if (task.dueDate <= soon) return [{ ...base, type: 'soon' }];
                        return [];
                    })
                );

                // Overdue first, then soon; ascending by dueDate within each group
                return [...alerts].sort((a, b) => {
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

                const tasks = workflowList.flatMap(wf =>
                    Object.entries(wf.tasks || {}).flatMap(([taskId, task]) => {
                        if (!task.dueDate || task.dueDate < ts || task.dueDate > te) return [];
                        return [{
                            taskId,
                            workflowId: wf.workflowId || wf.id,
                            workflowName: wf.name || 'Unnamed workflow',
                            title: task.title || task.name || 'Unnamed task',
                            status: task.status || 'pending',
                            dueDate: task.dueDate,
                            completing: false
                        }];
                    })
                );
                return [...tasks].sort((a, b) => a.dueDate - b.dueDate);
            },

            async completeTask(task) {
                if (!this.locationId) return;

                // Immutable flag update
                this.todayTasks = this.todayTasks.map(t =>
                    t.taskId === task.taskId ? { ...t, completing: true } : t
                );

                try {
                    await rossService.completeTask(
                        this.locationId,
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
                this.templatesLoading = true;
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
                    this.templatesLoading = false;
                }
            },

            async loadAvailableLocations() {
                this.locationsLoading = true;
                try {
                    const user = auth.currentUser;
                    if (!user) {
                        this.availableLocations = [];
                        return;
                    }
                    const userLocSnap = await get(ref(rtdb, `userLocations/${user.uid}`));
                    const locationIds = userLocSnap.exists()
                        ? Object.keys(userLocSnap.val())
                        : [];
                    const locationEntries = await Promise.all(
                        locationIds.map(async (id) => {
                            const locSnap = await get(ref(rtdb, `locations/${id}`));
                            const loc = locSnap.val() || {};
                            return { id, name: loc.name || id };
                        })
                    );
                    this.availableLocations = locationEntries
                        .sort((a, b) => a.name.localeCompare(b.name));
                } catch (err) {
                    console.error('[ROSS] loadAvailableLocations error:', err);
                } finally {
                    this.locationsLoading = false;
                }
            },

            applyPickedLocation() {
                if (!this.pickedLocationId) return;
                this.locationId = this.pickedLocationId;
                rossState.locationId = this.pickedLocationId;
                this.staffLocationId = this.pickedLocationId;
                this.builder = {
                    step: 1, name: '', category: 'operations', recurrence: 'monthly',
                    nextDueDate: '', subtasks: [], daysBeforeAlert: [30, 7],
                    notifyPhone: '', notifyEmail: ''
                };
                this.loadOverview();
            },

            async activateTemplate(template) {
                if (!this.locationId) {
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
                        locationIds: [this.locationId],
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

            openEditTemplate(tmpl) {
                this.templateEditor = {
                    mode: 'edit',
                    templateId: tmpl.templateId,
                    form: {
                        name: tmpl.name || '',
                        category: tmpl.category || 'operations',
                        description: tmpl.description || '',
                        recurrence: tmpl.recurrence || 'monthly',
                        daysBeforeAlertRaw: (tmpl.daysBeforeAlert || [30, 7]).join(', '),
                        subtasks: (tmpl.subtasks || []).map(s => ({ ...s }))
                    }
                };
            },

            openCreateTemplate() {
                this.templateEditor = {
                    mode: 'create',
                    form: {
                        name: '',
                        category: 'operations',
                        description: '',
                        recurrence: 'monthly',
                        daysBeforeAlertRaw: '30, 7',
                        subtasks: []
                    }
                };
            },

            cancelTemplateEdit() {
                this.templateEditor = null;
            },

            addTemplateSubtask() {
                const nextOrder = this.templateEditor.form.subtasks.length + 1;
                this.templateEditor.form.subtasks = [
                    ...this.templateEditor.form.subtasks,
                    { title: '', daysOffset: 0, order: nextOrder }
                ];
            },

            removeTemplateSubtask(idx) {
                this.templateEditor.form.subtasks = this.templateEditor.form.subtasks
                    .filter((_, i) => i !== idx)
                    .map((s, i) => ({ ...s, order: i + 1 }));
            },

            async saveTemplate() {
                const { form, mode, templateId } = this.templateEditor;
                if (!form.name.trim()) {
                    await Swal.fire('Required', 'Template name is required.', 'warning');
                    return;
                }
                if (form.subtasks.length === 0) {
                    await Swal.fire('Required', 'Add at least one subtask.', 'warning');
                    return;
                }
                const daysBeforeAlert = form.daysBeforeAlertRaw
                    .split(',')
                    .map(s => parseInt(s.trim(), 10))
                    .filter(n => !isNaN(n));
                const payload = {
                    name: form.name.trim(),
                    category: form.category,
                    description: form.description.trim(),
                    recurrence: form.recurrence,
                    daysBeforeAlert,
                    subtasks: form.subtasks.map((s, i) => ({
                        title: s.title.trim() || 'Untitled',
                        daysOffset: s.daysOffset || 0,
                        order: i + 1
                    }))
                };
                this.templateSaving = true;
                try {
                    if (mode === 'create') {
                        await rossService.createTemplate(payload);
                    } else {
                        await rossService.updateTemplate(templateId, payload);
                    }
                    this.templateEditor = null;
                    await this.loadTemplates();
                    await Swal.fire('Saved!', `Template "${payload.name}" saved.`, 'success');
                } catch (err) {
                    console.error('[ROSS] saveTemplate error:', err);
                    await Swal.fire('Error', 'Failed to save template: ' + err.message, 'error');
                } finally {
                    this.templateSaving = false;
                }
            },

            // ------------------------------------------------------------------
            // View 3 — My Workflows
            // ------------------------------------------------------------------
            async loadWorkflows() {
                if (!this.locationId) return;
                this.workflowsLoading = true;
                try {
                    const raw = await rossService.getWorkflows(this.locationId);
                    const rawList = Array.isArray(raw) ? raw
                        : Array.isArray(raw?.workflows) ? raw.workflows
                        : Object.values(raw || {});
                    this.workflows = rawList.map(w => ({
                        ...w,
                        nextDueDate: w.locationNextDueDate ?? w.nextDueDate,
                        status: w.locationStatus ?? w.status
                    }));
                } catch (err) {
                    console.error('[ROSS] loadWorkflows error:', err);
                    await Swal.fire('Error', 'Failed to load workflows: ' + err.message, 'error');
                } finally {
                    this.workflowsLoading = false;
                }
            },

            openWorkflow(workflow) {
                this.selectedWorkflow = { ...workflow };
                this.workflowDetailTab = 'tasks';
                if (this.staffMembers.length === 0) this.loadStaff();
            },

            closeWorkflowDetail() {
                this.selectedWorkflow = null;
                this.loadWorkflows();
            },

            staffName(staffId) {
                const m = this.staffMembers.find(s => s.staffId === staffId);
                return m ? m.name : staffId;
            },

            async assignTask(task, staffId) {
                const wf = this.selectedWorkflow;
                try {
                    await rossService.manageTask(
                        this.locationId, wf.workflowId, 'update',
                        task._taskId, { assignedTo: staffId || null }
                    );
                    this.selectedWorkflow = {
                        ...this.selectedWorkflow,
                        tasks: {
                            ...this.selectedWorkflow.tasks,
                            [task._taskId]: {
                                ...this.selectedWorkflow.tasks[task._taskId],
                                assignedTo: staffId || null
                            }
                        }
                    };
                } catch (err) {
                    console.error('[ROSS] assignTask error:', err);
                    await Swal.fire('Error', 'Failed to assign task.', 'error');
                }
            },

            async markTaskComplete(task) {
                const wf = this.selectedWorkflow;
                const result = await Swal.fire({
                    title: 'Mark Task Complete?',
                    text: task.title,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Complete'
                });
                if (!result.isConfirmed) return;
                try {
                    await rossService.completeTask(this.locationId, wf.workflowId, task._taskId);
                    const updatedTasks = { ...wf.tasks };
                    updatedTasks[task._taskId] = {
                        ...updatedTasks[task._taskId],
                        status: 'completed',
                        completedAt: Date.now()
                    };
                    this.selectedWorkflow = { ...wf, tasks: updatedTasks };
                } catch (err) {
                    console.error('[ROSS] markTaskComplete error:', err);
                    await Swal.fire('Error', 'Could not complete task. Please try again.', 'error');
                }
            },

            async deleteWorkflow(workflow) {
                const result = await Swal.fire({
                    title: 'Delete Workflow?',
                    text: `"${workflow.name}" and all its task history will be permanently deleted.`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Delete',
                    confirmButtonColor: '#dc3545'
                });
                if (!result.isConfirmed) return;
                try {
                    await rossService.deleteWorkflow(workflow.workflowId);
                    this.workflows = this.workflows.filter(w => w.workflowId !== workflow.workflowId);
                    await Swal.fire('Deleted', 'Workflow removed.', 'success');
                } catch (err) {
                    console.error('[ROSS] deleteWorkflow error:', err);
                    await Swal.fire('Error', 'Failed to delete workflow.', 'error');
                }
            },

            async pauseResumeWorkflow(workflow) {
                const newStatus = workflow.status === 'active' ? 'paused' : 'active';
                try {
                    await rossService.updateWorkflow(
                        workflow.workflowId, { status: newStatus }
                    );
                    this.workflows = this.workflows.map(w =>
                        w.workflowId === workflow.workflowId ? { ...w, status: newStatus } : w
                    );
                    if (this.selectedWorkflow?.workflowId === workflow.workflowId) {
                        this.selectedWorkflow = { ...this.selectedWorkflow, status: newStatus };
                    }
                } catch (err) {
                    console.error('[ROSS] pauseResumeWorkflow error:', err);
                    await Swal.fire('Error', 'Could not update workflow status.', 'error');
                }
            },

            // ------------------------------------------------------------------
            // View 4 — Workflow Builder
            // ------------------------------------------------------------------
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

            async builderSave() {
                if (!this.locationId) {
                    await Swal.fire('No Location', 'Please select a location first.', 'warning');
                    return;
                }
                if (!this.builder.name.trim() || !this.builder.nextDueDate) {
                    await Swal.fire('Incomplete', 'Please complete all required fields.', 'warning');
                    return;
                }
                if (this.builder.subtasks.length === 0) {
                    await Swal.fire('Required', 'Please add at least one subtask.', 'warning');
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
                        locationIds: [this.locationId],
                        nextDueDate,
                        subtasks,
                        daysBeforeAlert: this.builder.daysBeforeAlert,
                        notifyPhone: this.builder.notifyPhone || null,
                        notifyEmail: this.builder.notifyEmail || null
                    });
                    await Swal.fire('Created!', 'Your workflow is now active.', 'success');
                    this.builder = {
                        step: 1, name: '', category: 'operations', recurrence: 'monthly',
                        nextDueDate: '', subtasks: [], daysBeforeAlert: [30, 7],
                        notifyPhone: '', notifyEmail: ''
                    };
                    this.switchTab('workflows');
                } catch (err) {
                    console.error('[ROSS] builderSave error:', err);
                    await Swal.fire('Error', 'Failed to create workflow. Please try again.', 'error');
                }
            },

            // ------------------------------------------------------------------
            // View 5 — Reports
            // ------------------------------------------------------------------
            async loadReports() {
                if (!this.locationId) return;
                this.reportsLoading = true;
                try {
                    const raw = await rossService.getReports(this.locationId);
                    this.reportData = Array.isArray(raw)
                        ? raw
                        : Array.isArray(raw?.report)
                            ? raw.report
                            : Object.values(raw || {});
                } catch (err) {
                    console.error('[ROSS] loadReports error:', err);
                    await Swal.fire('Error', 'Failed to load reports: ' + err.message, 'error');
                } finally {
                    this.reportsLoading = false;
                }
            },

            // ------------------------------------------------------------------
            // View 6 — Staff Management
            // ------------------------------------------------------------------
            async loadStaff() {
                if (!this.staffLocationId) { this.staffMembers = []; return; }
                this.staffLoading = true;
                try {
                    const raw = await rossService.getStaff(this.staffLocationId);
                    this.staffMembers = Array.isArray(raw)
                        ? raw
                        : Array.isArray(raw?.staff)
                            ? raw.staff
                            : Object.values(raw || {});
                } catch (err) {
                    console.error('[ROSS] loadStaff error:', err);
                    await Swal.fire({ icon: 'error', title: 'Error', text: escapeHtml(err.message) });
                } finally {
                    this.staffLoading = false;
                }
            },

            async showAddStaffModal() {
                if (!this.staffLocationId) {
                    await Swal.fire({ icon: 'warning', title: 'Select a location first' });
                    return;
                }
                const { value } = await Swal.fire({
                    title: 'Add Staff Member',
                    html: `
                        <div class="text-start">
                            <div class="mb-2">
                                <label class="form-label">Name <span class="text-danger">*</span></label>
                                <input id="swal-name" class="form-control" placeholder="e.g. Sipho Dlamini">
                            </div>
                            <div class="mb-2">
                                <label class="form-label">Role</label>
                                <input id="swal-role" class="form-control" placeholder="e.g. Floor Manager">
                            </div>
                            <div class="mb-2">
                                <label class="form-label">Phone</label>
                                <input id="swal-phone" class="form-control" placeholder="+27821234567">
                            </div>
                            <div class="mb-2">
                                <label class="form-label">Email</label>
                                <input id="swal-email" class="form-control" placeholder="staff@restaurant.co.za">
                            </div>
                        </div>`,
                    showCancelButton: true,
                    confirmButtonText: 'Add',
                    preConfirm: () => {
                        const name = document.getElementById('swal-name').value.trim();
                        if (!name) {
                            Swal.showValidationMessage('Name is required');
                            return false;
                        }
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
                    await rossService.manageStaff({
                        locationId: this.staffLocationId, action: 'create', staffData: value
                    });
                    await this.loadStaff();
                    await Swal.fire({
                        icon: 'success', title: 'Staff member added',
                        timer: 1500, showConfirmButton: false
                    });
                } catch (err) {
                    console.error('[ROSS] showAddStaffModal error:', err);
                    await Swal.fire({ icon: 'error', title: 'Error', text: escapeHtml(err.message) });
                }
            },

            async editStaff(member) {
                const { value } = await Swal.fire({
                    title: 'Edit Staff Member',
                    html: `
                        <div class="text-start">
                            <div class="mb-2">
                                <label class="form-label">Name <span class="text-danger">*</span></label>
                                <input id="swal-name" class="form-control" value="${escapeHtml(member.name)}">
                            </div>
                            <div class="mb-2">
                                <label class="form-label">Role</label>
                                <input id="swal-role" class="form-control" value="${escapeHtml(member.role || '')}">
                            </div>
                            <div class="mb-2">
                                <label class="form-label">Phone</label>
                                <input id="swal-phone" class="form-control" value="${escapeHtml(member.phone || '')}">
                            </div>
                            <div class="mb-2">
                                <label class="form-label">Email</label>
                                <input id="swal-email" class="form-control" value="${escapeHtml(member.email || '')}">
                            </div>
                        </div>`,
                    showCancelButton: true,
                    confirmButtonText: 'Save',
                    preConfirm: () => {
                        const name = document.getElementById('swal-name').value.trim();
                        if (!name) {
                            Swal.showValidationMessage('Name is required');
                            return false;
                        }
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
                    await rossService.manageStaff({
                        locationId: this.staffLocationId,
                        action: 'update',
                        staffId: member.staffId,
                        staffData: value
                    });
                    await this.loadStaff();
                    await Swal.fire({
                        icon: 'success', title: 'Updated',
                        timer: 1500, showConfirmButton: false
                    });
                } catch (err) {
                    console.error('[ROSS] editStaff error:', err);
                    await Swal.fire({ icon: 'error', title: 'Error', text: escapeHtml(err.message) });
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
                    await rossService.manageStaff({
                        locationId: this.staffLocationId,
                        action: 'delete',
                        staffId: member.staffId
                    });
                    await this.loadStaff();
                    await Swal.fire({
                        icon: 'success', title: 'Deleted',
                        timer: 1500, showConfirmButton: false
                    });
                } catch (err) {
                    console.error('[ROSS] deleteStaff error:', err);
                    await Swal.fire({ icon: 'error', title: 'Error', text: escapeHtml(err.message) });
                }
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
            daysUntil,
            getDueSeverity,
            calcProgress,
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
            if (this.locationId) {
                this.staffLocationId = this.locationId;
                this.loadOverview();
            } else {
                this.loadAvailableLocations();
            }
        }
    });

    rossState.app.mount(container);

    rossState.authUnsubscribe = auth.onAuthStateChanged((user) => {
        if (!user && rossState.app) {
            cleanupRoss();
        }
    });

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

    if (rossState.authUnsubscribe) {
        rossState.authUnsubscribe();
        rossState.authUnsubscribe = null;
    }

    rossState.locationId = null;
}
