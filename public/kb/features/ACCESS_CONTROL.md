# Access Control and Subscription Tiers

## Purpose

The Access Control module implements a tiered subscription system that gates platform features based on the user's plan level. It provides centralized permission checking, resource limit enforcement, and subscription lifecycle management across both frontend (UI gating) and backend (Cloud Functions validation).

## Key Files

| File | Description |
|------|-------------|
| `public/js/modules/access-control/index.js` | Module entry point, exports `AccessControl` and `SubscriptionService` |
| `public/js/modules/access-control/services/access-control-service.js` | Core permission engine: feature tiers, resource limits, subscription cache |
| `public/js/modules/access-control/services/subscription-service.js` | `canAddGuest()`, subscription lifecycle helpers |
| `public/js/modules/access-control/services/feature-access-control.js` | Feature-level access control helpers |
| `public/js/modules/access-control/services/platform-features.js` | Platform feature definitions |
| `public/js/modules/access-control/services/role-access-control.js` | Role-based access control |
| `public/js/modules/access-control/components/feature-guard.js` | Vue `FeatureGuard` component for UI gating |
| `public/js/modules/access-control/admin/` | Admin tools for subscription management |
| `public/js/modules/user-subscription.js` | User-facing subscription page logic |
| `functions/subscriptionStatusManager.js` | Backend subscription status validation |
| `functions/queueManagement.js` | QMS-specific tier validation (duplicates some logic) |
| `functions/whatsappManagement.js` | WhatsApp-specific tier validation |

## Subscription Tiers

### Tier Hierarchy

```
free < starter < professional < enterprise
```

Users on a higher tier have access to all features of lower tiers.

### Tier Definitions

| Tier | Target User | Key Features |
|------|-------------|-------------|
| `free` | Trial/basic users | WiFi, basic guest management, basic queue, basic analytics |
| `starter` | Single-location | Multi-location, campaigns, rewards, WhatsApp, advanced queue |
| `professional` | Growing businesses | Food cost, advanced analytics, receipt automation, booking analytics |
| `enterprise` | Multi-location chains | Unlimited everything, custom campaigns, automation, advanced food cost |

## Feature Tiers Map

Complete `FEATURE_TIERS` from `access-control-service.js`:

| Feature ID | Min Tier | Description |
|-----------|----------|-------------|
| `analyticsBasic` | `free` | Basic analytics dashboard |
| `analyticsExport` | `professional` | Data export functionality |
| `analyticsAdvanced` | `professional` | Advanced analytics views |
| `wifiBasic` | `free` | WiFi captive portal |
| `wifiAdvancedCollection` | `starter` | Advanced WiFi data collection |
| `guestManagementBasic` | `free` | Basic guest CRUD |
| `guestManagementAdvanced` | `professional` | Advanced guest features |
| `campaignsBasic` | `starter` | Basic campaign creation |
| `campaignsAdvanced` | `professional` | Advanced campaigns |
| `campaignsCustom` | `enterprise` | Custom campaign types |
| `rewardsBasic` | `starter` | Basic rewards |
| `rewardsAdvanced` | `professional` | Advanced rewards |
| `rewardsCustom` | `enterprise` | Custom reward types |
| `receiptProcessingManual` | `free` | Manual receipt upload |
| `receiptProcessingAutomated` | `professional` | Automated receipt processing |
| `whatsappBasic` | `starter` | Basic WhatsApp integration |
| `whatsappAdvanced` | `professional` | Advanced WhatsApp features |
| `foodCostBasic` | `professional` | Food cost analytics |
| `advancedFoodCostCalculation` | `enterprise` | Advanced food cost calculations |
| `multiLocation` | `starter` | Multi-location support |
| `qmsBasic` | `free` | Basic queue management |
| `qmsAdvanced` | `starter` | Advanced queue features |
| `qmsWhatsAppIntegration` | `starter` | Queue WhatsApp notifications |
| `qmsAnalytics` | `professional` | Queue analytics |
| `qmsAutomation` | `enterprise` | Queue automation |
| `bookingManagement` | `free` | Basic bookings (testing) |
| `bookingAdvanced` | `professional` | Advanced bookings |
| `bookingAnalytics` | `professional` | Booking analytics |

## Resource Limits

### `TIER_LIMITS` by tier:

| Resource | Free | Starter | Professional | Enterprise |
|----------|------|---------|-------------|-----------|
| `guestRecords` | 500 | 2,000 | 10,000 | Unlimited |
| `locations` | 1 | 2 | 5 | Unlimited |
| `receiptProcessing` | 50 | 200 | 500 | Unlimited |
| `campaignTemplates` | 2 | 5 | 20 | Unlimited |
| `queueEntries` | 25 | 100 | 500 | Unlimited |
| `queueLocations` | 1 | 2 | 5 | Unlimited |
| `queueHistoryDays` | 7 | 30 | 90 | Unlimited |
| `bookingEntries` | 50 | 200 | 1,000 | Unlimited |
| `bookingHistoryDays` | 30 | 60 | 365 | Unlimited |

