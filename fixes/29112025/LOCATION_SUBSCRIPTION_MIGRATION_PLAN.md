# Location-Based Subscription Architecture Migration Plan

## Date: November 29, 2025

## Executive Summary

This document outlines the plan to migrate from user-based subscriptions to location-based subscriptions. This architectural change better reflects real-world business models where each venue/location may have different subscription needs.

## Current Architecture (User-Based)

### Database Structure
```
users/{userId}
  └─ email, displayName, etc.

subscriptions/{userId}
  └─ tierId: "enterprise"
  └─ status: "active"
  └─ features: {...}
  └─ limits: {...}

locations/{locationId}
  └─ name, address, etc.
  └─ ownerId: userId

userLocations/{userId}
  └─ {locationId}: true
```

### Problems with Current Model
1. **One Tier Per User:** All locations under a user get the same tier
2. **No Per-Location Billing:** Can't charge differently for different locations
3. **Upgrade Complexity:** Upgrading means ALL locations get upgraded
4. **Multi-Client Users:** Consultants can't manage clients with different tiers
5. **Feature Bleed:** Enterprise features available at ALL user locations

## Proposed Architecture (Location-Based)

### New Database Structure
```
users/{userId}
  └─ email, displayName, etc.
  └─ role: "owner" | "admin" | "manager" | "viewer"

locations/{locationId}
  └─ name, address, etc.
  └─ ownerId: userId
  └─ subscription:
      └─ tierId: "enterprise"
      └─ status: "active"
      └─ startDate: timestamp
      └─ expirationDate: timestamp (optional)
      └─ features: {...}  // Cached from tier
      └─ limits: {...}    // Cached from tier
      └─ metadata:
          └─ signupSource: "admin"
          └─ createdBy: userId

userLocations/{userId}
  └─ {locationId}:
      └─ role: "owner" | "admin" | "manager" | "staff"
      └─ addedAt: timestamp
      └─ addedBy: userId

subscriptionTiers/{tierId}  // No change
  └─ name, monthlyPrice, features, limits, etc.

// DEPRECATED - Keep for migration but stop using
subscriptions/{userId}  // Will be removed after migration
```

### Key Changes

#### 1. Subscription Lives on Location
```javascript
// OLD: Get user subscription
const subscription = await get(ref(rtdb, `subscriptions/${userId}`));

// NEW: Get location subscription
const subscription = await get(ref(rtdb, `locations/${locationId}/subscription`));
```

#### 2. Feature Access Check
```javascript
// OLD: Check user's subscription tier
async function checkFeatureAccess(userId, featureId) {
  const subscription = await getUserSubscription(userId);
  return subscription.tier.features[featureId];
}

// NEW: Check location's subscription tier
async function checkFeatureAccess(locationId, featureId) {
  const location = await getLocation(locationId);
  return location.subscription?.tier?.features?.[featureId] ?? false;
}
```

#### 3. User Roles Per Location
```javascript
// userLocations/{userId}/{locationId}
{
  role: "owner",      // Full control + billing
  // or "admin",      // Full control, no billing
  // or "manager",    // Manage guests, queue, etc.
  // or "staff",      // View-only + basic actions
  addedAt: timestamp,
  addedBy: userId
}
```

## Migration Strategy

### Phase 1: Backward Compatible Changes (Week 1-2)

1. **Add subscription to locations**
   - Create migration script to copy subscription data to each user's locations
   - New code writes to BOTH old and new locations
   - Read continues from old location

2. **Update feature access service**
   - Add location context parameter
   - Support both old (user) and new (location) subscription checks
   - Use location subscription if available, fall back to user subscription

### Phase 2: Switch to Location-Primary (Week 3-4)

3. **Update all feature checks**
   - Dashboard checks location subscription
   - QMS checks location subscription
   - Food Cost checks location subscription
   - All modules receive locationId context

4. **Update admin tools**
   - Subscription management by location
   - Tier upgrades per location
   - Location-specific feature toggles

### Phase 3: Cleanup (Week 5-6)

5. **Remove user subscription reads**
   - Remove fallback to user subscription
   - Delete deprecated code paths

6. **Optional: Remove old subscription data**
   - Archive old subscriptions/{userId} data
   - Clean up database

## Implementation Details

### Migration Script
```javascript
async function migrateToLocationSubscriptions() {
  const users = await get(ref(rtdb, 'users'));

  for (const [userId, userData] of Object.entries(users.val())) {
    // Get user's current subscription
    const subscription = await get(ref(rtdb, `subscriptions/${userId}`));
    if (!subscription.exists()) continue;

    // Get user's locations
    const userLocations = await get(ref(rtdb, `userLocations/${userId}`));
    if (!userLocations.exists()) continue;

    // Copy subscription to each location
    for (const locationId of Object.keys(userLocations.val())) {
      await update(ref(rtdb, `locations/${locationId}/subscription`), {
        ...subscription.val(),
        migratedFrom: userId,
        migratedAt: Date.now()
      });
    }
  }
}
```

