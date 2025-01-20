// Project Management State
const projectManagement = {
    projects: [],
    tasks: [],
    currentFilters: {
        status: '',
        priority: ''
    }
};

// Project Modal Functions
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

// Add these missing functions for project and task creation
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

// Export necessary functions
export {
    initializeProjectManagement,
    createProject,
    createTask
};
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
        showError('Failed to load project tasks');
    }
}
// Main initialization function
function initializeProjectManagement() {
    // Project menu click handler
    const projectManagementMenu = document.getElementById('projectManagementMenu');
    if (projectManagementMenu) {
        projectManagementMenu.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = 'none';
            });
            const projectSection = document.getElementById('projectManagementContent');
            if (projectSection) {
                projectSection.style.display = 'block';
            }
            loadProjects();
        });
    }

    initializeProjectListeners();
}


// Initialize project-related event listeners
function initializeProjectListeners() {
    // Add project button click handler
    const addProjectBtn = document.getElementById('addProjectBtn');
    if (addProjectBtn) {
        addProjectBtn.addEventListener('click', showAddProjectModal);
    }

    // Event delegation for dynamic elements
    document.addEventListener('click', async function(e) {
        const button = e.target.closest('button');
        if (!button) return;

        const projectId = button.getAttribute('data-project-id');
        const taskId = button.getAttribute('data-task-id');

        switch (true) {
            case button.classList.contains('add-task-btn'):
                showAddTaskModal(projectId);
                break;
            case button.classList.contains('edit-project-btn'):
                handleEditProject(projectId);
                break;
            case button.classList.contains('delete-project-btn'):
                handleDeleteProject(projectId);
                break;
            case button.classList.contains('edit-task-btn'):
                handleEditTask(projectId, taskId);
                break;
            case button.classList.contains('delete-task-btn'):
                handleDeleteTask(projectId, taskId);
                break;
            case button.classList.contains('complete-task-btn'):
                handleCompleteTask(projectId, taskId);
                break;
        }
    });
}

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

function renderProjects() {
    const container = document.getElementById('projectsList');
    if (!container) return;

    container.innerHTML = projectManagement.projects.map(project => `
        <div class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0">${project.name}</h5>
                <div class="d-flex align-items-center gap-2">
                    <span class="badge badge-${getStatusBadgeClass(project.status)}">
                        ${project.status}
                    </span>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-info edit-project-btn" data-project-id="${project.id}" title="Edit Project">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger delete-project-btn" data-project-id="${project.id}" title="Delete Project">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="card-body">
                <p class="card-text">${project.description || 'No description'}</p>
                <div class="tasks-list">
                    ${renderProjectTasks(project.id)}
                </div>
                <div class="mt-3">
                    <button class="btn btn-sm btn-primary add-task-btn" data-project-id="${project.id}">
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
                    <div class="d-flex align-items-center">
                        <span class="me-3">${task.description}</span>
                        <span class="badge badge-${getPriorityBadgeClass(task.priority)}">
                            ${task.priority}
                        </span>
                    </div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-info edit-task-btn" 
                            data-project-id="${projectId}" 
                            data-task-id="${task.id}" 
                            title="Edit Task">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-success complete-task-btn" 
                            data-project-id="${projectId}" 
                            data-task-id="${task.id}" 
                            title="Complete Task">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-danger delete-task-btn" 
                            data-project-id="${projectId}" 
                            data-task-id="${task.id}" 
                            title="Delete Task">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Action handlers
async function handleEditProject(projectId) {
    try {
        const snapshot = await firebase.database().ref(`projects/${projectId}`).once('value');
        const project = snapshot.val();
        
        if (!project) throw new Error('Project not found');

        Swal.fire({
            title: 'Edit Project',
            html: `
                <input id="projectName" class="swal2-input" placeholder="Project Name" value="${project.name}">
                <textarea id="projectDescription" class="swal2-textarea" placeholder="Project Description">${project.description || ''}</textarea>
                <select id="projectStatus" class="swal2-select">
                    <option value="planned" ${project.status === 'planned' ? 'selected' : ''}>Planned</option>
                    <option value="in_progress" ${project.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>Completed</option>
                </select>
            `,
            showCancelButton: true,
            confirmButtonText: 'Update'
        }).then(async (result) => {
            if (result.isConfirmed) {
                await firebase.database().ref(`projects/${projectId}`).update({
                    name: document.getElementById('projectName').value,
                    description: document.getElementById('projectDescription').value,
                    status: document.getElementById('projectStatus').value,
                    updatedAt: Date.now()
                });
                loadProjects();
            }
        });
    } catch (error) {
        console.error('Error editing project:', error);
        showError('Failed to edit project');
    }
}

async function handleDeleteProject(projectId) {
    try {
        const result = await Swal.fire({
            title: 'Delete Project?',
            text: 'This will also delete all tasks associated with this project.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            confirmButtonText: 'Yes, delete it!'
        });

        if (result.isConfirmed) {
            await firebase.database().ref(`projects/${projectId}`).remove();
            await firebase.database().ref(`tasks/${projectId}`).remove();
            loadProjects();
        }
    } catch (error) {
        console.error('Error deleting project:', error);
        showError('Failed to delete project');
    }
}

async function handleEditTask(projectId, taskId) {
    try {
        const snapshot = await firebase.database().ref(`tasks/${projectId}/${taskId}`).once('value');
        const task = snapshot.val();
        
        if (!task) throw new Error('Task not found');

        Swal.fire({
            title: 'Edit Task',
            html: `
                <input id="taskDescription" class="swal2-input" placeholder="Task Description" value="${task.description}">
                <select id="taskPriority" class="swal2-select">
                    <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low Priority</option>
                    <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium Priority</option>
                    <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High Priority</option>
                </select>
            `,
            showCancelButton: true,
            confirmButtonText: 'Update'
        }).then(async (result) => {
            if (result.isConfirmed) {
                await firebase.database().ref(`tasks/${projectId}/${taskId}`).update({
                    description: document.getElementById('taskDescription').value,
                    priority: document.getElementById('taskPriority').value,
                    updatedAt: Date.now()
                });
                loadProjects();
            }
        });
    } catch (error) {
        console.error('Error editing task:', error);
        showError('Failed to edit task');
    }
}

async function handleDeleteTask(projectId, taskId) {
    try {
        const result = await Swal.fire({
            title: 'Delete Task?',
            text: 'This action cannot be undone.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            confirmButtonText: 'Yes, delete it!'
        });

        if (result.isConfirmed) {
            await firebase.database().ref(`tasks/${projectId}/${taskId}`).remove();
            loadProjects();
        }
    } catch (error) {
        console.error('Error deleting task:', error);
        showError('Failed to delete task');
    }
}

async function handleCompleteTask(projectId, taskId) {
    try {
        await firebase.database().ref(`tasks/${projectId}/${taskId}`).update({
            status: 'completed',
            completedAt: Date.now()
        });
        loadProjects();
    } catch (error) {
        console.error('Error completing task:', error);
        showError('Failed to complete task');
    }
}

// Helper functions
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

// UI Helper functions
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
    // Loading will be hidden when content is rendered
}