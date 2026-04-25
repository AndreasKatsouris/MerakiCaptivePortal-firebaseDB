# Sparks Hospitality -- Firebase RTDB Data Model

## Overview

The platform uses Firebase Realtime Database (RTDB) as its primary data store. Data is organized into top-level nodes with denormalized index nodes for efficient querying. Phone numbers serve as natural keys for guest data. Location-scoped data uses `locationId` for multi-tenant isolation.

## Top-Level Nodes

### Core User & Auth Nodes

#### `users/{uid}`
User profile data created during registration.

```json
{
  "uid": "abc123",
  "email": "owner@restaurant.com",
  "firstName": "John",
  "lastName": "Smith",
  "displayName": "John Smith",
  "businessInfo": {
    "name": "Sparks Grill",
    "address": "123 Main St, Cape Town",
    "phone": "+27821234567",
    "type": "restaurant"
  },
  "phoneNumber": "+27821234567",
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000,
  "status": "active",
  "role": "user"
}
```

#### `subscriptions/{uid}`
Subscription tier and billing state for each user.

```json
{
  "userId": "abc123",
  "tierId": "professional",
  "status": "active|trial|expired|cancelled",
  "startDate": 1700000000000,
  "trialEndDate": 1701209600000,
  "features": { "analyticsAdvanced": true, "foodCostBasic": true },
  "limits": { "guestRecords": 10000, "locations": 5 },
  "locationIds": ["-NxLoc1", "-NxLoc2"],
  "metadata": {
    "signupSource": "web|admin",
    "initialTier": "starter",
    "createdBy": "admin-uid"
  }
}
```
**Indexes:** `userId`, `tier`, `status`, `expirationDate`

#### `subscriptionTiers`
Tier definitions stored in RTDB. Read by registration flow and admin tier management.

```json
{
  "free": { "name": "Free", "features": {...}, "limits": {...} },
  "starter": { "name": "Starter", ... },
  "professional": { "name": "Professional", ... },
  "enterprise": { "name": "Enterprise", ... }
}
```
**Access:** Public read, admin-only write.

#### `locations/{locationId}`
Physical restaurant locations.

```json
{
  "name": "Sparks Grill Waterfront",
  "address": "V&A Waterfront, Cape Town",
  "phone": "+27211234567",
  "type": "restaurant",
  "ownerId": "abc123",
  "createdAt": 1700000000000,
  "status": "active",
  "settings": {
    "timezone": "UTC",
    "currency": "USD",
    "language": "en"
  }
}
```
**Indexes:** `userId`, `ownerId`, `isActive`, `createdAt`, `name`

#### `userLocations/{uid}/{locationId}`
Maps users to their accessible locations. Used for authorization checks in security rules.

```json
{
  "role": "admin|manager",
  "addedAt": 1700000000000,
  "addedBy": "admin-uid"
}
```

#### `admin-claims/{uid}`
Boolean flags for admin users. Used alongside Firebase Auth custom claims for dual verification.

```json
{ "admin-uid-1": true, "admin-uid-2": true }
```

#### `admins/{uid}`
Admin profile data. Requires `superAdmin` field.

```json
{
  "superAdmin": true,
  "email": "admin@sparkshospitality.com"
}
```

#### `onboarding-progress/{uid}`
Tracks user onboarding completion.

---

### Guest Data Nodes

#### `guests/{phoneNumber}`
Guest profiles keyed by normalized phone number. Central CRM node.

```json
{
  "phoneNumber": "+27821234567",
  "name": "Jane Doe",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "currentLocationId": "meraki-node-mac",
  "lastWifiLogin": 1700000000000,
  "source": "wifi_login|manual|whatsapp",
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000,
  "nameCollectedAt": 1700000000000
}
```
**Indexes:** `phoneNumber`, `locationId`, `createdAt`, `email`, `nameCollectedAt`, `name`

#### `wifiLogins/{sessionId}`
Raw WiFi login events from Meraki captive portal. Triggers `syncWifiToGuest` function.

```json
{
  "phoneNumber": "+27821234567",
  "email": "jane@example.com",
  "name": "Jane Doe",
  "node_mac": "AA:BB:CC:DD:EE:FF",
  "timestamp": 1700000000000
}
```
**Access:** Public write (captive portal), authenticated read.

#### `activeUsers`
Currently connected WiFi users.

#### `userPreferences`
Guest preferences data.

---

### Queue Management Nodes

#### `queue/{locationId}/entries/{entryId}`
Queue entries per location.

```json
{
  "phoneNumber": "+27821234567",
  "guestName": "Jane Doe",
  "partySize": 4,
  "status": "waiting|seated|cancelled|no-show",
  "createdAt": 1700000000000,
  "estimatedWaitTime": 15,
  "specialRequests": "Window seat"
}
```
**Indexes:** `status`, `createdAt`, `phoneNumber`, `estimatedWaitTime`

