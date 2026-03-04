/**
 * Project Management Module - Enhanced with Detail View, Kanban & Timeline
 * Initializes and manages the project management interface
 */

import { projectService } from './services/project-service.js';
import { auth } from '../../config/firebase-config.js';

// Module state
const projectManagementState = {
    app: null,
    projects: [],
    currentFilter: 'all',
    unsubscribe: null
};

/**
 * Get status badge class based on project status
 */
function getStatusBadgeClass(status) {
    const classes = {
        'planning': 'bg-info',
        'in_progress': 'bg-primary',
        'completed': 'bg-success',
        'on_hold': 'bg-warning'
    };
    return classes[status] || 'bg-secondary';
}

/**
 * Get priority badge class
 */
function getPriorityBadgeClass(priority) {
    const classes = {
        'low': 'bg-secondary',
        'medium': 'bg-info',
        'high': 'bg-warning',
        'critical': 'bg-danger'
    };
    return classes[priority] || 'bg-secondary';
}

/**
 * Format date for display
 */
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Calculate project progress based on completed tasks
 */
function calculateProgress(project) {
    const tasks = Object.values(project.tasks || {});
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(t => t.status === 'done').length;
    return Math.round((completed / tasks.length) * 100);
}

/**
 * Initialize the Project Management module
 */
