export function initializeCampaignManagement() {
    if (typeof Vue === 'undefined') {
        console.error('Vue is not loaded. Cannot initialize campaign management.');
        return;
    }

    console.log('Initializing campaign management with Vue:', Vue.version);
    
    const { createApp, ref, computed } = Vue;
    
    const app = createApp({
        data() {
            return {
                campaigns: [],
                loading: false,
                error: null,
                filters: {
                    brandName: '',
                    status: ''
                },
                daysOfWeek: [
                    { value: 0, label: 'Sunday' },
                    { value: 1, label: 'Monday' },
                    { value: 2, label: 'Tuesday' },
                    { value: 3, label: 'Wednesday' },
                    { value: 4, label: 'Thursday' },
                    { value: 5, label: 'Friday' },
                    { value: 6, label: 'Saturday' }
                ],
                selectedRewardTypes: [],
                rewardCriteria: {},
                availableRewardTypes: []
            };
        },
        template: `
            <div class="campaign-management">
                <div class="header d-flex justify-content-between align-items-center mb-4">
                    <h2>Campaign Management</h2>
                    <div class="controls d-flex gap-2">
                        <input 
                            type="text" 
                            class="form-control" 
                            v-model="filters.brandName" 
                            placeholder="Search campaigns...">
                        <select 
                            class="form-select" 
                            v-model="filters.status">
                            <option value="">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="draft">Draft</option>
                        </select>
                        <button 
                            class="btn btn-primary"
                            @click="showAddCampaignModal">
                            <i class="fas fa-plus"></i> New Campaign
                        </button>
                    </div>
                </div>

                <!-- Loading State -->
                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary"></div>
                    <p class="mt-2">Loading campaigns...</p>
                </div>

                <!-- Error State -->
                <div v-else-if="error" class="alert alert-danger">
                    {{ error }}
                </div>

                <!-- Campaign List -->
                <div v-else class="campaign-list">
                    <div v-if="filteredCampaigns.length === 0" class="alert alert-info">
                        No campaigns found. Click "New Campaign" to create one.
                    </div>
                    <div v-else class="row">
                        <div v-for="campaign in filteredCampaigns" 
                             :key="campaign.id"
                             class="col-md-6 col-lg-4 mb-4">
                            <div class="card h-100">
                                <div class="card-header d-flex justify-content-between align-items-center">
                                    <h5 class="mb-0">{{ campaign.name }}</h5>
                                    <span :class="getStatusBadgeClass(campaign.status)">
                                        {{ campaign.status }}
                                    </span>
                                </div>
                                <div class="card-body">
                                    <p><strong>Brand:</strong> {{ campaign.brandName }}</p>
                                    <p><strong>Store:</strong> {{ campaign.storeName || 'All Stores' }}</p>
                                    <p><strong>Duration:</strong> {{ formatDate(campaign.startDate) }} - {{ formatDate(campaign.endDate) }}</p>
                                    <p v-if="campaign.minPurchaseAmount">
                                        <strong>Min. Purchase:</strong> R{{ campaign.minPurchaseAmount }}
                                    </p>
                                    <div v-if="campaign.requiredItems && campaign.requiredItems.length">
                                        <strong>Required Items:</strong>
                                        <ul class="list-unstyled">
                                            <li v-for="item in campaign.requiredItems" :key="item.name">
                                                {{ item.quantity }}x {{ item.name }}
                                            </li>
                                        </ul>
                                    </div>
                                    <div v-if="campaign.activeDays && campaign.activeDays.length">
                                        <strong>Active Days:</strong>
                                        <p class="mb-0">{{ formatActiveDays(campaign.activeDays) }}</p>
                                    </div>
                                </div>
                                <div class="card-footer">
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-info" @click="viewCampaign(campaign)">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-warning" @click="editCampaign(campaign)">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-danger" @click="deleteCampaign(campaign)">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
    <!-- Add this section after existing campaign fields in the form -->
    <div class="form-group" v-if="showRewardTypeSection">
        <h5>Campaign Rewards</h5>
        <div class="reward-types-container">
            <div v-for="type in availableRewardTypes" :key="type.id" class="reward-type-item">
                <div class="form-check">
                    <input type="checkbox" 
                        class="form-check-input" 
                        :id="'reward-type-' + type.id"
                        v-model="selectedRewardTypes"
                        :value="type.id">
                    <label class="form-check-label" :for="'reward-type-' + type.id">
                        {{ type.name }}
                    </label>
                </div>
                <div v-if="isRewardTypeSelected(type.id)" class="reward-criteria mt-2">
                    <div class="form-row">
                        <div class="col">
                            <label>Minimum Purchase Amount</label>
                            <input type="number" 
                                class="form-control" 
                                v-model="rewardCriteria[type.id].minPurchaseAmount">
                        </div>
                        <div class="col">
                            <label>Maximum Rewards</label>
                            <input type="number" 
                                class="form-control" 
                                v-model="rewardCriteria[type.id].maxRewards">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
`,

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
                this.loading = true;
                try {
                    const snapshot = await firebase.database().ref('campaigns').once('value');
                    const campaigns = snapshot.val();
                    this.campaigns = campaigns ? Object.entries(campaigns).map(([id, data]) => ({
                        id,
                        ...data
                    })) : [];
                    console.log('Loaded campaigns:', this.campaigns);
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                    this.error = 'Failed to load campaigns';
                } finally {
                    this.loading = false;
                }
            },
            async loadRewardTypes() {
                try {
                    const snapshot = await firebase.database()
                        .ref('rewardTypes')
                        .orderByChild('status')
                        .equalTo('active')
                        .once('value');
                    
                    this.availableRewardTypes = Object.entries(snapshot.val() || {})
                        .map(([id, data]) => ({ id, ...data }));
                } catch (error) {
                    console.error('Error loading reward types:', error);
                }
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
                const items = [];
                document.querySelectorAll('.required-item-row').forEach(row => {
                    const quantity = row.querySelector('.item-quantity').value;
                    const name = row.querySelector('.item-name').value;
                    if (quantity && name) {
                        items.push({
                            quantity: parseInt(quantity),
                            name: name.trim()
                        });
                    }
                });
                return items;
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
                const itemRowTemplate = `
                    <div class="required-item-row mb-2">
                        <div class="input-group">
                            <input type="number" class="form-control item-quantity" placeholder="Qty" min="1">
                            <input type="text" class="form-control item-name" placeholder="Item Name">
                            <button type="button" class="btn btn-danger remove-item">-</button>
                            <button type="button" class="btn btn-success add-item">+</button>
                        </div>
                    </div>
                `;
            
                const { value: formValues } = await Swal.fire({
                    title: 'Create New Campaign',
                    width: 800,
                    html: `
                        <div class="container">
                            <div class="row mb-3">
                                <div class="col">
                                    <input id="campaignName" class="form-control" placeholder="Campaign Name">
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col">
                                    <input id="brandName" class="form-control" placeholder="Brand Name">
                                </div>
                                <div class="col">
                                    <input id="storeName" class="form-control" placeholder="Store Name (optional)">
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col">
                                    <input id="minPurchase" class="form-control" type="number" placeholder="Minimum Purchase Amount">
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col">
                                    <input id="startDate" class="form-control" type="date">
                                </div>
                                <div class="col">
                                    <input id="endDate" class="form-control" type="date">
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col">
                                    <h6>Required Items</h6>
                                    <div id="requiredItems">
                                        ${itemRowTemplate}
                                    </div>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col">
                                    <h6>Active Days</h6>
                                    <div id="activeDays" class="weekday-selector-grid">
                                        ${this.daysOfWeek.map(day => `
                                            <div class="weekday-item">
                                                <input 
                                                    type="checkbox" 
                                                    class="form-check-input day-checkbox" 
                                                    id="day${day.value}" 
                                                    value="${day.value}"
                                                    checked
                                                >
                                                <label 
                                                    class="form-check-label" 
                                                    for="day${day.value}"
                                                >
                                                    ${day.label}
                                                </label>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col">
                                <h6>Campaign Rewards</h6>
                                <div id="rewardTypesSection">
                                    ${this.availableRewardTypes.map(type => `
                                        <div class="reward-type-item">
                                            <div class="form-check">
                                                <input type="checkbox" 
                                                    class="form-check-input" 
                                                    id="reward-type-${type.id}"
                                                    value="${type.id}">
                                                <label class="form-check-label" for="reward-type-${type.id}">
                                                    ${type.name}
                                                </label>
                                            </div>
                                            <div class="reward-criteria mt-2" style="display:none;">
                                                <div class="form-row">
                                                    <div class="col">
                                                        <label>Minimum Purchase Amount</label>
                                                        <input type="number" 
                                                            class="form-control reward-min-purchase" 
                                                            data-type-id="${type.id}">
                                                    </div>
                                                    <div class="col">
                                                        <label>Maximum Rewards</label>
                                                        <input type="number" 
                                                            class="form-control reward-max-rewards" 
                                                            data-type-id="${type.id}">
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    `,
                    didOpen: () => {
                        // Add event listener for adding new item rows
                        document.querySelectorAll('.add-item').forEach(button => {
                            button.addEventListener('click', (e) => {
                                const newRow = document.createElement('div');
                                newRow.innerHTML = itemRowTemplate;
                                e.target.closest('.required-item-row').insertAdjacentElement('afterend', newRow.firstElementChild);
                            });
                        });
            
                        // Add event listener for removing item rows
                        document.querySelectorAll('.remove-item').forEach(button => {
                            button.addEventListener('click', (e) => {
                                const rows = document.querySelectorAll('.required-item-row');
                                if (rows.length > 1) {
                                    e.target.closest('.required-item-row').remove();
                                }
                            });
                        });
                        document.querySelectorAll('#rewardTypesSection input[type="checkbox"]').forEach(checkbox => {
                            checkbox.addEventListener('change', (e) => {
                                const criteriaDiv = e.target.closest('.reward-type-item').querySelector('.reward-criteria');
                                criteriaDiv.style.display = e.target.checked ? 'block' : 'none';
                            });
                        });
                    },
                    showCancelButton: true,
                    confirmButtonText: 'Create',
                    preConfirm: () => {
                        const requiredItems = this.getRequiredItemsFromForm();
                        const activeDays = this.getActiveDaysFromForm();
                        
                        // Validate required fields
                        const name = document.getElementById('campaignName').value;
                        const brandName = document.getElementById('brandName').value;
                        if (!name || !brandName) {
                            Swal.showValidationMessage('Campaign name and brand name are required');
                            return false;
                        }
                        const selectedRewardTypes = [];
                        document.querySelectorAll('#rewardTypesSection input[type="checkbox"]:checked').forEach(checkbox => {
                            const typeId = checkbox.value;
                            const minPurchase = document.querySelector(`.reward-min-purchase[data-type-id="${typeId}"]`)?.value || 0;
                            const maxRewards = document.querySelector(`.reward-max-rewards[data-type-id="${typeId}"]`)?.value || 0;
                            
                            selectedRewardTypes.push({
                                typeId,
                                criteria: {
                                    minPurchaseAmount: parseFloat(minPurchase),
                                    maxRewards: parseInt(maxRewards)
                                }
                            });
                        });
                        return {
                            name,
                            brandName,
                            storeName: document.getElementById('storeName').value,
                            minPurchaseAmount: parseFloat(document.getElementById('minPurchase').value) || 0,
                            startDate: document.getElementById('startDate').value,
                            endDate: document.getElementById('endDate').value,
                            requiredItems,
                            activeDays,
                            rewardTypes: selectedRewardTypes,
                            status: 'active'
                        };
                    }
                });
            
                if (formValues) {
                    this.createCampaign(formValues);
                }
            },
            

            async createCampaign(campaignData) {
                try {
                    const campaignRef = firebase.database().ref('campaigns').push();
                    await campaignRef.set({
                        ...campaignData,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    });
                    await this.loadCampaigns();
                    Swal.fire('Success', 'Campaign created successfully', 'success');
                } catch (error) {
                    console.error('Error creating campaign:', error);
                    Swal.fire('Error', 'Failed to create campaign', 'error');
                }
            },

            viewCampaign(campaign) {
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

            editCampaign(campaign) {
                const itemRowTemplate = `
                    <div class="required-item-row mb-2">
                        <div class="input-group">
                            <input type="number" class="form-control item-quantity" placeholder="Qty" min="1">
                            <input type="text" class="form-control item-name" placeholder="Item Name">
                            <button type="button" class="btn btn-danger remove-item">-</button>
                            <button type="button" class="btn btn-success add-item">+</button>
                        </div>
                    </div>
                `;
            
                Swal.fire({
                    title: 'Edit Campaign',
                    width: 800,
                    html: `
                        <div class="container">
                            <div class="row mb-3">
                                <div class="col">
                                    <input id="campaignName" class="form-control" placeholder="Campaign Name" value="${campaign.name}">
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col">
                                    <input id="brandName" class="form-control" placeholder="Brand Name" value="${campaign.brandName}">
                                </div>
                                <div class="col">
                                    <input id="storeName" class="form-control" placeholder="Store Name (optional)" value="${campaign.storeName || ''}">
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col">
                                    <input id="minPurchase" class="form-control" type="number" placeholder="Minimum Purchase Amount" value="${campaign.minPurchaseAmount || 0}">
                                </div>
                                <div class="col">
                                    <select id="campaignStatus" class="form-control">
                                        <option value="active" ${campaign.status === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="inactive" ${campaign.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                                        <option value="draft" ${campaign.status === 'draft' ? 'selected' : ''}>Draft</option>
                                    </select>
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col">
                                    <input id="startDate" class="form-control" type="date" value="${campaign.startDate || ''}">
                                </div>
                                <div class="col">
                                    <input id="endDate" class="form-control" type="date" value="${campaign.endDate || ''}">
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col">
                                    <h6>Required Items</h6>
                                    <div id="requiredItems">
                                        ${campaign.requiredItems && campaign.requiredItems.length ? 
                                            campaign.requiredItems.map(item => `
                                                <div class="required-item-row mb-2">
                                                    <div class="input-group">
                                                        <input type="number" class="form-control item-quantity" placeholder="Qty" min="1" value="${item.quantity}">
                                                        <input type="text" class="form-control item-name" placeholder="Item Name" value="${item.name}">
                                                        <button type="button" class="btn btn-danger remove-item">-</button>
                                                        <button type="button" class="btn btn-success add-item">+</button>
                                                    </div>
                                                </div>
                                            `).join('') 
                                            : itemRowTemplate
                                        }
                                    </div>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col">
                                    <h6>Active Days</h6>
                                    <div id="activeDays" class="weekday-selector-grid">
                                        ${this.daysOfWeek.map(day => `
                                            <div class="weekday-item">
                                                <input 
                                                    type="checkbox" 
                                                    class="form-check-input day-checkbox" 
                                                    id="day${day.value}" 
                                                    value="${day.value}"
                                                    ${campaign.activeDays && campaign.activeDays.includes(day.value) ? 'checked' : ''}
                                                >
                                                <label 
                                                    class="form-check-label" 
                                                    for="day${day.value}"
                                                >
                                                    ${day.label}
                                                </label>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `,
                    didOpen: () => {
                        // Add event listener for adding new item rows
                        document.querySelectorAll('.add-item').forEach(button => {
                            button.addEventListener('click', (e) => {
                                const newRow = document.createElement('div');
                                newRow.innerHTML = itemRowTemplate;
                                e.target.closest('.required-item-row').insertAdjacentElement('afterend', newRow.firstElementChild);
                            });
                        });
            
                        // Add event listener for removing item rows
                        document.querySelectorAll('.remove-item').forEach(button => {
                            button.addEventListener('click', (e) => {
                                const rows = document.querySelectorAll('.required-item-row');
                                if (rows.length > 1) {
                                    e.target.closest('.required-item-row').remove();
                                }
                            });
                        });

                            // Add reward type checkbox handlers
                        document.querySelectorAll('#rewardTypesSection input[type="checkbox"]').forEach(checkbox => {
                            checkbox.addEventListener('change', (e) => {
                                const criteriaDiv = e.target.closest('.reward-type-item').querySelector('.reward-criteria');
                                criteriaDiv.style.display = e.target.checked ? 'block' : 'none';
                            });
                        });
                    },
                    showCancelButton: true,
                    confirmButtonText: 'Update',
                    preConfirm: () => {
                        const requiredItems = this.getRequiredItemsFromForm();
                        const activeDays = this.getActiveDaysFromForm();
                        
                        // Validate required fields
                        const name = document.getElementById('campaignName').value;
                        const brandName = document.getElementById('brandName').value;
                        if (!name || !brandName) {
                            Swal.showValidationMessage('Campaign name and brand name are required');
                            return false;
                        }
                            // Collect selected reward types and their criteria
                        const selectedRewardTypes = [];
                        document.querySelectorAll('#rewardTypesSection input[type="checkbox"]:checked').forEach(checkbox => {
                            const typeId = checkbox.value;
                            const minPurchase = document.querySelector(`.reward-min-purchase[data-type-id="${typeId}"]`)?.value || 0;
                            const maxRewards = document.querySelector(`.reward-max-rewards[data-type-id="${typeId}"]`)?.value || 0;
                            
                            selectedRewardTypes.push({
                                typeId,
                                criteria: {
                                    minPurchaseAmount: parseFloat(minPurchase),
                                    maxRewards: parseInt(maxRewards)
                                }
                            });
                        });
                        
                        return {
                            name,
                            brandName,
                            storeName: document.getElementById('storeName').value,
                            minPurchaseAmount: parseFloat(document.getElementById('minPurchase').value) || 0,
                            startDate: document.getElementById('startDate').value,
                            endDate: document.getElementById('endDate').value,
                            status: document.getElementById('campaignStatus').value,
                            requiredItems,
                            rewardTypes: selectedRewardTypes,
                            activeDays
                        };
                    }
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            await firebase.database().ref(`campaigns/${campaign.id}`).update({
                                ...result.value,
                                updatedAt: Date.now()
                            });
                            await this.loadCampaigns();
                            Swal.fire('Updated!', 'Campaign has been updated successfully.', 'success');
                        } catch (error) {
                            console.error('Error updating campaign:', error);
                            Swal.fire('Error', 'Failed to update campaign', 'error');
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
                        await firebase.database().ref(`campaigns/${campaign.id}`).remove();
                        await this.loadCampaigns();
                        Swal.fire('Deleted!', 'Campaign has been deleted.', 'success');
                    } catch (error) {
                        console.error('Error deleting campaign:', error);
                        Swal.fire('Error', 'Failed to delete campaign', 'error');
                    }
                }
            }
        },

        mounted() {
            console.log('Campaign management component mounted');
            this.loadRewardTypes();
            this.loadCampaigns();
        }
    });

    // Mount the app to the campaign management container
    const mountPoint = document.getElementById('campaignManagementContent');
    if (mountPoint) {
        app.mount(mountPoint);
        console.log('Campaign management initialized');
    } else {
        console.error('Campaign management mount point not found');
    }

    return app;
}