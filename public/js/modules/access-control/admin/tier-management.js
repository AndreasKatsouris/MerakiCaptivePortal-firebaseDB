/**
 * Admin Tier Management
 * Version: 1.0.0-2025-05-13
 * 
 * Provides UI and logic for administrators to manage subscription tiers
 * Allows viewing and editing tier details (name, description, price, features, limits)
 */

import { rtdb, ref, get, set, update, push, remove } from '../../../config/firebase-config.js';

// Implement local showToast in case the utility isn't available
function showToast(message, type = 'info', duration = 3000) {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: duration,
      timerProgressBar: true,
      icon: type,
      title: message
    });
  } else {
    console.log(`Toast [${type}]: ${message}`);
  }
}

// Default tier definitions
const DEFAULT_TIERS = {
  'basic': {
    name: 'Basic Tier',
    description: 'Basic access tier with limited features',
    monthlyPrice: 0,
    annualPrice: 0,
    features: { wifiBasic: true },
    limits: { sessionTime: 30 }
  },
  'premium': {
    name: 'Premium Tier',
    description: 'Premium access tier with enhanced features',
    monthlyPrice: 9.99,
    annualPrice: 99.99,
    features: { wifiBasic: true, wifiPremium: true },
    limits: { sessionTime: 120 }
  }
};

// Define the path in Firebase where tier definitions are stored
const TIER_DEFINITIONS_PATH = 'subscriptionTiers';

// Initialize a global variable for the Vue app instance
let adminTierManagementApp = null;

/**
 * The AdminTierManagement Vue component
 */
