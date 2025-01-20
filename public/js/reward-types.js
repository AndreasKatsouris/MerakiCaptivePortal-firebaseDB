// Reward Types Module

// Rewards Type Management State
const rewardTypesState = {
    types: [],
    currentFilters: {
        status: '',
        category: ''
    }
};

// Main initialization function
function initializeRewardTypes() {
    // Add menu click handler
    const rewardTypesMenu = document.getElementById('rewardTypesMenu');
    if (rewardTypesMenu) {
        rewardTypesMenu.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = 'none';
            });
            const typesSection = document.getElementById('rewardTypesContent');
            if (typesSection) {
                typesSection.style.display = 'block';
            }
            loadRewardTypes();
        });
    }

    initializeRewardTypeListeners();
}

function initializeRewardTypeListeners() {
    // Add new reward type button
    const addRewardTypeBtn = document.getElementById('addRewardTypeBtn');
    if (addRewardTypeBtn) {
        addRewardTypeBtn.addEventListener('click', showAddRewardTypeModal);
    }

    // Event delegation for dynamic elements
    document.addEventListener('click', async function(e) {
        const button = e.target.closest('button');
        if (!button) return;

        const typeId = button.getAttribute('data-type-id');

        switch (true) {
            case button.classList.contains('edit-reward-type-btn'):
                handleEditRewardType(typeId);
                break;
            case button.classList.contains('delete-reward-type-btn'):
                handleDeleteRewardType(typeId);
                break;
        }
    });
}

async function loadRewardTypes() {
    try {
        showLoading();
        const snapshot = await firebase.database().ref('rewardTypes').once('value');
        const types = snapshot.val();
        
        if (types) {
            rewardTypesState.types = Object.entries(types).map(([id, data]) => ({
                id,
                ...data
            }));
            renderRewardTypes();
        } else {
            showNoRewardTypesMessage();
        }
    } catch (error) {
        console.error('Error loading reward types:', error);
        showError('Failed to load reward types');
    } finally {
        hideLoading();
    }
}

function renderRewardTypes() {
    const container = document.getElementById('rewardTypesList');
    if (!container) return;

    container.innerHTML = rewardTypesState.types.map(type => `
        <div class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0">${type.name}</h5>
                <div class="d-flex align-items-center gap-2">
                    <span class="badge badge-${getStatusBadgeClass(type.status)}">
                        ${type.status}
                    </span>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-info edit-reward-type-btn" data-type-id="${type.id}" title="Edit Reward Type">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger delete-reward-type-btn" data-type-id="${type.id}" title="Delete Reward Type">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <p><strong>Category:</strong> ${type.category}</p>
                        <p><strong>Value:</strong> ${formatRewardValue(type)}</p>
                    </div>
                    <div class="col-md-6">
                        <p><strong>Validity:</strong> ${type.validityDays} days</p>
                        <p><strong>Requirements:</strong> ${type.requirements || 'None'}</p>
                    </div>
                </div>
                <p class="mt-3">${type.description || 'No description'}</p>
            </div>
        </div>
    `).join('');
}

function showAddRewardTypeModal() {
    Swal.fire({
        title: 'Create New Reward Type',
        html: `
            <input id="typeName" class="swal2-input" placeholder="Reward Type Name">
            <select id="typeCategory" class="swal2-select">
                <option value="points">Points</option>
                <option value="discount">Discount</option>
                <option value="freeItem">Free Item</option>
                <option value="voucher">Voucher</option>
            </select>
            <input id="typeValue" class="swal2-input" placeholder="Value">
            <input type="number" id="validityDays" class="swal2-input" placeholder="Validity (days)">
            <textarea id="typeDescription" class="swal2-textarea" placeholder="Description"></textarea>
            <textarea id="typeRequirements" class="swal2-textarea" placeholder="Requirements"></textarea>
        `,
        showCancelButton: true,
        confirmButtonText: 'Create',
        preConfirm: () => {
            return {
                name: document.getElementById('typeName').value,
                category: document.getElementById('typeCategory').value,
                value: document.getElementById('typeValue').value,
                validityDays: document.getElementById('validityDays').value,
                description: document.getElementById('typeDescription').value,
                requirements: document.getElementById('typeRequirements').value,
                status: 'active'
            };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            createRewardType(result.value);
        }
    });
}

