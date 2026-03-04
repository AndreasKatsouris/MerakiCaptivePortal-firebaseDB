/**
 * Upgrade Prompt Component
 * Version: 1.0.0-2025-04-24
 * 
 * A reusable Vue component that displays an upgrade prompt for premium features
 * This component is used throughout the platform to maintain consistent upgrade messaging
 */

export default {
  name: 'upgrade-prompt',
  
  props: {
    /**
     * The feature ID that requires an upgrade
     */
    featureId: {
      type: String,
      required: true
    },
    
    /**
     * Custom headline for the prompt
     */
    headline: {
      type: String,
      default: ''
    },
    
    /**
     * Custom description text
     */
    description: {
      type: String,
      default: ''
    },
    
    /**
     * Whether to show the "Learn More" button
     */
    showLearnMore: {
      type: Boolean,
      default: true
    },
    
    /**
     * Theme variant (light, dark, accent)
     */
    theme: {
      type: String,
      default: 'light',
      validator: (value) => ['light', 'dark', 'accent'].includes(value)
    },
    
    /**
     * Size variant (small, medium, large)
     */
    size: {
      type: String,
      default: 'medium',
      validator: (value) => ['small', 'medium', 'large'].includes(value)
    }
  },
  
  data() {
    return {
      requiredTier: '',
      currentTier: '',
      isLoading: true,
      tierDetails: null,
      featureDetails: null
    };
  },
  
  computed: {
    /**
     * Get the actual headline to display
     */
    displayHeadline() {
      if (this.headline) return this.headline;
      
      if (this.featureDetails && this.tierDetails) {
        return `Upgrade to ${this.tierDetails.name} to unlock this feature`;
      }
      
      return 'Upgrade to unlock premium features';
    },
    
    /**
     * Get the actual description to display
     */
    displayDescription() {
      if (this.description) return this.description;
      
      if (this.featureDetails && this.tierDetails) {
        return `This feature requires our ${this.tierDetails.name} plan or higher. Upgrade now to access ${this.featureDetails.name} and other premium features.`;
      }
      
      return 'Unlock additional features by upgrading to a premium plan.';
    },
    
    /**
     * Get CSS classes based on theme and size
     */
    containerClasses() {
      return [
        'upgrade-prompt',
        `upgrade-prompt--${this.theme}`,
        `upgrade-prompt--${this.size}`
      ];
    }
  },
  
  async mounted() {
    this.isLoading = true;
    
    try {
      // Get details about the feature and required tier
      this.featureDetails = await this.getFeatureDetails(this.featureId);
      this.currentTier = await this.getCurrentTier();
      this.requiredTier = this.featureDetails?.requiredTier || 'professional';
      this.tierDetails = await this.getTierDetails(this.requiredTier);
    } catch (error) {
      console.error('Error loading upgrade prompt data:', error);
    } finally {
      this.isLoading = false;
    }
  },
  
  methods: {
    /**
     * Get details about the feature
     */
    async getFeatureDetails(featureId) {
      // In a real implementation, this would fetch feature details from the access control service
      // This is a placeholder implementation
      const featureTiers = window.AccessControl?.getFeatureDefinitions() || {};
      
      const requiredTier = featureTiers[featureId] || 'professional';
      
      // Map feature IDs to readable names
      const featureNames = {
        'analyticsExport': 'Analytics Export',
        'analyticsAdvanced': 'Advanced Analytics',
        'wifiAdvancedCollection': 'Advanced WiFi Collection',
        'guestManagementAdvanced': 'Advanced Guest Management',
        'campaignsAdvanced': 'Advanced Campaigns',
        'campaignsCustom': 'Custom Campaigns',
        'rewardsAdvanced': 'Advanced Rewards',
        'rewardsCustom': 'Custom Rewards',
        'receiptProcessingAutomated': 'Automated Receipt Processing',
        'whatsappAdvanced': 'Advanced WhatsApp Integration',
        'foodCostBasic': 'Food Cost Management',
        'advancedFoodCostCalculation': 'Advanced Food Cost Calculation',
        'multiLocation': 'Multi-Location Support'
      };
      
      return {
        id: featureId,
        name: featureNames[featureId] || featureId,
        requiredTier
      };
    },
    
    /**
     * Get the current user's subscription tier
     */
    async getCurrentTier() {
      try {
        const subscription = await window.AccessControl?.getCurrentSubscription();
        return subscription?.tier || 'free';
      } catch (error) {
        console.error('Error getting current tier:', error);
        return 'free';
      }
    },
    
    /**
     * Get details about a subscription tier
     */
    async getTierDetails(tierId) {
      // In a real implementation, this would fetch tier details from the subscription service
      // This is a placeholder implementation
      const tierDetails = {
        'free': {
          name: 'Free',
          description: 'Basic features for small operations'
        },
        'starter': {
          name: 'Starter',
          description: 'Essential features for growing businesses'
        },
        'professional': {
          name: 'Professional',
          description: 'Advanced features for established businesses'
        },
        'enterprise': {
          name: 'Enterprise',
          description: 'Complete solution for larger operations'
        }
      };
      
      return tierDetails[tierId] || tierDetails.professional;
    },
    
    /**
     * Handle the upgrade button click
     */
    handleUpgradeClick() {
      // Track the click event for analytics
      if (window.analytics) {
        window.analytics.track('Upgrade Prompt Clicked', {
          featureId: this.featureId,
          currentTier: this.currentTier,
          requiredTier: this.requiredTier
        });
      }
      
      // Emit the event
      this.$emit('upgrade');
      
      // Navigate to the subscription page
      window.location.href = `/subscription?feature=${this.featureId}`;
    },
    
    /**
     * Handle the learn more button click
     */
    handleLearnMoreClick() {
      // Track the click event for analytics
      if (window.analytics) {
        window.analytics.track('Upgrade Learn More Clicked', {
          featureId: this.featureId,
          currentTier: this.currentTier,
          requiredTier: this.requiredTier
        });
      }
      
      // Emit the event
      this.$emit('learn-more');
      
      // Navigate to the feature info page
      window.location.href = `/features/${this.featureId}`;
    }
  },
  
  template: `
    <div :class="containerClasses" v-if="!isLoading">
      <div class="upgrade-prompt__content">
        <h3 class="upgrade-prompt__title">{{ displayHeadline }}</h3>
        <p class="upgrade-prompt__description">{{ displayDescription }}</p>
        
        <div class="upgrade-prompt__actions">
          <button 
            class="btn btn-primary upgrade-prompt__button" 
            @click="handleUpgradeClick">
            Upgrade Now
          </button>
          
          <button 
            v-if="showLearnMore"
            class="btn btn-link upgrade-prompt__link" 
            @click="handleLearnMoreClick">
            Learn More
          </button>
        </div>
      </div>
    </div>
    <div v-else class="upgrade-prompt-loading">
      Loading...
    </div>
  `
};
