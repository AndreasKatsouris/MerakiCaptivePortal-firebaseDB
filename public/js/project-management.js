// project-management.js

// Helper function to safely add event listeners
function addEventListenerSafely(elementId, event, handler) {
    const element = document.getElementById(elementId);
    if (element) {
        element.addEventListener(event, handler);
    } else {
        console.warn(`Element with id '${elementId}' not found`);
    }
}

function initializeProjectManagement() {
    // Add event listener for the menu item
    addEventListenerSafely('projectManagementMenu', 'click', function(e) {
        e.preventDefault();
        displaySection('projectManagementContent');
        loadProjects();
    });
}

// Project Management State
const projectManagement = {
    projects: [],
    tasks: [],
    currentFilters: {
        status: '',
        priority: ''
    }
};

async function loadProjects() {
    try {
        showLoading();
        const snapshot = await firebase.database().ref('projects').once('value');
        const projects = snapshot.val();
        
        if (projects) {
            projectManagement.projects = Object.entries(projects).map(([id, data]) => ({
                id,
                ...data
            }));
            await loadProjectTasks();
            renderProjects();
        } else {
            showNoProjectsMessage();
        }
    } catch (error) {
        console.error('Error loading projects:', error);
        showError('Failed to load projects');
    } finally {
        hideLoading();
    }
}

async function loadProjectTasks() {
    try {
        const tasksData = [];
        for (const project of projectManagement.projects) {
            const snapshot = await firebase.database().ref(`tasks/${project.id}`).once('value');
            const projectTasks = snapshot.val();
            if (projectTasks) {
                Object.entries(projectTasks).forEach(([taskId, taskData]) => {
                    tasksData.push({
                        id: taskId,
                        projectId: project.id,
                        ...taskData
                    });
                });
            }
        }
        projectManagement.tasks = tasksData;
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

function renderProjects() {
    const container = document.getElementById('projectsList');
    if (!container) return;

    container.innerHTML = projectManagement.projects.map(project => `
        <div class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0">${project.name}</h5>
                <span class="badge badge-${getStatusBadgeClass(project.status)}">
                    ${project.status}
                </span>
            </div>
            <div class="card-body">
                <p class="card-text">${project.description || 'No description'}</p>
                <div class="tasks-list">
                    ${renderProjectTasks(project.id)}
                </div>
                <div class="mt-3">
                    <button class="btn btn-sm btn-primary" onclick="showAddTaskModal('${project.id}')">
                        <i class="fas fa-plus"></i> Add Task
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderProjectTasks(projectId) {
    const projectTasks = projectManagement.tasks.filter(task => task.projectId === projectId);
    
    if (projectTasks.length === 0) {
        return '<p class="text-muted">No tasks yet</p>';
    }

    return `
        <div class="list-group">
            ${projectTasks.map(task => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${task.description}</span>
                    <span class="badge badge-${getPriorityBadgeClass(task.priority)}">
                        ${task.priority}
                    </span>
                </div>
            `).join('')}
        </div>
    `;
}

function getStatusBadgeClass(status) {
    const statusClasses = {
        planned: 'secondary',
        in_progress: 'primary',
        completed: 'success',
        blocked: 'danger'
    };
    return statusClasses[status] || 'secondary';
}

function getPriorityBadgeClass(priority) {
    const priorityClasses = {
        high: 'danger',
        medium: 'warning',
        low: 'info'
    };
    return priorityClasses[priority] || 'secondary';
}

async function createProject(projectData) {
    try {
        const projectRef = firebase.database().ref('projects').push();
        await projectRef.set({
            ...projectData,
            createdAt: Date.now()
        });
        await loadProjects();
        return true;
    } catch (error) {
        console.error('Error creating project:', error);
        return false;
    }
}

async function createTask(taskData) {
    try {
        const taskRef = firebase.database().ref(`tasks/${taskData.projectId}`).push();
        await taskRef.set({
            ...taskData,
            createdAt: Date.now()
        });
        await loadProjectTasks();
        renderProjects();
        return true;
    } catch (error) {
        console.error('Error creating task:', error);
        return false;
    }
}

function showAddProjectModal() {
    Swal.fire({
        title: 'Create New Project',
        html: `
            <input id="projectName" class="swal2-input" placeholder="Project Name">
            <textarea id="projectDescription" class="swal2-textarea" placeholder="Project Description"></textarea>
            <select id="projectStatus" class="swal2-select">
                <option value="planned">Planned</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
            </select>
        `,
        showCancelButton: true,
        confirmButtonText: 'Create',
        preConfirm: () => {
            return {
                name: document.getElementById('projectName').value,
                description: document.getElementById('projectDescription').value,
                status: document.getElementById('projectStatus').value
            };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            createProject(result.value);
        }
    });
}

function showAddTaskModal(projectId) {
    Swal.fire({
        title: 'Add New Task',
        html: `
            <input id="taskDescription" class="swal2-input" placeholder="Task Description">
            <select id="taskPriority" class="swal2-select">
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
            </select>
        `,
        showCancelButton: true,
        confirmButtonText: 'Add Task',
        preConfirm: () => {
            return {
                projectId: projectId,
                description: document.getElementById('taskDescription').value,
                priority: document.getElementById('taskPriority').value,
                status: 'todo'
            };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            createTask(result.value);
        }
    });
}

// Helper functions for UI feedback
function showError(message) {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: message
    });
}

function showNoProjectsMessage() {
    const container = document.getElementById('projectsList');
    if (container) {
        container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                No projects found. Click the "New Project" button to create one.
            </div>
        `;
    }
}

function showLoading() {
    const container = document.getElementById('projectsList');
    if (container) {
        container.innerHTML = `
            <div class="text-center">
                <div class="spinner-border" role="status">
                    <span class="sr-only">Loading...</span>
                </div>
            </div>
        `;
    }
}

function hideLoading() {
    // This function is just a placeholder since the loading
    // will be hidden when content is rendered
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', initializeProjectManagement);