#### `queue/{locationId}/metadata`
Queue metadata (current count, average wait time, etc.)

---

### Booking Nodes

#### `bookings/{bookingId}`
Table reservations.

```json
{
  "guestName": "Jane Doe",
  "phoneNumber": "+27821234567",
  "date": "2025-06-15",
  "time": "19:00",
  "location": "-NxLoc1",
  "section": "indoor|outdoor|bar",
  "numberOfGuests": 4,
  "status": "pending|confirmed|cancelled",
  "specialRequests": "Birthday celebration",
  "createdAt": 1700000000000
}
```
**Indexes:** `status`, `date`, `location`, `createdAt`
**Validation:** Requires `guestName`, `phoneNumber`, `date`, `time`, `location`, `numberOfGuests`, `status`, `createdAt`.

---

### Receipt & OCR Nodes

#### `receipts/{receiptId}`
Processed receipts with OCR data.
**Indexes:** `phoneNumber`, `guestPhoneNumber`, `locationId`, `status`, `processedAt`, `createdAt`

#### `guest-receipts/{phoneNumber}/{receiptId}`
Per-guest receipt index.
**Indexes:** `createdAt`, `processedAt`

#### `receiptTemplates/{templateId}`
OCR template definitions for brand-specific receipt parsing.

```json
{
  "templateName": "Ocean Basket Standard",
  "brandName": "Ocean Basket",
  "patterns": { ... },
  "status": "active|inactive",
  "priority": 1,
  "createdAt": 1700000000000,
  "createdBy": "admin-uid"
}
```
**Indexes:** `brandName`, `status`, `priority`, `createdAt`

#### `receiptPatternLogs/{logId}`
Template matching audit logs.
**Indexes:** `templateId`, `success`, `timestamp`, `brandName`

#### `debug/ocr-logs/{logId}`
OCR debug logs for troubleshooting.
**Indexes:** `timestamp`, `phoneNumber`

---

### Rewards & Voucher Nodes

#### `rewards/{rewardId}`
Individual reward instances.

```json
{
  "metadata": { ... },
  "status": "pending|approved|redeemed|expired",
  "value": 50,
  "expiresAt": 1700000000000,
  "guestPhone": "+27821234567",
  "campaignId": "-NxCamp1"
}
```
**Indexes:** `status`, `guestPhone`, `campaignId`
**Validation:** Requires `metadata`, `status`, `value`, `expiresAt`.

#### `guest-rewards/{phoneNumber}/{rewardId}`
Per-guest reward index.
**Indexes:** `typeId`

#### `campaign-rewards/{campaignId}/{rewardId}`
Per-campaign reward index.

#### `rewardTypes/{typeId}`
Reward type definitions (e.g., "10% off", "Free dessert").
**Indexes:** `status`, `category`

---

### Campaign Nodes

#### `campaigns/{campaignId}`
Marketing campaign definitions.

```json
{
  "name": "Summer Special",
  "status": "draft|active|completed|cancelled",
  "brandName": "Sparks Grill"
}
```
**Indexes:** `status`, `brandName`
**Validation:** Requires `name`, `status`.

---

### WhatsApp Nodes

#### `whatsapp-numbers/{whatsappNumberId}`
Registered WhatsApp business numbers.

```json
{
  "phoneNumber": "+27211234567",
  "displayName": "Sparks Grill",
  "userId": "abc123",
  "status": "active|inactive",
  "createdAt": 1700000000000
}
```
**Indexes:** `userId`, `status`, `createdAt`

#### `location-whatsapp-mapping/{locationId}`
Maps locations to their WhatsApp numbers.

```json
{
  "locationId": "-NxLoc1",
  "whatsappNumberId": "-NxWA1",
  "phoneNumber": "+27211234567",
  "userId": "abc123",
  "assignedAt": 1700000000000
}
```
**Indexes:** `userId`, `whatsappNumberId`, `assignedAt`

#### `whatsapp-tier-limits`
Per-tier WhatsApp usage limits. Admin-only write.

#### `whatsapp-message-history/{messageId}`
Message audit trail.

```json
{
  "locationId": "-NxLoc1",
  "messageType": "booking_confirmation|queue_notification|...",
  "direction": "inbound|outbound",
  "timestamp": 1700000000000,
  "phoneNumber": "+27821234567"
}
```
**Indexes:** `locationId`, `messageType`, `timestamp`, `phoneNumber`

---

### Sales & Forecasting Nodes

#### `salesData/{recordId}`
Uploaded sales data records.
**Indexes:** `locationId`, `userId`, `uploadedAt`
**Validation:** Requires `userId`, `locationId`, `uploadedAt`.

