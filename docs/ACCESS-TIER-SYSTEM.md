# Laki Sparks Platform - Access Tier System

## Overview
This document outlines the implementation plan for introducing tiered subscription levels to the Laki Sparks platform. The system will enable monetization through feature-gated access while maintaining the existing architecture and user experience.

## Business Objectives
- Create sustainable revenue streams through tiered subscriptions
- Provide clear value differentiation between tiers
- Enable gradual feature adoption through upgrade paths
- Maintain seamless user experience across all tiers
- Support future expansion of premium features

## Subscription Tiers

### 1. Free Tier
- Basic WiFi data collection
- Limited guest records (up to 500 guests)
- Basic analytics dashboard
- Manual receipt processing (limited to 50 per month)
- Single location support

### 2. Starter Tier
- Expanded guest database (up to 2,000 guests)
- Basic rewards system
- Simple campaign templates (up to 5)
- Enhanced analytics with basic reports
- Limited WhatsApp integration
- Multi-location support (up to 2)

### 3. Professional Tier
- Full rewards system access
- Advanced campaign management
- Comprehensive analytics with export
- Automated receipt processing (up to 500 per month)
- Full WhatsApp integration
- Food cost management with basic features
- Multi-location support (up to 5)

### 4. Enterprise Tier
- Unlimited guest records
- Custom rewards programs
- Advanced food cost management with predictive ordering
- White-label options
- API access
- Priority support
- Unlimited locations

## Implementation Phases

### Phase 1: Foundation (Weeks 1-3)
**Core Infrastructure Development**

#### Database Structure
- Create subscription data model in Firebase
- Implement user-subscription relationships
- Develop feature flag system

#### Core Services
- Develop `access-control-service.js` with central permission checking
- Create subscription management service
- Build feature flag management system

#### Admin Interface
- Create subscription tier management interface
- Implement manual override capabilities for admins
- Develop subscription analytics dashboard

#### Integration Framework
- Design permission checking API for module integration
- Create UI components for upgrade prompts
- Implement client-side permission caching

### Phase 2: Module Integration (Weeks 4-6)
**Feature Gating Implementation**

#### WiFi Module Integration
- Implement guest limit controls
- Add tier-based data collection options
- Create upgrade paths in WiFi portal

#### Analytics Module Integration
- Implement tiered report access
- Add export limitations for lower tiers
- Create premium analytics features

#### Rewards & Campaigns
- Implement campaign template limitations
- Add tiered rewards program features
- Create premium campaign types

#### Food Cost Management
- Implement basic vs. advanced calculation access
- Add tiered historical data access
- Create premium forecasting features

### Phase 3: Subscription Management (Weeks 7-9)
**User-Facing Subscription Features**

#### Payment Integration
- Implement payment provider integration
- Create subscription lifecycle management
- Develop billing history and receipts

#### User Dashboard
- Create subscription management interface
- Implement upgrade/downgrade workflows
- Add usage metrics and limit indicators

#### Trial System
- Implement free trial capabilities
- Create trial conversion workflows
- Develop trial notification system

#### Multi-Location Management
- Implement location limits by tier
- Create location management interface
- Develop cross-location permission model

### Phase 4: Optimization & Testing (Weeks 10-12)
**Refining the System**

#### Performance Optimization
- Implement efficient permission checking
- Create permission caching system
- Optimize database queries

#### Security Hardening
- Implement server-side permission validation
- Create security rules for subscription data
- Develop anti-fraud measures

#### A/B Testing
- Test different upgrade prompts
- Optimize conversion workflows
- Analyze tier feature utilization

#### Documentation & Training
- Create internal documentation
- Develop customer-facing documentation
- Create sales enablement materials

## Technical Specifications

### Database Schema

```javascript
// Firebase Realtime Database Structure
subscriptions: {
  $userId: {
    tierId: string,         // 'free', 'starter', 'professional', 'enterprise' (links to subscriptionTiers)
    startDate: number,      // timestamp
    renewalDate: number,    // timestamp
    paymentStatus: string,  // 'active', 'pastDue', 'canceled'
    features: {
      // Specific feature flags for this user, potentially overriding tier defaults.
      // Effective features are calculated based on tierId + these overrides.
      advancedAnalytics: boolean,
      // ... additional features
    },
    limits: {
      guestRecords: number,
      locations: number,
      receiptProcessing: number,
      // ... additional limits
    },
    history: {
      // Subscription change history
    }
  }
}

// Tier definitions (for admin management)
subscriptionTiers: {
  $tierId: {
    name: string,
    description: string,
    monthlyPrice: number,
    annualPrice: number,
    features: {
      // Default feature flags for this tier
    },
    limits: {
      // Default limits for this tier
    }
  }
}
```