const AdminTierManagement = {  
  // Watch the loading state for changes
  watch: {
    isLoading(newVal, oldVal) {
      console.log('[TierManagement] isLoading changed:', oldVal, '->', newVal);
    }
  },
  data() {
    return {
      tiers: {},
      isLoading: true,
      loadingTimedOut: false,
      editingTierId: null,
      isAddingNewTier: false,
      editFormData: {},
      availableFeatures: [],
      availableLimits: [],
      modalInstance: null
    };
  },
  
  async mounted() {
    console.log('[TierManagement] Component mounted');
    try {
      // Check if we should skip loading animation
      if (this.$skipLoading) {
        console.log('[TierManagement] Skipping loading animation due to $skipLoading flag');
        this.isLoading = false;
        // Load data in background
        this.loadTierDefinitionsBackground();
        return;
      }
      
      // Set a timeout to detect if loading hangs
      setTimeout(() => {
        if (this.isLoading) {
          console.log('[TierManagement] Loading timed out after 10 seconds');
          this.loadingTimedOut = true;
        }
      }, 10000);
      
      // Load data immediately
      this.loadTierDefinitions();
      console.log('[TierManagement] Data loading initiated');
    } catch (error) {
      console.error('[TierManagement] Error in mounted:', error);
      this.isLoading = false;
    }
  },
  
  methods: {
    /**
     * Load tier definitions from Firebase
     */
    /**
     * Load tier definitions in background (without showing loading state)
     */
    async loadTierDefinitionsBackground() {
      console.log('[TierManagement] Loading tier definitions in background');
      
      try {
        // Create reference and fetch data
        const tierRef = ref(rtdb, TIER_DEFINITIONS_PATH);
        const snapshot = await get(tierRef);
        
        // Get the data or use default tiers if null
        if (snapshot.exists()) {
          this.tiers = snapshot.val();
          console.log('[TierManagement] Loaded', Object.keys(this.tiers).length, 'tiers from database (background)');
        } else {
          console.log('[TierManagement] No tiers found in database, using default tiers (background)');
          this.tiers = DEFAULT_TIERS;
        }
        
        // Ensure proper structure
        this.ensureTierStructure();
        
        // Update features and limits
        this.populateAvailableFeaturesAndLimits();
        
        console.log('[TierManagement] Background loading completed successfully');
      } catch (error) {
        console.error('[TierManagement] Error loading tier definitions in background:', error);
        
        // Use default tiers on error
        this.tiers = DEFAULT_TIERS;
        this.ensureTierStructure();
        this.populateAvailableFeaturesAndLimits();
        
        showToast('Error loading subscription tiers.', 'error');
      }
    },
    
    /**
     * Force complete loading (failsafe)
     */
    forceLoadComplete() {
      console.log('[TierManagement] Manually forcing load completion');
      // Apply default data if needed
      if (Object.keys(this.tiers).length === 0) {
        this.tiers = DEFAULT_TIERS;
        this.ensureTierStructure();
        this.populateAvailableFeaturesAndLimits();
      }
      // Force to false
      this.isLoading = false;
      showToast('Tier management loaded.', 'success');
    },

    /**
     * Load tier definitions from Firebase
     */
    async loadTierDefinitions() {
      console.log('[TierManagement] Setting isLoading to true');
      this.isLoading = true;
      
      try {
        console.log('[TierManagement] Loading tier definitions from Firebase path:', TIER_DEFINITIONS_PATH);
        
        // Create reference and fetch data
        const tierRef = ref(rtdb, TIER_DEFINITIONS_PATH);
        const snapshot = await get(tierRef);
        
        // Get the data or use default tiers if null
        if (snapshot.exists()) {
          this.tiers = snapshot.val();
          console.log('[TierManagement] Loaded', Object.keys(this.tiers).length, 'tiers from database');
        } else {
          console.log('[TierManagement] No tiers found in database, using default tiers');
          this.tiers = DEFAULT_TIERS;
        }
        
        // Ensure proper structure
        this.ensureTierStructure();
        
        // Update features and limits
        this.populateAvailableFeaturesAndLimits();
        
        // Force a repaint before changing loading state
        setTimeout(() => {
          console.log('[TierManagement] Setting isLoading to false');
          this.isLoading = false;
          console.log('[TierManagement] Current isLoading state:', this.isLoading);
        }, 500);
      } catch (error) {
        console.error('[TierManagement] Error loading tier definitions:', error);
        
        // Use default tiers on error
        this.tiers = DEFAULT_TIERS;
        this.ensureTierStructure();
        this.populateAvailableFeaturesAndLimits();
        
        // Force a repaint before changing loading state
        setTimeout(() => {
          console.log('[TierManagement] Setting isLoading to false (after error)');
          this.isLoading = false;
          console.log('[TierManagement] Current isLoading state (after error):', this.isLoading);
        }, 500);
        showToast('Error loading subscription tiers.', 'error');
      }
    },
    
    /**
     * Ensure all tiers have proper structure
     */
    ensureTierStructure() {
      Object.keys(this.tiers).forEach(tierId => {
        const tier = this.tiers[tierId];
        
        // Ensure features and limits objects exist
        if (!tier.features || typeof tier.features !== 'object') {
          tier.features = {};
        }
        
        if (!tier.limits || typeof tier.limits !== 'object') {
          tier.limits = {};
        }
      });
    },
    
    /**
     * Save tiers to Firebase
     */
    async saveAllTiersToFirebase() {
      try {
        await set(ref(rtdb, TIER_DEFINITIONS_PATH), this.tiers);
        showToast('Subscription tiers saved successfully.', 'success');
      } catch (error) {
        console.error('[TierManagement] Error saving tiers:', error);
        showToast('Failed to save subscription tiers.', 'error');
      }
    },
    
    /**
     * Populate available features and limits
     */
    populateAvailableFeaturesAndLimits() {
      const featuresSet = new Set();
      const limitsSet = new Set();
      
      Object.values(this.tiers).forEach(tier => {
        if (tier.features) {
          Object.keys(tier.features).forEach(key => featuresSet.add(key));
        }
        
        if (tier.limits) {
          Object.keys(tier.limits).forEach(key => limitsSet.add(key));
        }
      });
      
      this.availableFeatures = [...featuresSet].sort();
      this.availableLimits = [...limitsSet].sort();
    },
    
    /**
     * Check if a feature is enabled
     */
    isFeatureEnabled(tier, featureKey) {
      return tier && 
             tier.features && 
             typeof tier.features === 'object' && 
             tier.features[featureKey] === true;
    },
    
    /**
     * Get formatted limit value
     */
    getFormattedLimit(tier, limitKey) {
      if (!tier || !tier.limits || typeof tier.limits !== 'object') {
        return 'N/A';
      }
      
      return this.formatLimitValue(tier.limits[limitKey]);
    },
    
    /**
     * Format a limit value
     */
    formatLimitValue(value) {
      if (value === undefined || value === null) {
        return 'N/A';
      }
      
      return value.toString();
    },
    
    /**
     * Start editing a tier
     */
    editTier(tierId) {
      if (!this.tiers[tierId]) {
        showToast('Tier not found.', 'error');
        return;
      }
      
      // Create a deep copy of the tier data
      this.editFormData = JSON.parse(JSON.stringify(this.tiers[tierId]));
      this.editingTierId = tierId;
      this.isAddingNewTier = false;
      
      // Initialize the modal
      if (!this.modalInstance) {
        const modalEl = document.getElementById('editTierModal');
        if (modalEl) {
          this.modalInstance = new bootstrap.Modal(modalEl);
        }
      }
      
      // Show the modal
      if (this.modalInstance) {
        this.modalInstance.show();
      } else {
        showToast('Could not initialize modal.', 'error');
      }
    },
    
    /**
     * Add a new tier
     */
    startAddNewTier() {
      // Create empty form data
      this.editFormData = {
        name: '',
        description: '',
        monthlyPrice: 0,
        annualPrice: 0,
        features: {},
        limits: {}
      };
      
      // Add existing features and limits with default values
      this.availableFeatures.forEach(feature => {
        this.editFormData.features[feature] = false;
      });
      
      this.availableLimits.forEach(limit => {
        this.editFormData.limits[limit] = 0;
      });
      
      this.editingTierId = null;
      this.isAddingNewTier = true;
      
      // Initialize the modal
      if (!this.modalInstance) {
        const modalEl = document.getElementById('editTierModal');
        if (modalEl) {
          this.modalInstance = new bootstrap.Modal(modalEl);
        }
      }
      
      // Show the modal
      if (this.modalInstance) {
        this.modalInstance.show();
      } else {
        showToast('Could not initialize modal.', 'error');
      }
    },
    
    /**
     * Cancel editing
     */
    cancelEdit() {
      this.editFormData = {};
      this.editingTierId = null;
      this.isAddingNewTier = false;
      
      if (this.modalInstance) {
        this.modalInstance.hide();
      }
    },
    
    /**
     * Save changes
     */
    async saveChanges() {
      // Validate form
      if (!this.editFormData.name || !this.editFormData.description) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }
      
      try {
        // Create a clean version of the form data
        const tierData = {
          name: this.editFormData.name,
          description: this.editFormData.description,
          monthlyPrice: parseFloat(this.editFormData.monthlyPrice) || 0,
          annualPrice: parseFloat(this.editFormData.annualPrice) || 0,
          features: this.editFormData.features,
          limits: this.editFormData.limits
        };
        
        if (this.isAddingNewTier) {
          // Generate tier ID from name
          const tierId = tierData.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          // Add to tiers object
          this.tiers[tierId] = tierData;
          
          // Save to Firebase
          await set(ref(rtdb, `${TIER_DEFINITIONS_PATH}/${tierId}`), tierData);
          
          showToast(`Tier "${tierData.name}" added successfully.`, 'success');
        } else {
          // Update existing tier
          this.tiers[this.editingTierId] = tierData;
          
          // Save to Firebase
          await set(ref(rtdb, `${TIER_DEFINITIONS_PATH}/${this.editingTierId}`), tierData);
          
          showToast(`Tier "${tierData.name}" updated successfully.`, 'success');
        }
        
        // Update available features and limits
        this.populateAvailableFeaturesAndLimits();
        
        // Hide the modal
        this.cancelEdit();
      } catch (error) {
        console.error('[TierManagement] Error saving tier:', error);
        showToast('Failed to save tier.', 'error');
      }
    },
    
    /**
     * Add a new feature to the editing tier
     */
    addNewFeature() {
      const featureName = prompt('Enter new feature name (camelCase):');
      
      if (featureName && featureName.trim() !== '') {
        // Add to the form data
        this.$set(this.editFormData.features, featureName, true);
        
        // Add to available features
        if (!this.availableFeatures.includes(featureName)) {
          this.availableFeatures.push(featureName);
          this.availableFeatures.sort();
        }
      }
    },
    
    /**
     * Add a new limit to the editing tier
     */
    addNewLimit() {
      const limitName = prompt('Enter new limit name (camelCase):');
      
      if (limitName && limitName.trim() !== '') {
        // Add to the form data
        this.$set(this.editFormData.limits, limitName, 0);
        
        // Add to available limits
        if (!this.availableLimits.includes(limitName)) {
          this.availableLimits.push(limitName);
          this.availableLimits.sort();
        }
      }
    },
    
    /**
     * Delete a tier
     */
    async confirmDeleteTier(tierId) {
      if (!this.tiers[tierId]) {
        showToast('Tier not found.', 'error');
        return;
      }
      
      // Confirm deletion
      if (confirm(`Are you sure you want to delete the "${this.tiers[tierId].name}" tier?`)) {
        try {
          // Remove from tiers object
          const tierName = this.tiers[tierId].name;
          delete this.tiers[tierId];
          
          // Remove from Firebase
          await remove(ref(rtdb, `${TIER_DEFINITIONS_PATH}/${tierId}`));
          
          // Update available features and limits
          this.populateAvailableFeaturesAndLimits();
          
          showToast(`Tier "${tierName}" deleted successfully.`, 'success');
        } catch (error) {
          console.error('[TierManagement] Error deleting tier:', error);
          showToast('Failed to delete tier.', 'error');
        }
      }
    }
  },
  
  computed: {
    /**
     * Get feature display name
     */
    getFeatureDisplay() {
      return (featureKey) => {
        // Convert camelCase to Title Case
        return featureKey
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (str) => str.toUpperCase());
      };
    },
    
    /**
     * Get limit display name
     */
    getLimitDisplay() {
      return (limitKey) => {
        // Convert camelCase to Title Case
        return limitKey
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (str) => str.toUpperCase());
      };
    }
  },
  
  updated() {
    console.log('[TierManagement] Component updated, isLoading:', this.isLoading);
  },
  
  template: `
    <div class="admin-tier-management card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h4 class="mb-0">Subscription Tier Management</h4>
        <button type="button" class="btn btn-primary" @click="startAddNewTier">
          <i class="fas fa-plus"></i> Add New Tier
        </button>
      </div>
      <div class="card-body">
        <div v-if="isLoading" class="text-center py-4">
          <div v-if="!loadingTimedOut" class="spinner-border text-primary mb-3" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <div v-else class="alert alert-warning mb-3">
            <i class="fas fa-exclamation-triangle me-2"></i>Loading is taking longer than expected
          </div>
          <p class="mb-0" v-if="!loadingTimedOut">Loading tier definitions...</p>
          <p class="mb-1" v-else>Tier data could not be loaded automatically.</p>
          <button class="btn btn-primary mt-2" @click="forceLoadComplete">
            <i class="fas fa-sync-alt me-1"></i> {{ loadingTimedOut ? 'Load Default Tiers' : 'Force Load Completion' }}
          </button>
        </div>
        <div v-else-if="Object.keys(tiers).length === 0" class="alert alert-info">
          <p class="mb-0">No subscription tiers defined. Click "Add New Tier" to create one.</p>
        </div>
        <div v-else class="table-responsive">
          <table class="table table-striped table-hover">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Monthly Price</th>
                <th>Annual Price</th>
                <th>Features</th>
                <th>Limits</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(tier, tierId) in tiers" :key="tierId">
                <td>{{ tier.name }}</td>
                <td>{{ tier.description }}</td>
                <td>{{ tier.monthlyPrice || 0 }}</td>
                <td>{{ tier.annualPrice || 0 }}</td>
                <td>
                  <span v-if="availableFeatures.length === 0">No features defined</span>
                  <ul v-else class="list-unstyled mb-0">
                    <li v-for="feature in availableFeatures" :key="feature">
                      <i class="fas" :class="isFeatureEnabled(tier, feature) ? 'fa-check text-success' : 'fa-times text-danger'"></i>
                      {{ getFeatureDisplay(feature) }}
                    </li>
                  </ul>
                </td>
                <td>
                  <span v-if="availableLimits.length === 0">No limits defined</span>
                  <ul v-else class="list-unstyled mb-0">
                    <li v-for="limit in availableLimits" :key="limit">
                      {{ getLimitDisplay(limit) }}: {{ getFormattedLimit(tier, limit) }}
                    </li>
                  </ul>
                </td>
                <td>
                  <div class="btn-group">
                    <button type="button" class="btn btn-sm btn-outline-primary" @click="editTier(tierId)">
                      <i class="fas fa-edit"></i> Edit
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" @click="confirmDeleteTier(tierId)">
                      <i class="fas fa-trash"></i> Delete
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!isLoading && (!tiers || Object.keys(tiers).length === 0)">
                <td colspan="7" class="text-center text-muted py-3">
                  No subscription tiers have been defined yet. <button class="btn btn-link btn-sm p-0" @click="startAddNewTier">Add the first one?</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Edit/Add Modal (Bootstrap controlled) -->
    <div class="modal fade" id="editTierModal" tabindex="-1" aria-labelledby="editTierModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="editTierModalLabel">
                {{ isAddingNewTier ? 'Add New Tier' : 'Editing Tier: ' + (editFormData.name || '') }}
                <code v-if="!isAddingNewTier && editingTierId">({{ editingTierId }})</code>
            </h5>
            <button type="button" class="btn-close" @click="cancelEdit" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="saveChanges">
              <div class="mb-3">
                <label class="form-label">Tier Name</label>
                <input type="text" class="form-control" v-model="editFormData.name" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Description</label>
                <textarea class="form-control" v-model="editFormData.description" required></textarea>
              </div>
              <div class="row mb-3">
                  <div class="col">
                      <label class="form-label">Monthly Price ($)</label>
                      <input type="number" step="0.01" class="form-control" v-model="editFormData.monthlyPrice">
                  </div>
                  <div class="col">
                      <label class="form-label">Annual Price ($)</label>
                      <input type="number" step="0.01" class="form-control" v-model="editFormData.annualPrice">
                  </div>
              </div>

              <!-- Features -->
              <div class="mb-3 border p-3 rounded">
                <h5>Features <button type="button" class="btn btn-sm btn-outline-secondary ms-2" @click="addNewFeature">+ Add New Feature Type</button></h5>
                <div v-if="editFormData.features && typeof editFormData.features === 'object'">
                  <div v-for="feature in availableFeatures" :key="'feat-'+feature" class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" :id="'feature-' + feature" v-model="editFormData.features[feature]">
                    <label class="form-check-label" :for="'feature-' + feature">{{ getFeatureDisplay(feature) }}</label>
                  </div>
                </div>
                <div v-if="!availableFeatures || availableFeatures.length === 0" class="text-muted small">No features defined yet.</div>
              </div>

              <!-- Limits -->
              <div class="mb-3 border p-3 rounded">
                <h5>Limits <button type="button" class="btn btn-sm btn-outline-secondary ms-2" @click="addNewLimit">+ Add New Limit Type</button></h5>
                <div v-if="editFormData.limits && typeof editFormData.limits === 'object'">
                  <div v-for="limit in availableLimits" :key="'lim-'+limit" class="row mb-2 align-items-center">
                    <label :for="'limit-' + limit" class="col-sm-4 col-form-label">{{ getLimitDisplay(limit) }}</label>
                    <div class="col-sm-8">
                      <input type="text" class="form-control form-control-sm" :id="'limit-' + limit" v-model="editFormData.limits[limit]" placeholder="Number or Infinity">
                    </div>
                  </div>
                </div>
                <div v-if="!availableLimits || availableLimits.length === 0" class="text-muted small">No limits defined yet.</div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="cancelEdit">Cancel</button>
            <button type="button" class="btn btn-primary" @click="saveChanges">
              {{ isAddingNewTier ? 'Add Tier' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- End of Edit/Add Modal -->
  `,
};

