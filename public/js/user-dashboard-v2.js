/**
 * User Dashboard v2 - Enhanced with shadcn-vue
 * Built with Vue 3 Composition API and Tailwind CSS
 */

// Use global Vue from CDN
const { createApp, ref, reactive, onMounted, onUnmounted } = Vue;

import { auth, rtdb, ref as dbRef, get, set, push, update, remove, onAuthStateChanged } from './config/firebase-config.js';
import { versionManager } from './shared/version-manager.js';
import { featureAccessControl } from './modules/access-control/services/feature-access-control.js?v=2.1.4-20250605';

// Toast utility (simple implementation, can be replaced with shadcn toast later)
const showToast = (message, type = 'info') => {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // TODO: Replace with shadcn-vue toast component
};

// Dashboard v2 Vue Application
const DashboardV2App = {
  setup() {
    // Reactive state
    const currentUser = ref(null);
    const userData = ref(null);
    const userDisplayName = ref('User');
    const userName = ref('User');
    
    // UI state
    const userMenuOpen = ref(false);
    const mobileMenuOpen = ref(false);
    const showAddLocationModal = ref(false);
    const showVersionSwitcher = ref(false);
    const saving = ref(false);
    
    // Data state
    const subscription = reactive({
      plan: 'Loading...',
      status: 'Loading...',
      locationCount: '0 / 0',
      features: []
    });
    
    const stats = reactive({
      totalGuests: 0,
      activeCampaigns: 0,
      totalRewards: 0,
      engagementRate: '0%'
    });
    
    const locations = ref([]);
    const quickActions = ref([]);
    
    // New location form
    const newLocation = reactive({
      name: '',
      address: '',
      phone: '',
      type: '',
      timezone: 'UTC'
    });

    // Methods
    const toggleUserMenu = () => {
      userMenuOpen.value = !userMenuOpen.value;
      // Close when clicking outside
      if (userMenuOpen.value) {
        document.addEventListener('click', closeUserMenuOnOutsideClick);
      } else {
        document.removeEventListener('click', closeUserMenuOnOutsideClick);
      }
    };

    const closeUserMenuOnOutsideClick = (event) => {
      const dropdown = document.getElementById('user-dropdown');
      if (dropdown && !dropdown.contains(event.target)) {
        userMenuOpen.value = false;
        document.removeEventListener('click', closeUserMenuOnOutsideClick);
      }
    };

    const toggleMobileMenu = () => {
      mobileMenuOpen.value = !mobileMenuOpen.value;
    };

    const switchVersion = (version) => {
      versionManager.redirectToVersion(version);
    };

    const logout = async () => {
      try {
        await auth.signOut();
        window.location.href = '/user-login.html';
      } catch (error) {
        console.error('Logout error:', error);
        showToast('Error signing out. Please try again.', 'error');
      }
    };

    const loadUserData = async () => {
      if (!currentUser.value) return;

      try {
        const userSnapshot = await get(dbRef(rtdb, `users/${currentUser.value.uid}`));
        if (userSnapshot.exists()) {
          userData.value = userSnapshot.val();
          userDisplayName.value = userData.value.displayName || currentUser.value.email || 'User';
          userName.value = userData.value.firstName || userDisplayName.value.split('@')[0] || 'User';
        } else {
          // Create basic user data if doesn't exist
          const basicUserData = {
            email: currentUser.value.email,
            displayName: currentUser.value.displayName || currentUser.value.email,
            createdAt: Date.now()
          };
          await set(dbRef(rtdb, `users/${currentUser.value.uid}`), basicUserData);
          userData.value = basicUserData;
          userDisplayName.value = basicUserData.displayName;
          userName.value = basicUserData.displayName.split('@')[0];
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Error loading user data', 'error');
      }
    };

    const loadSubscriptionInfo = async () => {
      if (!currentUser.value) return;

      try {
        const subscriptionSnapshot = await get(dbRef(rtdb, `subscriptions/${currentUser.value.uid}`));
        if (subscriptionSnapshot.exists()) {
          const subscriptionData = subscriptionSnapshot.val();
          subscription.plan = subscriptionData.tier || 'Free';
          subscription.status = subscriptionData.status || 'Active';
          
          // Load location count
          const locationsSnapshot = await get(dbRef(rtdb, `userLocations/${currentUser.value.uid}`));
          const locationCount = locationsSnapshot.exists() ? Object.keys(locationsSnapshot.val()).length : 0;
          const maxLocations = getMaxLocationsForTier(subscription.plan);
          subscription.locationCount = `${locationCount} / ${maxLocations}`;
          
          // Load feature access
          await loadFeatureAccess();
        } else {
          // Default subscription info
          subscription.plan = 'Free';
          subscription.status = 'Active';
          subscription.locationCount = '0 / 1';
          subscription.features = [];
        }
      } catch (error) {
        console.error('Error loading subscription info:', error);
        showToast('Error loading subscription information', 'error');
      }
    };

    const loadFeatureAccess = async () => {
      try {
        const features = [
          'analyticsBasic', 'campaignBasic', 'wifiAnalytics', 'rewardsBasic',
          'guestInsights', 'multiLocation', 'foodCostBasic', 'foodCostAdvanced',
          'foodCostAnalytics', 'qmsBasic', 'qmsAdvanced', 'qmsWhatsAppIntegration'
        ];

        const featurePromises = features.map(async (feature) => {
          const hasAccess = await featureAccessControl.checkFeatureAccess(feature);
          return {
            name: getFeatureDisplayName(feature),
            key: feature,
            enabled: hasAccess
          };
        });

        subscription.features = await Promise.all(featurePromises);
        
        // Update quick actions based on feature access
        updateQuickActions();
      } catch (error) {
        console.error('Error loading feature access:', error);
      }
    };

    const updateQuickActions = () => {
      quickActions.value = [
        {
          id: 'add-location',
          title: 'Add Location',
          description: 'Set up a new business location',
          icon: 'fas fa-plus-circle',
          enabled: true,
          action: 'add-location'
        },
        {
          id: 'manage-subscription',
          title: 'Manage Subscription',
          description: 'View plan & usage details',
          icon: 'fas fa-credit-card',
          enabled: true,
          action: 'manage-subscription'
        },
        {
          id: 'view-analytics',
          title: 'View Analytics',
          description: 'Check your performance metrics',
          icon: 'fas fa-chart-line',
          enabled: subscription.features.find(f => f.key === 'analyticsBasic')?.enabled || false,
          action: 'view-analytics'
        },
        {
          id: 'create-campaign',
          title: 'Create Campaign',
          description: 'Launch a new marketing campaign',
          icon: 'fas fa-bullhorn',
          enabled: subscription.features.find(f => f.key === 'campaignBasic')?.enabled || false,
          action: 'create-campaign'
        },
        {
          id: 'guest-insights',
          title: 'Guest Insights',
          description: 'View customer analytics',
          icon: 'fas fa-users',
          enabled: subscription.features.find(f => f.key === 'guestInsights')?.enabled || false,
          action: 'guest-insights'
        },
        {
          id: 'food-cost',
          title: 'Food Cost Management',
          description: 'Track food costs & inventory',
          icon: 'fas fa-utensils',
          enabled: subscription.features.find(f => f.key === 'foodCostBasic')?.enabled || false,
          action: 'food-cost'
        },
        {
          id: 'food-analytics',
          title: 'Food Cost Analytics',
          description: 'Industry KPIs & insights',
          icon: 'fas fa-chart-pie',
          enabled: subscription.features.find(f => f.key === 'foodCostAnalytics')?.enabled || false,
          action: 'food-analytics'
        },
        {
          id: 'queue-management',
          title: 'Queue Management',
          description: 'Manage customer queues & wait times',
          icon: 'fas fa-clock',
          enabled: subscription.features.find(f => f.key === 'qmsBasic')?.enabled || false,
          action: 'queue-management'
        }
      ];
    };

    const loadLocations = async () => {
      if (!currentUser.value) return;

      try {
        const locationsSnapshot = await get(dbRef(rtdb, `userLocations/${currentUser.value.uid}`));
        if (locationsSnapshot.exists()) {
          const locationIds = Object.keys(locationsSnapshot.val());
          
          // Load location details in parallel
          const locationPromises = locationIds.map(async (locationId) => {
            const locationSnapshot = await get(dbRef(rtdb, `locations/${locationId}`));
            if (locationSnapshot.exists()) {
              return {
                id: locationId,
                ...locationSnapshot.val(),
                status: 'active' // Default status
              };
            }
            return null;
          });

          const locationResults = await Promise.all(locationPromises);
          locations.value = locationResults.filter(location => location !== null);
        } else {
          locations.value = [];
        }
      } catch (error) {
        console.error('Error loading locations:', error);
        showToast('Error loading locations', 'error');
      }
    };

    const loadStatistics = async () => {
      if (!currentUser.value) return;

      try {
        // Load basic statistics
        const [guestsSnapshot, campaignsSnapshot, rewardsSnapshot] = await Promise.all([
          get(dbRef(rtdb, `guests`)),
          get(dbRef(rtdb, `campaigns/${currentUser.value.uid}`)),
          get(dbRef(rtdb, `rewards/${currentUser.value.uid}`))
        ]);

        // Count guests for this user's locations
        let totalGuests = 0;
        if (guestsSnapshot.exists()) {
          const guests = guestsSnapshot.val();
          for (const guestId in guests) {
            const guest = guests[guestId];
            if (locations.value.some(loc => loc.id === guest.locationId)) {
              totalGuests++;
            }
          }
        }

        stats.totalGuests = totalGuests;
        stats.activeCampaigns = campaignsSnapshot.exists() ? Object.keys(campaignsSnapshot.val()).length : 0;
        stats.totalRewards = rewardsSnapshot.exists() ? Object.keys(rewardsSnapshot.val()).length : 0;
        stats.engagementRate = totalGuests > 0 ? Math.round((stats.totalRewards / totalGuests) * 100) + '%' : '0%';
      } catch (error) {
        console.error('Error loading statistics:', error);
        showToast('Error loading statistics', 'error');
      }
    };

    const handleActionClick = (action) => {
      if (!action.enabled) {
        showToast('This feature requires a higher subscription tier', 'warning');
        return;
      }

      switch (action.action) {
        case 'add-location':
          showAddLocationModal.value = true;
          break;
        case 'manage-subscription':
          window.location.href = 'user-subscription.html';
          break;
        case 'view-analytics':
          window.location.href = 'analytics.html';
          break;
        case 'create-campaign':
          window.location.href = 'campaigns.html';
          break;
        case 'guest-insights':
          window.location.href = 'guest-insights.html';
          break;
        case 'food-cost':
          window.location.href = 'food-cost-analytics.html';
          break;
        case 'food-analytics':
          window.location.href = 'food-cost-analytics.html?tab=analytics';
          break;
        case 'queue-management':
          window.location.href = 'queue-management.html';
          break;
        default:
          showToast('Feature coming soon!', 'info');
      }
    };

    const saveLocation = async () => {
      if (!currentUser.value) return;

      saving.value = true;
      try {
        // Validate form
        if (!newLocation.name || !newLocation.address || !newLocation.phone || !newLocation.type) {
          showToast('Please fill in all required fields', 'error');
          return;
        }

        // Create location data
        const locationData = {
          name: newLocation.name,
          address: newLocation.address,
          phone: newLocation.phone,
          type: newLocation.type,
          timezone: newLocation.timezone,
          ownerId: currentUser.value.uid,
          createdAt: Date.now(),
          status: 'active'
        };

        // Save to database
        const locationRef = push(dbRef(rtdb, 'locations'));
        await set(locationRef, locationData);

        // Add to user locations
        await set(dbRef(rtdb, `userLocations/${currentUser.value.uid}/${locationRef.key}`), true);

        // Reset form and close modal
        Object.assign(newLocation, {
          name: '',
          address: '',
          phone: '',
          type: '',
          timezone: 'UTC'
        });
        showAddLocationModal.value = false;

        // Reload locations and subscription info
        await Promise.all([
          loadLocations(),
          loadSubscriptionInfo()
        ]);

        showToast('Location added successfully!', 'success');
      } catch (error) {
        console.error('Error saving location:', error);
        showToast('Error saving location. Please try again.', 'error');
      } finally {
        saving.value = false;
      }
    };

    // Helper functions
    const getMaxLocationsForTier = (tier) => {
      const limits = {
        'Free': 1,
        'Bronze': 3,
        'Silver': 10,
        'Gold': 25,
        'Platinum': 100
      };
      return limits[tier] || 1;
    };

    const getFeatureDisplayName = (featureKey) => {
      const names = {
        'analyticsBasic': 'Basic Analytics',
        'campaignBasic': 'Campaigns',
        'wifiAnalytics': 'WiFi Analytics',
        'rewardsBasic': 'Rewards',
        'guestInsights': 'Guest Insights',
        'multiLocation': 'Multi-Location',
        'foodCostBasic': 'Food Cost Tracking',
        'foodCostAdvanced': 'Advanced Food Cost',
        'foodCostAnalytics': 'Food Cost Analytics',
        'qmsBasic': 'Queue Management',
        'qmsAdvanced': 'Advanced QMS',
        'qmsWhatsAppIntegration': 'WhatsApp Integration'
      };
      return names[featureKey] || featureKey;
    };

    // Initialization
    onMounted(() => {
      // Check if user should see version switcher (development mode)
      showVersionSwitcher.value = window.location.hostname === 'localhost' || 
                                   window.location.search.includes('debug=true');

      // Initialize authentication
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          currentUser.value = user;
          
          // Initialize version manager
          const version = versionManager.initialize(user);
          if (version !== 'v2') {
            // User should not be on v2, redirect
            versionManager.redirectToVersion(version, true);
            return;
          }

          // Hide loading and show app
          const loadingEl = document.getElementById('dashboard-loading');
          const appEl = document.getElementById('dashboard-v2-app');
          if (loadingEl) loadingEl.style.display = 'none';
          if (appEl) appEl.style.display = 'block';

          // Load dashboard data in parallel
          try {
            await Promise.all([
              loadUserData(),
              loadSubscriptionInfo(),
              loadLocations()
            ]);
            
            // Load statistics after locations are loaded
            await loadStatistics();
          } catch (error) {
            console.error('Error initializing dashboard:', error);
            showToast('Error loading dashboard data', 'error');
          }
        } else {
          // Redirect to login
          window.location.href = '/user-login.html?message=unauthorized';
        }
      });
    });

    onUnmounted(() => {
      // Clean up event listeners
      document.removeEventListener('click', closeUserMenuOnOutsideClick);
    });

    // Return reactive state and methods for template
    return {
      // State
      currentUser,
      userDisplayName,
      userName,
      userMenuOpen,
      mobileMenuOpen,
      showAddLocationModal,
      showVersionSwitcher,
      saving,
      subscription,
      stats,
      locations,
      quickActions,
      newLocation,
      
      // Methods
      toggleUserMenu,
      toggleMobileMenu,
      switchVersion,
      logout,
      handleActionClick,
      saveLocation
    };
  }
};