export async function initializeProjectManagement() {
    console.log('[ProjectManagement] Initializing...');

    const container = document.getElementById('project-management-app');
    if (!container) {
        console.error('[ProjectManagement] Container not found');
        return null;
    }

    // Clear any existing content
    container.innerHTML = '';

    // Verify Vue.js is available
    if (typeof Vue === 'undefined') {
        container.innerHTML = `
            <div class="alert alert-danger m-4">
                <h4><i class="fas fa-exclamation-triangle me-2"></i>Error</h4>
                <p>Vue.js is required for Project Management. Please refresh the page.</p>
            </div>
        `;
        return null;
    }

    // Create Vue app
    projectManagementState.app = Vue.createApp({
        template: `
            <div class="project-management">
                <!-- Header -->
                <div class="section-header mb-4">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h2><i class="fas fa-tasks me-2"></i>Project Management</h2>
                            <p class="text-muted mb-0">Track development tasks and onboarding milestones</p>
                        </div>
                        <button class="btn btn-primary" @click="showCreateProjectModal">
                            <i class="fas fa-plus me-2"></i>New Project
                        </button>
                    </div>
                </div>

                <!-- Loading State -->
                <div v-if="loading" class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-2 text-muted">Loading projects...</p>
                </div>

                <!-- Error State -->
                <div v-else-if="error" class="alert alert-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>{{ error }}
                </div>

                <!-- Projects Grid -->
                <div v-else>
                    <!-- Filters -->
                    <div class="card mb-4">
                        <div class="card-body">
                            <div class="row g-3 align-items-center">
                                <div class="col-md-4">
                                    <label class="form-label">Filter by Status</label>
                                    <select v-model="filter" class="form-select">
                                        <option value="all">All Projects</option>
                                        <option value="planning">Planning</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
                                        <option value="on_hold">On Hold</option>
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Search</label>
                                    <input type="text" v-model="searchQuery" class="form-control" placeholder="Search projects...">
                                </div>
                                <div class="col-md-4 text-end">
                                    <p class="mb-0 text-muted">{{ filteredProjects.length }} project(s)</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Empty State -->
                    <div v-if="filteredProjects.length === 0" class="text-center py-5">
                        <i class="fas fa-folder-open fa-3x text-muted mb-3"></i>
                        <h5>No Projects Found</h5>
                        <p class="text-muted">Create your first project to get started.</p>
                    </div>

                    <!-- Projects Grid -->
                    <div v-else class="row g-4">
                        <div v-for="project in filteredProjects" :key="project.projectId" class="col-md-6 col-lg-4">
                            <div class="card h-100 project-card" @click="selectProject(project)">
                                <div class="card-header d-flex justify-content-between align-items-center">
                                    <span class="badge" :class="getStatusBadgeClass(project.status)">
                                        {{ formatStatus(project.status) }}
                                    </span>
                                    <span class="badge" :class="getPriorityBadgeClass(project.priority)">
                                        {{ project.priority }}
                                    </span>
                                </div>
                                <div class="card-body">
                                    <h5 class="card-title">{{ project.name }}</h5>
                                    <p class="card-text text-muted small">{{ project.description || 'No description' }}</p>

                                    <!-- Progress Bar -->
                                    <div class="progress mb-3" style="height: 8px;">
                                        <div class="progress-bar" :style="{ width: getProgress(project) + '%' }"></div>
                                    </div>

                                    <!-- Stats -->
                                    <div class="d-flex justify-content-between small text-muted">
                                        <span><i class="fas fa-tasks me-1"></i>{{ getTaskCount(project) }} tasks</span>
                                        <span><i class="fas fa-flag me-1"></i>{{ getMilestoneCount(project) }} milestones</span>
                                    </div>
                                </div>
                                <div class="card-footer text-muted small">
                                    <i class="fas fa-calendar me-1"></i>Due: {{ formatDate(project.dueDate) }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Create Project Modal -->
                <div v-if="showCreateModal" class="modal fade show d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">
                                    <i class="fas fa-plus-circle me-2"></i>Create New Project
                                </h5>
                                <button type="button" class="btn-close" @click="showCreateModal = false"></button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="createProject">
                                    <div class="mb-3">
                                        <label class="form-label">Project Name *</label>
                                        <input type="text" v-model="newProject.name" class="form-control" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Description</label>
                                        <textarea v-model="newProject.description" class="form-control" rows="3"></textarea>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-6 mb-3">
                                            <label class="form-label">Priority</label>
                                            <select v-model="newProject.priority" class="form-select">
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                                <option value="critical">Critical</option>
                                            </select>
                                        </div>
                                        <div class="col-md-6 mb-3">
                                            <label class="form-label">Due Date</label>
                                            <input type="date" v-model="newProject.dueDateStr" class="form-control">
                                        </div>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" @click="showCreateModal = false">Cancel</button>
                                <button type="button" class="btn btn-primary" @click="createProject" :disabled="creating">
                                    <span v-if="creating" class="spinner-border spinner-border-sm me-2"></span>
                                    Create Project
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Project Detail Modal -->
                <div v-if="selectedProject" class="modal fade show d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
                    <div class="modal-dialog modal-xl modal-fullscreen-lg-down">
                        <div class="modal-content">
                            <div class="modal-header">
                                <div>
                                    <h5 class="modal-title mb-1">{{ selectedProject.name }}</h5>
                                    <div>
                                        <span class="badge me-2" :class="getStatusBadgeClass(selectedProject.status)">
                                            {{ formatStatus(selectedProject.status) }}
                                        </span>
                                        <span class="badge" :class="getPriorityBadgeClass(selectedProject.priority)">
                                            {{ selectedProject.priority }}
                                        </span>
                                    </div>
                                </div>
                                <button type="button" class="btn-close" @click="closeDetailView"></button>
                            </div>
                            <div class="modal-body">
                                <!-- Project Info -->
                                <div class="card mb-4">
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-8">
                                                <h6 class="text-muted mb-2">Description</h6>
                                                <p>{{ selectedProject.description || 'No description provided' }}</p>
                                            </div>
                                            <div class="col-md-4">
                                                <h6 class="text-muted mb-2">Details</h6>
                                                <p class="mb-1"><strong>Due Date:</strong> {{ formatDate(selectedProject.dueDate) }}</p>
                                                <p class="mb-1"><strong>Progress:</strong> {{ getProgress(selectedProject) }}%</p>
                                                <p class="mb-1"><strong>Created:</strong> {{ formatDate(selectedProject.createdAt) }}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Tabs -->
                                <ul class="nav nav-tabs mb-3" role="tablist">
                                    <li class="nav-item">
                                        <button class="nav-link" :class="{ active: activeTab === 'tasks' }" @click="activeTab = 'tasks'">
                                            <i class="fas fa-tasks me-2"></i>Tasks ({{ getTaskCount(selectedProject) }})
                                        </button>
                                    </li>
                                    <li class="nav-item">
                                        <button class="nav-link" :class="{ active: activeTab === 'milestones' }" @click="activeTab = 'milestones'">
                                            <i class="fas fa-flag me-2"></i>Milestones ({{ getMilestoneCount(selectedProject) }})
                                        </button>
                                    </li>
                                </ul>

                                <!-- Task Kanban Board -->
                                <div v-if="activeTab === 'tasks'" class="kanban-board">
                                    <div class="row g-3">
                                        <div v-for="column in kanbanColumns" :key="column.id" class="col-md-4">
                                            <div class="kanban-column">
                                                <div class="kanban-column-header">
                                                    <h6 class="mb-0">{{ column.title }}</h6>
                                                    <span class="badge bg-secondary">{{ getTasksInColumn(column.id).length }}</span>
                                                </div>
                                                <div class="kanban-column-body">
                                                    <div v-if="getTasksInColumn(column.id).length === 0" class="kanban-empty-state">
                                                        <i class="fas fa-inbox fa-2x text-muted mb-2"></i>
                                                        <p class="text-muted small mb-0">No tasks</p>
                                                    </div>
                                                    <div
                                                        v-for="task in getTasksInColumn(column.id)"
                                                        :key="task.taskId"
                                                        class="kanban-card"
                                                        @click.stop="editTask(task)">
                                                        <div class="d-flex justify-content-between align-items-start mb-2">
                                                            <h6 class="mb-0">{{ task.title }}</h6>
                                                            <span class="badge badge-sm" :class="getPriorityBadgeClass(task.priority)">
                                                                {{ task.priority }}
                                                            </span>
                                                        </div>
                                                        <p class="small text-muted mb-2">{{ task.description }}</p>
                                                        <div class="d-flex justify-content-between align-items-center">
                                                            <small class="text-muted">
                                                                <i class="fas fa-user-circle me-1"></i>
                                                                {{ task.assignedTo || 'Unassigned' }}
                                                            </small>
                                                            <div class="btn-group btn-group-sm">
                                                                <button v-if="column.id !== 'todo'" class="btn btn-sm btn-outline-secondary" @click.stop="moveTask(task, 'todo')" title="Move to To Do">
                                                                    <i class="fas fa-arrow-left"></i>
                                                                </button>
                                                                <button v-if="column.id === 'todo'" class="btn btn-sm btn-outline-primary" @click.stop="moveTask(task, 'in_progress')" title="Start">
                                                                    <i class="fas fa-play"></i>
                                                                </button>
                                                                <button v-if="column.id === 'in_progress'" class="btn btn-sm btn-outline-success" @click.stop="moveTask(task, 'done')" title="Complete">
                                                                    <i class="fas fa-check"></i>
                                                                </button>
                                                                <button class="btn btn-sm btn-outline-danger" @click.stop="deleteTask(task)" title="Delete">
                                                                    <i class="fas fa-trash"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="kanban-column-footer">
                                                    <button class="btn btn-sm btn-outline-primary w-100" @click="addTask(column.id)">
                                                        <i class="fas fa-plus me-1"></i>Add Task
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Milestone Timeline -->
                                <div v-if="activeTab === 'milestones'" class="milestone-timeline">
                                    <div v-if="getMilestones().length === 0" class="text-center py-5">
                                        <i class="fas fa-flag fa-3x text-muted mb-3"></i>
                                        <h5>No Milestones</h5>
                                        <p class="text-muted">Add milestones to track project progress</p>
                                        <button class="btn btn-primary" @click="addMilestone">
                                            <i class="fas fa-plus me-2"></i>Add Milestone
                                        </button>
                                    </div>
                                    <div v-else class="timeline">
                                        <div v-for="(milestone, index) in getMilestones()" :key="milestone.milestoneId" class="timeline-item">
                                            <div class="timeline-marker" :class="{ 'completed': milestone.status === 'completed' }">
                                                <i v-if="milestone.status === 'completed'" class="fas fa-check"></i>
                                                <i v-else class="fas fa-flag"></i>
                                            </div>
                                            <div class="timeline-content">
                                                <div class="card">
                                                    <div class="card-body">
                                                        <div class="d-flex justify-content-between align-items-start">
                                                            <div>
                                                                <h6 class="mb-1">{{ milestone.name }}</h6>
                                                                <p class="small text-muted mb-2">{{ milestone.description }}</p>
                                                                <div class="d-flex gap-2">
                                                                    <span class="badge" :class="milestone.status === 'completed' ? 'bg-success' : 'bg-warning'">
                                                                        {{ milestone.status }}
                                                                    </span>
                                                                    <span class="badge bg-secondary">
                                                                        <i class="fas fa-calendar me-1"></i>{{ formatDate(milestone.dueDate) }}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div class="btn-group btn-group-sm">
                                                                <button v-if="milestone.status !== 'completed'" class="btn btn-sm btn-success" @click="completeMilestone(milestone)" title="Mark Complete">
                                                                    <i class="fas fa-check"></i>
                                                                </button>
                                                                <button class="btn btn-sm btn-outline-primary" @click="editMilestone(milestone)" title="Edit">
                                                                    <i class="fas fa-edit"></i>
                                                                </button>
                                                                <button class="btn btn-sm btn-outline-danger" @click="deleteMilestone(milestone)" title="Delete">
                                                                    <i class="fas fa-trash"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="text-center mt-3">
                                            <button class="btn btn-outline-primary" @click="addMilestone">
                                                <i class="fas fa-plus me-2"></i>Add Milestone
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-danger me-auto" @click="deleteProject">
                                    <i class="fas fa-trash me-2"></i>Delete Project
                                </button>
                                <button type="button" class="btn btn-outline-primary" @click="editProject">
                                    <i class="fas fa-edit me-2"></i>Edit Project
                                </button>
                                <button type="button" class="btn btn-secondary" @click="closeDetailView">Close</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Edit Project Modal -->
                <div v-if="showEditProjectModal" class="modal fade show d-block" tabindex="-1" style="background: rgba(0,0,0,0.7); z-index: 1060;">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">
                                    <i class="fas fa-edit me-2"></i>Edit Project
                                </h5>
                                <button type="button" class="btn-close" @click="showEditProjectModal = false"></button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="updateProject">
                                    <div class="mb-3">
                                        <label class="form-label">Project Name *</label>
                                        <input type="text" v-model="editProjectForm.name" class="form-control" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Description</label>
                                        <textarea v-model="editProjectForm.description" class="form-control" rows="3"></textarea>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-6 mb-3">
                                            <label class="form-label">Status</label>
                                            <select v-model="editProjectForm.status" class="form-select">
                                                <option value="planning">Planning</option>
                                                <option value="in_progress">In Progress</option>
                                                <option value="completed">Completed</option>
                                                <option value="on_hold">On Hold</option>
                                            </select>
                                        </div>
                                        <div class="col-md-6 mb-3">
                                            <label class="form-label">Priority</label>
                                            <select v-model="editProjectForm.priority" class="form-select">
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                                <option value="critical">Critical</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Due Date</label>
                                        <input type="date" v-model="editProjectForm.dueDateStr" class="form-control">
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" @click="showEditProjectModal = false">Cancel</button>
                                <button type="button" class="btn btn-primary" @click="updateProject" :disabled="updating">
                                    <span v-if="updating" class="spinner-border spinner-border-sm me-2"></span>
                                    Update Project
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Task Form Modal -->
                <div v-if="showTaskModal" class="modal fade show d-block" tabindex="-1" style="background: rgba(0,0,0,0.7); z-index: 1060;">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ taskForm.taskId ? 'Edit Task' : 'Add Task' }}</h5>
                                <button type="button" class="btn-close" @click="showTaskModal = false"></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label">Title *</label>
                                    <input type="text" v-model="taskForm.title" class="form-control" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Description</label>
                                    <textarea v-model="taskForm.description" class="form-control" rows="3"></textarea>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Priority</label>
                                    <select v-model="taskForm.priority" class="form-select">
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="critical">Critical</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Assigned To</label>
                                    <input type="text" v-model="taskForm.assignedTo" class="form-control" placeholder="Enter name or email">
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" @click="showTaskModal = false">Cancel</button>
                                <button type="button" class="btn btn-primary" @click="saveTask">
                                    {{ taskForm.taskId ? 'Update' : 'Create' }} Task
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Milestone Form Modal -->
                <div v-if="showMilestoneModal" class="modal fade show d-block" tabindex="-1" style="background: rgba(0,0,0,0.7); z-index: 1060;">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ milestoneForm.milestoneId ? 'Edit Milestone' : 'Add Milestone' }}</h5>
                                <button type="button" class="btn-close" @click="showMilestoneModal = false"></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label">Name *</label>
                                    <input type="text" v-model="milestoneForm.name" class="form-control" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Description</label>
                                    <textarea v-model="milestoneForm.description" class="form-control" rows="3"></textarea>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Due Date</label>
                                    <input type="date" v-model="milestoneForm.dueDateStr" class="form-control">
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" @click="showMilestoneModal = false">Cancel</button>
                                <button type="button" class="btn btn-primary" @click="saveMilestone">
                                    {{ milestoneForm.milestoneId ? 'Update' : 'Create' }} Milestone
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,
        data() {
            return {
                projects: [],
                loading: true,
                error: null,
                filter: 'all',
                searchQuery: '',
                showCreateModal: false,
                creating: false,
                newProject: {
                    name: '',
                    description: '',
                    priority: 'medium',
                    dueDateStr: ''
                },
                selectedProject: null,
                activeTab: 'tasks',
                kanbanColumns: [
                    { id: 'todo', title: 'To Do', status: 'todo' },
                    { id: 'in_progress', title: 'In Progress', status: 'in_progress' },
                    { id: 'done', title: 'Done', status: 'done' }
                ],
                showTaskModal: false,
                taskForm: {
                    taskId: null,
                    title: '',
                    description: '',
                    priority: 'medium',
                    assignedTo: '',
                    status: 'todo'
                },
                showMilestoneModal: false,
                milestoneForm: {
                    milestoneId: null,
                    name: '',
                    description: '',
                    dueDateStr: ''
                },
                showEditProjectModal: false,
                updating: false,
                editProjectForm: {
                    name: '',
                    description: '',
                    status: 'planning',
                    priority: 'medium',
                    dueDateStr: ''
                }
            };
        },
        computed: {
            filteredProjects() {
                let filtered = this.projects;

                // Filter by status
                if (this.filter !== 'all') {
                    filtered = filtered.filter(p => p.status === this.filter);
                }

                // Filter by search query
                if (this.searchQuery) {
                    const query = this.searchQuery.toLowerCase();
                    filtered = filtered.filter(p =>
                        p.name.toLowerCase().includes(query) ||
                        (p.description && p.description.toLowerCase().includes(query))
                    );
                }

                return filtered;
            }
        },
        methods: {
            getStatusBadgeClass,
            getPriorityBadgeClass,
            formatDate,

            formatStatus(status) {
                return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            },

            getProgress(project) {
                return calculateProgress(project);
            },

            getTaskCount(project) {
                return Object.keys(project.tasks || {}).length;
            },

            getMilestoneCount(project) {
                return Object.keys(project.milestones || {}).length;
            },

            showCreateProjectModal() {
                this.newProject = {
                    name: '',
                    description: '',
                    priority: 'medium',
                    dueDateStr: ''
                };
                this.showCreateModal = true;
            },

            async createProject() {
                if (!this.newProject.name.trim()) {
                    return;
                }

                this.creating = true;
                try {
                    const projectData = {
                        name: this.newProject.name.trim(),
                        description: this.newProject.description.trim(),
                        priority: this.newProject.priority,
                        dueDate: this.newProject.dueDateStr ? new Date(this.newProject.dueDateStr).getTime() : null
                    };

                    await projectService.createProject(projectData);
                    this.showCreateModal = false;
                    await this.loadProjects();
                } catch (error) {
                    console.error('Error creating project:', error);
                    this.error = 'Failed to create project: ' + error.message;
                } finally {
                    this.creating = false;
                }
            },

            selectProject(project) {
                console.log('[ProjectManagement] Selected project:', project.projectId);
                this.selectedProject = project;
                this.activeTab = 'tasks';
            },

            closeDetailView() {
                this.selectedProject = null;
            },

            getTasksInColumn(columnId) {
                if (!this.selectedProject || !this.selectedProject.tasks) return [];
                return Object.entries(this.selectedProject.tasks)
                    .filter(([_, task]) => task.status === columnId)
                    .map(([taskId, task]) => ({ ...task, taskId }))
                    .sort((a, b) => (a.order || 0) - (b.order || 0));
            },

            getMilestones() {
                if (!this.selectedProject || !this.selectedProject.milestones) return [];
                return Object.entries(this.selectedProject.milestones)
                    .map(([milestoneId, milestone]) => ({ ...milestone, milestoneId }))
                    .sort((a, b) => (a.order || 0) - (b.order || 0));
            },

            addTask(status) {
                this.taskForm = {
                    taskId: null,
                    title: '',
                    description: '',
                    priority: 'medium',
                    assignedTo: '',
                    status: status
                };
                this.showTaskModal = true;
            },

            editTask(task) {
                this.taskForm = {
                    taskId: task.taskId,
                    title: task.title,
                    description: task.description || '',
                    priority: task.priority || 'medium',
                    assignedTo: task.assignedTo || '',
                    status: task.status
                };
                this.showTaskModal = true;
            },

            async saveTask() {
                if (!this.taskForm.title.trim()) return;

                try {
                    const taskData = {
                        title: this.taskForm.title,
                        description: this.taskForm.description,
                        priority: this.taskForm.priority,
                        assignedTo: this.taskForm.assignedTo,
                        status: this.taskForm.status
                    };

                    if (this.taskForm.taskId) {
                        // Update existing task
                        await projectService.manageProjectTasks({
                            projectId: this.selectedProject.projectId,
                            action: 'update',
                            taskId: this.taskForm.taskId,
                            taskData
                        });
                    } else {
                        // Create new task
                        await projectService.manageProjectTasks({
                            projectId: this.selectedProject.projectId,
                            action: 'create',
                            taskData
                        });
                    }

                    this.showTaskModal = false;
                    await this.reloadCurrentProject();
                } catch (error) {
                    console.error('Error saving task:', error);
                    alert('Failed to save task: ' + error.message);
                }
            },

            async moveTask(task, newStatus) {
                try {
                    await projectService.manageProjectTasks({
                        projectId: this.selectedProject.projectId,
                        action: 'update',
                        taskId: task.taskId,
                        taskData: { status: newStatus }
                    });
                    await this.reloadCurrentProject();
                } catch (error) {
                    console.error('Error moving task:', error);
                    alert('Failed to move task: ' + error.message);
                }
            },

            async deleteTask(task) {
                if (!confirm('Are you sure you want to delete this task?')) return;

                try {
                    await projectService.manageProjectTasks({
                        projectId: this.selectedProject.projectId,
                        action: 'delete',
                        taskId: task.taskId
                    });
                    await this.reloadCurrentProject();
                } catch (error) {
                    console.error('Error deleting task:', error);
                    alert('Failed to delete task: ' + error.message);
                }
            },

            addMilestone() {
                this.milestoneForm = {
                    milestoneId: null,
                    name: '',
                    description: '',
                    dueDateStr: ''
                };
                this.showMilestoneModal = true;
            },

            editMilestone(milestone) {
                this.milestoneForm = {
                    milestoneId: milestone.milestoneId,
                    name: milestone.name,
                    description: milestone.description || '',
                    dueDateStr: milestone.dueDate ? new Date(milestone.dueDate).toISOString().split('T')[0] : ''
                };
                this.showMilestoneModal = true;
            },

            async saveMilestone() {
                if (!this.milestoneForm.name.trim()) return;

                try {
                    const milestoneData = {
                        name: this.milestoneForm.name,
                        description: this.milestoneForm.description,
                        dueDate: this.milestoneForm.dueDateStr ? new Date(this.milestoneForm.dueDateStr).getTime() : null
                    };

                    if (this.milestoneForm.milestoneId) {
                        // Update existing milestone
                        await projectService.manageProjectMilestones({
                            projectId: this.selectedProject.projectId,
                            action: 'update',
                            milestoneId: this.milestoneForm.milestoneId,
                            milestoneData
                        });
                    } else {
                        // Create new milestone
                        await projectService.manageProjectMilestones({
                            projectId: this.selectedProject.projectId,
                            action: 'create',
                            milestoneData
                        });
                    }

                    this.showMilestoneModal = false;
                    await this.reloadCurrentProject();
                } catch (error) {
                    console.error('Error saving milestone:', error);
                    alert('Failed to save milestone: ' + error.message);
                }
            },

            async completeMilestone(milestone) {
                try {
                    await projectService.manageProjectMilestones({
                        projectId: this.selectedProject.projectId,
                        action: 'update',
                        milestoneId: milestone.milestoneId,
                        milestoneData: { status: 'completed' }
                    });
                    await this.reloadCurrentProject();
                } catch (error) {
                    console.error('Error completing milestone:', error);
                    alert('Failed to complete milestone: ' + error.message);
                }
            },

            async deleteMilestone(milestone) {
                if (!confirm('Are you sure you want to delete this milestone?')) return;

                try {
                    await projectService.manageProjectMilestones({
                        projectId: this.selectedProject.projectId,
                        action: 'delete',
                        milestoneId: milestone.milestoneId
                    });
                    await this.reloadCurrentProject();
                } catch (error) {
                    console.error('Error deleting milestone:', error);
                    alert('Failed to delete milestone: ' + error.message);
                }
            },

            editProject() {
                this.editProjectForm = {
                    name: this.selectedProject.name,
                    description: this.selectedProject.description || '',
                    status: this.selectedProject.status,
                    priority: this.selectedProject.priority,
                    dueDateStr: this.selectedProject.dueDate ? new Date(this.selectedProject.dueDate).toISOString().split('T')[0] : ''
                };
                this.showEditProjectModal = true;
            },

            async updateProject() {
                if (!this.editProjectForm.name.trim()) return;

                this.updating = true;
                try {
                    const updates = {
                        name: this.editProjectForm.name.trim(),
                        description: this.editProjectForm.description.trim(),
                        status: this.editProjectForm.status,
                        priority: this.editProjectForm.priority,
                        dueDate: this.editProjectForm.dueDateStr ? new Date(this.editProjectForm.dueDateStr).getTime() : null
                    };

                    await projectService.updateProject(this.selectedProject.projectId, updates);
                    this.showEditProjectModal = false;
                    await this.reloadCurrentProject();
                } catch (error) {
                    console.error('Error updating project:', error);
                    alert('Failed to update project: ' + error.message);
                } finally {
                    this.updating = false;
                }
            },

            async deleteProject() {
                if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;

                try {
                    await projectService.deleteProject(this.selectedProject.projectId);
                    this.closeDetailView();
                    await this.loadProjects();
                } catch (error) {
                    console.error('Error deleting project:', error);
                    alert('Failed to delete project: ' + error.message);
                }
            },

            async reloadCurrentProject() {
                try {
                    const projects = await projectService.getProjects();
                    const updatedProject = projects.find(p => p.projectId === this.selectedProject.projectId);
                    if (updatedProject) {
                        this.selectedProject = updatedProject;
                    }
                    // Update projects list too
                    this.projects = projects;
                } catch (error) {
                    console.error('Error reloading project:', error);
                }
            },

            async loadProjects() {
                this.loading = true;
                this.error = null;
                try {
                    this.projects = await projectService.getProjects();
                } catch (error) {
                    console.error('Error loading projects:', error);
                    this.error = 'Failed to load projects: ' + error.message;
                } finally {
                    this.loading = false;
                }
            }
        },
        mounted() {
            console.log('[ProjectManagement] Vue app mounted');
            this.loadProjects();
        }
    });

    projectManagementState.app.mount(container);
    console.log('[ProjectManagement] Initialized successfully');
    return projectManagementState.app;
}

/**
 * Cleanup the Project Management module
 */
export function cleanupProjectManagement() {
    console.log('[ProjectManagement] Cleaning up...');

    if (projectManagementState.unsubscribe) {
        projectManagementState.unsubscribe();
        projectManagementState.unsubscribe = null;
    }

    if (projectManagementState.app) {
        try {
            projectManagementState.app.unmount();
        } catch (error) {
            console.error('[ProjectManagement] Error unmounting Vue app:', error);
        }
        projectManagementState.app = null;
    }

    projectManagementState.projects = [];
}
