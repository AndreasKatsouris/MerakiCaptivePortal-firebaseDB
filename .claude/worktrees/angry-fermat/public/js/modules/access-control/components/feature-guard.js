/**
 * Feature Guard Component
 * Vue component that conditionally renders content based on feature access
 */

import featureAccessControl from '../services/feature-access-control.js';

export const FeatureGuard = {
  name: 'FeatureGuard',
  
  props: {
    // Single feature or array of features
    feature: {
      type: [String, Array],
      required: true
    },
    // Require all features (AND) or any feature (OR)
    requireAll: {
      type: Boolean,
      default: false
    },
    // Show placeholder when access denied
    showPlaceholder: {
      type: Boolean,
      default: true
    },
    // Custom placeholder message
    placeholderMessage: {
      type: String,
      default: null
    },
    // Show upgrade button
    showUpgradeButton: {
      type: Boolean,
      default: true
    }
  },
  
  data() {
    return {
      hasAccess: false,
      isLoading: true,
      featureInfo: null,
      error: null
    };
  },
  
  async created() {
    await this.checkAccess();
  },
  
  methods: {
    async checkAccess() {
      try {
        this.isLoading = true;
        this.error = null;
        
        const features = Array.isArray(this.feature) ? this.feature : [this.feature];
        
        if (this.requireAll) {
          this.hasAccess = await featureAccessControl.hasAllFeatures(features);
        } else {
          this.hasAccess = await featureAccessControl.hasAnyFeature(features);
        }
        
        // Get feature info for the first feature
        if (features.length > 0) {
          const result = await featureAccessControl.checkFeatureAccess(features[0]);
          this.featureInfo = result.feature;
        }
      } catch (error) {
        console.error('[FeatureGuard] Error checking access:', error);
        this.error = error.message;
        this.hasAccess = false;
      } finally {
        this.isLoading = false;
      }
    },
    
    async handleUpgradeClick() {
      const features = Array.isArray(this.feature) ? this.feature : [this.feature];
      if (features.length > 0) {
        await featureAccessControl.showAccessDeniedMessage(features[0], {
          onUpgradeClick: () => {
            // Navigate to subscription management
            window.location.href = '#subscription-management';
          }
        });
      }
    }
  },
  
  watch: {
    feature: {
      handler() {
        this.checkAccess();
      },
      deep: true
    }
  },
  
  template: `
    <div class="feature-guard">
      <!-- Loading state -->
      <div v-if="isLoading" class="text-center py-3">
        <div class="spinner-border spinner-border-sm text-primary" role="status">
          <span class="visually-hidden">Checking access...</span>
        </div>
      </div>
      
      <!-- Error state -->
      <div v-else-if="error" class="alert alert-danger">
        <i class="fas fa-exclamation-triangle me-2"></i>
        Error checking feature access: {{ error }}
      </div>
      
      <!-- Access granted - show content -->
      <div v-else-if="hasAccess">
        <slot></slot>
      </div>
      
      <!-- Access denied - show placeholder -->
      <div v-else-if="showPlaceholder" class="feature-locked-placeholder">
        <div class="card bg-light">
          <div class="card-body text-center py-5">
            <i class="fas fa-lock fa-3x text-muted mb-3"></i>
            <h5 class="card-title">Feature Locked</h5>
            <p class="card-text text-muted">
              {{ placeholderMessage || (featureInfo ? featureInfo.description : 'This feature requires a subscription upgrade.') }}
            </p>
            <button 
              v-if="showUpgradeButton" 
              class="btn btn-primary"
              @click="handleUpgradeClick">
              <i class="fas fa-arrow-up me-2"></i>Upgrade to Access
            </button>
          </div>
        </div>
      </div>
    </div>
  `
};

/**
 * Feature Button Component
 * Button that shows feature status and handles access control
 */
export const FeatureButton = {
  name: 'FeatureButton',
  
  props: {
    feature: {
      type: String,
      required: true
    },
    // Button properties
    text: String,
    icon: String,
    variant: {
      type: String,
      default: 'primary'
    },
    size: {
      type: String,
      default: 'md'
    }
  },
  
  data() {
    return {
      hasAccess: false,
      isLoading: false,
      featureInfo: null
    };
  },
  
  async created() {
    await this.checkAccess();
  },
  
  methods: {
    async checkAccess() {
      try {
        const result = await featureAccessControl.checkFeatureAccess(this.feature);
        this.hasAccess = result.hasAccess;
        this.featureInfo = result.feature;
      } catch (error) {
        console.error('[FeatureButton] Error checking access:', error);
        this.hasAccess = false;
      }
    },
    
    async handleClick() {
      if (this.hasAccess) {
        this.$emit('click');
      } else {
        await featureAccessControl.showAccessDeniedMessage(this.feature, {
          onUpgradeClick: () => {
            this.$emit('upgrade-requested');
          }
        });
      }
    }
  },
  
  computed: {
    buttonClasses() {
      return [
        'btn',
        `btn-${this.hasAccess ? this.variant : 'secondary'}`,
        `btn-${this.size}`,
        { 'disabled': !this.hasAccess }
      ];
    },
    
    buttonText() {
      if (this.text) return this.text;
      return this.featureInfo ? this.featureInfo.name : 'Feature';
    },
    
    buttonIcon() {
      if (this.icon) return this.icon;
      return this.featureInfo ? this.featureInfo.icon : 'fa-cube';
    }
  },
  
  template: `
    <button 
      :class="buttonClasses"
      @click="handleClick"
      :title="hasAccess ? '' : 'Upgrade required to access this feature'">
      <i v-if="isLoading" class="fas fa-spinner fa-spin me-2"></i>
      <i v-else :class="['fas', buttonIcon, 'me-2']"></i>
      {{ buttonText }}
      <i v-if="!hasAccess" class="fas fa-lock ms-2"></i>
    </button>
  `
};

// Export all components
export default {
  FeatureGuard,
  FeatureButton
};