### Updated Feature Access Service
```javascript
// feature-access-control.js
export const featureAccessControl = {
  async checkFeatureAccess(featureId, options = {}) {
    const { locationId, userId } = options;

    // NEW: Try location subscription first
    if (locationId) {
      const locationSub = await this.getLocationSubscription(locationId);
      if (locationSub?.tier?.features?.[featureId]) {
        return { hasAccess: true, source: 'location' };
      }
    }

    // FALLBACK: Try user subscription (deprecated path)
    if (userId) {
      const userSub = await this.getUserSubscription(userId);
      if (userSub?.tier?.features?.[featureId]) {
        console.warn('[FeatureAccess] Using deprecated user subscription');
        return { hasAccess: true, source: 'user' };
      }
    }

    return { hasAccess: false, source: null };
  },

  async getLocationSubscription(locationId) {
    const snapshot = await get(ref(rtdb, `locations/${locationId}/subscription`));
    if (!snapshot.exists()) return null;

    const subscription = snapshot.val();
    const tierId = subscription.tierId || 'free';

    const tierSnapshot = await get(ref(rtdb, `subscriptionTiers/${tierId}`));
    return {
      ...subscription,
      tier: tierSnapshot.val()
    };
  }
};
```

### Updated Dashboard Context
```javascript
// user-dashboard.js
class UserDashboard {
  constructor() {
    this.currentLocationId = null;  // Track selected location
  }

  async loadDashboard() {
    // Load user's locations
    const locations = await this.loadUserLocations();

    // Select first location or last used
    this.currentLocationId = this.getSelectedLocation(locations);

    // Load subscription for SELECTED LOCATION
    await this.loadLocationSubscription(this.currentLocationId);

    // Check features for this location
    await this.checkFeatureAccess(this.currentLocationId);
  }

  async switchLocation(locationId) {
    this.currentLocationId = locationId;
    await this.loadLocationSubscription(locationId);
    await this.refreshUI();
  }
}
```

## UI Changes Required

### 1. Location Selector (New)
Add location dropdown to dashboard header:
```html
<select id="locationSelector" class="form-select">
  <option value="loc1">Main Restaurant - Enterprise</option>
  <option value="loc2">Beach Cafe - Professional</option>
  <option value="loc3">Food Truck - Free</option>
</select>
```

### 2. Subscription Display (Update)
Show subscription for selected location:
```html
<div class="subscription-card">
  <h5>Location: Main Restaurant</h5>
  <p>Plan: Enterprise</p>
  <p>Status: Active</p>
  <button>Upgrade This Location</button>
</div>
```

### 3. Admin Subscription Manager (Update)
- List locations with their tiers
- Bulk tier assignment
- Per-location upgrade/downgrade

## Benefits After Migration

| Aspect | Before | After |
|--------|--------|-------|
| Billing | Per-user | Per-location |
| Flexibility | Same tier everywhere | Different tiers per location |
| Multi-tenant | Not supported | Full support |
| Enterprise Sales | All-or-nothing | Gradual rollout per location |
| Testing | Test on entire account | Test on single location |
| Downgrade Risk | Lose everything | Downgrade specific locations |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | High | Backup before migration, dual-write during transition |
| Feature access breaks | High | Extensive testing, fallback to user subscription |
| User confusion | Medium | Clear UI showing location context |
| Performance | Low | Cache location subscriptions |

## Timeline Estimate

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Backward Compatible | 2 weeks | Not Started |
| Phase 2: Switch Primary | 2 weeks | Not Started |
| Phase 3: Cleanup | 2 weeks | Not Started |
| **Total** | **6 weeks** | |

## Files to Modify

### Core Files
- `public/js/modules/access-control/services/feature-access-control.js`
- `public/js/modules/access-control/services/subscription-service.js`
- `public/js/user-dashboard.js`
- `functions/index.js` (createUserAccount, registerUser)

### Module Files
- `public/js/queue-management.js`
- `public/js/modules/food-cost/index.js`
- `public/js/GuestAnalytics.js`
- `public/js/admin/users-locations-management.js`

### Database Rules
- `database.rules.json` - Add location subscription rules

## Questions to Answer Before Starting

1. **Billing Integration:** Do we need to integrate with Stripe/payment system per location?
2. **Legacy Users:** What happens to users with no locations?
3. **Free Tier Default:** Should locations default to free tier or inherit from user?
4. **Admin Override:** Should admins still have enterprise access everywhere?
5. **Feature Limits:** How do we handle limits (e.g., max guests) per location vs per user?

## Next Steps

1. Review and approve this plan
2. Create detailed task breakdown
3. Set up migration test environment
4. Implement Phase 1 changes
5. Test thoroughly before Phase 2

---

**Status:** Planning Complete - Awaiting Approval

**Owner:** [TBD]

**Reviewers:** [TBD]