#### `salesDataIndex/byLocation/{locationId}/{dataId}` and `salesDataIndex/byUser/{uid}/{dataId}`
Denormalized index nodes for efficient querying. Access is scoped to user's locations.

#### `forecasts/{forecastId}`
Generated forecast records.
**Indexes:** `locationId`, `userId`, `createdAt`, `status`
**Validation:** Requires `userId`, `locationId`, `createdAt`.

#### `forecastIndex/byLocation/{locationId}` and `forecastIndex/byUser/{uid}`
Denormalized index nodes for forecasts.

#### `forecastActuals/{actualId}`
Actual sales data uploaded for forecast accuracy comparison.
**Indexes:** `forecastId`, `locationId`, `uploadedBy`
**Validation:** Requires `forecastId`, `locationId`, `uploadedAt`.

#### `forecastAnalytics/byLocation/{locationId}` and `forecastAnalytics/systemWide`
Aggregated forecast accuracy metrics.

---

### Stock & Food Cost Nodes

#### `stockUsage/{recordId}`
Stock usage records for food cost analytics.

```json
{
  "timestamp": 1700000000000,
  "userId": "abc123",
  "selectedLocationId": "-NxLoc1",
  "storeName": "Main Kitchen",
  "items": [...]
}
```
**Indexes:** `storeName`, `timestamp`
**Validation:** Requires `timestamp`, `userId`, `selectedLocationId`.

---

### Operational Data Nodes

#### `scanningData/{dataId}`
Raw Meraki scanning API data. Written by webhook.

#### `customization`
Portal customization settings. Public read, admin-only write.

#### `googleReviews/{reviewId}`
Google review imports. Requires `reviewerName`, `rating`, `text`, `timestamp`.

---

### ROSS (Restaurant Operations Support System) Nodes

#### `ross/workflows/{uid}/{workflowId}`
Operational workflows owned by a user, with per-location activation.

```json
{
  "id": "wf-abc123",
  "name": "Opening Checklist",
  "description": "Daily opening procedure",
  "category": "operations",
  "recurrence": "daily",
  "templateId": "tpl-xyz",
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000,
  "locations": {
    "loc-1": {
      "locationId": "loc-1",
      "locationStatus": "active",
      "locationNextDueDate": "2026-03-10T00:00:00.000Z",
      "locationAssignedTo": "staffId",
      "activatedAt": 1700000000000,
      "tasks": {
        "task-1": {
          "title": "Check gas valve",
          "status": "pending",
          "dueDate": null,
          "completedAt": null,
          "assignedTo": null,
          "order": 0
        }
      },
      "history": {
        "2026-daily": {
          "cycleId": "2026-daily",
          "period": "2026",
          "completedAt": 1700000000000,
          "tasksTotal": 5,
          "tasksCompleted": 5,
          "completionRate": 100,
          "onTime": true
        }
      }
    }
  }
}
```

#### `ross/templates/{templateId}`
Reusable workflow templates. Created/edited/deleted by Super Admins only.

```json
{
  "id": "tpl-xyz",
  "name": "Weekly Deep Clean",
  "description": "Weekly deep cleaning procedure",
  "category": "operations",
  "recurrence": "weekly",
  "tasks": [
    { "id": "t1", "title": "Degrease hoods", "required": true, "order": 0 }
  ],
  "isPublic": true,
  "createdBy": "admin-uid",
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000
}
```

#### `ross/ownerIndex/{uid}`
Fan-out index mapping user IDs to a boolean `true`. Written by `rossCreateWorkflow` and `rossActivateWorkflow`. Cleaned up by `rossDeleteWorkflow` when the last workflow for a user is removed. Used by `rossScheduledReminder` to avoid scanning the entire `/ross/workflows` tree.

```json
{ "uid-abc": true, "uid-def": true }
```

#### `ross/workflowsByLocation/{locationId}/{workflowId}`
Reverse index mapping (locationId, workflowId) → ownerUid. Lets a caller resolve the workflow owner given a location they have access to, so any user with location access can read a workflow even when they are not the creator. Written atomically alongside the workflow record by `rossCreateWorkflow` / `rossActivateWorkflow`; removed by `rossDeleteWorkflow`.

```json
{
  "loc-1": {
    "wf-abc123": "admin-uid",
    "wf-def456": "other-admin-uid"
  }
}
```

> **Read-time use:** every per-location ROSS function (`rossGetWorkflows`, `rossGetReports`, `rossCompleteTask`, `rossCreateRun`, `rossSubmitResponse`, `rossGetRun`, `rossGetRunHistory`) starts by resolving the owner via this index, then dereferences `ross/workflows/{ownerUid}/{workflowId}/...` to get the canonical record. Structural mutations (`rossUpdateWorkflow`, `rossManageTask`, `rossDeleteWorkflow`) remain owner-only and continue to scope by the caller's uid.

---