### Access Control Module Structure

```
/public/js/modules/access-control/
  ├── index.js                 // Main module entry point
  ├── services/
  │   ├── access-control-service.js    // Core permission checking
  │   ├── subscription-service.js      // Subscription management
  │   └── feature-flag-service.js      // Feature flag management
  ├── components/
  │   ├── subscription-manager/        // User subscription management
  │   ├── upgrade-prompt/             // Upgrade CTAs
  │   └── feature-gating/             // UI components for gated features
  └── admin/
      ├── tier-management.js          // Admin tier configuration
      ├── user-subscription-manager.js // Admin override tools
      └── subscription-analytics.js    // Subscription metrics
```

### Integration API

```javascript
// Core permission checking API
window.AccessControl = {
  // Check if user can access a feature
  async canUseFeature(featureId) {
    // Implementation with caching
  },
  
  // Get user's limit for a specific resource
  async getLimit(limitId) {
    // Implementation with fallbacks
  },
  
  // Check if user is at or over a limit
  async isAtLimit(limitId, currentUsage) {
    // Implementation with comparison logic
  },
  
  // Get user's current subscription details
  async getCurrentSubscription() {
    // Implementation with proper error handling
  },
  
  // Show upgrade prompt for a feature
  showUpgradePrompt(featureId, elementContainer) {
    // Implementation with UI rendering
  }
}
```

## Integration Guidelines

### Module Integration Pattern

```javascript
// Example integration in Food Cost module
import { FoodCostAdvanced } from './order-calculator-advanced.js';

async function initializePurchaseOrderModal() {
  const modal = document.getElementById('po-modal');
  
  // Check permission for advanced features
  const hasAdvancedAccess = await window.AccessControl.canUseFeature('advancedFoodCostCalculation');
  
  if (hasAdvancedAccess) {
    // Show advanced calculation toggle
    modal.querySelector('.advanced-options').classList.remove('hidden');
    
    // Initialize advanced calculator
    const advancedCalculator = new FoodCostAdvanced();
    // Setup advanced calculator
  } else {
    // Hide advanced options
    modal.querySelector('.advanced-options').classList.add('hidden');
    
    // Add upgrade prompt
    const upgradeContainer = modal.querySelector('.upgrade-container');
    window.AccessControl.showUpgradePrompt('advancedFoodCostCalculation', upgradeContainer);
  }
  
  // Continue with basic initialization
}
```

### UI Components for Gated Features

```html
<!-- Example of feature-gated UI component -->
<div class="analytics-export">
  <h3>Export Reports</h3>
  
  <div class="feature-content" data-feature-id="analyticsExport">
    <!-- Feature content shown only if user has access -->
    <button id="export-csv">Export as CSV</button>
    <button id="export-pdf">Export as PDF</button>
  </div>
  
  <div class="feature-locked" data-feature-id="analyticsExport">
    <!-- Shown when user doesn't have access -->
    <p>Export reports are available on the Professional plan and above</p>
    <button class="upgrade-button">Upgrade Now</button>
  </div>
</div>
```

## Testing Strategy

### Unit Testing
- Test permission checking logic
- Validate subscription state transitions
- Verify limit enforcement accuracy

### Integration Testing
- Test module integrations with access control
- Verify UI states for different subscription tiers
- Test upgrade/downgrade workflows

### User Acceptance Testing
- Test complete user journeys across tiers
- Validate upgrade prompts and conversion flows
- Test payment processing and subscription lifecycle

## Future Enhancements

### Phase 5: Advanced Monetization (Future)
- Implement usage-based billing for specific features
- Create add-on marketplace for specialized modules
- Develop partner integration program
- Implement dynamic pricing based on usage patterns

### Phase 6: Enterprise Features (Future)
- Develop SSO integration for enterprise customers
- Create custom branding capabilities
- Implement advanced security features
- Develop enterprise API access

## Conclusion

This phased implementation plan provides a structured approach to introducing monetization through tiered access levels while maintaining the existing architecture and user experience. Each phase builds upon the previous, allowing for incremental deployment and testing.

The Access Tier System will be implemented using established patterns for Firebase Realtime Database operations and will follow the modular architecture with global namespacing that characterizes the current codebase.
