/**
 * Admin User Subscription Manager
 * Version: 1.0.0-2025-04-25
 * 
 * Provides UI and logic for administrators to manage individual user subscriptions
 * Allows searching users, viewing subscription details, and modifying tiers/features/limits
 */

import { rtdb, ref, get, set, update, query, orderByChild, equalTo, limitToFirst } from '../../../config/firebase-config.js';
import { showToast } from '../../../utils/toast.js';
import AccessControl from '../services/access-control-service.js'; // For resetting cache
import { getSubscriptionTiers } from '../services/subscription-service.js'; // Use admin definition

let adminUserSubManagerApp = null;

const AdminUserSubscriptionManager = {
  data() {
    return {
      searchQuery: '',
      searchType: 'email', // 'email', 'uid', 'name'
      searchResults: [],
      selectedUser: null,
      selectedUserSubscription: null,
      isLoadingUser: false,
      isLoadingSubscription: false,
      isEditing: false,
      editFormData: {},
      availableTiers: {},
      availableFeatures: [],
      availableLimits: []
    };
  },
  
  async mounted() {
      // Load available tiers for dropdowns
      await this.loadTierDefinitions();
      this.populateAvailableFeaturesAndLimits();
  },
  
  methods: {
    /**
     * Load available tier definitions for editing dropdowns
     */
    async loadTierDefinitions() {
      try {
        const snapshot = await get(ref(rtdb, 'subscriptionTiers'));
        this.availableTiers = snapshot.val() || {};
      } catch (error) {
        console.error('Error loading tier definitions for admin:', error);
        // Fallback or handle error
        this.availableTiers = {};
      }
    },

    /**
     * Populate available features and limits based on admin tier definitions
     */
    populateAvailableFeaturesAndLimits() {
      const features = new Set();
      const limits = new Set();
      
      Object.values(this.availableTiers).forEach(tier => {
        if (tier.features) Object.keys(tier.features).forEach(f => features.add(f));
        if (tier.limits) Object.keys(tier.limits).forEach(l => limits.add(l));
      });
      
      this.availableFeatures = [...features].sort();
      this.availableLimits = [...limits].sort();
    },

    /**
     * Search for users based on query and type
     * NOTE: This requires a searchable user profile structure in Firebase 
     *       (e.g., '/users' with indexed email or name)
     */
    async searchUsers() {
      if (!this.searchQuery.trim()) {
        this.searchResults = [];
        return;
      }
      
      this.isLoadingUser = true;
      this.searchResults = [];
      this.selectedUser = null;
      this.selectedUserSubscription = null;
      
      try {
        let userQuery;
        const usersRef = ref(rtdb, 'users'); // Adjust this path based on your user data structure
        
        // Basic search examples (adjust indexes in Firebase accordingly)
        if (this.searchType === 'uid') {
            const userRef = ref(rtdb, `users/${this.searchQuery.trim()}`);
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                 this.searchResults = [{ id: snapshot.key, ...snapshot.val() }];
            } else {
                 this.searchResults = [];
            }
        } else if (this.searchType === 'email') {
            // Requires Firebase rule indexing on 'email'
            userQuery = query(usersRef, orderByChild('email'), equalTo(this.searchQuery.trim()), limitToFirst(10));
            const snapshot = await get(userQuery);
             if (snapshot.exists()) {
                this.searchResults = Object.entries(snapshot.val()).map(([id, data]) => ({ id, ...data }));
            } else {
                 this.searchResults = [];
            }
        } else if (this.searchType === 'name') {
            // Requires Firebase rule indexing on 'displayName' or similar
            // Note: Firebase RTDB is not ideal for full-text search. Consider Firestore or Algolia.
            userQuery = query(usersRef, orderByChild('displayName'), equalTo(this.searchQuery.trim()), limitToFirst(10));
            const snapshot = await get(userQuery);
             if (snapshot.exists()) {
                 this.searchResults = Object.entries(snapshot.val()).map(([id, data]) => ({ id, ...data }));
            } else {
                 this.searchResults = [];
            }
        }
        
        if (this.searchResults.length === 0) {
            showToast('No users found.', 'info');
        }

      } catch (error) {
        console.error('Error searching users:', error);
        showToast('Failed to search users.', 'error');
        this.searchResults = [];
      } finally {
        this.isLoadingUser = false;
      }
    },
    
    /**
     * Select a user from search results and load their subscription
     * @param {Object} user The user object { id, email, displayName, ... }
     */
    async selectUser(user) {
      this.selectedUser = user;
      this.searchResults = []; // Clear search results
      this.searchQuery = ''; // Clear search input
      this.isLoadingSubscription = true;
      this.isEditing = false;
      this.editFormData = {};
      this.selectedUserSubscription = null;
      
      try {
        const subRef = ref(rtdb, `subscriptions/${user.id}`);
        const snapshot = await get(subRef);
        
        if (snapshot.exists()) {
          this.selectedUserSubscription = snapshot.val();
        } else {
          // User exists but has no subscription record - assume free tier
          this.selectedUserSubscription = {
            tier: 'free',
            paymentStatus: 'none',
            startDate: null,
            renewalDate: null,
            features: this.availableTiers.free?.features || {},
            limits: this.availableTiers.free?.limits || {}
          };
          showToast('User has no explicit subscription record (defaulting to Free).', 'info');
        }
      } catch (error) {
        console.error(`Error loading subscription for user ${user.id}:`, error);
        showToast('Failed to load user subscription.', 'error');
        this.selectedUserSubscription = null;
      } finally {
        this.isLoadingSubscription = false;
      }
    },

    /**
     * Start editing the selected user's subscription
     */
    editSubscription() {
      if (!this.selectedUserSubscription) return;
      this.isEditing = true;
      // Deep copy for editing
      this.editFormData = JSON.parse(JSON.stringify(this.selectedUserSubscription));
      // Ensure features/limits objects exist for editing
      this.editFormData.features = this.editFormData.features || {};
      this.editFormData.limits = this.editFormData.limits || {};
    },
    
    /**
     * Cancel editing
     */
    cancelEdit() {
      this.isEditing = false;
      this.editFormData = {};
    },
    
    /**
     * Save changes to the user's subscription
     */
    async saveSubscriptionChanges() {
      if (!this.selectedUser || !this.isEditing) return;
      
      const userId = this.selectedUser.id;
      const updates = {};
      const historyKey = Date.now(); // Use timestamp for history key

      // Compare and prepare updates
      Object.keys(this.editFormData).forEach(key => {
          // Use JSON.stringify for comparison to handle objects/arrays correctly
          if (JSON.stringify(this.editFormData[key]) !== JSON.stringify(this.selectedUserSubscription[key])) {
              // Special handling for limits (convert 'Infinity' string to actual Infinity)
              if (key === 'limits') {
                updates[key] = {};
                Object.keys(this.editFormData[key]).forEach(limitKey => {
                    const value = this.editFormData[key][limitKey];
                    if (typeof value === 'string' && value.toLowerCase() === 'infinity') {
                        updates[key][limitKey] = Infinity;
                    } else {
                        updates[key][limitKey] = parseInt(value, 10) || 0;
                    }
                });
              } else {
                  updates[key] = this.editFormData[key];
              }
          }
      });
      
       // If tier changed, update features and limits based on the new tier definition
       // unless they were manually overridden (i.e., already in editFormData)
      if (updates.tier && this.availableTiers[updates.tier]) {
          const newTierDef = this.availableTiers[updates.tier];
          if (newTierDef.features && !updates.features) {
              updates.features = { ...(this.selectedUserSubscription.features || {}), ...newTierDef.features };
          }
          if (newTierDef.limits && !updates.limits) {
              updates.limits = { ...(this.selectedUserSubscription.limits || {}), ...newTierDef.limits };
          }
      }

      // Add history entry
      updates[`history/${historyKey}`] = {
        action: 'admin_update',
        timestamp: historyKey,
        changes: updates, // Log what was changed
        adminUser: 'CURRENT_ADMIN_UID' // TODO: Replace with actual admin UID
      };
      
      if (Object.keys(updates).length <= 1) { // Only history entry was added
          showToast('No changes detected.', 'info');
          this.cancelEdit();
          return;
      }

      try {
        await update(ref(rtdb, `subscriptions/${userId}`), updates);
        showToast(`Subscription updated for ${this.selectedUser.email || userId}.`, 'success');
        
        // Reload subscription data and exit edit mode
        await this.selectUser(this.selectedUser); // Re-select to load fresh data
        this.isEditing = false;
        
        // IMPORTANT: Reset cache for the specific user if AccessControl service is used client-side by them
        // AccessControl.resetCache(userId); 
        // If resetCache doesn't support userId, a global reset might be needed, or implement user-specific cache invalidation.
        AccessControl.resetCache(); // Using global reset for simplicity here

      } catch (error) {
        console.error('Error saving subscription changes:', error);
        showToast('Failed to save subscription changes.', 'error');
      }
    },
    
    formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        return new Date(timestamp).toLocaleDateString();
    },
    
    formatValue(value) {
        if (value === Infinity) return 'Infinity';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        return value === null || value === undefined ? 'N/A' : value;
    }
  },
  
  template: `
    <div class="admin-user-sub-manager card mt-4">
      <div class="card-header">
        <h4 class="mb-0">User Subscription Management</h4>
      </div>
      <div class="card-body">
        <!-- Search Form -->
        <form @submit.prevent="searchUsers" class="mb-3">
          <div class="input-group">
            <select class="form-select" v-model="searchType" style="max-width: 120px;">
              <option value="email">Email</option>
              <option value="uid">User ID</option>
              <option value="name">Name</option>
            </select>
            <input type="text" class="form-control" placeholder="Search..." v-model="searchQuery" required>
            <button class="btn btn-primary" type="submit" :disabled="isLoadingUser">
              <span v-if="isLoadingUser" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              Search
            </button>
          </div>
        </form>
        
        <!-- Search Results -->
        <div v-if="searchResults.length > 0" class="list-group mb-3">
          <button v-for="user in searchResults" :key="user.id"
                  type="button" class="list-group-item list-group-item-action"
                  @click="selectUser(user)">
            {{ user.displayName || 'N/A' }} ({{ user.email || user.id }})
          </button>
        </div>
        
        <!-- Selected User & Subscription Details -->
        <div v-if="selectedUser">
          <h5>Subscription for: {{ selectedUser.displayName || 'N/A' }} ({{ selectedUser.email || selectedUser.id }})</h5>
          
          <div v-if="isLoadingSubscription" class="text-center">
            <div class="spinner-border spinner-border-sm" role="status">
              <span class="visually-hidden">Loading subscription...</span>
            </div>
          </div>
          
          <div v-else-if="selectedUserSubscription">
            <!-- Display Mode -->
            <div v-if="!isEditing">
              <table class="table table-sm table-bordered">
                <tbody>
                  <tr><th>Tier</th><td>{{ selectedUserSubscription.tier }}</td></tr>
                  <tr><th>Status</th><td>{{ selectedUserSubscription.paymentStatus }}</td></tr>
                  <tr><th>Start Date</th><td>{{ formatDate(selectedUserSubscription.startDate) }}</td></tr>
                  <tr><th>Renewal/End Date</th><td>{{ formatDate(selectedUserSubscription.renewalDate || selectedUserSubscription.trialEndDate || selectedUserSubscription.cancellationDate) }}</td></tr>
                  <tr v-if="selectedUserSubscription.isTrial"><th>Trial Active</th><td>Yes (ends {{ formatDate(selectedUserSubscription.trialEndDate) }})</td></tr>
                  <tr><th>Billing Cycle</th><td>{{ selectedUserSubscription.billingCycle || 'N/A' }}</td></tr>
                </tbody>
              </table>
              <h6>Features & Limits (Overrides shown if present)</h6>
              <pre style="max-height: 200px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 4px;">{{ JSON.stringify({ features: selectedUserSubscription.features, limits: selectedUserSubscription.limits }, null, 2) }}</pre>
              <button class="btn btn-secondary btn-sm mt-2" @click="editSubscription">Edit Subscription</button>
            </div>
            
            <!-- Edit Mode -->
            <div v-else>
              <form @submit.prevent="saveSubscriptionChanges">
                <div class="row mb-3">
                  <div class="col-md-6">
                    <label class="form-label">Subscription Tier</label>
                    <select class="form-select" v-model="editFormData.tier">
                      <option v-for="(tier, tierId) in availableTiers" :key="tierId" :value="tierId">{{ tier.name }} ({{ tierId }})</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Payment Status</label>
                    <select class="form-select" v-model="editFormData.paymentStatus">
                      <option value="active">Active</option>
                      <option value="pastDue">Past Due</option>
                      <option value="canceled">Canceled</option>
                      <option value="trial">Trial</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                </div>
                 <div class="row mb-3">
                    <div class="col-md-6">
                        <label class="form-label">Start Date</label>
                        <input type="date" class="form-control" :value="editFormData.startDate ? new Date(editFormData.startDate).toISOString().split('T')[0] : ''" @input="editFormData.startDate = $event.target.valueAsNumber"> 
                    </div>
                     <div class="col-md-6">
                        <label class="form-label">Renewal/End Date</label>
                        <input type="date" class="form-control" :value="editFormData.renewalDate ? new Date(editFormData.renewalDate).toISOString().split('T')[0] : ''" @input="editFormData.renewalDate = $event.target.valueAsNumber"> 
                    </div>
                 </div>
                <!-- Feature Overrides -->
                 <div class="mb-3 border p-3 rounded">
                    <h5>Feature Overrides <small class="text-muted">(Define specific features for this user, overriding tier defaults)</small></h5>
                    <div v-for="feature in availableFeatures" :key="feature" class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" :id="'edit-feature-' + feature" v-model="editFormData.features[feature]">
                    <label class="form-check-label" :for="'edit-feature-' + feature">{{ feature }}</label>
                    </div>
                </div>
                
                <!-- Limit Overrides -->
                 <div class="mb-3 border p-3 rounded">
                    <h5>Limit Overrides <small class="text-muted">(Define specific limits for this user, overriding tier defaults)</small></h5>
                    <div v-for="limit in availableLimits" :key="limit" class="row mb-2 align-items-center">
                        <label :for="'edit-limit-' + limit" class="col-sm-4 col-form-label">{{ limit }}</label>
                        <div class="col-sm-8">
                        <input type="text" class="form-control form-control-sm" :id="'edit-limit-' + limit" v-model="editFormData.limits[limit]" placeholder="Number or Infinity">
                        </div>
                    </div>
                </div>

                <div class="mt-3">
                  <button type="button" class="btn btn-secondary me-2" @click="cancelEdit">Cancel</button>
                  <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
              </form>
            </div>
            
          </div>
          
          <div v-else-if="!isLoadingSubscription">
            <p class="text-muted">No subscription data found for this user.</p>
            <button class="btn btn-secondary btn-sm mt-2" @click="editSubscription">Create Subscription Record</button> <!-- Allow creating a default record -->
          </div>
        </div>
      </div>
    </div>
  `
};

// Function to initialize this component within the admin dashboard
export function initializeAdminUserSubscriptionManager(containerId) {
    if (typeof Vue === 'undefined') {
        console.error('Vue is not loaded. Cannot initialize AdminUserSubscriptionManager component.');
        return;
    }

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container element with ID '${containerId}' not found.`);
        return;
    }

    adminUserSubManagerApp = Vue.createApp(AdminUserSubscriptionManager);
    adminUserSubManagerApp.mount(container);
}

export default AdminUserSubscriptionManager;
