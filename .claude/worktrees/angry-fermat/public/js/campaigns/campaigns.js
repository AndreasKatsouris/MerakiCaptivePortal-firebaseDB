// Import Firebase dependencies
import { auth, rtdb, ref, get, push, set, update, remove } from '../config/firebase-config.js';

const campaignManagement = {
    app: null
};

export function initializeCampaignManagement() {
    console.log('Initializing campaign management...');

    // Check if Vue is available
    if (typeof Vue === 'undefined') {
        console.error('Vue is not loaded. Cannot initialize campaign management.');
        return;
    }

    // Clean up any existing instance
    if (campaignManagement.app) {
        console.log('Cleaning up existing campaign management app...');
        try {
            campaignManagement.app.unmount();
        } catch (error) {
            console.warn('Error unmounting existing app:', error);
        }
        campaignManagement.app = null;
    }

    // Ensure the mount point exists and is clean
    const container = document.getElementById('campaign-management-app');
    if (!container) {
        console.error('Campaign management container not found');
        return null;
    }

    // Clear any existing content to prevent conflicts
    container.innerHTML = '';

    campaignManagement.app = Vue.createApp({
        template: `
            <div class="campaign-management">
                <div class="section-header mb-4">
                    <h2><i class="fas fa-bullhorn me-2"></i>Campaign Management</h2>
                    <button @click="showAddCampaignModal" class="btn btn-primary">
                        <i class="fas fa-plus"></i> Add Campaign
                    </button>
                </div>

                <!-- Filters -->
                <div class="card mb-4">
                    <div class="card-body">
                        <h5 class="card-title">Filters</h5>
                        <div class="row g-3">
                            <div class="col-md-4">
                                <label class="form-label">Brand Name</label>
                                <input type="text" v-model="filters.brandName" class="form-control" placeholder="Search by brand...">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">Status</label>
                                <select v-model="filters.status" class="form-select">
                                    <option value="">All Status</option>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="draft">Draft</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Loading State -->
                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>

                <!-- Error State -->
                <div v-else-if="error" class="alert alert-danger" role="alert">
                    {{ error }}
                </div>

                <!-- Campaigns Grid -->
                <div v-else>
                    <div v-if="filteredCampaigns.length === 0" class="alert alert-info">
                        <i class="fas fa-info-circle me-2"></i>
                        No campaigns found matching the current filters.
                    </div>
                    <div v-else class="row">
                        <div v-for="campaign in filteredCampaigns" :key="campaign.id" class="col-md-6 col-lg-4 mb-4">
                            <div class="card h-100">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-start mb-2">
                                        <h5 class="card-title">{{ campaign.name }}</h5>
                                        <span :class="getStatusBadgeClass(campaign.status)">
                                            {{ campaign.status }}
                                        </span>
                                    </div>
                                    <h6 class="card-subtitle mb-2 text-muted">{{ campaign.brandName }}</h6>
                                    <p class="card-text" v-if="campaign.storeName">
                                        <i class="fas fa-store me-1"></i>{{ campaign.storeName }}
                                    </p>
                                    <p class="card-text" v-if="campaign.minPurchaseAmount">
                                        <i class="fas fa-dollar-sign me-1"></i>Min Purchase: R{{ campaign.minPurchaseAmount }}
                                    </p>
                                    <p class="card-text" v-if="campaign.startDate && campaign.endDate">
                                        <i class="fas fa-calendar me-1"></i>{{ formatDate(campaign.startDate) }} - {{ formatDate(campaign.endDate) }}
                                    </p>
                                    <p class="card-text" v-if="campaign.activeDays && campaign.activeDays.length > 0">
                                        <i class="fas fa-clock me-1"></i>{{ formatActiveDays(campaign.activeDays) }}
                                    </p>
                                </div>
                                <div class="card-footer">
                                    <div class="btn-group w-100">
                                        <button @click="viewCampaign(campaign)" class="btn btn-outline-primary btn-sm">
                                            <i class="fas fa-eye"></i> View
                                        </button>
                                        <button @click="editCampaign(campaign)" class="btn btn-outline-warning btn-sm">
                                            <i class="fas fa-edit"></i> Edit
                                        </button>
                                        <button @click="deleteCampaign(campaign)" class="btn btn-outline-danger btn-sm">
                                            <i class="fas fa-trash"></i> Delete
                                        </button>
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
                campaigns: [],
                loading: true,
                error: null,
                filters: {
                    brandName: '',
                    status: ''
                },
                daysOfWeek: [
                    { value: 0, label: 'Sunday', short: 'Sun' },
                    { value: 1, label: 'Monday', short: 'Mon' },
                    { value: 2, label: 'Tuesday', short: 'Tue' },
                    { value: 3, label: 'Wednesday', short: 'Wed' },
                    { value: 4, label: 'Thursday', short: 'Thu' },
                    { value: 5, label: 'Friday', short: 'Fri' },
                    { value: 6, label: 'Saturday', short: 'Sat' }
                ],
                selectedRewardTypes: [],
                rewardCriteria: {},
                availableRewardTypes: [],
                newCampaign: {
                    name: '',
                    brandName: '',
                    storeName: '',
                    minPurchaseAmount: '',
                    startDate: '',
                    endDate: '',
                    status: 'draft',
                    requiredItems: [],
                    activeDays: [],
                    rewardTypes: []
                }
            };
        },
        computed: {
            filteredCampaigns() {
                return this.campaigns.filter(campaign => {
                    const matchesStatus = !this.filters.status || 
                                        campaign.status === this.filters.status;
                    const matchesBrand = !this.filters.brandName || 
                                       campaign.brandName.toLowerCase().includes(this.filters.brandName.toLowerCase());
                    return matchesStatus && matchesBrand;
                });
            }
        },
        methods: {
            async loadCampaigns() {
                try {
                    const campaignsRef = ref(rtdb, 'campaigns');
                    const snapshot = await get(campaignsRef);
                    const data = snapshot.val();
                    this.campaigns = data ? Object.entries(data).map(([id, campaign]) => ({
                        id,
                        ...campaign
                    })) : [];
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                    this.error = 'Failed to load campaigns';
                } finally {
                    this.loading = false;
                }
            },
            async loadRewardTypes() {
                try {
                    const rewardTypesRef = ref(rtdb, 'rewardTypes');
                    const snapshot = await get(rewardTypesRef);
                    const data = snapshot.val();
                    this.availableRewardTypes = data ? Object.entries(data).map(([id, rewardType]) => ({
                        id,
                        ...rewardType
                    })) : [];
                } catch (error) {
                    console.error('Error loading reward types:', error);
                }
            },
            async createCampaign(campaignData) {
                this.loading = true;
                this.error = null;
                try {
                    // Validate campaign data
                    if (!campaignData.name || !campaignData.brandName || !campaignData.status) {
                        throw new Error('Missing required campaign fields');
                    }

                    // Clean up any incorrect data in the campaigns node
                    const campaignsRef = ref(rtdb, 'campaigns');
                    const snapshot = await get(campaignsRef);
                    const campaigns = snapshot.val();

                    if (campaigns) {
                        const updates = {};
                        Object.entries(campaigns).forEach(([key, value]) => {
                            // Remove entries that don't have required campaign fields
                            if (!value.name || !value.brandName || !value.status) {
                                updates[key] = null;
                            }
                        });

                        if (Object.keys(updates).length > 0) {
                            console.log('Cleaning up invalid campaign data:', updates);
                            await update(campaignsRef, updates);
                        }
                    }

                    // Create the new campaign
                    const newCampaignRef = push(ref(rtdb, 'campaigns'));
                    const campaignWithMeta = {
                        ...campaignData,
                        createdAt: new Date().toISOString(),
                        createdBy: auth.currentUser.uid,
                        status: 'active' // Ensure status is set to active
                    };

                    console.log('Creating new campaign:', campaignWithMeta);
                    await set(newCampaignRef, campaignWithMeta);
                    
                    await this.loadCampaigns();
                    this.resetForm();
                } catch (error) {
                    console.error('Error creating campaign:', error);
                    this.error = 'Failed to create campaign. Please try again.';
                } finally {
                    this.loading = false;
                }
            },
            async updateCampaign(campaign) {
                this.loading = true;
                this.error = null;
                try {
                    await update(ref(rtdb, `campaigns/${campaign.id}`), {
                        ...campaign,
                        updatedAt: new Date().toISOString(),
                        updatedBy: auth.currentUser.uid
                    });
                    await this.loadCampaigns();
                } catch (error) {
                    console.error('Error updating campaign:', error);
                    this.error = 'Failed to update campaign. Please try again.';
                } finally {
                    this.loading = false;
                }
            },
            resetForm() {
                this.newCampaign = {
                    name: '',
                    brandName: '',
                    storeName: '',
                    minPurchaseAmount: '',
                    startDate: '',
                    endDate: '',
                    status: 'draft',
                    requiredItems: [],
                    activeDays: [],
                    rewardTypes: []
                };
            },
            isRewardTypeSelected(typeId) {
                return this.selectedRewardTypes.includes(typeId);
            },
            formatDate(date) {
                if (!date) return 'N/A';
                return new Date(date).toLocaleDateString();
            },
            formatActiveDays(activeDays) {
                if (!activeDays || !activeDays.length) return 'All days';
                return activeDays
                    .map(day => this.daysOfWeek.find(d => d.value === day)?.label)
                    .filter(Boolean)
                    .join(', ');
            },
            getRequiredItemsFromForm() {
                const requiredItems = [];
                document.querySelectorAll('.required-item-row').forEach(row => {
                    const itemQuantity = row.querySelector('.item-quantity').value;
                    const itemName = row.querySelector('.item-name').value;
                    if (itemQuantity && itemName) {
                        requiredItems.push({
                            quantity: parseInt(itemQuantity),
                            itemName: itemName.trim()
                        });
                    }
                });
                return requiredItems;
            },
            getActiveDaysFromForm() {
                const activeDays = [];
                document.querySelectorAll('.day-checkbox:checked').forEach(checkbox => {
                    activeDays.push(parseInt(checkbox.value));
                });
                return activeDays;
            },
            getStatusBadgeClass(status) {
                const classes = {
                    active: 'badge bg-success',
                    inactive: 'badge bg-secondary',
                    draft: 'badge bg-warning',
                    default: 'badge bg-secondary'
                };
                return classes[status] || classes.default;
            },
            async showAddCampaignModal() {
                // Better organized modal with tabs and progressive disclosure
                const { value: formValues } = await Swal.fire({
                    title: '<i class="fas fa-bullhorn me-2"></i>Create New Campaign',
                    width: '900px',
                    html: `
                        <div class="campaign-modal-container">
                            <!-- Tab Navigation -->
                            <ul class="nav nav-tabs nav-fill mb-4" id="campaignTabs" role="tablist">
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link active" id="basic-tab" data-bs-toggle="tab" 
                                            data-bs-target="#basic-info" type="button" role="tab">
                                        <i class="fas fa-info-circle me-1"></i>Basic Info
                                    </button>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link" id="requirements-tab" data-bs-toggle="tab" 
                                            data-bs-target="#requirements" type="button" role="tab">
                                        <i class="fas fa-list-check me-1"></i>Requirements
                                    </button>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link" id="rewards-tab" data-bs-toggle="tab" 
                                            data-bs-target="#rewards" type="button" role="tab">
                                        <i class="fas fa-gift me-1"></i>Rewards
                                    </button>
                                </li>
                            </ul>

                            <!-- Tab Content -->
                            <div class="tab-content" id="campaignTabContent">
                                <!-- Basic Info Tab -->
                                <div class="tab-pane fade show active" id="basic-info" role="tabpanel">
                                    <div class="row g-3">
                                        <div class="col-12">
                                            <label class="form-label fw-bold">Campaign Name *</label>
                                            <input id="newCampaignName" type="text" class="form-control form-control-lg" 
                                                   placeholder="Enter campaign name" required>
                                            <div class="invalid-feedback" id="newCampaignName-feedback"></div>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold">Brand Name *</label>
                                            <input id="newBrandName" type="text" class="form-control" 
                                                   placeholder="Enter brand name" required>
                                            <div class="invalid-feedback" id="newBrandName-feedback"></div>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Store Name</label>
                                            <input id="newStoreName" type="text" class="form-control" 
                                                   placeholder="Specific store (optional)">
                                            <small class="form-text text-muted">Leave empty to apply to all stores</small>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Minimum Purchase</label>
                                            <div class="input-group">
                                                <span class="input-group-text">R</span>
                                                <input id="newMinPurchase" type="number" class="form-control" 
                                                       placeholder="0.00" min="0" step="0.01">
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Campaign Status</label>
                                            <select id="newCampaignStatus" class="form-select">
                                                <option value="active">Active</option>
                                                <option value="draft">Draft</option>
                                                <option value="inactive">Inactive</option>
                                            </select>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold">Start Date *</label>
                                            <input id="newStartDate" type="date" class="form-control" required>
                                            <div class="invalid-feedback" id="newStartDate-feedback"></div>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold">End Date *</label>
                                            <input id="newEndDate" type="date" class="form-control" required>
                                            <div class="invalid-feedback" id="newEndDate-feedback"></div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Requirements Tab -->
                                <div class="tab-pane fade" id="requirements" role="tabpanel">
                                    <div class="row g-4">
                                        <!-- Active Days Section -->
                                        <div class="col-12">
                                            <div class="card">
                                                <div class="card-header">
                                                    <h6 class="mb-0"><i class="fas fa-calendar-days me-2"></i>Active Days</h6>
                                                </div>
                                                <div class="card-body">
                                                                                        <div class="row g-2" id="newActiveDays">
                                        ${this.daysOfWeek.map(day => `
                                            <div class="col-md-3">
                                                <div class="form-check form-check-card">
                                                    <input type="checkbox" class="form-check-input day-checkbox" 
                                                           id="newDay${day.value}" value="${day.value}" checked>
                                                    <label class="form-check-label fw-semibold" for="newDay${day.value}">
                                                        ${day.label}
                                                    </label>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                                    <small class="form-text text-muted">Select which days the campaign is active</small>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Required Items Section -->
                                        <div class="col-12">
                                            <div class="card">
                                                <div class="card-header d-flex justify-content-between align-items-center">
                                                    <h6 class="mb-0"><i class="fas fa-shopping-list me-2"></i>Required Items</h6>
                                                    <button type="button" class="btn btn-sm btn-success" id="addItemBtn">
                                                        <i class="fas fa-plus"></i> Add Item
                                                    </button>
                                                </div>
                                                <div class="card-body">
                                                    <div id="newRequiredItems">
                                                        <div class="required-item-row mb-3">
                                                            <div class="row g-2 align-items-end">
                                                                <div class="col-md-3">
                                                                    <label class="form-label">Quantity</label>
                                                                    <input type="number" class="form-control item-quantity" 
                                                                           placeholder="1" min="1">
                                                                </div>
                                                                <div class="col-md-7">
                                                                    <label class="form-label">Item Name</label>
                                                                    <input type="text" class="form-control item-name" 
                                                                           placeholder="Enter item name">
                                                                </div>
                                                                <div class="col-md-2">
                                                                    <button type="button" class="btn btn-outline-danger remove-item w-100">
                                                                        <i class="fas fa-trash"></i>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <small class="form-text text-muted">Specify items that must be present in receipts (optional)</small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Rewards Tab -->
                                <div class="tab-pane fade" id="rewards" role="tabpanel">
                                    <div class="reward-types-section">
                                        <div class="d-flex justify-content-between align-items-center mb-3">
                                            <h6 class="mb-0"><i class="fas fa-gift me-2"></i>Available Reward Types</h6>
                                            <button type="button" class="btn btn-sm btn-outline-primary" id="manageRewardTypesBtn">
                                                <i class="fas fa-cog"></i> Manage Types
                                            </button>
                                        </div>
                                        
                                        <div id="newRewardTypesSection">
                                            ${this.availableRewardTypes.length === 0 ? `
                                                <div class="alert alert-info">
                                                    <i class="fas fa-info-circle me-2"></i>
                                                    No reward types available. Create some reward types first.
                                                </div>
                                            ` : this.availableRewardTypes.map(type => `
                                                <div class="card mb-3 reward-type-card">
                                                    <div class="card-body">
                                                        <div class="form-check">
                                                            <input type="checkbox" class="form-check-input reward-type-checkbox" 
                                                                   id="new-reward-type-${type.id}" value="${type.id}">
                                                            <label class="form-check-label fw-semibold" for="new-reward-type-${type.id}">
                                                                ${type.name}
                                                            </label>
                                                        </div>
                                                        <p class="text-muted mb-2">${type.description || 'No description'}</p>
                                                        <div class="reward-criteria mt-3" style="display: none">
                                                            <div class="row g-2">
                                                                <div class="col-md-6">
                                                                    <label class="form-label">Min Purchase for this Reward</label>
                                                                    <div class="input-group">
                                                                        <span class="input-group-text">R</span>
                                                                        <input type="number" class="form-control reward-min-purchase" 
                                                                               placeholder="0.00" step="0.01">
                                                                    </div>
                                                                </div>
                                                                <div class="col-md-6">
                                                                    <label class="form-label">Max Rewards per Receipt</label>
                                                                    <input type="number" class="form-control reward-max-count" 
                                                                           placeholder="1" min="1">
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <style>
                            .campaign-modal-container .nav-tabs {
                                border-bottom: 2px solid #e9ecef;
                            }
                            .campaign-modal-container .nav-link {
                                border: none;
                                color: #6c757d;
                                font-weight: 500;
                                padding: 12px 20px;
                            }
                            .campaign-modal-container .nav-link.active {
                                color: #0d6efd;
                                border-bottom: 2px solid #0d6efd;
                                background: none;
                            }
                            .form-check-card {
                                padding: 8px 12px;
                                border: 1px solid #dee2e6;
                                border-radius: 6px;
                                transition: all 0.2s;
                            }
                            .form-check-card:has(.form-check-input:checked) {
                                background-color: #e7f3ff;
                                border-color: #0d6efd;
                            }
                            .reward-type-card {
                                transition: all 0.2s;
                                border: 1px solid #dee2e6;
                            }
                            .reward-type-card:has(.reward-type-checkbox:checked) {
                                border-color: #198754;
                                background-color: #f8fff9;
                            }
                            .invalid-feedback {
                                display: block;
                            }
                        </style>
                    `,
                    didOpen: () => {
                        // Initialize Bootstrap tabs if available
                        if (typeof bootstrap !== 'undefined') {
                            const tabElements = document.querySelectorAll('#campaignTabs button[data-bs-toggle="tab"]');
                            tabElements.forEach(tab => {
                                new bootstrap.Tab(tab);
                            });
                        }

                        // Add Item button handler
                        document.getElementById('addItemBtn').addEventListener('click', () => {
                            const container = document.getElementById('newRequiredItems');
                            const newRow = document.createElement('div');
                            newRow.className = 'required-item-row mb-3';
                            newRow.innerHTML = `
                                <div class="row g-2 align-items-end">
                                    <div class="col-md-3">
                                        <label class="form-label">Quantity</label>
                                        <input type="number" class="form-control item-quantity" 
                                               placeholder="1" min="1">
                                    </div>
                                    <div class="col-md-7">
                                        <label class="form-label">Item Name</label>
                                        <input type="text" class="form-control item-name" 
                                               placeholder="Enter item name">
                                    </div>
                                    <div class="col-md-2">
                                        <button type="button" class="btn btn-outline-danger remove-item w-100">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            `;
                            container.appendChild(newRow);
                        });

                        // Remove item handlers (event delegation)
                        document.getElementById('newRequiredItems').addEventListener('click', (e) => {
                            if (e.target.closest('.remove-item')) {
                                const rows = document.querySelectorAll('.required-item-row');
                                if (rows.length > 1) {
                                    e.target.closest('.required-item-row').remove();
                                }
                            }
                        });

                        // Reward type checkbox handlers
                        document.querySelectorAll('.reward-type-checkbox').forEach(checkbox => {
                            checkbox.addEventListener('change', (e) => {
                                const criteriaDiv = e.target.closest('.reward-type-card').querySelector('.reward-criteria');
                                criteriaDiv.style.display = e.target.checked ? 'block' : 'none';
                            });
                        });

                        // Manage Reward Types button
                        document.getElementById('manageRewardTypesBtn').addEventListener('click', () => {
                            // Open reward types management in a new modal
                            this.showRewardTypeManagementModal();
                        });

                        // Real-time validation with new field IDs
                        ['newCampaignName', 'newBrandName', 'newStartDate', 'newEndDate'].forEach(fieldId => {
                            const field = document.getElementById(fieldId);
                            field.addEventListener('blur', () => this.validateNewField(fieldId));
                            field.addEventListener('input', () => this.clearNewFieldError(fieldId));
                        });
                    },
                    showCancelButton: true,
                    confirmButtonText: '<i class="fas fa-plus me-1"></i>Create Campaign',
                    cancelButtonText: '<i class="fas fa-times me-1"></i>Cancel',
                    confirmButtonColor: '#198754',
                    preConfirm: () => {
                        return this.validateAndCollectNewCampaignData();
                    },
                    showLoaderOnConfirm: true,
                    allowOutsideClick: () => !Swal.isLoading()
                });

                if (formValues) {
                    try {
                        console.log('Creating campaign with data:', formValues);
                        await this.createCampaign(formValues);
                        
                        await Swal.fire({
                            icon: 'success',
                            title: 'Campaign Created!',
                            text: 'Your campaign has been created successfully.',
                            confirmButtonColor: '#198754'
                        });
                        
                        await this.loadCampaigns();
                    } catch (error) {
                        console.error('Error creating campaign:', error);
                        await Swal.fire({
                            icon: 'error',
                            title: 'Creation Failed',
                            text: 'Failed to create campaign. Please try again.',
                            confirmButtonColor: '#dc3545'
                        });
                    }
                }
            },

            // New helper methods for validation and data collection
            validateField(fieldId) {
                const field = document.getElementById(fieldId);
                const feedback = document.getElementById(`${fieldId}-feedback`);
                let isValid = true;
                let message = '';

                switch (fieldId) {
                    case 'campaignName':
                        if (!field.value.trim()) {
                            isValid = false;
                            message = 'Campaign name is required';
                        }
                        break;
                    case 'brandName':
                        if (!field.value.trim()) {
                            isValid = false;
                            message = 'Brand name is required';
                        }
                        break;
                    case 'startDate':
                        if (!field.value) {
                            isValid = false;
                            message = 'Start date is required';
                        }
                        break;
                    case 'endDate':
                        if (!field.value) {
                            isValid = false;
                            message = 'End date is required';
                        } else if (field.value && document.getElementById('startDate').value && 
                                  new Date(field.value) <= new Date(document.getElementById('startDate').value)) {
                            isValid = false;
                            message = 'End date must be after start date';
                        }
                        break;
                }

                field.classList.toggle('is-invalid', !isValid);
                field.classList.toggle('is-valid', isValid && field.value.trim());
                if (feedback) feedback.textContent = message;

                return isValid;
            },

            validateEditField(fieldId) {
                const field = document.getElementById(fieldId);
                if (!field) {
                    console.warn(`Field with ID ${fieldId} not found`);
                    return false;
                }

                const feedback = field.parentElement.querySelector('.invalid-feedback');
                let isValid = true;
                let message = '';

                switch (fieldId) {
                    case 'editCampaignName':
                        if (!field.value.trim()) {
                            isValid = false;
                            message = 'Campaign name is required';
                        }
                        break;
                    case 'editBrandName':
                        if (!field.value.trim()) {
                            isValid = false;
                            message = 'Brand name is required';
                        }
                        break;
                    case 'editStartDate':
                        if (!field.value) {
                            isValid = false;
                            message = 'Start date is required';
                        }
                        break;
                    case 'editEndDate':
                        if (!field.value) {
                            isValid = false;
                            message = 'End date is required';
                        } else if (field.value && document.getElementById('editStartDate').value && 
                                  new Date(field.value) <= new Date(document.getElementById('editStartDate').value)) {
                            isValid = false;
                            message = 'End date must be after start date';
                        }
                        break;
                }

                field.classList.toggle('is-invalid', !isValid);
                field.classList.toggle('is-valid', isValid && field.value.trim());
                if (feedback) feedback.textContent = message;

                return isValid;
            },

            clearFieldError(fieldId) {
                const field = document.getElementById(fieldId);
                field.classList.remove('is-invalid');
                if (field.value.trim()) {
                    field.classList.add('is-valid');
                } else {
                    field.classList.remove('is-valid');
                }
            },

            clearNewFieldError(fieldId) {
                const field = document.getElementById(fieldId);
                field.classList.remove('is-invalid');
                if (field.value.trim()) {
                    field.classList.add('is-valid');
                } else {
                    field.classList.remove('is-valid');
                }
            },

            clearEditFieldError(fieldId) {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.classList.remove('is-invalid');
                    if (field.value.trim()) {
                        field.classList.add('is-valid');
                    } else {
                        field.classList.remove('is-valid');
                    }
                }
            },

            validateAndCollectCampaignData() {
                // Validate all required fields
                const requiredFields = ['editCampaignName', 'editBrandName', 'editStartDate', 'editEndDate'];
                let isFormValid = true;

                requiredFields.forEach(fieldId => {
                    if (!this.validateEditField(fieldId)) {
                        isFormValid = false;
                    }
                });

                if (!isFormValid) {
                    Swal.showValidationMessage('Please fix the errors above');
                    return false;
                }

                // Collect form data
                const formData = {
                    name: document.getElementById('editCampaignName').value.trim(),
                    brandName: document.getElementById('editBrandName').value.trim(),
                    storeName: document.getElementById('editStoreName').value.trim(),
                    minPurchaseAmount: parseFloat(document.getElementById('editMinPurchase').value) || 0,
                    startDate: document.getElementById('editStartDate').value,
                    endDate: document.getElementById('editEndDate').value,
                    status: document.getElementById('editCampaignStatus').value,
                    requiredItems: this.getEditRequiredItemsFromForm(),
                    activeDays: this.getEditActiveDaysFromForm(),
                    rewardTypes: this.getEditSelectedRewardTypes()
                };

                return formData;
            },

            validateAndCollectNewCampaignData() {
                // Validate all required fields with new prefixes
                const requiredFields = ['newCampaignName', 'newBrandName', 'newStartDate', 'newEndDate'];
                let isFormValid = true;

                requiredFields.forEach(fieldId => {
                    if (!this.validateNewField(fieldId)) {
                        isFormValid = false;
                    }
                });

                if (!isFormValid) {
                    Swal.showValidationMessage('Please fix the errors above');
                    return false;
                }

                // Collect form data with new field IDs
                const formData = {
                    name: document.getElementById('newCampaignName').value.trim(),
                    brandName: document.getElementById('newBrandName').value.trim(),
                    storeName: document.getElementById('newStoreName').value.trim(),
                    minPurchaseAmount: parseFloat(document.getElementById('newMinPurchase').value) || 0,
                    startDate: document.getElementById('newStartDate').value,
                    endDate: document.getElementById('newEndDate').value,
                    status: document.getElementById('newCampaignStatus').value,
                    requiredItems: this.getNewRequiredItemsFromForm(),
                    activeDays: this.getNewActiveDaysFromForm(),
                    rewardTypes: this.getNewSelectedRewardTypes()
                };

                return formData;
            },

            validateNewField(fieldId) {
                const field = document.getElementById(fieldId);
                if (!field) {
                    console.warn(`Field with ID ${fieldId} not found`);
                    return false;
                }
                
                const feedback = document.getElementById(`${fieldId}-feedback`);
                let isValid = true;
                let message = '';

                const baseFieldId = fieldId.replace('new', '').toLowerCase();

                switch (baseFieldId) {
                    case 'campaignname':
                        if (!field.value.trim()) {
                            isValid = false;
                            message = 'Campaign name is required';
                        }
                        break;
                    case 'brandname':
                        if (!field.value.trim()) {
                            isValid = false;
                            message = 'Brand name is required';
                        }
                        break;
                    case 'startdate':
                        if (!field.value) {
                            isValid = false;
                            message = 'Start date is required';
                        }
                        break;
                    case 'enddate':
                        if (!field.value) {
                            isValid = false;
                            message = 'End date is required';
                        } else if (field.value && document.getElementById('newStartDate').value && 
                                  new Date(field.value) <= new Date(document.getElementById('newStartDate').value)) {
                            isValid = false;
                            message = 'End date must be after start date';
                        }
                        break;
                }

                field.classList.toggle('is-invalid', !isValid);
                field.classList.toggle('is-valid', isValid && field.value.trim());
                if (feedback) feedback.textContent = message;

                return isValid;
            },

            getNewRequiredItemsFromForm() {
                const items = [];
                document.querySelectorAll('#newRequiredItems .required-item-row').forEach(row => {
                    const quantity = row.querySelector('.item-quantity').value;
                    const itemName = row.querySelector('.item-name').value.trim();
                    
                    if (quantity && itemName) {
                        items.push({
                            quantity: parseInt(quantity),
                            itemName: itemName
                        });
                    }
                });
                return items;
            },

            getNewActiveDaysFromForm() {
                const activeDays = [];
                document.querySelectorAll('#newActiveDays .day-checkbox:checked').forEach(checkbox => {
                    activeDays.push(checkbox.value);
                });
                return activeDays;
            },

            getNewSelectedRewardTypes() {
                const selectedTypes = [];
                document.querySelectorAll('#newRewardTypesSection .reward-type-checkbox:checked').forEach(checkbox => {
                    const card = checkbox.closest('.reward-type-card');
                    const minPurchase = card.querySelector('.reward-min-purchase').value;
                    const maxCount = card.querySelector('.reward-max-count').value;
                    
                    selectedTypes.push({
                        typeId: checkbox.value,
                        criteria: {
                            minPurchaseAmount: parseFloat(minPurchase) || 0,
                            maxRewards: parseInt(maxCount) || 1
                        }
                    });
                });
                return selectedTypes;
            },

            getSelectedRewardTypes() {
                const selectedTypes = [];
                document.querySelectorAll('.reward-type-checkbox:checked').forEach(checkbox => {
                    const card = checkbox.closest('.reward-type-card');
                    const minPurchase = card.querySelector('.reward-min-purchase').value;
                    const maxCount = card.querySelector('.reward-max-count').value;
                    
                    selectedTypes.push({
                        typeId: checkbox.value,
                        criteria: {
                            minPurchaseAmount: parseFloat(minPurchase) || 0,
                            maxRewards: parseInt(maxCount) || 1
                        }
                    });
                });
                return selectedTypes;
            },

            getEditRequiredItemsFromForm() {
                const requiredItems = [];
                document.querySelectorAll('#requiredItems .required-item-row').forEach(row => {
                    const itemQuantity = row.querySelector('.item-quantity').value;
                    const itemName = row.querySelector('.item-name').value;
                    if (itemQuantity && itemName) {
                        requiredItems.push({
                            quantity: parseInt(itemQuantity),
                            itemName: itemName.trim()
                        });
                    }
                });
                return requiredItems;
            },

            getEditActiveDaysFromForm() {
                const activeDays = [];
                document.querySelectorAll('#activeDays .day-checkbox:checked').forEach(checkbox => {
                    activeDays.push(parseInt(checkbox.value));
                });
                return activeDays;
            },

            getEditSelectedRewardTypes() {
                const selectedTypes = [];
                document.querySelectorAll('#rewardTypesSection .reward-type-checkbox:checked').forEach(checkbox => {
                    const card = checkbox.closest('.reward-type-card');
                    const minPurchase = card.querySelector('.reward-min-purchase').value;
                    const maxCount = card.querySelector('.reward-max-count').value;
                    
                    selectedTypes.push({
                        typeId: checkbox.value,
                        criteria: {
                            minPurchaseAmount: parseFloat(minPurchase) || 0,
                            maxRewards: parseInt(maxCount) || 1
                        }
                    });
                });
                return selectedTypes;
            },

            async showRewardTypeManagementModal() {
                // Quick reward type creation modal
                const { value: rewardTypeData } = await Swal.fire({
                    title: 'Create Reward Type',
                    html: `
                        <div class="row g-3">
                            <div class="col-12">
                                <label class="form-label">Reward Name</label>
                                <input id="rewardName" type="text" class="form-control" placeholder="e.g., 10% Discount">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Category</label>
                                <select id="rewardCategory" class="form-select">
                                    <option value="discount">Discount (%)</option>
                                    <option value="voucher">Voucher (R)</option>
                                    <option value="points">Points</option>
                                    <option value="freeItem">Free Item</option>
                                </select>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Value</label>
                                <input id="rewardValue" type="text" class="form-control" placeholder="10">
                            </div>
                            <div class="col-12">
                                <label class="form-label">Description</label>
                                <textarea id="rewardDescription" class="form-control" rows="2" 
                                          placeholder="Brief description of the reward"></textarea>
                            </div>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'Create & Use',
                    preConfirm: () => {
                        const name = document.getElementById('rewardName').value.trim();
                        const category = document.getElementById('rewardCategory').value;
                        const value = document.getElementById('rewardValue').value.trim();
                        const description = document.getElementById('rewardDescription').value.trim();

                        if (!name || !value) {
                            Swal.showValidationMessage('Name and value are required');
                            return false;
                        }

                        return { name, category, value, description };
                    }
                });

                if (rewardTypeData) {
                    // Create the reward type and refresh the list
                    try {
                        const rewardRef = push(ref(rtdb, 'rewardTypes'));
                        await set(rewardRef, {
                            ...rewardTypeData,
                            status: 'active',
                            validityDays: 30,
                            createdAt: new Date().toISOString()
                        });

                        // Reload reward types and refresh the campaign modal
                        await this.loadRewardTypes();
                        
                        Swal.fire({
                            icon: 'success',
                            title: 'Reward Type Created!',
                            text: 'You can now select it in your campaign.',
                            timer: 2000,
                            showConfirmButton: false
                        });

                        // Close this modal and reopen the campaign modal with updated data
                        setTimeout(() => {
                            this.showAddCampaignModal();
                        }, 2000);

                    } catch (error) {
                        console.error('Error creating reward type:', error);
                        Swal.fire({
                            icon: 'error',
                            title: 'Creation Failed',
                            text: 'Failed to create reward type. Please try again.'
                        });
                    }
                }
            },
            async viewCampaign(campaign) {
                Swal.fire({
                    title: campaign.name,
                    html: `
                        <div class="text-left">
                            <p><strong>Brand:</strong> ${campaign.brandName}</p>
                            <p><strong>Store:</strong> ${campaign.storeName || 'All Stores'}</p>
                            <p><strong>Duration:</strong> ${this.formatDate(campaign.startDate)} - ${this.formatDate(campaign.endDate)}</p>
                            <p><strong>Minimum Purchase:</strong> R${campaign.minPurchaseAmount || 0}</p>
                            <p><strong>Status:</strong> ${campaign.status}</p>
                            <p><strong>Created:</strong> ${this.formatDate(campaign.createdAt)}</p>
                            ${campaign.rewardTypes ? `
                            <div class="mt-3">
                            <strong>Reward Types:</strong>
                            <ul>
                                ${campaign.rewardTypes.map(reward => `
                                    <li>${this.availableRewardTypes.find(t => t.id === reward.typeId)?.name || 'Unknown Reward'}
                                        (Min Purchase: R${reward.criteria.minPurchaseAmount}, 
                                        Max Rewards: ${reward.criteria.maxRewards})</li>
                                `).join('')}
                            </ul>
                            </div>
                        ` : ''}
                        </div>
                    `,
                    width: '600px'
                });
            },
            async editCampaign(campaign) {
                let currentTab = 'basic';
                let selectedRewardTypes = campaign.rewardTypes ? [...campaign.rewardTypes] : [];
                
                const itemRowTemplate = `
                    <div class="required-item-row mb-2">
                        <div class="input-group">
                            <input type="number" class="form-control item-quantity" placeholder="Qty" min="1">
                            <input type="text" class="form-control item-name" placeholder="Item Name">
                            <button type="button" class="btn btn-danger btn-sm remove-item">
                                <i class="fas fa-minus"></i>
                            </button>
                            <button type="button" class="btn btn-success btn-sm add-item">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                `;

                Swal.fire({
                    title: '<i class="fas fa-edit text-primary"></i> Edit Campaign',
                    width: '900px',
                    customClass: {
                        popup: 'swal2-campaign-modal'
                    },
                    html: `
                        <div class="campaign-modal-container">
                            <!-- Tab Navigation -->
                            <div class="nav nav-tabs campaign-tabs" role="tablist">
                                <button class="nav-link active" data-tab="basic" type="button">
                                    <i class="fas fa-info-circle"></i> Basic Info
                                </button>
                                <button class="nav-link" data-tab="requirements" type="button">
                                    <i class="fas fa-list-check"></i> Requirements
                                </button>
                                <button class="nav-link" data-tab="rewards" type="button">
                                    <i class="fas fa-gift"></i> Rewards
                                </button>
                            </div>

                            <!-- Tab Content -->
                            <div class="tab-content campaign-tab-content">
                                <!-- Basic Information Tab -->
                                <div class="tab-pane fade show active" id="basic-tab">
                                    <div class="row g-3">
                                        <div class="col-12">
                                            <div class="form-floating">
                                                <input type="text" class="form-control" id="editCampaignName" 
                                                       placeholder="Campaign Name" value="${campaign.name}">
                                                <label for="editCampaignName">
                                                    <i class="fas fa-bullhorn"></i> Campaign Name *
                                                </label>
                                                <div class="invalid-feedback"></div>
                                            </div>
                                        </div>
                                        
                                        <div class="col-md-6">
                                            <div class="form-floating">
                                                <input type="text" class="form-control" id="editBrandName" 
                                                       placeholder="Brand Name" value="${campaign.brandName}">
                                                <label for="editBrandName">
                                                    <i class="fas fa-building"></i> Brand Name *
                                                </label>
                                                <div class="invalid-feedback"></div>
                                            </div>
                                        </div>
                                        
                                        <div class="col-md-6">
                                            <div class="form-floating">
                                                <input type="text" class="form-control" id="editStoreName" 
                                                       placeholder="Store Name" value="${campaign.storeName || ''}">
                                                <label for="editStoreName">
                                                    <i class="fas fa-store"></i> Store Name (Optional)
                                                </label>
                                            </div>
                                        </div>
                                        
                                        <div class="col-md-4">
                                            <div class="form-floating">
                                                <input type="number" class="form-control" id="editMinPurchase" 
                                                       placeholder="0" min="0" step="0.01" value="${campaign.minPurchaseAmount || 0}">
                                                <label for="editMinPurchase">
                                                    <i class="fas fa-dollar-sign"></i> Minimum Purchase (R)
                                                </label>
                                            </div>
                                        </div>
                                        
                                        <div class="col-md-4">
                                            <div class="form-floating">
                                                <select class="form-select" id="editCampaignStatus">
                                                    <option value="active" ${campaign.status === 'active' ? 'selected' : ''}>Active</option>
                                                    <option value="inactive" ${campaign.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                                                    <option value="draft" ${campaign.status === 'draft' ? 'selected' : ''}>Draft</option>
                                                </select>
                                                <label for="editCampaignStatus">
                                                    <i class="fas fa-toggle-on"></i> Status
                                                </label>
                                            </div>
                                        </div>
                                        
                                        <div class="col-md-4">
                                            <div class="form-floating">
                                                <input type="date" class="form-control" id="editStartDate" 
                                                       value="${campaign.startDate || ''}">
                                                <label for="editStartDate">
                                                    <i class="fas fa-calendar-alt"></i> Start Date *
                                                </label>
                                                <div class="invalid-feedback"></div>
                                            </div>
                                        </div>
                                        
                                        <div class="col-md-6">
                                            <div class="form-floating">
                                                <input type="date" class="form-control" id="editEndDate" 
                                                       value="${campaign.endDate || ''}">
                                                <label for="editEndDate">
                                                    <i class="fas fa-calendar-alt"></i> End Date *
                                                </label>
                                                <div class="invalid-feedback"></div>
                                            </div>
                                        </div>
                                        
                                        <div class="col-md-6">
                                            <div class="form-text">
                                                <i class="fas fa-info-circle text-primary"></i>
                                                Campaign will be active between these dates
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Requirements Tab -->
                                <div class="tab-pane fade" id="requirements-tab">
                                    <div class="row g-4">
                                        <!-- Required Items Section -->
                                        <div class="col-12">
                                            <div class="card border-0 shadow-sm">
                                                <div class="card-header bg-light">
                                                    <h6 class="mb-0">
                                                        <i class="fas fa-shopping-cart text-primary"></i> 
                                                        Required Items
                                                    </h6>
                                                    <small class="text-muted">Specify items that must be purchased</small>
                                                </div>
                                                <div class="card-body">
                                                    <div id="requiredItems">
                                                        ${campaign.requiredItems && campaign.requiredItems.length ? 
                                                            campaign.requiredItems.map(item => `
                                                                <div class="required-item-row mb-2">
                                                                    <div class="input-group">
                                                                        <input type="number" class="form-control item-quantity" 
                                                                               placeholder="Qty" min="1" value="${item.quantity}">
                                                                        <input type="text" class="form-control item-name" 
                                                                               placeholder="Item Name" value="${item.itemName}">
                                                                        <button type="button" class="btn btn-danger btn-sm remove-item">
                                                                            <i class="fas fa-minus"></i>
                                                                        </button>
                                                                        <button type="button" class="btn btn-success btn-sm add-item">
                                                                            <i class="fas fa-plus"></i>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            `).join('') 
                                                            : itemRowTemplate
                                                        }
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <!-- Active Days Section -->
                                        <div class="col-12">
                                            <div class="card border-0 shadow-sm">
                                                <div class="card-header bg-light">
                                                    <h6 class="mb-0">
                                                        <i class="fas fa-calendar-week text-primary"></i> 
                                                        Active Days
                                                    </h6>
                                                    <small class="text-muted">Select days when campaign is active</small>
                                                </div>
                                                <div class="card-body">
                                                    <div id="activeDays" class="row g-2">
                                                        ${this.daysOfWeek.map(day => `
                                                            <div class="col-md-3">
                                                                <div class="form-check form-check-card">
                                                                    <input type="checkbox" class="form-check-input day-checkbox" 
                                                                           id="day${day.value}" value="${day.value}"
                                                                           ${campaign.activeDays && campaign.activeDays.includes(day.value) ? 'checked' : ''}>
                                                                    <label class="form-check-label fw-semibold" for="day${day.value}">
                                                                        ${day.label}
                                                                    </label>
                                                                </div>
                                                            </div>
                                                        `).join('')}
                                                    </div>
                                                    <small class="form-text text-muted">Select which days the campaign is active</small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Rewards Tab -->
                                <div class="tab-pane fade" id="rewards-tab">
                                    <div class="row g-4">
                                        <div class="col-12">
                                            <div class="d-flex justify-content-between align-items-center mb-3">
                                                <h6 class="mb-0">
                                                    <i class="fas fa-gift text-primary"></i> 
                                                    Reward Types
                                                </h6>
                                                <button type="button" class="btn btn-outline-primary btn-sm" id="addNewRewardType">
                                                    <i class="fas fa-plus"></i> New Reward Type
                                                </button>
                                            </div>
                                            
                                            <div id="rewardTypesSection" class="reward-types-grid">
                                                ${this.availableRewardTypes.map(type => {
                                                    const isSelected = campaign.rewardTypes && campaign.rewardTypes.some(r => r.typeId === type.id);
                                                    const existingReward = campaign.rewardTypes ? campaign.rewardTypes.find(r => r.typeId === type.id) : null;
                                                    return `
                                                        <div class="reward-type-card ${isSelected ? 'selected' : ''}">
                                                            <div class="card-header">
                                                                <div class="form-check">
                                                                    <input type="checkbox" class="form-check-input reward-type-checkbox" 
                                                                           id="reward-type-${type.id}" value="${type.id}"
                                                                           ${isSelected ? 'checked' : ''}>
                                                                    <label class="form-check-label" for="reward-type-${type.id}">
                                                                        <strong>${type.name}</strong>
                                                                    </label>
                                                                </div>
                                                                <div class="reward-type-info">
                                                                    <small class="text-muted">${type.category}</small>
                                                                    <div class="reward-value">${type.value}</div>
                                                                </div>
                                                            </div>
                                                            <div class="card-body reward-criteria" style="display: ${isSelected ? 'block' : 'none'}">
                                                                <div class="row g-2">
                                                                    <div class="col-md-6">
                                                                        <div class="form-floating">
                                                                            <input type="number" class="form-control reward-min-purchase" 
                                                                                   placeholder="0" min="0" step="0.01"
                                                                                   value="${existingReward ? existingReward.criteria.minPurchaseAmount : 0}">
                                                                            <label>Min Purchase (R)</label>
                                                                        </div>
                                                                    </div>
                                                                    <div class="col-md-6">
                                                                        <div class="form-floating">
                                                                            <input type="number" class="form-control reward-max-count" 
                                                                                   placeholder="1" min="1"
                                                                                   value="${existingReward ? existingReward.criteria.maxRewards : 1}">
                                                                            <label>Max Rewards</label>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div class="mt-2">
                                                                    <small class="text-muted">
                                                                        <i class="fas fa-info-circle"></i>
                                                                        ${type.description || 'Configure reward criteria'}
                                                                    </small>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                            
                                            ${this.availableRewardTypes.length === 0 ? `
                                                <div class="text-center py-4">
                                                    <i class="fas fa-gift fa-3x text-muted mb-3"></i>
                                                    <h6 class="text-muted">No reward types available</h6>
                                                    <p class="text-muted">Create your first reward type to get started</p>
                                                    <button type="button" class="btn btn-primary" id="createFirstRewardType">
                                                        <i class="fas fa-plus"></i> Create Reward Type
                                                    </button>
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `,
                    didOpen: () => {
                        // Tab Navigation
                        document.querySelectorAll('.campaign-tabs .nav-link').forEach(tab => {
                            tab.addEventListener('click', (e) => {
                                // Get the tab button element (in case user clicked on an icon inside)
                                const tabButton = e.target.closest('.nav-link');
                                const targetTab = tabButton ? tabButton.getAttribute('data-tab') : null;
                                
                                // Only proceed if we have a valid targetTab
                                if (!targetTab) {
                                    console.warn('No targetTab found for clicked element');
                                    return;
                                }
                                
                                // Update active tab
                                document.querySelectorAll('.campaign-tabs .nav-link').forEach(t => t.classList.remove('active'));
                                document.querySelectorAll('.tab-pane').forEach(t => {
                                    t.classList.remove('show', 'active');
                                });
                                
                                tabButton.classList.add('active');
                                const targetTabElement = document.getElementById(`${targetTab}-tab`);
                                if (targetTabElement) {
                                    targetTabElement.classList.add('show', 'active');
                                } else {
                                    console.error(`Tab element with ID '${targetTab}-tab' not found`);
                                }
                                
                                currentTab = targetTab;
                            });
                        });

                        // Real-time validation
                        const validationFields = ['editCampaignName', 'editBrandName', 'editStartDate', 'editEndDate'];
                        validationFields.forEach(fieldId => {
                            const field = document.getElementById(fieldId);
                            if (field) {
                                field.addEventListener('input', () => this.clearEditFieldError(fieldId));
                                field.addEventListener('blur', () => this.validateEditField(fieldId));
                            }
                        });

                        // Required items management
                        const setupItemRowEvents = (container) => {
                            container.querySelectorAll('.add-item').forEach(button => {
                                button.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    const itemsContainer = document.getElementById('requiredItems');
                                    const newRow = document.createElement('div');
                                    newRow.innerHTML = itemRowTemplate;
                                    itemsContainer.appendChild(newRow.firstElementChild);
                                    setupItemRowEvents(itemsContainer);
                                });
                            });

                            container.querySelectorAll('.remove-item').forEach(button => {
                                button.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    const rows = document.querySelectorAll('.required-item-row');
                                    if (rows.length > 1) {
                                        e.target.closest('.required-item-row').remove();
                                    }
                                });
                            });
                        };

                        setupItemRowEvents(document.getElementById('requiredItems'));

                        // Reward type management
                        document.querySelectorAll('.reward-type-checkbox').forEach(checkbox => {
                            checkbox.addEventListener('change', (e) => {
                                const card = e.target.closest('.reward-type-card');
                                const criteriaDiv = card ? card.querySelector('.reward-criteria') : null;
                                const typeId = e.target.value;
                                
                                if (!card) {
                                    console.warn('Could not find reward type card for checkbox');
                                    return;
                                }
                                
                                if (e.target.checked) {
                                    card.classList.add('selected');
                                    if (criteriaDiv) {
                                        criteriaDiv.style.display = 'block';
                                    }
                                } else {
                                    card.classList.remove('selected');
                                    if (criteriaDiv) {
                                        criteriaDiv.style.display = 'none';
                                    }
                                }
                            });
                        });

                        // Quick reward type creation
                        const addRewardButtons = document.querySelectorAll('#addNewRewardType, #createFirstRewardType');
                        addRewardButtons.forEach(button => {
                            button.addEventListener('click', () => {
                                this.showRewardTypeManagementModal();
                            });
                        });
                    },
                    showCancelButton: true,
                    confirmButtonText: '<i class="fas fa-save"></i> Update Campaign',
                    cancelButtonText: '<i class="fas fa-times"></i> Cancel',
                    showLoaderOnConfirm: true,
                    preConfirm: () => {
                        return this.validateAndCollectCampaignData();
                    }
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            await update(ref(rtdb, `campaigns/${campaign.id}`), {
                                ...result.value,
                                updatedAt: Date.now()
                            });
                            await this.loadCampaigns();
                            
                            Swal.fire({
                                icon: 'success',
                                title: 'Campaign Updated!',
                                text: 'Your campaign has been updated successfully.',
                                timer: 2000,
                                showConfirmButton: false
                            });
                        } catch (error) {
                            console.error('Error updating campaign:', error);
                            Swal.fire({
                                icon: 'error',
                                title: 'Update Failed',
                                text: 'Failed to update campaign. Please try again.'
                            });
                        }
                    }
                });
            },
            async deleteCampaign(campaign) {
                const result = await Swal.fire({
                    title: 'Delete Campaign?',
                    text: 'This action cannot be undone.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#dc3545',
                    confirmButtonText: 'Yes, delete it!'
                });

                if (result.isConfirmed) {
                    try {
                        // CASCADE DELETE: Clean up campaign references
                        const campaignId = campaign.id;

                        // 1. Get all receipts that reference this campaign
                        const receiptsRef = ref(rtdb, 'receipts');
                        const receiptsSnapshot = await get(receiptsRef);

                        if (receiptsSnapshot.exists()) {
                            const receipts = receiptsSnapshot.val();
                            const updates = {};

                            // Null out campaignId for all receipts referencing this campaign
                            Object.entries(receipts).forEach(([receiptId, receipt]) => {
                                if (receipt.campaignId === campaignId) {
                                    updates[`receipts/${receiptId}/campaignId`] = null;
                                }
                            });

                            // Apply updates if any receipts need to be cleaned up
                            if (Object.keys(updates).length > 0) {
                                await update(ref(rtdb), updates);
                            }
                        }

                        // 2. Delete the campaign itself
                        await remove(ref(rtdb, `campaigns/${campaignId}`));

                        await this.loadCampaigns();
                        Swal.fire('Deleted!', 'Campaign and references have been removed.', 'success');
                    } catch (error) {
                        console.error('Error deleting campaign:', error);
                        Swal.fire('Error', 'Failed to delete campaign', 'error');
                    }
                }
            }
        },
        mounted() {
            this.loadCampaigns();
            this.loadRewardTypes();
        }
    });

    // Mount the app
    try {
        campaignManagement.app.mount(container);
        console.log('Campaign management initialized successfully');
        return campaignManagement.app;
    } catch (error) {
        console.error('Error mounting campaign management app:', error);
        return null;
    }
}

export function cleanupCampaignManagement() {
    if (campaignManagement.app) {
        console.log('Cleaning up campaign management app...');
        try {
            campaignManagement.app.unmount();
        } catch (error) {
            console.warn('Error unmounting campaign management app:', error);
        }
        campaignManagement.app = null;
    }
}