// Reward Types Management Module
import { auth, rtdb, ref, get, push, set, update, remove } from './config/firebase-config.js';

// Rewards Type Management State
const rewardTypesState = {
    app: null,
    types: [],
    currentFilters: {
        status: '',
        category: ''
    }
};

// Export the initialization function
export function initializeRewardTypes() {
    console.log('Initializing reward types management...');
    
    if (typeof Vue === 'undefined') {
        console.error('Vue is not loaded. Cannot initialize reward types management.');
        return null;
    }

    // Clean up any existing instance
    if (rewardTypesState.app) {
        console.log('Cleaning up existing reward types app...');
        try {
            rewardTypesState.app.unmount();
        } catch (error) {
            console.warn('Error unmounting existing app:', error);
        }
        rewardTypesState.app = null;
    }

    // Ensure the mount point exists and is clean
    const container = document.getElementById('reward-types-app');
    if (!container) {
        console.error('Reward types container not found');
        return null;
    }

    // Clear any existing content to prevent conflicts
    container.innerHTML = '';
    
    // Force visibility on container and parent
    container.style.display = 'block !important';
    container.style.visibility = 'visible !important';
    container.style.opacity = '1 !important';
    
    // Also ensure parent section is visible
    const parentSection = document.getElementById('rewardTypesContent');
    if (parentSection) {
        parentSection.style.display = 'block !important';
        parentSection.style.visibility = 'visible !important';
    }

    // Create Vue app
    try {
        rewardTypesState.app = Vue.createApp({
            template: `
                <div class="reward-types-management">
                    <div class="section-header mb-4">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h2><i class="fas fa-gift me-2"></i>Reward Types Management</h2>
                                <p class="text-muted mb-0">Configure and manage different types of rewards for your customers</p>
                            </div>
                            <button class="btn btn-primary" @click="showCreateModal">
                                <i class="fas fa-plus me-1"></i>Create Reward Type
                            </button>
                        </div>
                    </div>

                    <!-- Filters Section -->
                    <div class="card mb-4">
                        <div class="card-body">
                            <div class="row g-3">
                                <div class="col-md-4">
                                    <label class="form-label">Filter by Category</label>
                                    <select v-model="filters.category" class="form-select">
                                        <option value="">All Categories</option>
                                        <option value="discount">Discount</option>
                                        <option value="voucher">Voucher</option>
                                        <option value="points">Points</option>
                                        <option value="freeItem">Free Item</option>
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Filter by Status</label>
                                    <select v-model="filters.status" class="form-select">
                                        <option value="">All Status</option>
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Search</label>
                                    <input v-model="filters.search" type="text" class="form-control" 
                                           placeholder="Search reward types...">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Loading State -->
                    <div v-if="loading" class="text-center py-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="text-muted mt-2">Loading reward types...</p>
                    </div>

                    <!-- Error State -->
                    <div v-else-if="error" class="alert alert-danger" role="alert">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        {{ error }}
                        <button class="btn btn-outline-danger btn-sm ms-2" @click="loadTypes">
                            <i class="fas fa-sync-alt me-1"></i>Retry
                        </button>
                    </div>

                    <!-- Empty State -->
                    <div v-else-if="filteredTypes.length === 0" class="text-center py-5">
                        <i class="fas fa-gift fa-3x text-muted mb-3"></i>
                        <h5 class="text-muted">No Reward Types Found</h5>
                        <p class="text-muted">
                            <span v-if="types.length === 0">Create your first reward type to get started</span>
                            <span v-else>Try adjusting your filters to see more results</span>
                        </p>
                        <button v-if="types.length === 0" class="btn btn-primary" @click="showCreateModal">
                            <i class="fas fa-plus me-1"></i>Create First Reward Type
                        </button>
                    </div>

                    <!-- Reward Types Table -->
                    <div v-else class="card">
                        <div class="card-header">
                            <h6 class="mb-0">
                                <i class="fas fa-list me-2"></i>Reward Types 
                                <span class="badge bg-primary ms-2">{{ filteredTypes.length }}</span>
                            </h6>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-hover mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Name</th>
                                            <th>Category</th>
                                            <th>Value</th>
                                            <th>Validity</th>
                                            <th>Status</th>
                                            <th>Created</th>
                                            <th class="text-end">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="type in filteredTypes" :key="type.id">
                                            <td class="fw-medium">{{ type.name }}</td>
                                            <td>
                                                <span class="badge bg-info">{{ getCategoryLabel(type.category) }}</span>
                                            </td>
                                            <td>{{ formatValue(type) }}</td>
                                            <td>{{ type.validityDays || 30 }} days</td>
                                            <td>
                                                <span :class="getStatusBadgeClass(type.status)">
                                                    {{ type.status }}
                                                </span>
                                            </td>
                                            <td>{{ new Date(type.createdAt).toLocaleDateString() }}</td>
                                            <td class="text-end">
                                                <div class="btn-group btn-group-sm" role="group">
                                                    <button class="btn btn-outline-primary" @click="viewType(type)"
                                                            title="View Details">
                                                        <i class="fas fa-eye"></i>
                                                    </button>
                                                    <button class="btn btn-outline-warning" @click="editType(type)"
                                                            title="Edit">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn btn-outline-danger" @click="deleteType(type)"
                                                            title="Delete">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            data() {
                return {
                    types: [],
                    loading: true,
                    error: null,
                    filters: {
                        category: '',
                        status: '',
                        search: ''
                    }
                };
            },
            computed: {
                filteredTypes() {
                    return this.types.filter(type => {
                        const matchesCategory = !this.filters.category || type.category === this.filters.category;
                        const matchesStatus = !this.filters.status || type.status === this.filters.status;
                        const matchesSearch = !this.filters.search || 
                            type.name.toLowerCase().includes(this.filters.search.toLowerCase());
                        
                        return matchesCategory && matchesStatus && matchesSearch;
                    });
                }
            },
            methods: {
                async loadTypes() {
                    console.log('🎯 Vue loadTypes() called - starting data load...');
                    this.loading = true;
                    this.error = null;
                    try {
                        console.log('🎯 Getting reward types from Firebase...');
                        const snapshot = await get(ref(rtdb, 'rewardTypes'));
                        const data = snapshot.val() || {};
                        console.log('🎯 Firebase data received:', data);
                        console.log('🎯 Raw data keys:', Object.keys(data));
                        
                        this.types = Object.entries(data).map(([id, type]) => ({
                            id,
                            ...type
                        }));
                        
                        console.log('🎯 Processed types array:', this.types);
                        console.log('🎯 Types count:', this.types.length);
                        
                        // Force Vue reactivity update
                        this.$forceUpdate();
                        
                    } catch (error) {
                        console.error('🎯 Error loading reward types:', error);
                        this.error = 'Failed to load reward types: ' + error.message;
                    } finally {
                        this.loading = false;
                        console.log('🎯 Loading complete. Final state:', {
                            loading: this.loading,
                            error: this.error,
                            typesCount: this.types.length,
                            hasTypes: this.types.length > 0
                        });
                    }
                },
                
                getStatusBadgeClass(status) {
                    return status === 'active' ? 'badge bg-success' : 'badge bg-secondary';
                },
                
                getCategoryLabel(category) {
                    const labels = {
                        discount: 'Discount',
                        voucher: 'Voucher',
                        points: 'Points',
                        freeItem: 'Free Item'
                    };
                    return labels[category] || category;
                },
                
                formatValue(type) {
                    switch (type.category) {
                        case 'discount':
                            return `${type.value}% off`;
                        case 'voucher':
                            return `R${type.value}`;
                        case 'points':
                            return `${type.value} points`;
                        case 'freeItem':
                            return `Free ${type.value}`;
                        default:
                            return type.value;
                    }
                },

                async showCreateModal() {
                    const { value: formData } = await Swal.fire({
                        title: '<i class="fas fa-plus me-2"></i>Create Reward Type',
                        width: '700px',
                        html: `
                            <div class="row g-3">
                                <div class="col-12">
                                    <label class="form-label fw-bold">Reward Name *</label>
                                    <input id="rewardName" type="text" class="form-control" 
                                           placeholder="e.g., 10% Discount, Free Coffee">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Category *</label>
                                    <select id="rewardCategory" class="form-select">
                                        <option value="discount">Discount (%)</option>
                                        <option value="voucher">Voucher (R)</option>
                                        <option value="points">Points</option>
                                        <option value="freeItem">Free Item</option>
                                    </select>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Value *</label>
                                    <input id="rewardValue" type="text" class="form-control" 
                                           placeholder="10, 50, Coffee">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Validity (Days)</label>
                                    <input id="validityDays" type="number" class="form-control" 
                                           value="30" min="1">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Status</label>
                                    <select id="rewardStatus" class="form-select">
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                                <div class="col-12">
                                    <label class="form-label">Description</label>
                                    <textarea id="rewardDescription" class="form-control" rows="3" 
                                              placeholder="Describe this reward type"></textarea>
                                </div>
                                <div class="col-12">
                                    <label class="form-label">Requirements</label>
                                    <textarea id="rewardRequirements" class="form-control" rows="2" 
                                              placeholder="Any special requirements (optional)"></textarea>
                                </div>
                            </div>
                        `,
                        showCancelButton: true,
                        confirmButtonText: '<i class="fas fa-plus me-1"></i>Create',
                        cancelButtonText: 'Cancel',
                        confirmButtonColor: '#198754',
                        preConfirm: () => {
                            const name = document.getElementById('rewardName').value.trim();
                            const category = document.getElementById('rewardCategory').value;
                            const value = document.getElementById('rewardValue').value.trim();
                            const validityDays = parseInt(document.getElementById('validityDays').value) || 30;
                            const status = document.getElementById('rewardStatus').value;
                            const description = document.getElementById('rewardDescription').value.trim();
                            const requirements = document.getElementById('rewardRequirements').value.trim();

                            if (!name || !value) {
                                Swal.showValidationMessage('Name and value are required');
                                return false;
                            }

                            return { name, category, value, validityDays, status, description, requirements };
                        }
                    });

                    if (formData) {
                        await this.createType(formData);
                    }
                },

                async createType(typeData) {
                    try {
                        const typeRef = push(ref(rtdb, 'rewardTypes'));
                        await set(typeRef, {
                            ...typeData,
                            createdAt: new Date().toISOString(),
                            createdBy: auth.currentUser?.uid
                        });
                        
                        await this.loadTypes();
                        
                        Swal.fire({
                            icon: 'success',
                            title: 'Reward Type Created!',
                            text: 'The reward type has been created successfully.',
                            confirmButtonColor: '#198754'
                        });
                    } catch (error) {
                        console.error('Error creating reward type:', error);
                        Swal.fire({
                            icon: 'error',
                            title: 'Creation Failed',
                            text: 'Failed to create reward type. Please try again.'
                        });
                    }
                },

                async editType(type) {
                    const { value: formData } = await Swal.fire({
                        title: `<i class="fas fa-edit me-2"></i>Edit ${type.name}`,
                        width: '700px',
                        html: `
                            <div class="row g-3">
                                <div class="col-12">
                                    <label class="form-label fw-bold">Reward Name *</label>
                                    <input id="rewardName" type="text" class="form-control" 
                                           value="${type.name}">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Category *</label>
                                    <select id="rewardCategory" class="form-select">
                                        <option value="discount" ${type.category === 'discount' ? 'selected' : ''}>Discount (%)</option>
                                        <option value="voucher" ${type.category === 'voucher' ? 'selected' : ''}>Voucher (R)</option>
                                        <option value="points" ${type.category === 'points' ? 'selected' : ''}>Points</option>
                                        <option value="freeItem" ${type.category === 'freeItem' ? 'selected' : ''}>Free Item</option>
                                    </select>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Value *</label>
                                    <input id="rewardValue" type="text" class="form-control" 
                                           value="${type.value}">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Validity (Days)</label>
                                    <input id="validityDays" type="number" class="form-control" 
                                           value="${type.validityDays || 30}" min="1">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Status</label>
                                    <select id="rewardStatus" class="form-select">
                                        <option value="active" ${type.status === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="inactive" ${type.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                                    </select>
                                </div>
                                <div class="col-12">
                                    <label class="form-label">Description</label>
                                    <textarea id="rewardDescription" class="form-control" rows="3">${type.description || ''}</textarea>
                                </div>
                                <div class="col-12">
                                    <label class="form-label">Requirements</label>
                                    <textarea id="rewardRequirements" class="form-control" rows="2">${type.requirements || ''}</textarea>
                                </div>
                            </div>
                        `,
                        showCancelButton: true,
                        confirmButtonText: '<i class="fas fa-save me-1"></i>Update',
                        cancelButtonText: 'Cancel',
                        confirmButtonColor: '#198754',
                        preConfirm: () => {
                            const name = document.getElementById('rewardName').value.trim();
                            const category = document.getElementById('rewardCategory').value;
                            const value = document.getElementById('rewardValue').value.trim();
                            const validityDays = parseInt(document.getElementById('validityDays').value) || 30;
                            const status = document.getElementById('rewardStatus').value;
                            const description = document.getElementById('rewardDescription').value.trim();
                            const requirements = document.getElementById('rewardRequirements').value.trim();

                            if (!name || !value) {
                                Swal.showValidationMessage('Name and value are required');
                                return false;
                            }

                            return { name, category, value, validityDays, status, description, requirements };
                        }
                    });

                    if (formData) {
                        await this.updateType(type.id, formData);
                    }
                },

                async updateType(typeId, typeData) {
                    try {
                        await update(ref(rtdb, `rewardTypes/${typeId}`), {
                            ...typeData,
                            updatedAt: new Date().toISOString(),
                            updatedBy: auth.currentUser?.uid
                        });
                        
                        await this.loadTypes();
                        
                        Swal.fire({
                            icon: 'success',
                            title: 'Reward Type Updated!',
                            text: 'The reward type has been updated successfully.',
                            confirmButtonColor: '#198754'
                        });
                    } catch (error) {
                        console.error('Error updating reward type:', error);
                        Swal.fire({
                            icon: 'error',
                            title: 'Update Failed',
                            text: 'Failed to update reward type. Please try again.'
                        });
                    }
                },

                async viewType(type) {
                    Swal.fire({
                        title: type.name,
                        html: `
                            <div class="text-start">
                                <div class="row mb-3">
                                    <div class="col-6"><strong>Category:</strong></div>
                                    <div class="col-6">${this.getCategoryLabel(type.category)}</div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-6"><strong>Value:</strong></div>
                                    <div class="col-6">${this.formatValue(type)}</div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-6"><strong>Validity:</strong></div>
                                    <div class="col-6">${type.validityDays || 30} days</div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-6"><strong>Status:</strong></div>
                                    <div class="col-6"><span class="${this.getStatusBadgeClass(type.status)}">${type.status}</span></div>
                                </div>
                                ${type.description ? `
                                    <div class="row mb-3">
                                        <div class="col-12"><strong>Description:</strong></div>
                                        <div class="col-12">${type.description}</div>
                                    </div>
                                ` : ''}
                                ${type.requirements ? `
                                    <div class="row mb-3">
                                        <div class="col-12"><strong>Requirements:</strong></div>
                                        <div class="col-12">${type.requirements}</div>
                                    </div>
                                ` : ''}
                                <div class="row">
                                    <div class="col-6"><strong>Created:</strong></div>
                                    <div class="col-6">${new Date(type.createdAt).toLocaleDateString()}</div>
                                </div>
                            </div>
                        `,
                        width: '600px',
                        confirmButtonText: 'Close'
                    });
                },

                async deleteType(type) {
                    const result = await Swal.fire({
                        title: 'Delete Reward Type?',
                        text: `Are you sure you want to delete "${type.name}"? This action cannot be undone.`,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#dc3545',
                        confirmButtonText: 'Yes, delete it!'
                    });

                    if (result.isConfirmed) {
                        try {
                            await remove(ref(rtdb, `rewardTypes/${type.id}`));
                            await this.loadTypes();
                            
                            Swal.fire({
                                icon: 'success',
                                title: 'Deleted!',
                                text: 'The reward type has been deleted.',
                                confirmButtonColor: '#198754'
                            });
                        } catch (error) {
                            console.error('Error deleting reward type:', error);
                            Swal.fire({
                                icon: 'error',
                                title: 'Deletion Failed',
                                text: 'Failed to delete reward type. Please try again.'
                            });
                        }
                    }
                }
            },
            
            mounted() {
                console.log('🎯 Reward Types Vue app mounted successfully!');
                console.log('🎯 Initial data state:', {
                    loading: this.loading,
                    error: this.error,
                    typesLength: this.types.length,
                    filtersState: this.filters
                });
                console.log('🎯 Vue instance element:', this.$el);
                console.log('🎯 Vue instance element innerHTML:', this.$el.innerHTML.length, 'characters');
                
                this.loadTypes();
                
                // Debug template rendering after a delay
                setTimeout(() => {
                    console.log('🎯 AFTER loadTypes - Vue element innerHTML:', this.$el.innerHTML.length, 'characters');
                    console.log('🎯 AFTER loadTypes - First 500 chars:', this.$el.innerHTML.substring(0, 500));
                    if (this.$el.innerHTML.length === 0) {
                        console.error('🎯 Vue template is NOT RENDERING - innerHTML is empty!');
                    }
                }, 2000);
            }
        });

        rewardTypesState.app.mount(container);
        
        // Force visibility with !important styles (same fix as voucher management)
        setTimeout(() => {
            console.log('🎯 Applying visibility fix after Vue mount...');
            const mountedContent = container.querySelector('.reward-types-management');
            if (mountedContent) {
                console.log('🎯 Found mounted content, ensuring visibility...');
                
                // Clean, simple visibility fix without debug styling
                mountedContent.style.cssText = `
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    position: relative !important;
                    z-index: 10 !important;
                    width: 100% !important;
                    height: auto !important;
                `;
                
                // Also force the parent containers
                let parent = mountedContent.parentElement;
                while (parent && parent.id !== 'app') {
                    parent.style.cssText += `
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        overflow: visible !important;
                    `;
                    parent = parent.parentElement;
                }
                
                // Force all child elements to be visible
                const allChildren = mountedContent.querySelectorAll('*');
                allChildren.forEach(child => {
                    child.style.visibility = 'visible !important';
                    child.style.opacity = '1 !important';
                });
                
                console.log('✅ Reward types visibility ensured');
            } else {
                console.error('❌ Could not find .reward-types-management element');
            }
        }, 200);

        console.log('Reward types management initialized successfully');
        return rewardTypesState.app;
    } catch (error) {
        console.error('Error mounting reward types app:', error);
        return null;
    }
}

export function cleanupRewardTypes() {
    if (rewardTypesState.app) {
        console.log('Cleaning up reward types app...');
        try {
            rewardTypesState.app.unmount();
        } catch (error) {
            console.warn('Error unmounting reward types app:', error);
        }
        rewardTypesState.app = null;
    }
}

// Make globally available for compatibility
window.initializeRewardTypes = initializeRewardTypes;
window.cleanupRewardTypes = cleanupRewardTypes;