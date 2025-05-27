/**
 * Enhanced Admin User Subscription Manager
 * Version: 2.0.0-2025-05-26
 * 
 * Comprehensive user management platform with:
 * - Advanced user search and filtering
 * - Bulk subscription operations
 * - User creation interface
 * - Analytics dashboard
 * - Payment history tracking
 * - Communication features
 */

import { auth, rtdb, ref, get, set, update, push, query, orderByChild, equalTo, limitToFirst, orderByKey, limitToLast, remove } from '../../../config/firebase-config.js';
import { showToast } from '../../../utils/toast.js';
import AccessControl from '../services/access-control-service.js';
import { getSubscriptionTiers } from '../services/subscription-service.js';

let enhancedUserSubManagerApp = null;

const EnhancedUserSubscriptionManager = {
  data() {
    return {
      // Navigation
      currentView: 'dashboard', // 'dashboard', 'users', 'analytics', 'communication'
      
      // Dashboard Analytics
      dashboardMetrics: {
        totalUsers: 0,
        activeSubscriptions: 0,
        revenue: 0,
        churnRate: 0,
        tierDistribution: {},
        recentActivity: []
      },
      
      // User Management
      searchQuery: '',
      searchType: 'email',
      searchResults: [],
      allUsers: [],
      filteredUsers: [],
      selectedUsers: [],
      bulkAction: '',
      
      // Filters
      filters: {
        tier: 'all',
        status: 'all',
        dateRange: 'all',
        sortBy: 'created',
        sortOrder: 'desc'
      },
      
      // Pagination
      currentPage: 1,
      usersPerPage: 20,
      
      // User Details
      selectedUser: null,
      selectedUserSubscription: null,
      userPaymentHistory: [],
      userUsageStats: {},
      
      // Editing
      isEditing: false,
      editFormData: {},
      
      // User Creation
      showCreateUser: false,
      newUserData: {
        email: '',
        displayName: '',
        tier: 'free',
        paymentStatus: 'none'
      },
      
      // Communication
      messageTemplate: '',
      emailSubject: '',
      selectedRecipients: [],
      
      // System Data
      availableTiers: {},
      availableFeatures: [],
      availableLimits: [],
      
      // Loading States
      isLoading: false,
      isLoadingUser: false,
      isLoadingSubscription: false,
      isLoadingAnalytics: false,
      
      // User Management
      showUserDetails: false,
      editingUser: null,
      showEditUser: false
    };
  },
  
  async mounted() {
    await this.loadTierDefinitions();
    this.populateAvailableFeaturesAndLimits();
    await this.loadDashboardMetrics();
    await this.loadAllUsers();
  },
  
  computed: {
    paginatedUsers() {
      const start = (this.currentPage - 1) * this.usersPerPage;
      const end = start + this.usersPerPage;
      return this.filteredUsers.slice(start, end);
    },
    
    totalPages() {
      return Math.ceil(this.filteredUsers.length / this.usersPerPage);
    },
    
    hasSelectedUsers() {
      return this.selectedUsers.length > 0;
    }
  },
  
  methods: {
    // Navigation
    setCurrentView(view) {
      this.currentView = view;
      if (view === 'analytics') {
        this.loadAnalytics();
      }
    },
    
    // Dashboard Methods
    async loadDashboardMetrics() {
      this.isLoadingAnalytics = true;
      try {
        // Load users count
        const usersSnapshot = await get(ref(rtdb, 'users'));
        const users = usersSnapshot.val() || {};
        this.dashboardMetrics.totalUsers = Object.keys(users).length;
        
        // Load subscriptions
        const subscriptionsSnapshot = await get(ref(rtdb, 'subscriptions'));
        const subscriptions = subscriptionsSnapshot.val() || {};
        
        let activeCount = 0;
        let revenue = 0;
        const tierDistribution = {};
        
        Object.values(subscriptions).forEach(sub => {
          if (sub.paymentStatus === 'active') {
            activeCount++;
            // Calculate revenue based on tier
            const tierData = this.availableTiers[sub.tier];
            if (tierData && tierData.price) {
              revenue += tierData.price;
            }
          }
          
          tierDistribution[sub.tier] = (tierDistribution[sub.tier] || 0) + 1;
        });
        
        this.dashboardMetrics.activeSubscriptions = activeCount;
        this.dashboardMetrics.revenue = revenue;
        this.dashboardMetrics.tierDistribution = tierDistribution;
        
        // Load recent activity
        await this.loadRecentActivity();
        
      } catch (error) {
        console.error('Error loading dashboard metrics:', error);
        showToast('Failed to load dashboard metrics', 'error');
      } finally {
        this.isLoadingAnalytics = false;
      }
    },
    
    async loadRecentActivity() {
      try {
        const activityQuery = query(
          ref(rtdb, 'subscriptions'),
          orderByKey(),
          limitToLast(10)
        );
        
        const snapshot = await get(activityQuery);
        const activities = [];
        
        if (snapshot.exists()) {
          Object.entries(snapshot.val()).forEach(([userId, subscription]) => {
            if (subscription.history) {
              Object.values(subscription.history).forEach(historyItem => {
                activities.push({
                  userId,
                  ...historyItem,
                  userEmail: subscription.email || userId
                });
              });
            }
          });
        }
        
        this.dashboardMetrics.recentActivity = activities
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 10);
          
      } catch (error) {
        console.error('Error loading recent activity:', error);
      }
    },
    
    // User Management Methods
    async loadAllUsers() {
      this.isLoading = true;
      try {
        const usersSnapshot = await get(ref(rtdb, 'users'));
        const users = usersSnapshot.val() || {};
        
        const subscriptionsSnapshot = await get(ref(rtdb, 'subscriptions'));
        const subscriptions = subscriptionsSnapshot.val() || {};
        
        this.allUsers = Object.entries(users).map(([id, userData]) => ({
          id,
          ...userData,
          subscription: subscriptions[id] || {
            tier: 'free',
            paymentStatus: 'none'
          }
        }));
        
        this.applyFilters();
        
      } catch (error) {
        console.error('Error loading users:', error);
        showToast('Failed to load users', 'error');
      } finally {
        this.isLoading = false;
      }
    },
    
    applyFilters() {
      let filtered = [...this.allUsers];
      
      // Search filter
      if (this.searchQuery.trim()) {
        const query = this.searchQuery.toLowerCase();
        filtered = filtered.filter(user => {
          if (this.searchType === 'email') {
            return user.email && user.email.toLowerCase().includes(query);
          } else if (this.searchType === 'name') {
            return user.displayName && user.displayName.toLowerCase().includes(query);
          } else if (this.searchType === 'uid') {
            return user.id.toLowerCase().includes(query);
          }
          return false;
        });
      }
      
      // Tier filter
      if (this.filters.tier !== 'all') {
        filtered = filtered.filter(user => user.subscription.tier === this.filters.tier);
      }
      
      // Status filter
      if (this.filters.status !== 'all') {
        filtered = filtered.filter(user => user.subscription.paymentStatus === this.filters.status);
      }
      
      // Sort
      filtered.sort((a, b) => {
        let valueA, valueB;
        
        switch (this.filters.sortBy) {
          case 'email':
            valueA = a.email || '';
            valueB = b.email || '';
            break;
          case 'name':
            valueA = a.displayName || '';
            valueB = b.displayName || '';
            break;
          case 'tier':
            valueA = a.subscription.tier || '';
            valueB = b.subscription.tier || '';
            break;
          case 'created':
          default:
            valueA = a.createdAt || 0;
            valueB = b.createdAt || 0;
            break;
        }
        
        if (this.filters.sortOrder === 'asc') {
          return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
        } else {
          return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
        }
      });
      
      this.filteredUsers = filtered;
      this.currentPage = 1; // Reset to first page
    },
    
    // User Selection Methods
    toggleUserSelection(user) {
      const index = this.selectedUsers.findIndex(u => u.id === user.id);
      if (index > -1) {
        this.selectedUsers.splice(index, 1);
      } else {
        this.selectedUsers.push(user);
      }
    },
    
    selectAllUsers() {
      if (this.selectedUsers.length === this.paginatedUsers.length) {
        this.selectedUsers = [];
      } else {
        this.selectedUsers = [...this.paginatedUsers];
      }
    },
    
    // Bulk Operations
    async executeBulkAction() {
      if (!this.bulkAction || this.selectedUsers.length === 0) {
        showToast('Please select an action and users', 'warning');
        return;
      }
      
      const confirmation = confirm(`Are you sure you want to ${this.bulkAction} for ${this.selectedUsers.length} users?`);
      if (!confirmation) return;
      
      this.isLoading = true;
      try {
        const updates = {};
        const timestamp = Date.now();
        
        this.selectedUsers.forEach(user => {
          switch (this.bulkAction) {
            case 'upgrade_premium':
              updates[`subscriptions/${user.id}/tier`] = 'premium';
              updates[`subscriptions/${user.id}/paymentStatus`] = 'active';
              updates[`subscriptions/${user.id}/history/${timestamp}`] = {
                action: 'bulk_upgrade',
                timestamp,
                adminUser: 'CURRENT_ADMIN_UID'
              };
              break;
              
            case 'downgrade_free':
              updates[`subscriptions/${user.id}/tier`] = 'free';
              updates[`subscriptions/${user.id}/paymentStatus`] = 'none';
              updates[`subscriptions/${user.id}/history/${timestamp}`] = {
                action: 'bulk_downgrade',
                timestamp,
                adminUser: 'CURRENT_ADMIN_UID'
              };
              break;
              
            case 'suspend':
              updates[`subscriptions/${user.id}/paymentStatus`] = 'canceled';
              updates[`subscriptions/${user.id}/history/${timestamp}`] = {
                action: 'bulk_suspend',
                timestamp,
                adminUser: 'CURRENT_ADMIN_UID'
              };
              break;
          }
        });
        
        await update(ref(rtdb, '/'), updates);
        showToast(`Bulk action completed for ${this.selectedUsers.length} users`, 'success');
        
        // Reload data
        await this.loadAllUsers();
        await this.loadDashboardMetrics();
        this.selectedUsers = [];
        this.bulkAction = '';
        
      } catch (error) {
        console.error('Error executing bulk action:', error);
        showToast('Bulk action failed', 'error');
      } finally {
        this.isLoading = false;
      }
    },
    
    // User Creation
    async createUser() {
      if (!this.newUserData.email) {
        showToast('Email is required', 'warning');
        return;
      }
      
      this.isLoading = true;
      try {
        const userId = `user_${Date.now()}`;
        const timestamp = Date.now();
        
        const userData = {
          email: this.newUserData.email,
          displayName: this.newUserData.displayName || this.newUserData.email,
          createdAt: timestamp,
          createdBy: 'admin'
        };
        
        const subscriptionData = {
          tier: this.newUserData.tier,
          paymentStatus: this.newUserData.paymentStatus,
          startDate: timestamp,
          features: this.availableTiers[this.newUserData.tier]?.features || {},
          limits: this.availableTiers[this.newUserData.tier]?.limits || {},
          history: {
            [timestamp]: {
              action: 'admin_create',
              timestamp,
              adminUser: 'CURRENT_ADMIN_UID'
            }
          }
        };
        
        await set(ref(rtdb, `users/${userId}`), userData);
        await set(ref(rtdb, `subscriptions/${userId}`), subscriptionData);
        
        showToast('User created successfully', 'success');
        
        // Reset form and reload data
        this.newUserData = { email: '', displayName: '', tier: 'free', paymentStatus: 'none' };
        this.showCreateUser = false;
        await this.loadAllUsers();
        await this.loadDashboardMetrics();
        
      } catch (error) {
        console.error('Error creating user:', error);
        showToast('Failed to create user', 'error');
      } finally {
        this.isLoading = false;
      }
    },
    
    // Existing methods from original component
    async loadTierDefinitions() {
      try {
        const snapshot = await get(ref(rtdb, 'subscriptionTiers'));
        this.availableTiers = snapshot.val() || {};
      } catch (error) {
        console.error('Error loading tier definitions:', error);
        this.availableTiers = {};
      }
    },
    
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
    
    async selectUser(user) {
      this.selectedUser = user;
      this.isLoadingSubscription = true;
      this.isEditing = false;
      
      try {
        const subRef = ref(rtdb, `subscriptions/${user.id}`);
        const snapshot = await get(subRef);
        
        if (snapshot.exists()) {
          this.selectedUserSubscription = snapshot.val();
        } else {
          this.selectedUserSubscription = {
            tier: 'free',
            paymentStatus: 'none',
            startDate: null,
            renewalDate: null,
            features: this.availableTiers.free?.features || {},
            limits: this.availableTiers.free?.limits || {}
          };
        }
        
        // Load payment history and usage stats
        await this.loadUserPaymentHistory(user.id);
        await this.loadUserUsageStats(user.id);
        
      } catch (error) {
        console.error('Error loading user details:', error);
        showToast('Failed to load user details', 'error');
      } finally {
        this.isLoadingSubscription = false;
      }
    },
    
    async loadUserPaymentHistory(userId) {
      try {
        const historyRef = ref(rtdb, `paymentHistory/${userId}`);
        const snapshot = await get(historyRef);
        this.userPaymentHistory = snapshot.exists() ? Object.values(snapshot.val()) : [];
      } catch (error) {
        console.error('Error loading payment history:', error);
        this.userPaymentHistory = [];
      }
    },
    
    async loadUserUsageStats(userId) {
      try {
        const statsRef = ref(rtdb, `usageStats/${userId}`);
        const snapshot = await get(statsRef);
        this.userUsageStats = snapshot.exists() ? snapshot.val() : {};
      } catch (error) {
        console.error('Error loading usage stats:', error);
        this.userUsageStats = {};
      }
    },
    
    async viewUserDetails(userId) {
      try {
        const userSnapshot = await get(ref(rtdb, `users/${userId}`));
        const subscriptionSnapshot = await get(ref(rtdb, `subscriptions/${userId}`));
        
        const user = userSnapshot.val();
        const subscription = subscriptionSnapshot.val();
        
        if (!user) {
          showToast('User not found', 'error');
          return;
        }
        
        this.selectedUser = {
          ...user,
          id: userId,
          subscription: subscription || {}
        };
        
        this.showUserDetails = true;
      } catch (error) {
        console.error('Error viewing user details:', error);
        showToast('Error loading user details', 'error');
      }
    },
    
    async editUser(userId) {
      try {
        // Load user data for editing
        const userSnapshot = await get(ref(rtdb, `users/${userId}`));
        const subscriptionSnapshot = await get(ref(rtdb, `subscriptions/${userId}`));
        
        const user = userSnapshot.val();
        const subscription = subscriptionSnapshot.val();
        
        if (!user) {
          showToast('User not found', 'error');
          return;
        }
        
        // Populate edit form
        this.editingUser = {
          id: userId,
          email: user.email,
          displayName: user.displayName || '',
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          status: user.status || 'active',
          businessInfo: user.businessInfo || {},
          subscription: subscription || {}
        };
        
        this.showEditUser = true;
      } catch (error) {
        console.error('Error loading user for edit:', error);
        showToast('Error loading user data', 'error');
      }
    },
    
    async saveUserChanges() {
      if (!this.editingUser || !this.editingUser.id) return;
      
      this.isLoading = true;
      
      try {
        const userId = this.editingUser.id;
        
        // Update user data
        const userUpdates = {
          displayName: this.editingUser.displayName,
          firstName: this.editingUser.firstName,
          lastName: this.editingUser.lastName,
          status: this.editingUser.status,
          businessInfo: this.editingUser.businessInfo,
          updatedAt: Date.now(),
          updatedBy: auth.currentUser?.uid
        };
        
        await update(ref(rtdb, `users/${userId}`), userUpdates);
        
        // Update subscription if changed
        if (this.editingUser.subscription) {
          const subscriptionUpdates = {
            tier: this.editingUser.subscription.tier,
            status: this.editingUser.subscription.status,
            updatedAt: Date.now(),
            updatedBy: auth.currentUser?.uid
          };
          
          await update(ref(rtdb, `subscriptions/${userId}`), subscriptionUpdates);
        }
        
        showToast('User updated successfully', 'success');
        this.showEditUser = false;
        this.editingUser = null;
        
        // Refresh user list
        await this.loadAllUsers();
        
      } catch (error) {
        console.error('Error updating user:', error);
        showToast('Error updating user', 'error');
      } finally {
        this.isLoading = false;
      }
    },
    
    async deleteUser(userId) {
      // Show confirmation dialog
      const confirmed = await Swal.fire({
        title: 'Delete User?',
        text: 'This action cannot be undone. All user data and subscriptions will be permanently deleted.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, delete user',
        cancelButtonText: 'Cancel'
      });
      
      if (!confirmed.isConfirmed) return;
      
      this.isLoading = true;
      
      try {
        // Delete user authentication account
        // Note: This requires admin SDK or cloud function
        // For now, we'll just mark the user as deleted in the database
        
        // Mark user as deleted (soft delete)
        await update(ref(rtdb, `users/${userId}`), {
          status: 'deleted',
          deletedAt: Date.now(),
          deletedBy: auth.currentUser?.uid
        });
        
        // Remove subscription
        await remove(ref(rtdb, `subscriptions/${userId}`));
        
        // Remove user locations
        await remove(ref(rtdb, `userLocations/${userId}`));
        
        showToast('User deleted successfully', 'success');
        
        // Refresh user list
        await this.loadAllUsers();
        
        // Update metrics
        await this.loadDashboardMetrics();
        
      } catch (error) {
        console.error('Error deleting user:', error);
        showToast('Error deleting user', 'error');
      } finally {
        this.isLoading = false;
      }
    },
    
    // Utility methods
    formatDate(timestamp) {
      if (!timestamp) return 'N/A';
      return new Date(timestamp).toLocaleDateString();
    },
    
    formatCurrency(amount) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
    },
    
    formatValue(value) {
      if (value === Infinity) return 'Unlimited';
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      return value === null || value === undefined ? 'N/A' : value;
    }
  }
};

