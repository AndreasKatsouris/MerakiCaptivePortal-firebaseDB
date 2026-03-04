# Location Association Implementation (Option B)

## Date: November 30, 2025

## Summary

Implemented a simpler location association system that adds `locationIds` array to subscriptions with tier-based limits, instead of the full location-based subscription migration.

## What Was Implemented

### 1. Subscription Schema Update

Added `locationIds` array to subscription records:

```javascript
subscriptions/{userId}
  └─ tierId: "professional"
  └─ locationIds: ["loc1", "loc2"]  // NEW: Which locations this subscription covers
  └─ limits: { locations: 5 }       // Tier controls max locations
  └─ features: {...}
  └─ metadata: {...}
```

### 2. Create User Modal Updates

**File:** `public/js/admin/users-locations-management.js`

- Added multi-select dropdown for locations
- Shows tier location limits
- Validates selection against tier limits
- Warning/error display for limit violations

### 3. Cloud Function Updates

**File:** `functions/index.js` - `createUserAccount`

- Accepts `locationIds` array parameter
- Validates location count against tier limits
- Creates `userLocations/{userId}/{locationId}` entries
- Stores `locationIds` in subscription record

### 4. Subscription Service Methods

**File:** `public/js/modules/access-control/services/subscription-service.js`

New methods added:
- `getSubscriptionLocations()` - Get assigned location IDs
- `addLocationToSubscription(locationId)` - Add a location (with limit check)
- `removeLocationFromSubscription(locationId)` - Remove a location
- `hasLocationAccess(locationId)` - Check if user has access to location
- `getLocationQuota()` - Get used/max/remaining location counts

## Database Structure

### Before
```
subscriptions/{userId}
  └─ tierId
  └─ features
  └─ limits
```

### After
```
subscriptions/{userId}
  └─ tierId
  └─ features
  └─ limits
  └─ locationIds: ["loc1", "loc2"]  // NEW

userLocations/{userId}/{locationId}
  └─ role: "owner" | "admin" | "manager"
  └─ addedAt: timestamp
  └─ addedBy: userId
```

## Tier Location Limits

From `subscriptionTiers`:

| Tier | Max Locations |
|------|---------------|
| Free | 1 |
| Starter | 2 |
| Professional | 5 |
| Enterprise | Unlimited |

## Usage Examples

### Check Location Access
```javascript
import { hasLocationAccess } from './modules/access-control/services/subscription-service.js';

const canAccess = await hasLocationAccess('location-123');
if (!canAccess) {
  alert('This location is not included in your subscription');
}
```

### Get Location Quota
```javascript
import { getLocationQuota } from './modules/access-control/services/subscription-service.js';

const quota = await getLocationQuota();
console.log(`Using ${quota.used} of ${quota.max} locations (${quota.remaining} remaining)`);
```

### Add Location
```javascript
import { addLocationToSubscription } from './modules/access-control/services/subscription-service.js';

const result = await addLocationToSubscription('new-location-id');
if (!result.success) {
  alert(result.error); // "Location limit reached. Your tier allows 5 location(s)."
}
```

## Deployment Required

Deploy the updated Cloud Function:
```bash
firebase deploy --only functions:createUserAccount
```

## Benefits Over Full Migration

1. **Minimal changes** - Only added locationIds array, didn't restructure database
2. **Backward compatible** - Existing subscriptions without locationIds still work
3. **Simple enforcement** - Tier limits checked on add, enterprise has unlimited
4. **Quick implementation** - Hours instead of weeks
5. **Easy to extend** - Can still do full location-based migration later if needed

## Future Considerations

If per-location billing becomes necessary, the full migration plan is available at:
`fixes/29112025/LOCATION_SUBSCRIPTION_MIGRATION_PLAN.md`