async function createRewardType(typeData) {
    try {
        const typeRef = firebase.database().ref('rewardTypes').push();
        await typeRef.set({
            ...typeData,
            createdAt: Date.now()
        });
        await loadRewardTypes();
        return true;
    } catch (error) {
        console.error('Error creating reward type:', error);
        showError('Failed to create reward type');
        return false;
    }
}

async function handleEditRewardType(typeId) {
    try {
        const snapshot = await firebase.database().ref(`rewardTypes/${typeId}`).once('value');
        const type = snapshot.val();
        
        if (!type) throw new Error('Reward type not found');

        Swal.fire({
            title: 'Edit Reward Type',
            html: `
                <input id="typeName" class="swal2-input" placeholder="Reward Type Name" value="${type.name}">
                <select id="typeCategory" class="swal2-select">
                    <option value="points" ${type.category === 'points' ? 'selected' : ''}>Points</option>
                    <option value="discount" ${type.category === 'discount' ? 'selected' : ''}>Discount</option>
                    <option value="freeItem" ${type.category === 'freeItem' ? 'selected' : ''}>Free Item</option>
                    <option value="voucher" ${type.category === 'voucher' ? 'selected' : ''}>Voucher</option>
                </select>
                <input id="typeValue" class="swal2-input" placeholder="Value" value="${type.value}">
                <input type="number" id="validityDays" class="swal2-input" placeholder="Validity (days)" value="${type.validityDays}">
                <textarea id="typeDescription" class="swal2-textarea" placeholder="Description">${type.description || ''}</textarea>
                <textarea id="typeRequirements" class="swal2-textarea" placeholder="Requirements">${type.requirements || ''}</textarea>
            `,
            showCancelButton: true,
            confirmButtonText: 'Update'
        }).then(async (result) => {
            if (result.isConfirmed) {
                await updateRewardType(typeId, {
                    name: document.getElementById('typeName').value,
                    category: document.getElementById('typeCategory').value,
                    value: document.getElementById('typeValue').value,
                    validityDays: document.getElementById('validityDays').value,
                    description: document.getElementById('typeDescription').value,
                    requirements: document.getElementById('typeRequirements').value,
                    updatedAt: Date.now()
                });
                loadRewardTypes();
            }
        });
    } catch (error) {
        console.error('Error editing reward type:', error);
        showError('Failed to edit reward type');
    }
}

async function handleDeleteRewardType(typeId) {
    try {
        const result = await Swal.fire({
            title: 'Delete Reward Type?',
            text: 'This action cannot be undone.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            confirmButtonText: 'Yes, delete it!'
        });

        if (result.isConfirmed) {
            await firebase.database().ref(`rewardTypes/${typeId}`).remove();
            loadRewardTypes();
        }
    } catch (error) {
        console.error('Error deleting reward type:', error);
        showError('Failed to delete reward type');
    }
}

async function updateRewardType(typeId, typeData) {
    try {
        await firebase.database().ref(`rewardTypes/${typeId}`).update(typeData);
        return true;
    } catch (error) {
        console.error('Error updating reward type:', error);
        showError('Failed to update reward type');
        return false;
    }
}

async function deleteRewardType(typeId) {
    try {
        await firebase.database().ref(`rewardTypes/${typeId}`).remove();
        return true;
    } catch (error) {
        console.error('Error deleting reward type:', error);
        showError('Failed to delete reward type');
        return false;
    }
}

// Helper functions
function formatRewardValue(type) {
    switch (type.category) {
        case 'points':
            return `${type.value} points`;
        case 'discount':
            return `${type.value}% off`;
        case 'freeItem':
            return `Free ${type.value}`;
        case 'voucher':
            return `R${type.value} voucher`;
        default:
            return type.value;
    }
}

function getStatusBadgeClass(status) {
    return status === 'active' ? 'success' : 'secondary';
}

function showError(message) {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: message
    });
}

function showNoRewardTypesMessage() {
    const container = document.getElementById('rewardTypesList');
    if (container) {
        container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                No reward types found. Click the "New Reward Type" button to create one.
            </div>
        `;
    }
}

function showLoading() {
    const container = document.getElementById('rewardTypesList');
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

// Export the functions after they are defined
export {
    initializeRewardTypes,
    createRewardType,
    updateRewardType,
    deleteRewardType
};