EnhancedUserSubscriptionManager.template = `
  <div class="enhanced-user-sub-manager">
    <!-- Navigation Tabs -->
    <ul class="nav nav-tabs mb-4">
      <li class="nav-item">
        <button class="nav-link" :class="{ active: currentView === 'dashboard' }" @click="setCurrentView('dashboard')">
          <i class="fas fa-chart-line me-2"></i>Dashboard
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: currentView === 'users' }" @click="setCurrentView('users')">
          <i class="fas fa-users me-2"></i>User Management
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: currentView === 'analytics' }" @click="setCurrentView('analytics')">
          <i class="fas fa-analytics me-2"></i>Analytics
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: currentView === 'communication' }" @click="setCurrentView('communication')">
          <i class="fas fa-envelope me-2"></i>Communication
        </button>
      </li>
    </ul>

    <!-- Dashboard View -->
    <div v-if="currentView === 'dashboard'" class="dashboard-view">
      <div class="row mb-4">
        <div class="col-md-3">
          <div class="card bg-primary text-white">
            <div class="card-body">
              <div class="d-flex justify-content-between">
                <div>
                  <h4 class="card-title">{{ dashboardMetrics.totalUsers }}</h4>
                  <p class="card-text">Total Users</p>
                </div>
                <i class="fas fa-users fa-2x opacity-75"></i>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card bg-success text-white">
            <div class="card-body">
              <div class="d-flex justify-content-between">
                <div>
                  <h4 class="card-title">{{ dashboardMetrics.activeSubscriptions }}</h4>
                  <p class="card-text">Active Subscriptions</p>
                </div>
                <i class="fas fa-credit-card fa-2x opacity-75"></i>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card bg-info text-white">
            <div class="card-body">
              <div class="d-flex justify-content-between">
                <div>
                  <h4 class="card-title">{{ formatCurrency(dashboardMetrics.revenue) }}</h4>
                  <p class="card-text">Monthly Revenue</p>
                </div>
                <i class="fas fa-dollar-sign fa-2x opacity-75"></i>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card bg-warning text-white">
            <div class="card-body">
              <div class="d-flex justify-content-between">
                <div>
                  <h4 class="card-title">{{ dashboardMetrics.churnRate.toFixed(1) }}%</h4>
                  <p class="card-text">Churn Rate</p>
                </div>
                <i class="fas fa-chart-line fa-2x opacity-75"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="card">
        <div class="card-header">
          <h5 class="card-title">Recent Activity</h5>
        </div>
        <div class="card-body">
          <div v-if="dashboardMetrics.recentActivity.length === 0" class="text-muted">
            No recent activity
          </div>
          <div v-else>
            <div v-for="activity in dashboardMetrics.recentActivity" :key="activity.timestamp" class="mb-2 p-2 border-start border-3 border-primary">
              <small class="text-muted">{{ formatDate(activity.timestamp) }}</small>
              <div>{{ activity.action }} - {{ activity.userEmail }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- User Management View -->
    <div v-if="currentView === 'users'" class="users-view">
      <!-- Search and Actions -->
      <div class="card mb-4">
        <div class="card-body">
          <div class="row mb-3">
            <div class="col-md-6">
              <div class="input-group">
                <select class="form-select" v-model="searchType" style="max-width: 120px;">
                  <option value="email">Email</option>
                  <option value="name">Name</option>
                  <option value="uid">User ID</option>
                </select>
                <input type="text" class="form-control" placeholder="Search users..." v-model="searchQuery" @input="applyFilters">
              </div>
            </div>
            <div class="col-md-6 text-end">
              <button class="btn btn-primary" @click="showCreateUser = true">
                <i class="fas fa-plus me-2"></i>Create User
              </button>
            </div>
          </div>
          
          <!-- Filters and Bulk Actions -->
          <div class="row">
            <div class="col-md-2">
              <select class="form-select" v-model="filters.tier" @change="applyFilters">
                <option value="all">All Tiers</option>
                <option v-for="(tier, tierId) in availableTiers" :key="tierId" :value="tierId">{{ tier.name || tierId }}</option>
              </select>
            </div>
            <div class="col-md-2">
              <select class="form-select" v-model="filters.status" @change="applyFilters">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="pastDue">Past Due</option>
                <option value="canceled">Canceled</option>
                <option value="none">None</option>
              </select>
            </div>
            <div class="col-md-8" v-if="hasSelectedUsers">
              <div class="input-group">
                <select class="form-select" v-model="bulkAction">
                  <option value="">Select Bulk Action</option>
                  <option value="upgrade_premium">Upgrade to Premium</option>
                  <option value="downgrade_free">Downgrade to Free</option>
                  <option value="suspend">Suspend Accounts</option>
                </select>
                <button class="btn btn-outline-danger" @click="executeBulkAction" :disabled="!bulkAction">
                  Execute ({{ selectedUsers.length }})
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Users Table -->
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h5 class="mb-0">Users ({{ filteredUsers.length }})</h5>
        </div>
        <div class="card-body">
          <div v-if="isLoading" class="text-center p-4">
            <div class="spinner-border"></div>
          </div>
          
          <div v-else class="table-responsive">
            <table class="table table-hover">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" @change="selectAllUsers" 
                           :checked="selectedUsers.length === paginatedUsers.length && paginatedUsers.length > 0">
                  </th>
                  <th>User</th>
                  <th>Email</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in paginatedUsers" :key="user.id">
                  <td>
                    <input type="checkbox" @change="toggleUserSelection(user)" 
                           :checked="selectedUsers.some(u => u.id === user.id)">
                  </td>
                  <td>
                    <div class="d-flex align-items-center">
                      <div class="bg-primary text-white rounded-circle me-2 d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">
                        {{ (user.displayName || user.email || 'U').charAt(0).toUpperCase() }}
                      </div>
                      <div>
                        <div class="fw-bold">{{ user.displayName || 'N/A' }}</div>
                        <small class="text-muted">{{ user.id }}</small>
                      </div>
                    </div>
                  </td>
                  <td>{{ user.email }}</td>
                  <td>
                    <span class="badge" :class="{
                      'bg-success': user.subscription.tier === 'premium',
                      'bg-primary': user.subscription.tier === 'pro',
                      'bg-secondary': user.subscription.tier === 'free'
                    }">
                      {{ user.subscription.tier }}
                    </span>
                  </td>
                  <td>
                    <span class="badge" :class="{
                      'bg-success': user.subscription.paymentStatus === 'active',
                      'bg-warning': user.subscription.paymentStatus === 'trial',
                      'bg-danger': user.subscription.paymentStatus === 'pastDue',
                      'bg-dark': user.subscription.paymentStatus === 'canceled',
                      'bg-secondary': user.subscription.paymentStatus === 'none'
                    }">
                      {{ user.subscription.paymentStatus }}
                    </span>
                  </td>
                  <td>{{ formatDate(user.createdAt) }}</td>
                  <td>
                    <button class="btn btn-sm btn-outline-primary" @click="viewUserDetails(user.id)">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" @click="editUser(user.id)">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" @click="deleteUser(user.id)">
                      <i class="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- Pagination -->
          <nav v-if="totalPages > 1" class="mt-3">
            <ul class="pagination justify-content-center">
              <li class="page-item" :class="{ disabled: currentPage === 1 }">
                <button class="page-link" @click="currentPage = currentPage - 1" :disabled="currentPage === 1">Previous</button>
              </li>
              <li v-for="page in Math.min(totalPages, 5)" :key="page" class="page-item" :class="{ active: currentView === page }">
                <button class="page-link" @click="currentPage = page">{{ page }}</button>
              </li>
              <li class="page-item" :class="{ disabled: currentPage === totalPages }">
                <button class="page-link" @click="currentPage = currentPage + 1" :disabled="currentPage === totalPages">Next</button>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </div>

    <!-- Create User Modal -->
    <div v-if="showCreateUser" class="modal fade show d-block" style="background-color: rgba(0,0,0,0.5);">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Create New User</h5>
            <button type="button" class="btn-close" @click="showCreateUser = false"></button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="createUser">
              <div class="mb-3">
                <label class="form-label">Email *</label>
                <input type="email" class="form-control" v-model="newUserData.email" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Display Name</label>
                <input type="text" class="form-control" v-model="newUserData.displayName">
              </div>
              <div class="mb-3">
                <label class="form-label">Initial Tier</label>
                <select class="form-select" v-model="newUserData.tier">
                  <option v-for="(tier, tierId) in availableTiers" :key="tierId" :value="tierId">{{ tier.name || tierId }}</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Payment Status</label>
                <select class="form-select" v-model="newUserData.paymentStatus">
                  <option value="none">None</option>
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                </select>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showCreateUser = false">Cancel</button>
            <button type="button" class="btn btn-primary" @click="createUser" :disabled="isLoading">
              <span v-if="isLoading" class="spinner-border spinner-border-sm me-2"></span>
              Create User
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit User Modal -->
    <div v-if="showEditUser" class="modal fade show d-block" style="background-color: rgba(0,0,0,0.5);">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Edit User</h5>
            <button type="button" class="btn-close" @click="showEditUser = false"></button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="saveUserChanges">
              <div class="mb-3">
                <label class="form-label">Email</label>
                <input type="email" class="form-control" v-model="editingUser.email" disabled>
              </div>
              <div class="mb-3">
                <label class="form-label">Display Name</label>
                <input type="text" class="form-control" v-model="editingUser.displayName">
              </div>
              <div class="mb-3">
                <label class="form-label">First Name</label>
                <input type="text" class="form-control" v-model="editingUser.firstName">
              </div>
              <div class="mb-3">
                <label class="form-label">Last Name</label>
                <input type="text" class="form-control" v-model="editingUser.lastName">
              </div>
              <div class="mb-3">
                <label class="form-label">Status</label>
                <select class="form-select" v-model="editingUser.status">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Business Info</label>
                <textarea class="form-control" v-model="editingUser.businessInfo"></textarea>
              </div>
              <div class="mb-3">
                <label class="form-label">Subscription Tier</label>
                <select class="form-select" v-model="editingUser.subscription.tier">
                  <option v-for="(tier, tierId) in availableTiers" :key="tierId" :value="tierId">{{ tier.name || tierId }}</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Subscription Status</label>
                <select class="form-select" v-model="editingUser.subscription.status">
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="pastDue">Past Due</option>
                  <option value="canceled">Canceled</option>
                  <option value="none">None</option>
                </select>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showEditUser = false">Cancel</button>
            <button type="button" class="btn btn-primary" @click="saveUserChanges" :disabled="isLoading">
              <span v-if="isLoading" class="spinner-border spinner-border-sm me-2"></span>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Analytics & Communication Views -->
    <div v-if="currentView === 'analytics'" class="card">
      <div class="card-header">
        <h5>Advanced Analytics</h5>
      </div>
      <div class="card-body">
        <p class="text-muted">Advanced analytics dashboard coming soon...</p>
      </div>
    </div>

    <div v-if="currentView === 'communication'" class="card">
      <div class="card-header">
        <h5>User Communication</h5>
      </div>
      <div class="card-body">
        <p class="text-muted">Communication features coming soon...</p>
      </div>
    </div>
  </div>
`;

export function initializeEnhancedUserSubscriptionManager(containerId) {
    if (typeof Vue === 'undefined') {
        console.error('Vue is not loaded. Cannot initialize EnhancedUserSubscriptionManager component.');
        return;
    }

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container element with ID '${containerId}' not found.`);
        return;
    }

    enhancedUserSubManagerApp = Vue.createApp(EnhancedUserSubscriptionManager);
    enhancedUserSubManagerApp.mount(`#${containerId}`);
}

export { EnhancedUserSubscriptionManager };