/**
 * Initialize the AdminTierManagement component
 * @param {string} containerId ID of the container element
 */
function initializeAdminTierManagement(containerId = 'tierManagementContent') {
  console.log('[TierManagement] Initializing with container:', containerId);
  
  try {
    // Check if Vue is loaded
    if (typeof Vue === 'undefined') {
      console.error('[TierManagement] Vue is not defined');
      const errorMsg = 'Vue.js is not loaded. Cannot initialize Tier Management.';
      showElement(containerId, createErrorMessage(errorMsg));
      return;
    }

    // Find the section container first
    const sectionContainer = document.getElementById(containerId);
    
    if (!sectionContainer) {
      console.error(`[TierManagement] Section container #${containerId} not found`);
      return;
    }
    
    // Look for the inner container or create it if it doesn't exist
    let innerContainerId = 'tier-management-container';
    let innerContainer = document.getElementById(innerContainerId);
    
    if (!innerContainer) {
      console.log(`[TierManagement] Inner container #${innerContainerId} not found, creating it`);
      // Create the inner container if it doesn't exist
      innerContainer = document.createElement('div');
      innerContainer.id = innerContainerId;
      sectionContainer.appendChild(innerContainer);
    }
    
    // Clear any existing content in the inner container to prepare for Vue mounting
    innerContainer.innerHTML = '';
    
    // Make sure the containers are visible
    sectionContainer.style.display = 'block';
    sectionContainer.style.visibility = 'visible';
    innerContainer.style.display = 'block';
    innerContainer.style.visibility = 'visible';
    
    // Create and mount the Vue app to the inner container
    console.log('[TierManagement] Creating Vue app');
    try {
      // Create standard component without modifications
      adminTierManagementApp = Vue.createApp(AdminTierManagement);
      
      // Register a global property to skip loading animation
      adminTierManagementApp.config.globalProperties.$skipLoading = true;
      
      // Mount the app
      adminTierManagementApp.mount(`#${innerContainerId}`);
      console.log('[TierManagement] Vue app mounted successfully');
    } catch (err) {
      console.error('[TierManagement] Error mounting Vue app:', err);
      showElement(containerId, createErrorMessage('Error initializing Tier Management: ' + err.message));
    }
  } catch (error) {
    console.error('[TierManagement] Initialization error:', error);
    const errorMsg = `Failed to initialize Tier Management: ${error.message}`;
    showElement(containerId, createErrorMessage(errorMsg));
  }
}

// Helper function to show an element with content
function showElement(id, content) {
  const el = document.getElementById(id);
  if (el) {
    el.innerHTML = content;
    el.style.display = 'block';
  }
}

// Helper function to create an error message
function createErrorMessage(message) {
  return `
    <div class="alert alert-danger">
      <h4 class="alert-heading">Initialization Error</h4>
      <p>${message}</p>
      <hr>
      <p class="mb-0">Please check the console for more details.</p>
    </div>
  `;
}

// Export the module
export default AdminTierManagement;
export { initializeAdminTierManagement };

// Also make it available globally
window.adminTierManagement = { 
  initializeAdminTierManagement
};