## Data Model (RTDB Paths)

### `subscriptions/{userId}`

User subscription record:

```json
{
  "tierId": "professional",
  "tier": "professional",
  "status": "active",
  "startDate": "2025-01-01",
  "expirationDate": "2026-01-01",
  "features": {
    "foodCostBasic": true,
    "campaignsAdvanced": true
  },
  "limits": {
    "guestRecords": 15000
  }
}
```

Status values: `active`, `trial`, `expired`, `cancelled`

The `features` and `limits` objects allow per-user overrides that bypass tier-based defaults.

### `subscriptionTiers`

Global tier definitions (publicly readable, admin-writable):

```json
"subscriptionTiers": {
  ".read": true,
  ".write": "auth != null && auth.token.admin === true"
}
```

### `admin-claims/{userId}`

Admin claim markers used for access control checks:

```json
"admin-claims": {
  ".read": "auth != null",
  ".write": "auth != null"
}
```

## Permission Checking

### Frontend: `getCurrentSubscription()`

1. Checks `auth.currentUser` or `authManager.getCurrentUser()`
2. Reads from 5-minute cache (`CACHE_TTL = 5 * 60 * 1000`)
3. Fetches `subscriptions/{userId}` from RTDB
4. If subscription expired, falls back to free tier
5. If no subscription found, defaults to `{ tier: 'free' }`

### Frontend: `hasFeatureAccess(featureId)`

```javascript
const requiredTier = FEATURE_TIERS[featureId];
const userTierIndex = TIERS.indexOf(userTier);
const requiredTierIndex = TIERS.indexOf(requiredTier);
return userTierIndex >= requiredTierIndex;
```

Also checks `subscription.features[featureId]` for direct feature overrides.

### Frontend: `getResourceLimit(limitId)`

Returns the limit value from:
1. `subscription.limits[limitId]` (direct override), or
2. `TIER_LIMITS[userTier][limitId]` (tier default)

### Backend: Duplicate Logic in Cloud Functions

**Important**: QMS (`queueManagement.js`) and WhatsApp (`whatsappManagement.js`) contain their **own copies** of tier validation logic:
- `QMS_FEATURE_TIERS` and `QMS_TIER_LIMITS` in `queueManagement.js`
- `WHATSAPP_TIER_LIMITS` in `whatsappDatabaseSchema.js`

These must be kept in sync with the frontend `FEATURE_TIERS` and `TIER_LIMITS`.

## FeatureGuard Component

Vue 3 component for declarative UI gating:

```html
<FeatureGuard
    feature="foodCostBasic"
    :show-placeholder="true"
    :show-upgrade-button="true"
    placeholder-message="Food Cost Analytics requires a Professional plan.">
    <!-- Protected content rendered only if user has access -->
    <FoodCostDashboard />
</FeatureGuard>
```

Props:
- `feature` - Feature ID to check
- `show-placeholder` - Show placeholder when access denied
- `show-upgrade-button` - Include upgrade CTA
- `placeholder-message` - Custom message text

## Real-Time Subscription Listener

`subscribeToSubscription(callback)` sets up an `onValue` listener on `subscriptions/{userId}` for real-time tier changes. Only one listener is active at a time (previous listeners are detached).

## Custom Claims

Firebase Auth custom claims are used for admin status:
- `auth.token.admin === true` - Admin access
- Custom claims are set via the Firebase Admin SDK in Cloud Functions
- `AdminClaims` module in `public/js/auth/admin-claims.js` handles client-side claim checking

## Security Rules Pattern

```json
"$node": {
  ".read": "auth != null && (auth.token.admin === true || auth.uid === $uid)",
  ".write": "auth != null && (auth.token.admin === true || auth.uid === $uid)"
}
```

This pattern is repeated across most nodes. Admin always has full access. Regular users can only access their own data.

## Known Gotchas

1. **Dual tier definitions**: Feature tiers and limits are defined in BOTH the frontend (`access-control-service.js`) and backend Cloud Functions (`queueManagement.js`, `whatsappManagement.js`). Changes must be made in all locations.
2. **5-minute cache**: Subscription data is cached for 5 minutes. Tier changes may not take effect immediately in the UI.
3. **Expired subscription fallback**: Expired subscriptions automatically fall back to `free` tier features. The original tier data is preserved for re-activation.
4. **Per-user overrides**: The `features` and `limits` objects on the subscription record can override tier defaults. This allows giving specific users access to features above their tier level.
5. **Admin claims vs admin-claims node**: Two sources of admin status: Firebase Auth custom claims (`auth.token.admin`) and the `admin-claims/{uid}` RTDB node. Both are checked in security rules and Cloud Functions.
6. **`bookingManagement` on free tier**: Currently set to `free` for testing. Verify this is intentional before production deployment.
