/**
 * Subscription Status Manager
 * Version: 3.0.0
 * 
 * Focused subscription management system for:
 * - Real-time subscription status tracking
 * - Tier management and migrations
 * - Subscription lifecycle management
 * - Status-based user filtering and actions
 */

import { auth, rtdb, ref, get, set, update, push, query, orderByChild, equalTo, onValue, off } from '../../../config/firebase-config.js';
import { showToast } from '../../../utils/toast.js';

let subscriptionStatusManagerApp = null;

const SubscriptionStatusManager = {
  data() {
    return {
      // Current View
      currentView: 'status', // 'status', 'tiers', 'lifecycle', 'monitor'
      
      // Subscription Status Data
      statusGroups: {
        active: [],
        trial: [],
        pastDue: [],
        canceled: [],
        expired: [],
        none: []
      },
      
      // Tier Management
      availableTiers: {},
      tierMigrations: [],
      
      // Selected Items
      selectedUsers: [],
      selectedStatusFilter: 'all',
      selectedTierFilter: 'all',
      
      // Quick Actions
      quickAction: '',
      bulkUpdateInProgress: false,
      
      // Real-time Monitoring
      realtimeSubscriptions: new Map(),
      statusChangeAlerts: [],
      
      // Statistics
      stats: {
        totalUsers: 0,
        statusDistribution: {},
        tierDistribution: {},
        revenueByStatus: {},
        conversionRate: 0,
        churnRate: 0,
        avgSubscriptionDuration: 0
      },
      
      // Lifecycle Management
      lifecycleRules: {
        trialDuration: 14, // days
        gracePeriod: 7, // days
        autoRenewal: true,
        reminderDays: [7, 3, 1] // days before expiration
      },
      
      // UI State
      loading: false,
      searchQuery: '',
      sortBy: 'lastUpdated',
      sortOrder: 'desc',
      
      // Modal States
      showStatusChangeModal: false,
      showTierMigrationModal: false,
      showLifecycleSettingsModal: false,
      
      // Selected User for Actions
      selectedUser: null,
      userHistory: [],
      
      // Batch Operations
      batchOperation: {
        type: '', // 'status', 'tier', 'extend', 'cancel'
        targetValue: '',
        affectedUsers: []
      }
    };
  },
  
  async mounted() {
    await this.loadTiers();
    await this.loadAllSubscriptions();
    this.startRealtimeMonitoring();
    this.calculateStatistics();
  },
  
  beforeUnmount() {
    this.stopRealtimeMonitoring();
  },
  
  computed: {
    filteredUsers() {
      let users = [];
      
      // Collect users based on status filter
      if (this.selectedStatusFilter === 'all') {
        Object.values(this.statusGroups).forEach(group => {
          users = users.concat(group);
        });
      } else {
        users = this.statusGroups[this.selectedStatusFilter] || [];
      }
      
      // Apply tier filter
      if (this.selectedTierFilter !== 'all') {
        users = users.filter(user => user.subscription?.tier === this.selectedTierFilter);
      }
      
      // Apply search
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        users = users.filter(user => 
          user.email?.toLowerCase().includes(query) ||
          user.displayName?.toLowerCase().includes(query) ||
          user.id.toLowerCase().includes(query)
        );
      }
      
      // Sort users
      users.sort((a, b) => {
        let aVal, bVal;
        
        switch (this.sortBy) {
          case 'lastUpdated':
            aVal = a.subscription?.lastUpdated || 0;
            bVal = b.subscription?.lastUpdated || 0;
            break;
          case 'expirationDate':
            aVal = a.subscription?.expirationDate || Infinity;
            bVal = b.subscription?.expirationDate || Infinity;
            break;
          case 'tier':
            aVal = a.subscription?.tier || '';
            bVal = b.subscription?.tier || '';
            break;
          default:
            aVal = a.email || '';
            bVal = b.email || '';
        }
        
        return this.sortOrder === 'asc' 
          ? (aVal > bVal ? 1 : -1)
          : (aVal < bVal ? 1 : -1);
      });
      
      return users;
    },
    
    canExecuteBulkAction() {
      return this.selectedUsers.length > 0 && this.quickAction;
    }
  },
  
  methods: {
    // Load tier definitions
    async loadTiers() {
      try {
        const snapshot = await get(ref(rtdb, 'subscriptionTiers'));
        this.availableTiers = snapshot.val() || {};
      } catch (error) {
        console.error('Error loading tiers:', error);
        showToast('Failed to load subscription tiers', 'error');
      }
    },
    
    // Load all subscriptions and organize by status
    async loadAllSubscriptions() {
      this.loading = true;
      try {
        // Reset status groups
        Object.keys(this.statusGroups).forEach(key => {
          this.statusGroups[key] = [];
        });
        
        // Load users
        const usersSnapshot = await get(ref(rtdb, 'users'));
        const users = usersSnapshot.val() || {};
        
        // Load subscriptions
        const subscriptionsSnapshot = await get(ref(rtdb, 'subscriptions'));
        const subscriptions = subscriptionsSnapshot.val() || {};
        
        // Organize users by subscription status
        Object.entries(users).forEach(([userId, userData]) => {
          const subscription = subscriptions[userId] || { 
            status: 'none', 
            tier: 'free' 
          };
          
          const userWithSub = {
            id: userId,
            ...userData,
            subscription: {
              ...subscription,
              status: subscription.paymentStatus || subscription.status || 'none'
            }
          };
          
          // Categorize by status
          const status = userWithSub.subscription.status;
          if (this.statusGroups[status]) {
            this.statusGroups[status].push(userWithSub);
          } else {
            this.statusGroups.none.push(userWithSub);
          }
        });
        
        this.stats.totalUsers = Object.keys(users).length;
        
      } catch (error) {
        console.error('Error loading subscriptions:', error);
        showToast('Failed to load subscription data', 'error');
      } finally {
        this.loading = false;
      }
    },
    
    // Real-time subscription monitoring
    startRealtimeMonitoring() {
      const subscriptionsRef = ref(rtdb, 'subscriptions');
      
      this.realtimeListener = onValue(subscriptionsRef, (snapshot) => {
        if (snapshot.exists()) {
          const subscriptions = snapshot.val();
          
          // Check for status changes
          Object.entries(subscriptions).forEach(([userId, subscription]) => {
            const prevSub = this.realtimeSubscriptions.get(userId);
            
            if (prevSub && prevSub.status !== subscription.status) {
              this.handleStatusChange(userId, prevSub.status, subscription.status);
            }
            
            this.realtimeSubscriptions.set(userId, subscription);
          });
        }
      });
    },
    
    stopRealtimeMonitoring() {
      if (this.realtimeListener) {
        off(ref(rtdb, 'subscriptions'), this.realtimeListener);
      }
    },
    
    handleStatusChange(userId, oldStatus, newStatus) {
      const alert = {
        id: Date.now(),
        userId,
        oldStatus,
        newStatus,
        timestamp: Date.now(),
        message: `User ${userId} changed from ${oldStatus} to ${newStatus}`
      };
      
      this.statusChangeAlerts.unshift(alert);
      
      // Keep only last 50 alerts
      if (this.statusChangeAlerts.length > 50) {
        this.statusChangeAlerts = this.statusChangeAlerts.slice(0, 50);
      }
      
      // Reload subscriptions to update UI
      this.loadAllSubscriptions();
    },
    
    // Calculate statistics
    calculateStatistics() {
      // Reset stats
      this.stats.statusDistribution = {};
      this.stats.tierDistribution = {};
      this.stats.revenueByStatus = {};
      
      // Calculate distributions
      Object.entries(this.statusGroups).forEach(([status, users]) => {
        this.stats.statusDistribution[status] = users.length;
        
        users.forEach(user => {
          const tier = user.subscription?.tier || 'free';
          this.stats.tierDistribution[tier] = (this.stats.tierDistribution[tier] || 0) + 1;
          
          // Calculate revenue (simplified)
          const tierData = this.availableTiers[tier];
          if (tierData && tierData.monthlyPrice) {
            this.stats.revenueByStatus[status] = (this.stats.revenueByStatus[status] || 0) + tierData.monthlyPrice;
          }
        });
      });
      
      // Calculate conversion rate (trial to paid)
      const trialCount = this.statusGroups.trial.length;
      const paidCount = this.statusGroups.active.length;
      this.stats.conversionRate = trialCount > 0 ? (paidCount / (trialCount + paidCount) * 100).toFixed(1) : 0;
      
      // Calculate churn rate (canceled / total active)
      const canceledCount = this.statusGroups.canceled.length;
      this.stats.churnRate = paidCount > 0 ? (canceledCount / (paidCount + canceledCount) * 100).toFixed(1) : 0;
    },
    
    // Quick Actions
    async executeQuickAction() {
      if (!this.canExecuteBulkAction) return;
      
      const action = this.quickAction.split(':');
      const actionType = action[0];
      const actionValue = action[1];
      
      const confirmMsg = `Apply ${actionType} action to ${this.selectedUsers.length} users?`;
      if (!confirm(confirmMsg)) return;
      
      this.bulkUpdateInProgress = true;
      
      try {
        const updates = {};
        const timestamp = Date.now();
        
        this.selectedUsers.forEach(user => {
          switch (actionType) {
            case 'status':
              updates[`subscriptions/${user.id}/status`] = actionValue;
              updates[`subscriptions/${user.id}/paymentStatus`] = actionValue;
              updates[`subscriptions/${user.id}/lastUpdated`] = timestamp;
              updates[`subscriptions/${user.id}/history/${timestamp}`] = {
                action: 'status_change',
                from: user.subscription?.status,
                to: actionValue,
                timestamp,
                adminUser: auth.currentUser?.uid
              };
              break;
              
            case 'tier':
              updates[`subscriptions/${user.id}/tier`] = actionValue;
              updates[`subscriptions/${user.id}/lastUpdated`] = timestamp;
              
              // Update features and limits
              const tierData = this.availableTiers[actionValue];
              if (tierData) {
                updates[`subscriptions/${user.id}/features`] = tierData.features || {};
                updates[`subscriptions/${user.id}/limits`] = tierData.limits || {};
              }
              
              updates[`subscriptions/${user.id}/history/${timestamp}`] = {
                action: 'tier_change',
                from: user.subscription?.tier,
                to: actionValue,
                timestamp,
                adminUser: auth.currentUser?.uid
              };
              break;
              
            case 'extend':
              const days = parseInt(actionValue);
              const currentExpiry = user.subscription?.expirationDate || timestamp;
              const newExpiry = currentExpiry + (days * 24 * 60 * 60 * 1000);
              
              updates[`subscriptions/${user.id}/expirationDate`] = newExpiry;
              updates[`subscriptions/${user.id}/lastUpdated`] = timestamp;
              updates[`subscriptions/${user.id}/history/${timestamp}`] = {
                action: 'subscription_extended',
                days,
                newExpirationDate: newExpiry,
                timestamp,
                adminUser: auth.currentUser?.uid
              };
              break;
          }
        });
        
        await update(ref(rtdb, '/'), updates);
        
        showToast(`Successfully updated ${this.selectedUsers.length} subscriptions`, 'success');
        
        // Reset selection and reload
        this.selectedUsers = [];
        this.quickAction = '';
        await this.loadAllSubscriptions();
        this.calculateStatistics();
        
      } catch (error) {
        console.error('Error executing bulk action:', error);
        showToast('Failed to execute bulk action', 'error');
      } finally {
        this.bulkUpdateInProgress = false;
      }
    },
    
    // Individual user actions
    async changeUserStatus(user, newStatus) {
      this.selectedUser = user;
      this.batchOperation = {
        type: 'status',
        targetValue: newStatus,
        affectedUsers: [user]
      };
      this.showStatusChangeModal = true;
    },
    
    async changeUserTier(user, newTier) {
      this.selectedUser = user;
      this.batchOperation = {
        type: 'tier',
        targetValue: newTier,
        affectedUsers: [user]
      };
      this.showTierMigrationModal = true;
    },
    
    async confirmStatusChange() {
      const { targetValue, affectedUsers } = this.batchOperation;
      
      try {
        const updates = {};
        const timestamp = Date.now();
        
        affectedUsers.forEach(user => {
          updates[`subscriptions/${user.id}/status`] = targetValue;
          updates[`subscriptions/${user.id}/paymentStatus`] = targetValue;
          updates[`subscriptions/${user.id}/lastUpdated`] = timestamp;
          updates[`subscriptions/${user.id}/history/${timestamp}`] = {
            action: 'status_change',
            from: user.subscription?.status,
            to: targetValue,
            reason: 'admin_action',
            timestamp,
            adminUser: auth.currentUser?.uid
          };
        });
        
        await update(ref(rtdb, '/'), updates);
        
        showToast('Status updated successfully', 'success');
        this.showStatusChangeModal = false;
        await this.loadAllSubscriptions();
        
      } catch (error) {
        console.error('Error changing status:', error);
        showToast('Failed to update status', 'error');
      }
    },
    
    async confirmTierMigration() {
      const { targetValue, affectedUsers } = this.batchOperation;
      
      try {
        const updates = {};
        const timestamp = Date.now();
        const tierData = this.availableTiers[targetValue];
        
        affectedUsers.forEach(user => {
          updates[`subscriptions/${user.id}/tier`] = targetValue;
          updates[`subscriptions/${user.id}/lastUpdated`] = timestamp;
          
          if (tierData) {
            updates[`subscriptions/${user.id}/features`] = tierData.features || {};
            updates[`subscriptions/${user.id}/limits`] = tierData.limits || {};
            updates[`subscriptions/${user.id}/monthlyPrice`] = tierData.monthlyPrice || 0;
          }
          
          updates[`subscriptions/${user.id}/history/${timestamp}`] = {
            action: 'tier_migration',
            from: user.subscription?.tier,
            to: targetValue,
            timestamp,
            adminUser: auth.currentUser?.uid
          };
        });
        
        await update(ref(rtdb, '/'), updates);
        
        showToast('Tier updated successfully', 'success');
        this.showTierMigrationModal = false;
        await this.loadAllSubscriptions();
        
      } catch (error) {
        console.error('Error migrating tier:', error);
        showToast('Failed to update tier', 'error');
      }
    },
    
    // View user subscription history
    async viewUserHistory(user) {
      this.selectedUser = user;
      this.userHistory = [];
      
      try {
        const historyRef = ref(rtdb, `subscriptions/${user.id}/history`);
        const snapshot = await get(historyRef);
        
        if (snapshot.exists()) {
          this.userHistory = Object.values(snapshot.val())
            .sort((a, b) => b.timestamp - a.timestamp);
        }
      } catch (error) {
        console.error('Error loading user history:', error);
      }
    },
    
    // Utility methods
    formatDate(timestamp) {
      if (!timestamp) return 'N/A';
      return new Date(timestamp).toLocaleDateString();
    },
    
    formatDateTime(timestamp) {
      if (!timestamp) return 'N/A';
      return new Date(timestamp).toLocaleString();
    },
    
    getDaysUntilExpiration(expirationDate) {
      if (!expirationDate) return null;
      const days = Math.floor((expirationDate - Date.now()) / (1000 * 60 * 60 * 24));
      return days;
    },
    
    getStatusBadgeClass(status) {
      const classes = {
        active: 'bg-success',
        trial: 'bg-info',
        pastDue: 'bg-warning',
        canceled: 'bg-dark',
        expired: 'bg-danger',
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
    
    exportSubscriptionData() {
      const data = this.filteredUsers.map(user => ({
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.subscription?.status,
        tier: user.subscription?.tier,
        expirationDate: this.formatDate(user.subscription?.expirationDate),
        monthlyPrice: user.subscription?.monthlyPrice || 0,
        lastUpdated: this.formatDate(user.subscription?.lastUpdated)
      }));
      
      const csv = this.convertToCSV(data);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `subscriptions_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    },
    
    convertToCSV(data) {
      if (!data.length) return '';
      
      const headers = Object.keys(data[0]);
      const csv = [
        headers.join(','),
        ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
      ].join('\n');
      
      return csv;
    }
  }
};

// ... Continue with the template in the next part 