// Campaign Management Module

export function initializeCampaignManagement() {
    const app = Vue.createApp({
        // 1. Expanded data properties
        data() {
            return {
                campaigns: [],
                loading: false,
                showModal: false,
                modalMode: '',
                currentCampaign: null,
                searchQuery: '',
                formData: {
                    name: '',
                    brandName: '',
                    storeName: '',
                    startDate: '',
                    endDate: '',
                    status: 'active',
                    minPurchaseAmount: 0,
                    requiredItems: []
                },
                modalInstance: null  // Added for Bootstrap modal instance
            };
        },

        // 2. Added watcher for modal visibility
        watch: {
            showModal(newValue) {
                console.log('Modal visibility changed:', newValue);
                this.$nextTick(() => {
                    if (newValue) {
                        this.initializeModal();
                    }
                });
            }
        },

        methods: {
            // 3. Added new modal management methods
            initializeModal() {
                console.log('Initializing Bootstrap modal');
                const modalElement = document.querySelector('#campaignModal');
                if (modalElement) {
                    this.modalInstance = new bootstrap.Modal(modalElement, {
                        backdrop: 'static',
                        keyboard: false
                    });
                    this.modalInstance.show();
                } else {
                    console.error('Modal element not found');
                }
            },

            closeModal() {
                console.log('Closing modal');
                if (this.modalInstance) {
                    this.modalInstance.hide();
                }
                this.showModal = false;
                this.modalMode = '';
                console.log('Modal state after close:', this.showModal);
            },

            // Updated existing modal-related methods
            openAddModal() {
                console.log('Opening add modal');
                this.currentCampaign = null;
                this.modalMode = 'add';
                this.resetForm();
                this.formData = {
                    name: '',
                    brandName: '',
                    storeName: '',
                    startDate: new Date().toISOString().split('T')[0],
                    endDate: '', 
                    status: 'active',
                    minPurchaseAmount: 0,
                    requiredItems: []
                };
                this.showModal = true;
                console.log('Show modal set to:', this.showModal);
            },

            viewCampaign(campaign) {
                console.log('View campaign:', campaign);
                this.currentCampaign = campaign;
                this.modalMode = 'view';
                this.formData = { ...campaign };
                this.showModal = true;
                console.log('Show modal set to:', this.showModal);
            },

            editCampaign(campaign) {
                console.log('Edit campaign:', campaign);
                this.currentCampaign = campaign;
                this.modalMode = 'edit';
                this.formData = { ...campaign };
                this.showModal = true;
                console.log('Show modal set to:', this.showModal);
            },

            // ... other existing methods ...
        },

        // 4. Added lifecycle hooks
        mounted() {
            console.log('Campaign Management component mounted');
            this.loadCampaigns();
            
            // Add event listener for Bootstrap modal hidden event
            const modalElement = document.querySelector('#campaignModal');
            if (modalElement) {
                modalElement.addEventListener('hidden.bs.modal', () => {
                    this.showModal = false;
                    this.modalMode = '';
                });
            }
        },
        
        beforeUnmount() {
            // Clean up Bootstrap modal instance
            if (this.modalInstance) {
                this.modalInstance.dispose();
            }
        },

        // 5. Template with updated modal markup
        template: `
            <div class="campaign-management">
                <!-- Existing header and table code remains the same -->

                <!-- Updated Modal Structure -->
                <div id="campaignModal" class="modal fade" tabindex="-1" role="dialog" data-bs-backdrop="static">
                    <div class="modal-dialog modal-lg" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">
                                    {{ modalMode === 'view' ? 'View Campaign' : 
                                       modalMode === 'add' ? 'Add New Campaign' :
                                       'Edit Campaign' }}
                                </h5>
                                <button type="button" class="btn-close" @click="closeModal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <!-- Existing form content remains the same -->
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" @click="closeModal">
                                    {{ modalMode === 'view' ? 'Close' : 'Cancel' }}
                                </button>
                                <button 
                                    v-if="modalMode !== 'view'" 
                                    type="submit" 
                                    class="btn btn-primary"
                                >
                                    {{ modalMode === 'add' ? 'Create Campaign' : 'Update Campaign' }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `
    });

    try {
        app.mount('#campaignManagementRoot');
        console.log('Campaign management component mounted successfully');
    } catch (error) {
        console.error('Error mounting campaign management:', error);
    }
}

export function loadCampaigns() {
    if (app && app._instance) {
        app._instance.proxy.loadCampaigns();
    }
}