// Define inline shadcn-vue components (since we can't import .vue files directly)
const Button = {
  props: {
    variant: { type: String, default: 'default' },
    size: { type: String, default: 'default' },
    as: { type: String, default: 'button' },
    disabled: { type: Boolean, default: false }
  },
  template: `
    <component :is="as || 'button'"
               :class="buttonClass"
               :disabled="disabled"
               v-bind="$attrs"
               @click="$emit('click', $event)">
      <slot />
    </component>
  `,
  computed: {
    buttonClass() {
      const variants = {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
      };
      const sizes = {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10'
      };
      return `inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${variants[this.variant]} ${sizes[this.size]}`;
    }
  }
};

const Badge = {
  props: {
    variant: { type: String, default: 'default' }
  },
  template: `
    <div :class="badgeClass">
      <slot />
    </div>
  `,
  computed: {
    badgeClass() {
      const variants = {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'text-foreground'
      };
      return `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variants[this.variant]}`;
    }
  }
};

const Dialog = {
  props: {
    open: { type: Boolean, default: false }
  },
  emits: ['update:open'],
  template: `
    <div v-if="open">
      <div class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" @click="$emit('update:open', false)"></div>
      <div class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg" @click.stop>
        <slot />
      </div>
    </div>
  `
};

const Input = {
  props: {
    modelValue: { type: [String, Number], default: '' }
  },
  emits: ['update:modelValue'],
  template: `
    <input :class="inputClass"
           :value="modelValue"
           @input="$emit('update:modelValue', $event.target.value)"
           v-bind="$attrs" />
  `,
  computed: {
    inputClass() {
      return 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
    }
  }
};

const Label = {
  template: `
    <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" v-bind="$attrs">
      <slot />
    </label>
  `
};

// Create and mount the Vue app
const app = createApp(DashboardV2App);

// Register components globally
app.component('Button', Button);
app.component('Badge', Badge);
app.component('Dialog', Dialog);
app.component('Input', Input);
app.component('Label', Label);

app.mount('#dashboard-v2-app');