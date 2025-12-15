/**
 * Enhanced Admin User Subscription Manager
 * Version: 3.0.0-2025-01-06
 * 
 * Focused subscription management system with:
 * - Real-time subscription status tracking
 * - Tier management and migrations
 * - Subscription lifecycle management
 * - Status-based user filtering and actions
 * - Automated status monitoring
 * - Subscription analytics dashboard
 */

import { auth, rtdb, ref, get, set, update, push, query, orderByChild, equalTo, limitToFirst, orderByKey, limitToLast, remove, onValue, off } from '../../../config/firebase-config.js';
import { showToast } from '../../../utils/toast.js';
import AccessControl from '../services/access-control-service.js';
import { getSubscriptionTiers } from '../services/subscription-service.js';
import { safeSubscriptionUpdate } from '../../../utils/subscription-validation.js';

let enhancedUserSubManagerApp = null;

const EnhancedUserSubscriptionManager = {
  data() {
    return {
      // Navigation
      currentView: 'status', // 'status', 'tiers', 'lifecycle', 'analytics'
      
      // Subscription Status Groups
      statusGroups: {
        active: [],
        trial: [],
        pastDue: [],
        canceled: [],
        expired: [],
        paused: [],
        pending: [],
        none: []
      },
      
      // Real-time Status Monitoring
      realtimeMonitoring: {
        enabled: true,
        alerts: [],
        statusChanges: [],
        expiringSubscriptions: [],
        failedPayments: []
      },
      
      // Dashboard Analytics
      dashboardMetrics: {
        totalUsers: 0,
        activeSubscriptions: 0,
        trialUsers: 0,
        expiredSubscriptions: 0,
        revenue: 0,
        mrr: 0, // Monthly Recurring Revenue
        churnRate: 0,
        conversionRate: 0,
        tierDistribution: {},
        statusDistribution: {},
        recentActivity: []
      },
      
      // Subscription Lifecycle
      lifecycleSettings: {
        trialDuration: 14, // days
        gracePeriod: 7, // days after expiration
        autoRenewal: true,
        reminderDays: [7, 3, 1], // days before expiration
        reactivationWindow: 30 // days after cancellation
      },
      
      // User Management
      searchQuery: '',
      searchType: 'email',
      allUsers: [],
      filteredUsers: [],
      selectedUsers: [],
      quickAction: '',
      
      // Filters
      filters: {
        status: 'all',
        tier: 'all',
        dateRange: 'all',
        sortBy: 'lastActivity',
        sortOrder: 'desc',
        showExpiring: false,
        showPastDue: false
      },
      
      // Pagination
      currentPage: 1,
      usersPerPage: 25,
      
      // User Details
      selectedUser: null,
      selectedUserSubscription: null,
      userStatusHistory: [],
      userPaymentHistory: [],
      
      // Tier Management
      availableTiers: {},
      availableFeatures: {},
      availableLimits: {},
      tierMigrations: {
        scheduled: [],
        history: []
      },
      
      // Bulk Operations
      bulkOperation: {
        type: '', // 'status', 'tier', 'extend', 'cancel'
        targetValue: '',
        affectedUsers: [],
        scheduledDate: null
      },
      
      // Modals
      showStatusChangeModal: false,
      showTierChangeModal: false,
      showLifecycleSettingsModal: false,
      showBulkOperationModal: false,
      showUserDetailsModal: false,
      
      // Loading States
      isLoading: false,
      isLoadingUser: false,
      isLoadingSubscription: false,
      isLoadingAnalytics: false,
      
      // Settings
      autoRefreshInterval: 30000, // 30 seconds
      autoRefreshTimer: null,
      
      // Additional data for new views
      tierMigration: {
        fromTier: '',
        toTier: ''
      },
      tierMigrationPreview: null,
      recentTierChanges: [],
      newReminderDay: null,
      gracePeriodUsers: [],
      recentlyCanceledUsers: [],
      
      // Analytics computed values
      avgCustomerValue: 0,
      newSubscriptionsCount: 0,
      upgradesCount: 0,
      downgradesCount: 0,
      
      // For user creation
      showCreateUser: false,
      newUserData: {
        email: '',
        displayName: '',
        tier: 'free',
        paymentStatus: 'none'
      },
      
      // For user editing
      showEditUser: false,
      editingUser: null,
      
      // User details modal
      showUserDetailsModal: false,
      selectedUser: null,
      userStatusHistory: [],
      
      // Loading states for specific operations
      isLoadingAnalytics: false,
      
      // Tier Editor
      showTierEditor: false,
      editingTier: null,
      tierFormData: {
        id: '',
        name: '',
        description: '',
        monthlyPrice: 0,
        annualPrice: 0,
        features: {},
        limits: {
          locations: 1,
          devicesPerLocation: 100
        },
        active: true
      },
      
      // Migration Patterns
      migrationPatterns: [],
      
      // Feature Comparison
      showFeatureComparison: false
    };
  },
  
  async mounted() {
    await this.loadTierDefinitions();
    await this.loadAllSubscriptions();
    await this.loadLifecycleData();
    this.startRealtimeMonitoring();
    this.startAutoRefresh();
    this.checkExpiringSubscriptions();
  },
  
  beforeUnmount() {
    this.stopRealtimeMonitoring();
    this.stopAutoRefresh();
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
    },
    
    statusSummary() {
      const summary = {};
      Object.entries(this.statusGroups).forEach(([status, users]) => {
        summary[status] = users.length;
      });
      return summary;
    },
    
    activeStatusCounts() {
      return {
        active: this.statusGroups.active.length,
        trial: this.statusGroups.trial.length,
        pastDue: this.statusGroups.pastDue.length,
        total: this.dashboardMetrics.totalUsers
      };
    },
    
    criticalAlerts() {
      return [
        ...this.realtimeMonitoring.expiringSubscriptions.filter(s => s.daysUntilExpiry <= 3),
        ...this.realtimeMonitoring.failedPayments
      ];
    }
  },
  
  methods: {
    // Navigation
    async setCurrentView(view) {
      this.currentView = view;
      
      // Stop realtime monitoring when not in status view
      if (view !== 'status') {
        this.stopRealtimeMonitoring();
        this.stopAutoRefresh();
      } else {
        this.startRealtimeMonitoring();
        this.startAutoRefresh();
      }
      
      // Load view-specific data
      switch(view) {
        case 'tiers':
          await this.loadTierDefinitions();
          await this.loadRecentTierChanges();
          this.$nextTick(() => {
            this.initializeTierCharts();
          });
          break;
        case 'lifecycle':
          await this.loadLifecycleData();
          break;
        case 'analytics':
          await this.loadAnalytics();
          break;
      }
    },
    
    // Real-time Monitoring
    startRealtimeMonitoring() {
      const subscriptionsRef = ref(rtdb, 'subscriptions');
      
      this.realtimeListener = onValue(subscriptionsRef, (snapshot) => {
        if (snapshot.exists()) {
          const subscriptions = snapshot.val();
          this.processRealtimeUpdates(subscriptions);
        }
      });
    },
    
    stopRealtimeMonitoring() {
      if (this.realtimeListener) {
        off(ref(rtdb, 'subscriptions'), this.realtimeListener);
        this.realtimeListener = null;
      }
    },
    
    processRealtimeUpdates(subscriptions) {
      Object.entries(subscriptions).forEach(([userId, subscription]) => {
        // Check for status changes
        const existingUser = this.findUserInStatusGroups(userId);
        if (existingUser && existingUser.subscription?.status !== subscription.status) {
          this.handleStatusChange(userId, existingUser.subscription?.status, subscription.status);
        }
        
        // Check for payment failures
        if (subscription.lastPaymentFailed) {
          this.addPaymentFailureAlert(userId, subscription);
        }
      });
    },
    
    handleStatusChange(userId, oldStatus, newStatus) {
      const alert = {
        id: Date.now(),
        userId,
        oldStatus,
        newStatus,
        timestamp: Date.now(),
        type: 'status_change'
      };
      
      this.realtimeMonitoring.statusChanges.unshift(alert);
      
      // Keep only last 50 changes
      if (this.realtimeMonitoring.statusChanges.length > 50) {
        this.realtimeMonitoring.statusChanges = this.realtimeMonitoring.statusChanges.slice(0, 50);
      }
      
      // Refresh data to update UI
      this.loadAllSubscriptions();
    },
    
    startAutoRefresh() {
      this.autoRefreshTimer = setInterval(() => {
        this.refreshDashboard();
      }, this.autoRefreshInterval);
    },
    
    stopAutoRefresh() {
      if (this.autoRefreshTimer) {
        clearInterval(this.autoRefreshTimer);
      }
    },
    
    async refreshDashboard() {
      await this.loadAllSubscriptions();
      this.checkExpiringSubscriptions();
      this.calculateMetrics();
    },
    
    findUserInStatusGroups(userId) {
      for (const [status, users] of Object.entries(this.statusGroups)) {
        const user = users.find(u => u.id === userId);
        if (user) return user;
      }
      return null;
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
    
    // Subscription Loading and Grouping
    async loadAllSubscriptions() {
      this.isLoading = true;
      try {
        // Reset status groups
        Object.keys(this.statusGroups).forEach(key => {
          this.statusGroups[key] = [];
        });
        
        // Load users and subscriptions
        const usersSnapshot = await get(ref(rtdb, 'users'));
        const users = usersSnapshot.val() || {};
        
        const subscriptionsSnapshot = await get(ref(rtdb, 'subscriptions'));
        const subscriptions = subscriptionsSnapshot.val() || {};
        
        // Process and group by status
        this.allUsers = Object.entries(users).map(([id, userData]) => {
          const subscription = subscriptions[id] || {
            tier: 'free',
            status: 'none',
            paymentStatus: 'none'
          };
          
          // Normalize status
          const status = subscription.paymentStatus || subscription.status || 'none';
          
          const userWithSub = {
            id,
            ...userData,
            subscription: {
              ...subscription,
              status,
              daysUntilExpiration: this.calculateDaysUntilExpiration(subscription.expirationDate)
            }
          };
          
          // Add to appropriate status group
          if (this.statusGroups[status]) {
            this.statusGroups[status].push(userWithSub);
          } else {
            this.statusGroups.none.push(userWithSub);
          }
          
          return userWithSub;
        });
        
        // Update metrics
        this.dashboardMetrics.totalUsers = this.allUsers.length;
        this.dashboardMetrics.activeSubscriptions = this.statusGroups.active.length;
        this.dashboardMetrics.trialUsers = this.statusGroups.trial.length;
        this.dashboardMetrics.expiredSubscriptions = this.statusGroups.expired.length;
        
        this.calculateMetrics();
        this.applyFilters();
        
      } catch (error) {
        console.error('Error loading subscriptions:', error);
        showToast('Failed to load subscription data', 'error');
      } finally {
        this.isLoading = false;
      }
    },
    
    calculateDaysUntilExpiration(expirationDate) {
      if (!expirationDate) return null;
      const days = Math.floor((expirationDate - Date.now()) / (1000 * 60 * 60 * 24));
      return days;
    },
    
    checkExpiringSubscriptions() {
      this.realtimeMonitoring.expiringSubscriptions = [];
      
      this.statusGroups.active.forEach(user => {
        const daysUntilExpiry = user.subscription.daysUntilExpiration;
        if (daysUntilExpiry !== null && daysUntilExpiry <= 7) {
          this.realtimeMonitoring.expiringSubscriptions.push({
            userId: user.id,
            email: user.email,
            daysUntilExpiry,
            expirationDate: user.subscription.expirationDate,
            tier: user.subscription.tierId || user.subscription.tier || 'free'
          });
        }
      });
      
      // Sort by days until expiry
      this.realtimeMonitoring.expiringSubscriptions.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    },
    
    calculateMetrics() {
      // Calculate tier distribution
      this.dashboardMetrics.tierDistribution = {};
      this.dashboardMetrics.statusDistribution = {};
      
      this.allUsers.forEach(user => {
        const tier = user.subscription?.tier || 'free';
        const status = user.subscription?.status || 'none';
        
        this.dashboardMetrics.tierDistribution[tier] = (this.dashboardMetrics.tierDistribution[tier] || 0) + 1;
        this.dashboardMetrics.statusDistribution[status] = (this.dashboardMetrics.statusDistribution[status] || 0) + 1;
      });
      
      // Calculate MRR
      this.dashboardMetrics.mrr = 0;
      this.statusGroups.active.forEach(user => {
        const tierData = this.availableTiers[user.subscription.tier];
        if (tierData && tierData.monthlyPrice) {
          this.dashboardMetrics.mrr += tierData.monthlyPrice;
        }
      });
      
      // Calculate conversion rate (trial to paid)
      const trialCount = this.statusGroups.trial.length;
      const activeCount = this.statusGroups.active.length;
      this.dashboardMetrics.conversionRate = trialCount > 0 
        ? ((activeCount / (trialCount + activeCount)) * 100).toFixed(1)
        : 0;
      
      // Calculate churn rate
      const canceledCount = this.statusGroups.canceled.length;
      this.dashboardMetrics.churnRate = activeCount > 0
        ? ((canceledCount / (activeCount + canceledCount)) * 100).toFixed(1)
        : 0;
    },
    
    applyFilters() {
      let filtered = [];
      
      // Start with status filter
      if (this.filters.status === 'all') {
        filtered = [...this.allUsers];
      } else if (this.statusGroups[this.filters.status]) {
        filtered = [...this.statusGroups[this.filters.status]];
      }
      
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
      
      // Special filters
      if (this.filters.showExpiring) {
        filtered = filtered.filter(user => 
          user.subscription.daysUntilExpiration !== null && 
          user.subscription.daysUntilExpiration <= 7
        );
      }
      
      if (this.filters.showPastDue) {
        filtered = filtered.filter(user => 
          user.subscription.status === 'pastDue'
        );
      }
      
      // Sort
      filtered.sort((a, b) => {
        let valueA, valueB;
        
        switch (this.filters.sortBy) {
          case 'lastActivity':
            valueA = a.subscription?.lastUpdated || a.createdAt || 0;
            valueB = b.subscription?.lastUpdated || b.createdAt || 0;
            break;
          case 'expiration':
            valueA = a.subscription?.expirationDate || Infinity;
            valueB = b.subscription?.expirationDate || Infinity;
            break;
          case 'email':
            valueA = a.email || '';
            valueB = b.email || '';
            break;
          case 'tier':
            valueA = a.subscription?.tier || '';
            valueB = b.subscription?.tier || '';
            break;
          case 'status':
            valueA = a.subscription?.status || '';
            valueB = b.subscription?.status || '';
            break;
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
    
    // Quick Actions and Bulk Operations
    async executeQuickAction() {
      if (!this.quickAction || this.selectedUsers.length === 0) {
        showToast('Please select an action and users', 'warning');
        return;
      }
      
      const [actionType, actionValue] = this.quickAction.split(':');
      const confirmation = confirm(`Apply ${actionType} action to ${this.selectedUsers.length} users?`);
      if (!confirmation) return;
      
      this.isLoading = true;
      try {
        const updates = {};
        const timestamp = Date.now();
        
        this.selectedUsers.forEach(user => {
          const basePath = `subscriptions/${user.id}`;
          
          switch (actionType) {
            case 'status':
              updates[`${basePath}/status`] = actionValue;
              updates[`${basePath}/paymentStatus`] = actionValue;
              updates[`${basePath}/lastUpdated`] = timestamp;
              updates[`${basePath}/history/${timestamp}`] = {
                action: 'status_change',
                from: user.subscription?.status,
                to: actionValue,
                timestamp,
                adminUser: auth.currentUser?.uid || 'admin'
              };
              break;
              
            case 'tier':
              const tierData = this.availableTiers[actionValue];
              updates[`${basePath}/tier`] = actionValue;
              updates[`${basePath}/lastUpdated`] = timestamp;
              if (tierData) {
                updates[`${basePath}/features`] = tierData.features || {};
                updates[`${basePath}/limits`] = tierData.limits || {};
                updates[`${basePath}/monthlyPrice`] = tierData.monthlyPrice || 0;
              }
              updates[`${basePath}/history/${timestamp}`] = {
                action: 'tier_change',
                from: user.subscription?.tier,
                to: actionValue,
                timestamp,
                adminUser: auth.currentUser?.uid || 'admin'
              };
              break;
              
            case 'extend':
              const days = parseInt(actionValue);
              const currentExpiry = user.subscription?.expirationDate || timestamp;
              const newExpiry = currentExpiry + (days * 24 * 60 * 60 * 1000);
              updates[`${basePath}/expirationDate`] = newExpiry;
              updates[`${basePath}/lastUpdated`] = timestamp;
              updates[`${basePath}/history/${timestamp}`] = {
                action: 'subscription_extended',
                days,
                newExpirationDate: newExpiry,
                timestamp,
                adminUser: auth.currentUser?.uid || 'admin'
              };
              break;
              
            case 'activate_trial':
              updates[`${basePath}/status`] = 'trial';
              updates[`${basePath}/paymentStatus`] = 'trial';
              updates[`${basePath}/trialStartDate`] = timestamp;
              updates[`${basePath}/trialEndDate`] = timestamp + (this.lifecycleSettings.trialDuration * 24 * 60 * 60 * 1000);
              updates[`${basePath}/lastUpdated`] = timestamp;
              updates[`${basePath}/history/${timestamp}`] = {
                action: 'trial_activated',
                duration: this.lifecycleSettings.trialDuration,
                timestamp,
                adminUser: auth.currentUser?.uid || 'admin'
              };
              break;
          }
        });
        
        await update(ref(rtdb, '/'), updates);
        showToast(`Successfully updated ${this.selectedUsers.length} subscriptions`, 'success');
        
        // Reset and reload
        this.selectedUsers = [];
        this.quickAction = '';
        await this.loadAllSubscriptions();
        
      } catch (error) {
        console.error('Error executing quick action:', error);
        showToast('Action failed: ' + error.message, 'error');
      } finally {
        this.isLoading = false;
      }
    },
    
    // Individual Status Management
    async changeUserStatus(user, newStatus) {
      const confirmation = confirm(`Change ${user.email}'s status to ${newStatus}?`);
      if (!confirmation) return;
      
      try {
        const timestamp = Date.now();
        const updates = {
          [`subscriptions/${user.id}/status`]: newStatus,
          [`subscriptions/${user.id}/paymentStatus`]: newStatus,
          [`subscriptions/${user.id}/lastUpdated`]: timestamp,
          [`subscriptions/${user.id}/history/${timestamp}`]: {
            action: 'status_change',
            from: user.subscription?.status,
            to: newStatus,
            timestamp,
            adminUser: auth.currentUser?.uid || 'admin'
          }
        };
        
        await update(ref(rtdb, '/'), updates);
        showToast('Status updated successfully', 'success');
        await this.loadAllSubscriptions();
        
      } catch (error) {
        console.error('Error changing status:', error);
        showToast('Failed to update status', 'error');
      }
    },
    
    // Tier Management
    async changeUserTier(user, newTier) {
      const confirmation = confirm(`Change ${user.email}'s tier to ${newTier}?`);
      if (!confirmation) return;
      
      try {
        const timestamp = Date.now();
        const tierData = this.availableTiers[newTier];
        
        const updates = {
          [`subscriptions/${user.id}/tier`]: newTier,
          [`subscriptions/${user.id}/lastUpdated`]: timestamp,
          [`subscriptions/${user.id}/history/${timestamp}`]: {
            action: 'tier_change',
            from: user.subscription?.tier,
            to: newTier,
            timestamp,
            adminUser: auth.currentUser?.uid || 'admin'
          }
        };
        
        if (tierData) {
          updates[`subscriptions/${user.id}/features`] = tierData.features || {};
          updates[`subscriptions/${user.id}/limits`] = tierData.limits || {};
          updates[`subscriptions/${user.id}/monthlyPrice`] = tierData.monthlyPrice || 0;
        }
        
        await update(ref(rtdb, '/'), updates);
        showToast('Tier updated successfully', 'success');
        await this.loadAllSubscriptions();
        
      } catch (error) {
        console.error('Error changing tier:', error);
        showToast('Failed to update tier', 'error');
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
        
        // SAFETY CHECK: Ensure user doesn't already exist to prevent overwrites
        const userRef = ref(rtdb, `users/${userId}`);
        const subscriptionRef = ref(rtdb, `subscriptions/${userId}`);
        
        const existingUserSnapshot = await get(userRef);
        if (existingUserSnapshot.exists()) {
            console.log(`⚠️ [EnhancedUserSubscriptionManager] User ${userId} already exists, merging data instead of overwriting`);
            const existingUserData = existingUserSnapshot.val();
            
            // Preserve existing data, especially phone numbers
            const mergedUserData = {
                ...existingUserData,
                ...userData,
                // Explicitly preserve phone numbers if they exist
                phoneNumber: existingUserData.phoneNumber || userData.phoneNumber,
                phone: existingUserData.phone || userData.phone,
                businessPhone: existingUserData.businessPhone || userData.businessPhone,
                updatedAt: Date.now()
            };
            
            await update(userRef, mergedUserData);
        } else {
            await set(userRef, userData);
        }
        
        // Check subscription as well
        const existingSubscriptionSnapshot = await get(subscriptionRef);
        if (existingSubscriptionSnapshot.exists()) {
            console.log(`⚠️ [EnhancedUserSubscriptionManager] Subscription ${userId} already exists, merging data`);
            const existingSubscriptionData = existingSubscriptionSnapshot.val();
            const mergedSubscriptionData = {
                ...existingSubscriptionData,
                ...subscriptionData,
                updatedAt: Date.now()
            };
            await update(subscriptionRef, mergedSubscriptionData);
        } else {
            await set(subscriptionRef, subscriptionData);
        }
        
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
        
        // Also check the tiers path
        if (Object.keys(this.availableTiers).length === 0) {
          const tiersSnapshot = await get(ref(rtdb, 'tiers'));
          if (tiersSnapshot.exists()) {
            this.availableTiers = tiersSnapshot.val();
          }
        }
        
        // Normalize existing tiers to ensure they have required fields
        const normalizedTiers = {};
        const currentTime = Date.now();
        
        Object.entries(this.availableTiers).forEach(([tierId, tier]) => {
          normalizedTiers[tierId] = {
            ...tier,
            // Ensure createdAt exists
            createdAt: tier.createdAt || currentTime,
            // Ensure updatedAt exists
            updatedAt: tier.updatedAt || currentTime,
            // Ensure active field exists
            active: tier.active !== undefined ? tier.active : true,
            // Ensure features object exists
            features: tier.features || {},
            // Ensure limits object exists
            limits: tier.limits || { locations: 1, devicesPerLocation: 100 }
          };
        });
        
        this.availableTiers = normalizedTiers;
        
        // Populate available features and limits from loaded tiers
        this.populateAvailableFeaturesAndLimits();
        
      } catch (error) {
        console.error('Error loading tier definitions:', error);
        this.availableTiers = {};
      }
    },
    
    populateAvailableFeaturesAndLimits() {
      const features = {};
      const limits = new Set();
      
      // Define common features with display names
      const commonFeatures = {
        wifiBasic: 'Basic WiFi Analytics',
        wifiAdvanced: 'Advanced WiFi Analytics',
        wifiEnterprise: 'Enterprise WiFi Features',
        analyticsBasic: 'Basic Analytics',
        analyticsAdvanced: 'Advanced Analytics',
        analyticsRealtime: 'Real-time Analytics',
        whatsappBasic: 'WhatsApp Basic Integration',
        whatsappAdvanced: 'Advanced WhatsApp Features',
        whatsappCampaigns: 'WhatsApp Campaigns',
        guestBasic: 'Basic Guest Management',
        guestAdvanced: 'Advanced Guest Features',
        rewardsBasic: 'Basic Rewards Program',
        rewardsAdvanced: 'Advanced Rewards Features',
        campaignBasic: 'Basic Marketing Campaigns',
        campaignAdvanced: 'Advanced Campaign Tools'
      };
      
      // Start with common features
      Object.assign(features, commonFeatures);
      
      // Add any additional features found in tiers
      Object.values(this.availableTiers).forEach(tier => {
        if (tier.features) {
          Object.keys(tier.features).forEach(f => {
            if (!features[f]) {
              // Convert camelCase to readable name
              features[f] = f.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            }
          });
        }
        if (tier.limits) Object.keys(tier.limits).forEach(l => limits.add(l));
      });
      
      this.availableFeatures = features;
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
        
        // Populate edit form - PRESERVE ALL EXISTING FIELDS
        this.editingUser = {
          id: userId,
          email: user.email,
          displayName: user.displayName || '',
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          status: user.status || 'active',
          businessInfo: user.businessInfo || {},
          subscription: subscription || {},
          // IMPORTANT: Preserve existing fields that aren't in the form
          _existingUserData: user  // Store complete existing data
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
        
        // FIXED: Preserve existing fields by starting with existing data
        const userUpdates = {
          // Start with existing user data to preserve all fields
          ...this.editingUser._existingUserData,
          // Then override only the fields being edited
          displayName: this.editingUser.displayName,
          firstName: this.editingUser.firstName,
          lastName: this.editingUser.lastName,
          status: this.editingUser.status,
          businessInfo: this.editingUser.businessInfo,
          updatedAt: Date.now(),
          updatedBy: auth.currentUser?.uid
        };
        
        // SAFETY CHECK: Log if phoneNumber exists to monitor preservation
        if (this.editingUser._existingUserData?.phoneNumber) {
          console.log(`✅ [USER UPDATE] Preserving phoneNumber for user ${userId}:`, this.editingUser._existingUserData.phoneNumber);
        }
        
        // VALIDATION: Verify critical fields are preserved
        const criticalFields = ['phoneNumber', 'email', 'role', 'isAdmin'];
        criticalFields.forEach(field => {
          if (this.editingUser._existingUserData?.[field] && !userUpdates[field]) {
            console.warn(`⚠️ [USER UPDATE] Critical field '${field}' missing from update for user ${userId}`);
            userUpdates[field] = this.editingUser._existingUserData[field];
          }
        });
        
        console.log(`📝 [USER UPDATE] Updating user ${userId} with preserved fields:`, {
          preservedFields: Object.keys(this.editingUser._existingUserData || {}),
          updatedFields: ['displayName', 'firstName', 'lastName', 'status', 'businessInfo'],
          hasPhoneNumber: !!userUpdates.phoneNumber
        });
        
        // This now preserves phoneNumber and other existing fields
        await update(ref(rtdb, `users/${userId}`), userUpdates);
        
        // Update subscription if changed - using safe validation
        if (this.editingUser.subscription) {
          const subscriptionUpdates = {
            tier: this.editingUser.subscription.tier,
            status: this.editingUser.subscription.status,
            updatedAt: Date.now(),
            updatedBy: auth.currentUser?.uid
          };
          
          // Use safe validation to prevent tier/tierId conflicts
          await safeSubscriptionUpdate(userId, subscriptionUpdates);
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
    },
    
    formatDateTime(timestamp) {
      if (!timestamp) return 'N/A';
      return new Date(timestamp).toLocaleString();
    },
    
    getStatusBadgeClass(status) {
      const classes = {
        active: 'bg-success',
        trial: 'bg-info',
        pastDue: 'bg-warning',
        expired: 'bg-danger',
        canceled: 'bg-dark',
        paused: 'bg-secondary',
        none: 'bg-secondary'
      };
      return classes[status] || 'bg-secondary';
    },
    
    getTierBadgeClass(tier) {
      const classes = {
        premium: 'bg-success',
        pro: 'bg-primary',
        basic: 'bg-info',
        free: 'bg-secondary'
      };
      return classes[tier] || 'bg-secondary';
    },
    
    // Tier Management Methods
    viewTierUsers(tierId) {
      this.filters.tier = tierId;
      this.filters.status = 'all';
      this.setCurrentView('status');
      this.applyFilters();
    },
    
    async executeTierMigration() {
      const fromTier = this.tierMigration.fromTier;
      const toTier = this.tierMigration.toTier;
      
      if (!fromTier || !toTier || fromTier === toTier) return;
      
      // Get users in the source tier
      const usersToMigrate = this.allUsers.filter(user => user.subscription?.tier === fromTier);
      
      if (usersToMigrate.length === 0) {
        showToast('No users found in the selected tier', 'warning');
        return;
      }
      
      // Calculate revenue impact
      const fromTierData = this.availableTiers[fromTier];
      const toTierData = this.availableTiers[toTier];
      const revenueImpact = usersToMigrate.length * ((toTierData?.monthlyPrice || 0) - (fromTierData?.monthlyPrice || 0));
      
      this.tierMigrationPreview = {
        count: usersToMigrate.length,
        from: fromTierData?.name || fromTier,
        to: toTierData?.name || toTier,
        revenueImpact
      };
      
      const confirmed = confirm(`Migrate ${usersToMigrate.length} users from ${fromTierData?.name} to ${toTierData?.name}? Revenue impact: ${this.formatCurrency(revenueImpact)}`);
      
      if (!confirmed) {
        this.tierMigrationPreview = null;
        return;
      }
      
      try {
        const updates = {};
        const timestamp = Date.now();
        
        usersToMigrate.forEach(user => {
          updates[`subscriptions/${user.id}/tier`] = toTier;
          updates[`subscriptions/${user.id}/lastUpdated`] = timestamp;
          if (toTierData) {
            updates[`subscriptions/${user.id}/features`] = toTierData.features || {};
            updates[`subscriptions/${user.id}/limits`] = toTierData.limits || {};
            updates[`subscriptions/${user.id}/monthlyPrice`] = toTierData.monthlyPrice || 0;
          }
          updates[`subscriptions/${user.id}/history/${timestamp}`] = {
            action: 'tier_migration',
            from: fromTier,
            to: toTier,
            timestamp,
            adminUser: auth.currentUser?.uid || 'admin'
          };
        });
        
        await update(ref(rtdb, '/'), updates);
        
        showToast(`Successfully migrated ${usersToMigrate.length} users`, 'success');
        
        // Reset and reload
        this.tierMigration = { fromTier: '', toTier: '' };
        this.tierMigrationPreview = null;
        await this.loadAllSubscriptions();
        
      } catch (error) {
        console.error('Error executing tier migration:', error);
        showToast('Migration failed: ' + error.message, 'error');
      }
    },
    
    // Lifecycle Methods
    addReminderDay() {
      if (this.newReminderDay && !this.lifecycleSettings.reminderDays.includes(this.newReminderDay)) {
        this.lifecycleSettings.reminderDays.push(this.newReminderDay);
        this.lifecycleSettings.reminderDays.sort((a, b) => b - a);
        this.newReminderDay = null;
      }
    },
    
    removeReminderDay(index) {
      this.lifecycleSettings.reminderDays.splice(index, 1);
    },
    
    async saveLifecycleSettings() {
      try {
        await set(ref(rtdb, 'settings/subscriptionLifecycle'), this.lifecycleSettings);
        showToast('Lifecycle settings saved successfully', 'success');
      } catch (error) {
        console.error('Error saving lifecycle settings:', error);
        showToast('Failed to save settings', 'error');
      }
    },
    
    async loadLifecycleData() {
      try {
        // Load lifecycle settings
        const settingsSnapshot = await get(ref(rtdb, 'settings/subscriptionLifecycle'));
        if (settingsSnapshot.exists()) {
          this.lifecycleSettings = {
            ...this.lifecycleSettings,
            ...settingsSnapshot.val()
          };
        }
        
        // Calculate grace period users
        this.gracePeriodUsers = this.statusGroups.expired.filter(user => {
          const daysSinceExpiry = -this.calculateDaysUntilExpiration(user.subscription?.expirationDate);
          return daysSinceExpiry <= this.lifecycleSettings.gracePeriod;
        });
        
        // Calculate recently canceled users
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        this.recentlyCanceledUsers = this.statusGroups.canceled.filter(user => {
          return user.subscription?.lastUpdated >= thirtyDaysAgo;
        });
        
        // Load recent tier changes
        await this.loadRecentTierChanges();
        
      } catch (error) {
        console.error('Error loading lifecycle data:', error);
      }
    },
    
    async loadRecentTierChanges() {
      try {
        const changes = [];
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        
        // Go through all users and check their history
        for (const user of this.allUsers) {
          if (user.subscription?.history) {
            Object.values(user.subscription.history).forEach(entry => {
              if (entry.action === 'tier_change' && entry.timestamp >= thirtyDaysAgo) {
                changes.push({
                  id: entry.timestamp,
                  timestamp: entry.timestamp,
                  userEmail: user.email,
                  from: entry.from,
                  to: entry.to,
                  adminUser: entry.adminUser
                });
              }
            });
          }
        }
        
        this.recentTierChanges = changes.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
        
        // Also calculate migration patterns
        this.calculateMigrationPatterns(changes);
        
      } catch (error) {
        console.error('Error loading recent tier changes:', error);
      }
    },
    
    calculateMigrationPatterns(changes) {
      const patterns = {};
      
      changes.forEach(change => {
        const key = `${change.from}->${change.to}`;
        if (!patterns[key]) {
          patterns[key] = {
            id: key,
            from: change.from,
            to: change.to,
            count: 0,
            revenueImpact: 0,
            reasons: []
          };
        }
        patterns[key].count++;
        
        // Calculate revenue impact
        const fromTier = this.availableTiers[change.from];
        const toTier = this.availableTiers[change.to];
        const impact = (toTier?.monthlyPrice || 0) - (fromTier?.monthlyPrice || 0);
        patterns[key].revenueImpact += impact;
      });
      
      // Convert to array and add common reasons
      this.migrationPatterns = Object.values(patterns).map(pattern => {
        // Analyze reasons based on direction
        if (pattern.revenueImpact > 0) {
          pattern.reasons = ['Feature needs', 'Growth'];
        } else if (pattern.revenueImpact < 0) {
          pattern.reasons = ['Cost reduction', 'Downsizing'];
        } else {
          pattern.reasons = ['Feature alignment'];
        }
        return pattern;
      }).sort((a, b) => b.count - a.count);
    },
    
    async sendExpirationReminders() {
      const count = this.realtimeMonitoring.expiringSubscriptions.length;
      if (confirm(`Send expiration reminders to ${count} users?`)) {
        // Implementation would connect to email service
        showToast(`Reminder feature coming soon. Would send to ${count} users.`, 'info');
      }
    },
    
    async processGracePeriodUsers() {
      const count = this.gracePeriodUsers.length;
      if (confirm(`Process ${count} users in grace period?`)) {
        try {
          const updates = {};
          const timestamp = Date.now();
          
          this.gracePeriodUsers.forEach(user => {
            updates[`subscriptions/${user.id}/status`] = 'suspended';
            updates[`subscriptions/${user.id}/paymentStatus`] = 'suspended';
            updates[`subscriptions/${user.id}/lastUpdated`] = timestamp;
          });
          
          await update(ref(rtdb, '/'), updates);
          showToast(`Processed ${count} grace period users`, 'success');
          await this.loadAllSubscriptions();
          
        } catch (error) {
          console.error('Error processing grace period users:', error);
          showToast('Failed to process users', 'error');
        }
      }
    },
    
    async reactivateCanceledUsers() {
      const eligibleUsers = this.recentlyCanceledUsers.filter(user => {
        const daysSinceCancellation = Math.floor((Date.now() - user.subscription?.lastUpdated) / (1000 * 60 * 60 * 24));
        return daysSinceCancellation <= this.lifecycleSettings.reactivationWindow;
      });
      
      if (eligibleUsers.length === 0) {
        showToast('No eligible users for reactivation', 'info');
        return;
      }
      
      if (confirm(`Found ${eligibleUsers.length} eligible users for reactivation. Proceed?`)) {
        // Implementation would process reactivation
        showToast(`Reactivation feature coming soon. Would process ${eligibleUsers.length} users.`, 'info');
      }
    },
    
    // Analytics Methods
    async loadAnalytics() {
      this.isLoadingAnalytics = true;
      
      try {
        // Calculate average customer value
        let totalRevenue = 0;
        let activeCount = 0;
        
        this.statusGroups.active.forEach(user => {
          if (user.subscription?.monthlyPrice) {
            totalRevenue += user.subscription.monthlyPrice;
            activeCount++;
          }
        });
        
        this.avgCustomerValue = activeCount > 0 ? Math.round(totalRevenue / activeCount) : 0;
        
        // Calculate growth metrics (30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        
        this.newSubscriptionsCount = 0;
        this.upgradesCount = 0;
        this.downgradesCount = 0;
        
        this.allUsers.forEach(user => {
          if (user.createdAt >= thirtyDaysAgo) {
            this.newSubscriptionsCount++;
          }
          
          if (user.subscription?.history) {
            Object.values(user.subscription.history).forEach(entry => {
              if (entry.timestamp >= thirtyDaysAgo) {
                if (entry.action === 'tier_change') {
                  const fromValue = this.availableTiers[entry.from]?.monthlyPrice || 0;
                  const toValue = this.availableTiers[entry.to]?.monthlyPrice || 0;
                  
                  if (toValue > fromValue) {
                    this.upgradesCount++;
                  } else if (toValue < fromValue) {
                    this.downgradesCount++;
                  }
                }
              }
            });
          }
        });
        
        // Initialize charts if in analytics view
        if (this.currentView === 'analytics') {
          this.$nextTick(() => {
            this.initializeCharts();
          });
        }
        
      } catch (error) {
        console.error('Error loading analytics:', error);
      } finally {
        this.isLoadingAnalytics = false;
      }
    },
    
    initializeCharts() {
      // Initialize status distribution chart
      const statusCtx = document.getElementById('statusChart')?.getContext('2d');
      if (statusCtx && window.Chart) {
        new window.Chart(statusCtx, {
          type: 'doughnut',
          data: {
            labels: Object.keys(this.dashboardMetrics.statusDistribution),
            datasets: [{
              data: Object.values(this.dashboardMetrics.statusDistribution),
              backgroundColor: [
                '#28a745', '#17a2b8', '#ffc107', '#dc3545', '#343a40', '#6c757d', '#6c757d'
              ]
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false
          }
        });
      }
      
      // Initialize tier distribution chart
      const tierCtx = document.getElementById('tierChart')?.getContext('2d');
      if (tierCtx && window.Chart) {
        new window.Chart(tierCtx, {
          type: 'bar',
          data: {
            labels: Object.keys(this.dashboardMetrics.tierDistribution),
            datasets: [{
              label: 'Users',
              data: Object.values(this.dashboardMetrics.tierDistribution),
              backgroundColor: '#007bff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      }
    },
    
    initializeTierCharts() {
      // Initialize tier revenue chart
      const revenueCtx = document.getElementById('tierRevenueChart')?.getContext('2d');
      if (revenueCtx && window.Chart) {
        const tierNames = Object.keys(this.availableTiers);
        const revenueData = tierNames.map(tierId => {
          const tier = this.availableTiers[tierId];
          const userCount = this.dashboardMetrics.tierDistribution[tierId] || 0;
          return (tier.monthlyPrice || 0) * userCount;
        });
        
        new window.Chart(revenueCtx, {
          type: 'bar',
          data: {
            labels: tierNames.map(id => this.availableTiers[id].name || id),
            datasets: [{
              label: 'Monthly Revenue',
              data: revenueData,
              backgroundColor: ['#6c757d', '#17a2b8', '#007bff', '#28a745']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: 'Revenue by Tier'
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: (value) => '$' + value.toLocaleString()
                }
              }
            }
          }
        });
      }
      
      // Initialize tier retention chart (mock data for demo)
      const retentionCtx = document.getElementById('tierRetentionChart')?.getContext('2d');
      if (retentionCtx && window.Chart) {
        const tierNames = Object.keys(this.availableTiers);
        const retentionData = {
          'free': 65,
          'basic': 75,
          'pro': 85,
          'premium': 92
        };
        
        new window.Chart(retentionCtx, {
          type: 'line',
          data: {
            labels: tierNames.map(id => this.availableTiers[id].name || id),
            datasets: [{
              label: 'Retention Rate %',
              data: tierNames.map(id => retentionData[id] || Math.floor(Math.random() * 30) + 70),
              borderColor: '#28a745',
              backgroundColor: 'rgba(40, 167, 69, 0.1)',
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: '30-Day Retention by Tier'
              }
            },
            scales: {
              y: {
                beginAtZero: false,
                min: 50,
                max: 100,
                ticks: {
                  callback: (value) => value + '%'
                }
              }
            }
          }
        });
      }
    },
    
    // View user details with subscription history
    async viewUserDetails(userOrUserId) {
      // Handle both user object and userId string
      const user = typeof userOrUserId === 'string' 
        ? this.allUsers.find(u => u.id === userOrUserId)
        : userOrUserId;
        
      if (!user) {
        showToast('User not found', 'error');
        return;
      }
      
      this.selectedUser = user;
      this.showUserDetailsModal = true;
      
      // Load user's status history
      if (user.subscription?.history) {
        this.userStatusHistory = Object.values(user.subscription.history)
          .filter(h => h.action === 'status_change' || h.action === 'tier_change')
          .sort((a, b) => b.timestamp - a.timestamp);
      } else {
        this.userStatusHistory = [];
      }
    },
    
    // Payment failure alert helper
    addPaymentFailureAlert(userId, subscription) {
      const existingAlert = this.realtimeMonitoring.failedPayments.find(a => a.userId === userId);
      if (!existingAlert) {
        this.realtimeMonitoring.failedPayments.push({
          userId,
          timestamp: Date.now(),
          subscription
        });
        
        // Keep only last 20 alerts
        if (this.realtimeMonitoring.failedPayments.length > 20) {
          this.realtimeMonitoring.failedPayments = this.realtimeMonitoring.failedPayments.slice(-20);
        }
      }
    },
    
    // Tier Editor Methods
    showCreateTierModal() {
      this.editingTier = null;
      this.tierFormData = {
        id: '',
        name: '',
        description: '',
        monthlyPrice: 0,
        annualPrice: 0,
        features: {},
        limits: {
          locations: 1,
          devicesPerLocation: 100
        },
        active: true
      };
      
      // Pre-populate with default features
      if (this.availableFeatures) {
        Object.keys(this.availableFeatures).forEach(featureId => {
          this.tierFormData.features[featureId] = false;
        });
      }
      
      this.showTierEditor = true;
    },
    
    editTier(tierId, tier) {
      this.editingTier = tierId;
      this.tierFormData = {
        id: tierId,
        name: tier.name || '',
        description: tier.description || '',
        monthlyPrice: tier.monthlyPrice || 0,
        annualPrice: tier.annualPrice || 0,
        features: { ...tier.features } || {},
        limits: {
          locations: tier.limits?.locations || 1,
          devicesPerLocation: tier.limits?.devicesPerLocation || 100
        },
        active: tier.active !== false
      };
      this.showTierEditor = true;
    },
    
    async saveTier() {
      try {
        this.isLoading = true;
        
        const tierId = this.tierFormData.id.toLowerCase().replace(/\s+/g, '_');
        
        if (!tierId || !this.tierFormData.name || this.tierFormData.monthlyPrice < 0) {
          showToast('Please fill in all required fields', 'error');
          return;
        }
        
        // Check if tier already exists (for new tiers)
        if (!this.editingTier && this.availableTiers[tierId]) {
          showToast('A tier with this ID already exists', 'error');
          return;
        }

        // Prepare tier data
        const tierData = {
          name: this.tierFormData.name,
          description: this.tierFormData.description,
          monthlyPrice: this.tierFormData.monthlyPrice,
          annualPrice: this.tierFormData.annualPrice || this.tierFormData.monthlyPrice * 10,
          features: this.tierFormData.features,
          limits: {
            locations: this.tierFormData.limits.locations || 0,
            devicesPerLocation: this.tierFormData.limits.devicesPerLocation || 0
          },
          active: this.tierFormData.active,
          createdAt: this.editingTier ? 
            (this.availableTiers[this.editingTier]?.createdAt || Date.now()) : 
            Date.now(),
          updatedAt: Date.now()
        };
        
        // Convert 0 to Infinity for unlimited
        if (tierData.limits.locations === 0) tierData.limits.locations = Infinity;
        if (tierData.limits.devicesPerLocation === 0) tierData.limits.devicesPerLocation = Infinity;
        
        // Validate tierData for undefined values before saving to Firebase
        const validateData = (obj, path = '') => {
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            if (value === undefined) {
              throw new Error(`Undefined value found at ${currentPath}`);
            }
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              validateData(value, currentPath);
            }
          }
        };
        
        validateData(tierData);
        
        // Save to Firebase
        await set(ref(rtdb, `tiers/${tierId}`), tierData);
        
        showToast(this.editingTier ? 'Tier updated successfully' : 'Tier created successfully', 'success');
        
        // Reset form and reload
        this.showTierEditor = false;
        this.editingTier = null;
        this.tierFormData = {
          id: '',
          name: '',
          description: '',
          monthlyPrice: 0,
          annualPrice: 0,
          features: {},
          limits: {
            locations: 1,
            devicesPerLocation: 100
          },
          active: true
        };
        
        await this.loadTierDefinitions();
        
      } catch (error) {
        console.error('[EnhancedUserSubscriptionManager] Error saving tier:', error);
        console.error('[EnhancedUserSubscriptionManager] Tier data that failed:', tierData);
        console.error('[EnhancedUserSubscriptionManager] Available tiers:', this.availableTiers);
        console.error('[EnhancedUserSubscriptionManager] Editing tier:', this.editingTier);
        showToast('Failed to save tier: ' + error.message, 'error');
      } finally {
        this.isLoading = false;
      }
    },
    
    async toggleTierStatus(tierId) {
      try {
        const newStatus = !this.availableTiers[tierId].active;
        await update(ref(rtdb, `tiers/${tierId}`), { active: newStatus });
        this.availableTiers[tierId].active = newStatus;
        showToast(`Tier ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
      } catch (error) {
        console.error('Error toggling tier status:', error);
        showToast('Failed to update tier status', 'error');
      }
    }
  }
};

EnhancedUserSubscriptionManager.template = `
  <div class="enhanced-user-sub-manager">
    <!-- Navigation Tabs -->
    <ul class="nav nav-tabs mb-4">
      <li class="nav-item">
        <button class="nav-link" :class="{ active: currentView === 'status' }" @click="setCurrentView('status')">
          <i class="fas fa-signal me-2"></i>Status Management
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: currentView === 'tiers' }" @click="setCurrentView('tiers')">
          <i class="fas fa-layer-group me-2"></i>Tier Management
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: currentView === 'lifecycle' }" @click="setCurrentView('lifecycle')">
          <i class="fas fa-sync-alt me-2"></i>Lifecycle
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: currentView === 'analytics' }" @click="setCurrentView('analytics')">
          <i class="fas fa-chart-bar me-2"></i>Analytics
        </button>
      </li>
    </ul>

    <!-- Status Management View -->
    <div v-if="currentView === 'status'" class="status-view">
      <!-- Status Overview Cards -->
      <div class="row mb-4">
        <div class="col-md-2">
          <div class="card border-success">
            <div class="card-body text-center">
              <h3 class="text-success">{{ statusGroups.active.length }}</h3>
              <p class="mb-0">Active</p>
                </div>
              </div>
            </div>
        <div class="col-md-2">
          <div class="card border-info">
            <div class="card-body text-center">
              <h3 class="text-info">{{ statusGroups.trial.length }}</h3>
              <p class="mb-0">Trial</p>
          </div>
        </div>
                </div>
        <div class="col-md-2">
          <div class="card border-warning">
            <div class="card-body text-center">
              <h3 class="text-warning">{{ statusGroups.pastDue.length }}</h3>
              <p class="mb-0">Past Due</p>
              </div>
            </div>
          </div>
        <div class="col-md-2">
          <div class="card border-danger">
            <div class="card-body text-center">
              <h3 class="text-danger">{{ statusGroups.expired.length }}</h3>
              <p class="mb-0">Expired</p>
        </div>
                </div>
              </div>
        <div class="col-md-2">
          <div class="card border-dark">
            <div class="card-body text-center">
              <h3 class="text-dark">{{ statusGroups.canceled.length }}</h3>
              <p class="mb-0">Canceled</p>
            </div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="card border-secondary">
            <div class="card-body text-center">
              <h3 class="text-secondary">{{ statusGroups.none.length }}</h3>
              <p class="mb-0">No Subscription</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Alerts and Monitoring -->
      <div class="row mb-4">
        <div class="col-md-6">
          <div class="card">
            <div class="card-header bg-warning text-dark">
              <h5 class="mb-0"><i class="fas fa-exclamation-triangle me-2"></i>Expiring Soon</h5>
            </div>
            <div class="card-body" style="max-height: 300px; overflow-y: auto;">
              <div v-if="realtimeMonitoring.expiringSubscriptions.length === 0" class="text-muted">
                No subscriptions expiring soon
              </div>
              <div v-else>
                <div v-for="sub in realtimeMonitoring.expiringSubscriptions" :key="sub.userId" 
                     class="d-flex justify-content-between align-items-center mb-2 p-2 border rounded">
                <div>
                    <strong>{{ sub.email }}</strong>
                    <br>
                    <small class="text-muted">Tier: {{ sub.tier }}</small>
                </div>
                  <div class="text-end">
                    <span class="badge" :class="sub.daysUntilExpiry <= 3 ? 'bg-danger' : 'bg-warning'">
                      {{ sub.daysUntilExpiry }} days
                    </span>
                    <br>
                    <button class="btn btn-sm btn-outline-primary mt-1" @click="executeQuickAction('extend:30', sub)">
                      Extend
                    </button>
                  </div>
              </div>
            </div>
          </div>
        </div>
      </div>

        <div class="col-md-6">
      <div class="card">
            <div class="card-header bg-info text-white">
              <h5 class="mb-0"><i class="fas fa-sync-alt me-2"></i>Recent Status Changes</h5>
        </div>
            <div class="card-body" style="max-height: 300px; overflow-y: auto;">
              <div v-if="realtimeMonitoring.statusChanges.length === 0" class="text-muted">
                No recent status changes
          </div>
          <div v-else>
                <div v-for="change in realtimeMonitoring.statusChanges.slice(0, 10)" :key="change.id" 
                     class="mb-2 p-2 border-start border-3 border-info">
                  <small class="text-muted">{{ formatDateTime(change.timestamp) }}</small>
                  <div>
                    User {{ change.userId }} changed from 
                    <span class="badge" :class="getStatusBadgeClass(change.oldStatus)">{{ change.oldStatus }}</span>
                    to 
                    <span class="badge" :class="getStatusBadgeClass(change.newStatus)">{{ change.newStatus }}</span>
                  </div>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>

      <!-- Filters and Quick Actions -->
      <div class="card mb-4">
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4">
              <div class="input-group">
                <span class="input-group-text"><i class="fas fa-search"></i></span>
                <input type="text" class="form-control" placeholder="Search users..." v-model="searchQuery" @input="applyFilters">
              </div>
            </div>
            <div class="col-md-2">
              <select class="form-select" v-model="filters.status" @change="applyFilters">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="pastDue">Past Due</option>
                <option value="expired">Expired</option>
                <option value="canceled">Canceled</option>
                <option value="paused">Paused</option>
                <option value="none">No Subscription</option>
              </select>
            </div>
            <div class="col-md-2">
              <select class="form-select" v-model="filters.tier" @change="applyFilters">
                <option value="all">All Tiers</option>
                <option v-for="(tier, tierId) in availableTiers" :key="tierId" :value="tierId">
                  {{ tier.name || tierId }}
                </option>
                </select>
            </div>
            <div class="col-md-4">
              <div class="btn-group">
                <button class="btn btn-outline-primary" @click="filters.showExpiring = !filters.showExpiring; applyFilters()" 
                        :class="{ active: filters.showExpiring }">
                  <i class="fas fa-clock me-1"></i>Expiring Soon
                </button>
                <button class="btn btn-outline-warning" @click="filters.showPastDue = !filters.showPastDue; applyFilters()"
                        :class="{ active: filters.showPastDue }">
                  <i class="fas fa-exclamation-circle me-1"></i>Past Due
                </button>
              </div>
            </div>
          </div>
          
          <!-- Quick Actions Bar -->
          <div class="row mt-3" v-if="selectedUsers.length > 0">
            <div class="col-12">
              <div class="alert alert-info d-flex justify-content-between align-items-center mb-0">
                <span>{{ selectedUsers.length }} users selected</span>
                <div class="d-flex gap-2">
                  <select class="form-select form-select-sm" style="width: auto;" v-model="quickAction">
                    <option value="">Quick Actions...</option>
                    <optgroup label="Status Changes">
                      <option value="status:active">Activate Subscriptions</option>
                      <option value="status:paused">Pause Subscriptions</option>
                      <option value="status:canceled">Cancel Subscriptions</option>
                    </optgroup>
                    <optgroup label="Tier Changes">
                      <option v-for="(tier, tierId) in availableTiers" :key="tierId" :value="'tier:' + tierId">
                        Change to {{ tier.name || tierId }}
                      </option>
                    </optgroup>
                    <optgroup label="Extensions">
                      <option value="extend:7">Extend 7 Days</option>
                      <option value="extend:30">Extend 30 Days</option>
                      <option value="extend:90">Extend 90 Days</option>
                    </optgroup>
                    <optgroup label="Other">
                      <option value="activate_trial">Activate Trial</option>
                    </optgroup>
                  </select>
                  <button class="btn btn-sm btn-primary" @click="executeQuickAction" :disabled="!quickAction">
                    Execute
                  </button>
                  <button class="btn btn-sm btn-secondary" @click="selectedUsers = []">
                    Clear Selection
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Users Table -->
      <div class="card">
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
                  <th>Status</th>
                  <th>Tier</th>
                  <th>Expiration</th>
                  <th>Last Activity</th>
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
                      <div>
                      <div class="fw-bold">{{ user.displayName || user.email }}</div>
                      <small class="text-muted">{{ user.email }}</small>
                    </div>
                  </td>
                  <td>
                    <span class="badge" :class="getStatusBadgeClass(user.subscription?.status || 'none')">
                      {{ user.subscription?.status || 'none' }}
                    </span>
                    <div v-if="user.subscription?.daysUntilExpiration !== null && user.subscription?.daysUntilExpiration <= 7" 
                         class="small text-danger mt-1">
                      <i class="fas fa-clock"></i> {{ user.subscription.daysUntilExpiration }} days left
                    </div>
                  </td>
                  <td>
                    <span class="badge" :class="getTierBadgeClass(user.subscription?.tier || 'free')">
                      {{ user.subscription?.tier || 'free' }}
                    </span>
                  </td>
                  <td>
                    {{ formatDate(user.subscription?.expirationDate) }}
                  </td>
                  <td>
                    {{ formatDate(user.subscription?.lastUpdated || user.createdAt) }}
                  </td>
                  <td>
                    <div class="btn-group btn-group-sm">
                      <button class="btn btn-outline-primary" @click="viewUserDetails(user)" title="View Details">
                      <i class="fas fa-eye"></i>
                    </button>
                      <div class="btn-group btn-group-sm" role="group">
                        <button type="button" class="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                          <i class="fas fa-cog"></i>
                    </button>
                        <ul class="dropdown-menu">
                          <li><h6 class="dropdown-header">Change Status</h6></li>
                          <li><a class="dropdown-item" href="#" @click.prevent="changeUserStatus(user, 'active')">
                            <i class="fas fa-check text-success me-2"></i>Activate
                          </a></li>
                          <li><a class="dropdown-item" href="#" @click.prevent="changeUserStatus(user, 'paused')">
                            <i class="fas fa-pause text-warning me-2"></i>Pause
                          </a></li>
                          <li><a class="dropdown-item" href="#" @click.prevent="changeUserStatus(user, 'canceled')">
                            <i class="fas fa-times text-danger me-2"></i>Cancel
                          </a></li>
                          <li><hr class="dropdown-divider"></li>
                          <li><h6 class="dropdown-header">Change Tier</h6></li>
                          <li v-for="(tier, tierId) in availableTiers" :key="tierId">
                            <a class="dropdown-item" href="#" @click.prevent="changeUserTier(user, tierId)">
                              <i class="fas fa-layer-group me-2"></i>{{ tier.name || tierId }}
                            </a>
                          </li>
                        </ul>
                      </div>
                    </div>
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
              <li v-for="page in Math.min(totalPages, 5)" :key="page" class="page-item" :class="{ active: currentPage === page }">
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

    <!-- Tier Management View -->
    <div v-if="currentView === 'tiers'" class="tiers-view">
      <!-- Tier Overview -->
      <div class="row mb-4">
        <div class="col-12">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h4 class="mb-0">Subscription Tier Distribution</h4>
            <button class="btn btn-sm btn-outline-primary" @click="showFeatureComparison = !showFeatureComparison">
              <i class="fas fa-table me-1"></i>{{ showFeatureComparison ? 'Hide' : 'Show' }} Feature Comparison
            </button>
          </div>
          
          <!-- Feature Comparison Matrix -->
          <div v-if="showFeatureComparison" class="card mb-4">
            <div class="card-body">
              <h5 class="card-title">Tier Feature Comparison</h5>
              <div class="table-responsive">
                <table class="table table-bordered">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th v-for="(tier, tierId) in availableTiers" :key="tierId" 
                          :class="{ 'table-secondary': tierId === 'free', 'table-info': tierId === 'basic', 
                                   'table-primary': tierId === 'pro', 'table-success': tierId === 'premium' }">
                        {{ tier.name }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Monthly Price</strong></td>
                      <td v-for="(tier, tierId) in availableTiers" :key="tierId">
                        {{ formatCurrency(tier.monthlyPrice || 0) }}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Locations</strong></td>
                      <td v-for="(tier, tierId) in availableTiers" :key="tierId">
                        {{ formatValue(tier.limits?.locations) }}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Devices per Location</strong></td>
                      <td v-for="(tier, tierId) in availableTiers" :key="tierId">
                        {{ formatValue(tier.limits?.devicesPerLocation) }}
                      </td>
                    </tr>
                    <tr v-for="feature in Object.keys(availableFeatures)" :key="feature">
                      <td>{{ availableFeatures[feature] }}</td>
                      <td v-for="(tier, tierId) in availableTiers" :key="tierId" class="text-center">
                        <i v-if="tier.features && tier.features[feature]" class="fas fa-check text-success"></i>
                        <i v-else class="fas fa-times text-danger"></i>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <div class="row">
            <div v-for="(tier, tierId) in availableTiers" :key="tierId" class="col-md-3 mb-3">
              <div class="card">
                <div class="card-header" :class="{
                  'bg-success text-white': tierId === 'premium',
                  'bg-primary text-white': tierId === 'pro',
                  'bg-info text-white': tierId === 'basic',
                  'bg-secondary text-white': tierId === 'free'
                }">
                  <h5 class="mb-0">{{ tier.name || tierId }}</h5>
                </div>
                <div class="card-body">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <span>Users:</span>
                    <strong>{{ dashboardMetrics.tierDistribution[tierId] || 0 }}</strong>
                  </div>
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <span>Monthly Price:</span>
                    <strong>{{ formatCurrency(tier.monthlyPrice || 0) }}</strong>
                  </div>
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <span>MRR:</span>
                    <strong>{{ formatCurrency((tier.monthlyPrice || 0) * (dashboardMetrics.tierDistribution[tierId] || 0)) }}</strong>
                  </div>
                  <div class="small text-muted mb-2">
                    <div v-if="tier.limits?.locations !== undefined">
                      <i class="fas fa-map-marker-alt me-1"></i>{{ tier.limits.locations === Infinity ? 'Unlimited' : tier.limits.locations }} Locations
                    </div>
                    <div v-if="tier.limits?.devicesPerLocation !== undefined">
                      <i class="fas fa-wifi me-1"></i>{{ tier.limits.devicesPerLocation === Infinity ? 'Unlimited' : tier.limits.devicesPerLocation }} Devices/Location
                    </div>
                  </div>
                  <hr>
                  <button class="btn btn-sm btn-outline-primary w-100" @click="viewTierUsers(tierId)">
                    View Users
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tier Migration Tools -->
      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0">Tier Migration Tools</h5>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">From Tier</label>
              <select class="form-select" v-model="tierMigration.fromTier">
                <option value="">Select source tier...</option>
                <option v-for="(tier, tierId) in availableTiers" :key="tierId" :value="tierId">
                  {{ tier.name || tierId }} ({{ dashboardMetrics.tierDistribution[tierId] || 0 }} users)
                </option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label">To Tier</label>
              <select class="form-select" v-model="tierMigration.toTier">
                <option value="">Select destination tier...</option>
                <option v-for="(tier, tierId) in availableTiers" :key="tierId" :value="tierId">
                  {{ tier.name || tierId }}
                </option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label">&nbsp;</label>
              <button class="btn btn-primary w-100" 
                      @click="executeTierMigration"
                      :disabled="!tierMigration.fromTier || !tierMigration.toTier || tierMigration.fromTier === tierMigration.toTier">
                <i class="fas fa-exchange-alt me-2"></i>Migrate Users
              </button>
            </div>
          </div>
          
          <div v-if="tierMigrationPreview" class="mt-3">
            <div class="alert alert-warning">
              <strong>Migration Preview:</strong> This will migrate {{ tierMigrationPreview.count }} users 
              from {{ tierMigrationPreview.from }} to {{ tierMigrationPreview.to }}.
              <br>
              <strong>Revenue Impact:</strong> {{ formatCurrency(tierMigrationPreview.revenueImpact) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Tier Changes -->
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">Recent Tier Changes</h5>
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Admin</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="change in recentTierChanges" :key="change.id">
                  <td>{{ formatDateTime(change.timestamp) }}</td>
                  <td>{{ change.userEmail }}</td>
                  <td><span class="badge" :class="getTierBadgeClass(change.from)">{{ change.from }}</span></td>
                  <td><span class="badge" :class="getTierBadgeClass(change.to)">{{ change.to }}</span></td>
                  <td>{{ change.adminUser }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <!-- Tier Configuration -->
      <div class="card mt-4">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h5 class="mb-0">Tier Configuration</h5>
          <button class="btn btn-sm btn-primary" @click="showCreateTierModal">
            <i class="fas fa-plus me-1"></i>Add New Tier
          </button>
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  <th>Tier ID</th>
                  <th>Name</th>
                  <th>Monthly Price</th>
                  <th>Features</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(tier, tierId) in availableTiers" :key="tierId">
                  <td><code>{{ tierId }}</code></td>
                  <td>{{ tier.name }}</td>
                  <td>{{ formatCurrency(tier.monthlyPrice || 0) }}</td>
                  <td>
                    <span v-for="(value, feature) in tier.features" :key="feature" 
                          class="badge bg-secondary me-1" v-if="value">
                      {{ feature }}
                    </span>
                  </td>
                  <td>
                    <span class="badge" :class="tier.active !== false ? 'bg-success' : 'bg-danger'">
                      {{ tier.active !== false ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td>
                    <button class="btn btn-sm btn-outline-primary me-1" 
                            @click="editTier(tierId, tier)"
                            :disabled="['free', 'basic', 'pro', 'premium'].includes(tierId)">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" 
                            @click="toggleTierStatus(tierId)"
                            :disabled="dashboardMetrics.tierDistribution[tierId] > 0">
                      <i class="fas" :class="tier.active !== false ? 'fa-ban' : 'fa-check'"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <!-- Tier Performance Analytics -->
      <div class="card mt-4">
        <div class="card-header">
          <h5 class="mb-0">Tier Performance Analytics</h5>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-6">
              <canvas id="tierRevenueChart" height="300"></canvas>
            </div>
            <div class="col-md-6">
              <canvas id="tierRetentionChart" height="300"></canvas>
            </div>
          </div>
          <div class="row mt-4">
            <div class="col-12">
              <h6>Tier Migration Patterns (Last 30 Days)</h6>
              <div class="table-responsive">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>From → To</th>
                      <th>Count</th>
                      <th>Revenue Impact</th>
                      <th>Common Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="pattern in migrationPatterns" :key="pattern.id">
                      <td>
                        <span class="badge" :class="getTierBadgeClass(pattern.from)">{{ pattern.from }}</span>
                        <i class="fas fa-arrow-right mx-2"></i>
                        <span class="badge" :class="getTierBadgeClass(pattern.to)">{{ pattern.to }}</span>
                      </td>
                      <td>{{ pattern.count }}</td>
                      <td :class="pattern.revenueImpact > 0 ? 'text-success' : 'text-danger'">
                        {{ formatCurrency(pattern.revenueImpact) }}
                      </td>
                      <td>{{ pattern.reasons.join(', ') }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Lifecycle Management View -->
    <div v-if="currentView === 'lifecycle'" class="lifecycle-view">
      <div class="row mb-4">
        <div class="col-md-8">
          <div class="card">
            <div class="card-header">
              <h5 class="mb-0">Subscription Lifecycle Settings</h5>
            </div>
            <div class="card-body">
              <form @submit.prevent="saveLifecycleSettings">
                <div class="row mb-3">
                  <div class="col-md-6">
                    <label class="form-label">Trial Duration (days)</label>
                    <input type="number" class="form-control" v-model.number="lifecycleSettings.trialDuration" min="1" max="90">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Grace Period (days)</label>
                    <input type="number" class="form-control" v-model.number="lifecycleSettings.gracePeriod" min="0" max="30">
                  </div>
                </div>
                
                <div class="mb-3">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" v-model="lifecycleSettings.autoRenewal" id="autoRenewalSwitch">
                    <label class="form-check-label" for="autoRenewalSwitch">
                      Enable Auto-Renewal
                    </label>
                  </div>
                </div>
                
                <div class="mb-3">
                  <label class="form-label">Reminder Days Before Expiration</label>
                  <div class="input-group">
                    <input type="number" class="form-control" v-model.number="newReminderDay" min="1" max="30" placeholder="Days">
                    <button class="btn btn-outline-secondary" type="button" @click="addReminderDay">Add</button>
                  </div>
                  <div class="mt-2">
                    <span v-for="(day, index) in lifecycleSettings.reminderDays" :key="index" 
                          class="badge bg-primary me-2">
                      {{ day }} days
                      <i class="fas fa-times ms-1" style="cursor: pointer;" @click="removeReminderDay(index)"></i>
                    </span>
                  </div>
                </div>
                
                <div class="mb-3">
                  <label class="form-label">Reactivation Window (days after cancellation)</label>
                  <input type="number" class="form-control" v-model.number="lifecycleSettings.reactivationWindow" min="0" max="365">
                </div>
                
                <button type="submit" class="btn btn-primary">Save Settings</button>
              </form>
            </div>
          </div>
        </div>
        
        <div class="col-md-4">
          <div class="card">
            <div class="card-header">
              <h5 class="mb-0">Lifecycle Status</h5>
            </div>
            <div class="card-body">
              <div class="mb-3">
                <h6>Active Trials</h6>
                <p class="h3 text-info">{{ statusGroups.trial.length }}</p>
              </div>
              <div class="mb-3">
                <h6>Expiring This Week</h6>
                <p class="h3 text-warning">{{ realtimeMonitoring.expiringSubscriptions.length }}</p>
              </div>
              <div class="mb-3">
                <h6>In Grace Period</h6>
                <p class="h3 text-danger">{{ gracePeriodUsers.length }}</p>
              </div>
              <div class="mb-3">
                <h6>Recently Canceled</h6>
                <p class="h3 text-dark">{{ recentlyCanceledUsers.length }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Lifecycle Actions -->
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">Lifecycle Actions</h5>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4">
              <button class="btn btn-outline-primary w-100" @click="sendExpirationReminders">
                <i class="fas fa-envelope me-2"></i>Send Expiration Reminders
              </button>
            </div>
            <div class="col-md-4">
              <button class="btn btn-outline-warning w-100" @click="processGracePeriodUsers">
                <i class="fas fa-clock me-2"></i>Process Grace Period Users
              </button>
            </div>
            <div class="col-md-4">
              <button class="btn btn-outline-success w-100" @click="reactivateCanceledUsers">
                <i class="fas fa-redo me-2"></i>Reactivate Eligible Users
              </button>
            </div>
          </div>
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

    <!-- Analytics View -->
    <div v-if="currentView === 'analytics'" class="analytics-view">
      <div class="row mb-4">
        <!-- Key Metrics -->
        <div class="col-md-3">
          <div class="card bg-primary text-white">
            <div class="card-body">
              <h4 class="card-title">{{ formatCurrency(dashboardMetrics.mrr) }}</h4>
              <p class="card-text">Monthly Recurring Revenue</p>
              <small><i class="fas fa-arrow-up"></i> 12% from last month</small>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card bg-success text-white">
            <div class="card-body">
              <h4 class="card-title">{{ dashboardMetrics.conversionRate }}%</h4>
              <p class="card-text">Trial Conversion Rate</p>
              <small><i class="fas fa-arrow-up"></i> 3% improvement</small>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card bg-warning text-white">
            <div class="card-body">
              <h4 class="card-title">{{ dashboardMetrics.churnRate }}%</h4>
              <p class="card-text">Monthly Churn Rate</p>
              <small><i class="fas fa-arrow-down"></i> 2% reduction</small>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card bg-info text-white">
            <div class="card-body">
              <h4 class="card-title">{{ formatCurrency(avgCustomerValue) }}</h4>
              <p class="card-text">Avg Customer Value</p>
              <small>Per active subscription</small>
            </div>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="row mb-4">
        <div class="col-md-6">
          <div class="card">
      <div class="card-header">
              <h5 class="mb-0">Status Distribution</h5>
      </div>
      <div class="card-body">
              <canvas id="statusChart" style="height: 300px;"></canvas>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">
              <h5 class="mb-0">Tier Distribution</h5>
            </div>
            <div class="card-body">
              <canvas id="tierChart" style="height: 300px;"></canvas>
            </div>
          </div>
      </div>
    </div>

      <!-- Growth Metrics -->
      <div class="card">
      <div class="card-header">
          <h5 class="mb-0">Growth Metrics</h5>
      </div>
      <div class="card-body">
          <div class="row">
            <div class="col-md-4">
              <h6>New Subscriptions (30 days)</h6>
              <p class="h4">{{ newSubscriptionsCount }}</p>
      </div>
            <div class="col-md-4">
              <h6>Upgrades (30 days)</h6>
              <p class="h4">{{ upgradesCount }}</p>
            </div>
            <div class="col-md-4">
              <h6>Downgrades (30 days)</h6>
              <p class="h4">{{ downgradesCount }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tier Editor Modal -->
    <div v-if="showTierEditor" class="modal fade show d-block" style="background-color: rgba(0,0,0,0.5);">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ editingTier ? 'Edit Tier' : 'Create New Tier' }}</h5>
            <button type="button" class="btn-close" @click="showTierEditor = false"></button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="saveTier">
              <div class="row">
                <div class="col-md-6">
                  <div class="mb-3">
                    <label class="form-label">Tier ID *</label>
                    <input type="text" class="form-control" v-model="tierFormData.id" required 
                           :disabled="editingTier !== null" placeholder="e.g., enterprise">
                    <small class="text-muted">Unique identifier (lowercase, no spaces)</small>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Display Name *</label>
                    <input type="text" class="form-control" v-model="tierFormData.name" required 
                           placeholder="e.g., Enterprise">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Monthly Price *</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" class="form-control" v-model.number="tierFormData.monthlyPrice" 
                             required min="0" step="0.01">
                    </div>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Annual Price</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" class="form-control" v-model.number="tierFormData.annualPrice" 
                             min="0" step="0.01">
                    </div>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="mb-3">
                    <label class="form-label">Description</label>
                    <textarea class="form-control" v-model="tierFormData.description" rows="3"></textarea>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Locations Limit</label>
                    <input type="number" class="form-control" v-model.number="tierFormData.limits.locations" min="0">
                    <small class="text-muted">Set to 0 for unlimited</small>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Devices per Location Limit</label>
                    <input type="number" class="form-control" v-model.number="tierFormData.limits.devicesPerLocation" min="0">
                    <small class="text-muted">Set to 0 for unlimited</small>
                  </div>
                </div>
              </div>
              
              <div class="mb-3">
                <label class="form-label">Features</label>
                <div class="row">
                  <div v-for="(featureName, featureId) in availableFeatures" :key="featureId" class="col-md-4 mb-2">
                    <div class="form-check">
                      <input class="form-check-input" type="checkbox" 
                             :id="'feature-' + featureId"
                             v-model="tierFormData.features[featureId]">
                      <label class="form-check-label" :for="'feature-' + featureId">
                        {{ featureName }}
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showTierEditor = false">Cancel</button>
            <button type="button" class="btn btn-primary" @click="saveTier" :disabled="isLoading">
              <span v-if="isLoading" class="spinner-border spinner-border-sm me-2"></span>
              {{ editingTier ? 'Update' : 'Create' }} Tier
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- User Details Modal -->
    <div v-if="showUserDetailsModal" class="modal fade show d-block" style="background-color: rgba(0,0,0,0.5);">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">User Subscription Details</h5>
            <button type="button" class="btn-close" @click="showUserDetailsModal = false"></button>
          </div>
          <div class="modal-body" v-if="selectedUser">
            <div class="row">
              <div class="col-md-6">
                <h6>User Information</h6>
                <table class="table table-sm">
                  <tr>
                    <th>Email:</th>
                    <td>{{ selectedUser.email }}</td>
                  </tr>
                  <tr>
                    <th>Name:</th>
                    <td>{{ selectedUser.displayName || 'N/A' }}</td>
                  </tr>
                  <tr>
                    <th>User ID:</th>
                    <td>{{ selectedUser.id }}</td>
                  </tr>
                  <tr>
                    <th>Created:</th>
                    <td>{{ formatDate(selectedUser.createdAt) }}</td>
                  </tr>
                </table>
              </div>
              <div class="col-md-6">
                <h6>Subscription Information</h6>
                <table class="table table-sm">
                  <tr>
                    <th>Status:</th>
                    <td><span class="badge" :class="getStatusBadgeClass(selectedUser.subscription?.status)">
                      {{ selectedUser.subscription?.status }}
                    </span></td>
                  </tr>
                  <tr>
                    <th>Tier:</th>
                    <td><span class="badge" :class="getTierBadgeClass(selectedUser.subscription?.tier)">
                      {{ selectedUser.subscription?.tier }}
                    </span></td>
                  </tr>
                  <tr>
                    <th>Expires:</th>
                    <td>{{ formatDate(selectedUser.subscription?.expirationDate) }}</td>
                  </tr>
                  <tr>
                    <th>Monthly Price:</th>
                    <td>{{ formatCurrency(selectedUser.subscription?.monthlyPrice || 0) }}</td>
                  </tr>
                </table>
              </div>
            </div>
            
            <h6 class="mt-3">Status History</h6>
            <div class="table-responsive" style="max-height: 200px; overflow-y: auto;">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="history in userStatusHistory" :key="history.timestamp">
                    <td>{{ formatDateTime(history.timestamp) }}</td>
                    <td>{{ history.action }}</td>
                    <td>{{ history.from }} → {{ history.to }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showUserDetailsModal = false">Close</button>
          </div>
        </div>
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

    // Clean up previous instance if exists
    if (enhancedUserSubManagerApp) {
        try {
            enhancedUserSubManagerApp.unmount();
        } catch (e) {
            console.warn('Error unmounting previous app:', e);
        }
    }

    // Vue 3 syntax
    const { createApp } = Vue;
    enhancedUserSubManagerApp = createApp(EnhancedUserSubscriptionManager);
    enhancedUserSubManagerApp.mount(`#${containerId}`);
}

export function cleanupEnhancedUserSubscriptionManager() {
    if (enhancedUserSubManagerApp) {
        try {
            // Stop any real-time listeners
            if (enhancedUserSubManagerApp._instance && enhancedUserSubManagerApp._instance.proxy) {
                const instance = enhancedUserSubManagerApp._instance.proxy;
                if (instance.stopRealtimeMonitoring) {
                    instance.stopRealtimeMonitoring();
                }
                if (instance.stopAutoRefresh) {
                    instance.stopAutoRefresh();
                }
            }
            enhancedUserSubManagerApp.unmount();
            enhancedUserSubManagerApp = null;
        } catch (e) {
            console.warn('Error during cleanup:', e);
        }
    }
}

export { EnhancedUserSubscriptionManager };
