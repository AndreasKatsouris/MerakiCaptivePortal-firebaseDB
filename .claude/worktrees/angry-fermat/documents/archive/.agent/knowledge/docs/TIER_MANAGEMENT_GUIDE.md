# Tier Management and Feature Access Control Guide

## Overview

The Tier Management system allows administrators to create subscription tiers with specific features and limits, while the Feature Access Control system ensures users can only access features included in their subscription tier.

## Key Components

### 1. Platform Features (`platform-features.js`)
Defines all available platform features with metadata:
- Feature ID, name, and description
- Category (wifi, whatsapp, analytics, etc.)
- Icon for UI display
- Dependencies on other features

### 2. Tier Management (`tier-management.js`)
Admin interface for managing subscription tiers:
- Create, edit, and delete tiers
- Assign features to tiers
- Set usage limits
- Configure pricing

### 3. Feature Access Control (`feature-access-control.js`)
Service for checking user access to features:
- Check if user has access to specific features
- Get list of available features for user
- Show upgrade prompts when access is denied
- Cache subscription data for performance

### 4. Feature Guard Components (`feature-guard.js`)
Vue components for conditional rendering based on feature access:
- `FeatureGuard`: Conditionally renders content
- `FeatureButton`: Button with built-in access control

## Usage Examples

### 1. Adding Feature Access Control to a Module

```javascript
// Import the feature access control service
import featureAccessControl from './modules/access-control/services/feature-access-control.js';

// Check if user has access to a feature
async function initializeModule() {
  const { hasAccess } = await featureAccessControl.checkFeatureAccess('analyticsAdvanced');
  
  if (!hasAccess) {
    // Show upgrade prompt
    await featureAccessControl.showAccessDeniedMessage('analyticsAdvanced');
    return;
  }
  
  // Initialize the module
  // ...
}
```

### 2. Using Feature Guard Component

```html
<!-- In your Vue template -->
<feature-guard feature="campaignAdvanced" :show-upgrade-button="true">
  <!-- This content only shows if user has access -->
  <div class="advanced-campaign-tools">
    <h3>Advanced Campaign Tools</h3>
    <!-- Advanced features here -->
  </div>
</feature-guard>
```

### 3. Using Feature Button

```html
<!-- Button that checks access before allowing action -->
<feature-button 
  feature="rewardsAdvanced"
  text="Create Advanced Reward"
  icon="fa-gift"
  @click="createAdvancedReward"
  @upgrade-requested="handleUpgradeRequest">
</feature-button>
```

### 4. Checking Multiple Features

```javascript
// Check if user has any of the specified features
const hasAnalytics = await featureAccessControl.hasAnyFeature([
  'analyticsBasic',
  'analyticsAdvanced'
]);

// Check if user has all required features
const canUseAdvancedCampaigns = await featureAccessControl.hasAllFeatures([
  'campaignBasic',
  'campaignAdvanced',
  'analyticsBasic'
]);
```

## Admin Configuration

### Managing Tiers

1. Navigate to Settings > Tier Management in the admin dashboard
2. Click "Add New Tier" to create a new subscription tier
3. Configure tier details:
   - Name and description
   - Monthly and annual pricing
   - Select features to include
   - Set usage limits

### Feature Categories

Features are organized into categories:
- **Core**: Essential platform features
- **WiFi**: WiFi access and management
- **WhatsApp**: Messaging and bot features
- **Analytics**: Data analysis and reporting
- **Campaigns**: Marketing campaign tools
- **Rewards**: Loyalty and rewards features
- **Receipts**: Receipt processing features
- **Guests**: Guest management tools
- **Development**: Development and testing tools

### Feature Dependencies

Some features depend on others. The system automatically:
- Enables required dependencies when selecting a feature
- Prevents disabling features that others depend on
- Shows dependency information in the UI

## Integration with Existing Modules

### Example: Food Cost Module

