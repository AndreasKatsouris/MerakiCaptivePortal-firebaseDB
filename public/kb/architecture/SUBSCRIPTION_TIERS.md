# Sparks Hospitality -- Subscription Tier System

## Overview

The platform uses a four-tier subscription model to gate feature access. Tiers are defined both in client-side code (`access-control-service.js`, `subscription-service.js`) and in the RTDB `subscriptionTiers` node. The system combines **feature-based gating** (boolean feature flags) with **resource limits** (numeric caps) and **role-based access control** (user roles within an organization).

## Tier Definitions

### Free Tier

| Property | Value |
|----------|-------|
| Monthly Price | R0 |
| Annual Price | R0 |
| Visible | Yes (always shown) |

**Features Included:**
- `analyticsBasic` -- Basic analytics dashboard
- `wifiBasic` -- Guest WiFi capture
- `guestManagementBasic` -- Basic guest CRM
- `receiptProcessingManual` -- Manual receipt entry
- `bookingManagement` -- Basic booking management
- `qmsBasic` -- Basic queue management

**Resource Limits:**

| Resource | Limit |
|----------|-------|
| Guest Records | 500 |
| Locations | 1 |
| Receipt Processing | 50 / month |
| Campaign Templates | 2 |
| Booking Entries | 50 |
| Booking History | 30 days |
| Queue Entries | 25 |
| Queue Locations | 1 |
| Queue History | 7 days |

---

### Starter Tier

| Property | Value |
|----------|-------|
| Monthly Price | R49.99 |
| Annual Price | R499.99 (2 months free) |
| Visible | Yes |

**Additional Features (on top of Free):**
- `campaignsBasic` -- Basic marketing campaigns
- `rewardsBasic` -- Basic rewards/loyalty program
- `whatsappBasic` -- WhatsApp messaging
- `multiLocation` -- Multi-location support
- `salesForecastingBasic` -- Basic sales forecasting
- `qmsAdvanced` -- Advanced queue management
- `qmsWhatsAppIntegration` -- Queue WhatsApp notifications

**Resource Limits:**

| Resource | Limit |
|----------|-------|
| Guest Records | 2,000 |
| Locations | 2 |
| Receipt Processing | 200 / month |
| Campaign Templates | 5 |
| Queue Entries | 100 |
| Queue Locations | 2 |
| Queue History | 30 days |

---

### Professional Tier

| Property | Value |
|----------|-------|
| Monthly Price | R99.99 |
| Annual Price | R999.99 (2 months free) |
| Visible | Yes |

**Additional Features (on top of Starter):**
- `analyticsExport` -- Export analytics data
- `analyticsAdvanced` -- Advanced analytics
- `guestManagementAdvanced` -- Advanced guest CRM
- `campaignsAdvanced` -- Advanced campaigns
- `rewardsAdvanced` -- Advanced rewards
- `receiptProcessingAutomated` -- Automated OCR processing
- `whatsappAdvanced` -- Advanced WhatsApp features
- `foodCostBasic` -- Food cost analytics
- `bookingAdvanced` -- Advanced booking features
- `bookingAnalytics` -- Booking analytics
- `salesForecastingAdvanced` -- Advanced forecasting
- `qmsAnalytics` -- Queue analytics

**Resource Limits:**

| Resource | Limit |
|----------|-------|
| Guest Records | 10,000 |
| Locations | 5 |
| Receipt Processing | 500 / month |
| Campaign Templates | 20 |
| Queue Entries | 500 |
| Queue Locations | 5 |
| Queue History | 90 days |

---

### Enterprise Tier

| Property | Value |
|----------|-------|
| Monthly Price | R199.99 |
| Annual Price | R1,999.99 (2 months free) |
| Visible | **No** (contact sales only) |

**Additional Features (on top of Professional):**
- `campaignsCustom` -- Custom campaign workflows
- `rewardsCustom` -- Custom reward types
- `advancedFoodCostCalculation` -- Advanced food cost calculation
- `salesForecastingAnalytics` -- Forecast analytics
- `qmsAutomation` -- Queue automation

**Resource Limits:**

| Resource | Limit |
|----------|-------|
| Guest Records | Unlimited |
| Locations | Unlimited |
| Receipt Processing | Unlimited |
| Campaign Templates | Unlimited |
| Queue Entries | Unlimited |
| Queue Locations | Unlimited |
| Queue History | 365 days |

---

## How Gating Works in Code

### 1. Access Control Service (Client-Side)