### Admin / Project Management Nodes

#### `admin/projects/{projectId}`
Internal admin project tracking.
**Indexes:** `status`, `priority`, `locationId`, `createdAt`
**Validation:** Requires `name`, `status`, `createdAt`. Status enum: `planning|in_progress|completed|on_hold`.

#### `admin/projects/{projectId}/tasks/{taskId}`
Project tasks. Requires `title`, `status`, `createdAt`.

#### `admin/projects/{projectId}/milestones/{milestoneId}`
Project milestones. Requires `name`, `status`, `createdAt`.

#### `projects/{projectId}`
Public-facing project tracking (read-only for authenticated users).
**Indexes:** `status`, `createdAt`. Status enum: `planned|in_progress|completed|blocked`.

---

### System / Performance Nodes

#### `performance-test`
Used by FPM performance test functions.

#### `performance-logs`
Historical performance log entries (auto-cleaned after 7 days).

#### `optimization-logs/{timestamp}`
System optimization audit trail.

---

## Index Summary

| Node | Indexed Fields |
|------|---------------|
| `guests` | `phoneNumber`, `locationId`, `createdAt`, `email`, `nameCollectedAt`, `name` |
| `subscriptions` | `userId`, `tier`, `status`, `expirationDate` |
| `locations` | `userId`, `ownerId`, `isActive`, `createdAt`, `name` |
| `bookings` | `status`, `date`, `location`, `createdAt` |
| `queue/{locationId}` | `locationId`, `status`, `createdAt` |
| `queue/{locationId}/entries` | `status`, `createdAt`, `phoneNumber`, `estimatedWaitTime` |
| `rewards` | `status`, `guestPhone`, `campaignId` |
| `rewardTypes` | `status`, `category` |
| `campaigns` | `status`, `brandName` |
| `receipts` | `phoneNumber`, `guestPhoneNumber`, `locationId`, `status`, `processedAt`, `createdAt` |
| `receiptTemplates` | `brandName`, `status`, `priority`, `createdAt` |
| `receiptPatternLogs` | `templateId`, `success`, `timestamp`, `brandName` |
| `salesData` | `locationId`, `userId`, `uploadedAt` |
| `forecasts` | `locationId`, `userId`, `createdAt`, `status` |
| `forecastActuals` | `forecastId`, `locationId`, `uploadedBy` |
| `stockUsage` | `storeName`, `timestamp` |
| `whatsapp-numbers` | `userId`, `status`, `createdAt` |
| `location-whatsapp-mapping` | `userId`, `whatsappNumberId`, `assignedAt` |
| `whatsapp-message-history` | `locationId`, `messageType`, `timestamp`, `phoneNumber` |
| `admin/projects` | `status`, `priority`, `locationId`, `createdAt` |
| `projects` | `status`, `createdAt` |

## Data Relationships

```
users/{uid}
  |-- subscriptions/{uid}        (1:1)
  |-- userLocations/{uid}/*      (1:many locations)
  |-- admin-claims/{uid}         (1:1, optional)
  |-- onboarding-progress/{uid}  (1:1)

locations/{locationId}
  |-- queue/{locationId}         (1:1)
  |-- bookings (via location field)
  |-- whatsapp-mapping/{locationId}
  |-- salesDataIndex/byLocation/{locationId}
  |-- forecastIndex/byLocation/{locationId}

guests/{phoneNumber}
  |-- guest-receipts/{phoneNumber}
  |-- guest-rewards/{phoneNumber}
  |-- wifiLogins (via phoneNumber)
  |-- bookings (via phoneNumber)
  |-- queue entries (via phoneNumber)
```

```
ross/workflows/{uid}
  |-- ross/ownerIndex/{uid}       (fan-out for scheduled reminder)
  |-- ross/templates (via templateId)
```

## Key Design Patterns

1. **Phone Number as Guest Key:** Guest records are keyed by normalized phone number (E.164 format), making phone the canonical identifier across all guest-facing features.

2. **Denormalized Index Nodes:** `salesDataIndex`, `forecastIndex`, and `forecastAnalytics` provide secondary access patterns without scanning the full data nodes.

3. **Dual Admin Verification:** Admin status requires BOTH a Firebase Auth custom claim (`auth.token.admin === true`) AND an entry in `admin-claims/{uid}`.

4. **Location-Scoped Authorization:** Security rules check `userLocations/{uid}/{locationId}` to verify a user has access to a specific location's data.

5. **Atomic Multi-Path Updates:** Deletes and cross-node updates use `update(ref(rtdb), { path1: null, path2: null })` for atomicity.

6. **Fan-out Index Nodes:** `ross/ownerIndex` maps user IDs to `true` so scheduled functions can enumerate active owners without scanning the entire data tree. Written on workflow create/activate, cleaned up on last workflow delete.