```javascript
// In food-cost-app.js
import featureAccessControl from '../access-control/services/feature-access-control.js';

export default {
  async mounted() {
    // Check if user has access to food cost features
    const { hasAccess } = await featureAccessControl.checkFeatureAccess('analyticsFoodCost');
    
    if (!hasAccess) {
      this.showUpgradePrompt = true;
      return;
    }
    
    // Continue with normal initialization
    this.initialize();
  }
};
```

### Example: Campaign Management

```javascript
// Check feature access before showing advanced options
if (await featureAccessControl.checkFeatureAccess('campaignAdvanced').then(r => r.hasAccess)) {
  this.showAdvancedOptions = true;
}
```

## Best Practices

1. **Always check feature access** before displaying or enabling functionality
2. **Use caching** - The service caches subscription data for 5 minutes
3. **Provide clear upgrade paths** - Show what tier includes the feature
4. **Handle errors gracefully** - Always have fallback behavior
5. **Use feature guards** for entire sections that require access
6. **Use feature buttons** for individual actions

## Database Structure

### Tiers Collection
```javascript
{
  "tier_id": {
    "name": "Professional",
    "description": "For growing businesses",
    "monthlyPrice": 99,
    "annualPrice": 999,
    "features": {
      "wifiBasic": true,
      "analyticsBasic": true,
      "campaignBasic": true
    },
    "limits": {
      "monthlyUsers": 1000,
      "locations": 3
    }
  }
}
```

### User Subscriptions
```javascript
{
  "user_id": {
    "tierId": "tier_id",
    "status": "active",
    "startDate": "2024-01-01",
    "billingCycle": "monthly"
  }
}
```

## Troubleshooting

### Common Issues

1. **Feature not showing up**
   - Check if feature is defined in `platform-features.js`
   - Verify feature is enabled in user's tier
   - Check browser console for errors

2. **Access check always returns false**
   - Ensure user is authenticated
   - Check if user has active subscription
   - Verify tier configuration

3. **Upgrade prompt not showing**
   - Check if SweetAlert2 is loaded
   - Verify feature exists in platform features
   - Check console for JavaScript errors

## Future Enhancements

1. **Feature Usage Tracking** - Track which features users actually use
2. **A/B Testing** - Test different tier configurations
3. **Dynamic Pricing** - Adjust prices based on usage
4. **Feature Trials** - Allow temporary access to features
5. **Granular Permissions** - More detailed access control within features

## Development Roadmap

### Phase 1: Foundation 
- Tier Management System
- Feature Access Control
- Platform Features Module
- Feature Guard Components
- Testing Infrastructure

### Phase 2: User Experience (Current)
- **User Subscription Management Page** - View current plan, usage, and upgrade options
- **Feature Discovery** - Show locked features with clear upgrade paths
- **Usage Dashboard** - Real-time usage vs limits
- **Billing Portal** - Payment methods, invoices, history

### Phase 3: Admin Tools
- **Subscription Analytics Dashboard** - Overview of all subscriptions
- **Revenue Metrics** - MRR, churn rate, upgrade/downgrade trends
- **Manual Override Tools** - Grant/revoke access, extend trials
- **Promotion System** - Discount codes, special offers

### Phase 4: Full Integration
- **Module Integration** - Add guards to Campaign, Analytics, WhatsApp, etc.
- **Usage Enforcement** - Block actions when limits exceeded
- **Webhook System** - Real-time subscription event notifications
- **API Rate Limiting** - Enforce tier-based API limits

### Phase 5: Advanced Business Features
- **Payment Gateway Integration** - Stripe/PayPal automated billing
- **Free Trial System** - Time-limited feature access
- **Referral Program** - Incentivize user growth
- **Usage-Based Billing** - Pay-per-use options

## Implementation Priority

### Immediate Impact (Week 1-2)
1. User Subscription Page
2. Integration with 2-3 core modules
3. Basic usage tracking

### Short Term (Month 1)
1. Payment integration
2. Admin analytics dashboard
3. Usage enforcement

### Long Term (Quarter 1)
1. Full module integration
2. Advanced analytics
3. Referral and promotion systems