**File:** `public/js/modules/access-control/services/access-control-service.js`

The `AccessControl` class maintains a `FEATURE_TIERS` map that assigns each feature a minimum tier. Tier hierarchy: `free < starter < professional < enterprise`.

```javascript
const FEATURE_TIERS = {
  'analyticsBasic': 'free',
  'foodCostBasic': 'professional',
  'advancedFoodCostCalculation': 'enterprise',
  // ...
};
```

**Key method:** `hasFeatureAccess(featureId)` -- checks if the user's current tier meets or exceeds the minimum tier for the feature.

**Caching:** Subscription data is cached client-side for 5 minutes (`CACHE_TTL = 5 * 60 * 1000`).

### 2. Feature Guard Component

**File:** `public/js/modules/access-control/components/feature-guard.js`

Wraps UI elements and conditionally renders them based on feature access. Shows an upgrade prompt when access is denied.

### 3. Subscription Service

**File:** `public/js/modules/access-control/services/subscription-service.js`

Manages subscription lifecycle: creation, upgrades, downgrades. Reads tier definitions from both the local `SUBSCRIPTION_TIERS` constant and the RTDB `subscriptionTiers` node.

### 4. Platform Features Registry

**File:** `public/js/modules/access-control/services/platform-features.js`

Central registry of all platform features with metadata (id, name, module, description, category, icon, dependencies). Used by tier management UI.

### 5. Role-Based Access Control

**File:** `public/js/modules/access-control/services/role-access-control.js`

Orthogonal to tier gating. Defines what UI sections each role can access:

| Role | Permissions | Financial | Guest Data | Campaigns | Billing |
|------|------------|-----------|------------|-----------|---------|
| `restaurant_owner` | All | Yes | Yes | Yes | Yes |
| `general_manager` | Most (no billing) | Yes | Yes | Yes | No |
| `kitchen_manager` | Food cost, receipts | Yes | No | No | No |
| `floor_manager` | Queue, bookings, guests | No | Yes | No | No |
| `platform_admin` | Everything | Yes | Yes | Yes | Yes |

### 6. Server-Side Validation

**Cloud Functions** validate tier access for sensitive operations (e.g., QMS tier validation):
- `validateQMSFeatureAccess` -- Checks if user has access to specific QMS features
- `getQMSTierInfo` -- Returns user's QMS tier information and limits
- `getQMSUsageStats` -- Returns usage statistics with tier limit checking

**Location count validation** in `createUserAccount` checks `maxLocations` from tier data before assigning locations.

### 7. Security Rules

RTDB security rules do NOT directly enforce tier gating. They enforce:
- Authentication (`auth != null`)
- Ownership (`auth.uid === data.child('ownerId').val()`)
- Admin status (`auth.token.admin === true`)
- Location membership (`root.child('userLocations').child(auth.uid).child($locationId).exists()`)

Tier enforcement happens at the application layer (client-side + Cloud Functions).

## Subscription Lifecycle

```
Registration
     |
     v
Trial (14 days)
     |
     v
  Active <---> Expired
     |              |
     v              v
 Cancelled     Grace Period
                    |
                    v
                 Expired
```

### Key RTDB Fields

| Field | Purpose |
|-------|---------|
| `subscriptions/{uid}/status` | `trial`, `active`, `expired`, `cancelled` |
| `subscriptions/{uid}/tierId` | Current tier ID |
| `subscriptions/{uid}/trialEndDate` | 14-day trial expiration timestamp |
| `subscriptions/{uid}/startDate` | Subscription start timestamp |

### Automated Status Management

**File:** `functions/subscriptionStatusManager.js`

| Function | Trigger | Purpose |
|----------|---------|---------|
| `checkSubscriptionStatuses` | Scheduled (cron) | Batch check all subscriptions for expiration |
| `triggerSubscriptionStatusCheck` | `onCall` | Admin-triggered status check |
| `onTrialEndDateUpdate` | RTDB trigger | React to trial end date changes |
| `onRenewalDateUpdate` | RTDB trigger | React to renewal date changes |

## Admin Tier Management

**File:** `public/js/modules/access-control/admin/tier-management.js`

Admins can:
- View all tier definitions
- Modify tier features and limits
- Update tier data in RTDB `subscriptionTiers` node
- Assign tiers to users via `createUserAccount`

**File:** `public/js/modules/access-control/admin/enhanced-user-subscription-manager.js`

Enhanced UI for managing individual user subscriptions, including manual tier changes and status overrides.
