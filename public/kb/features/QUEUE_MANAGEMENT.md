# Queue Management System (QMS)

## Purpose

The Queue Management System implements a FIFO restaurant queue with real-time position tracking, estimated wait times, WhatsApp notifications, and tier-based access control. Guests can join queues via admin entry or WhatsApp self-service. The system supports multiple locations with daily queue isolation.

## Key Files

| File | Description |
|------|-------------|
| `public/queue-management.html` | HTML page with Vue.js queue management UI |
| `functions/queueManagement.js` | Core queue logic: add, remove, update, recalculate positions |
| `functions/queueWhatsAppIntegration.js` | WhatsApp conversational flow for self-service queue join |
| `functions/queueAnalytics.js` | Queue analytics and historical reporting |
| `functions/queueCache.js` | In-memory caching for queue metadata and entries |
| `functions/queueService.js` | Queue service orchestration layer |
| `public/js/modules/access-control/services/access-control-service.js` | QMS feature gating definitions |
| `database.rules.json` | Security rules for `queue` and `queues` nodes |

## Data Model (RTDB Paths)

### `queues/{locationId}/{YYYY-MM-DD}/`

Queues are partitioned by location and date.

#### `metadata`
```json
{
  "date": "2025-07-17",
  "locationId": "ocean_basket_waterfront",
  "locationName": "Ocean Basket Waterfront",
  "queueStatus": "active",
  "maxCapacity": 100,
  "currentCount": 5,
  "estimatedWaitTime": 45,
  "createdAt": 1721234567890,
  "updatedAt": 1721234567890
}
```

#### `entries/{entryId}`
```json
{
  "id": "-NxYz123abc",
  "position": 3,
  "guestName": "John Doe",
  "phoneNumber": "+27827001116",
  "partySize": 4,
  "specialRequests": "Window seat preferred",
  "status": "waiting",
  "estimatedWaitTime": 45,
  "addedAt": 1721234567890,
  "updatedAt": 1721234567890,
  "addedBy": "admin",
  "adminUserId": "uid123",
  "notificationsSent": {
    "added": false,
    "positionUpdate": false,
    "called": false,
    "reminder": false
  }
}
```

### `queue-states/{phoneNumber}`

Tracks WhatsApp conversation state for self-service queue join.

```json
{
  "step": "waiting_for_party_size",
  "phoneNumber": "+27827001116",
  "guestName": "John",
  "locationId": "ocean_basket_waterfront",
  "startedAt": 1721234567890,
  "updatedAt": 1721234567890
}
```

## Main Features

### 1. Add Guest to Queue

Function: `addGuestToQueue(guestData)`

Parameters: `locationId`, `guestName`, `phoneNumber`, `partySize`, `specialRequests`, `addedBy`, `adminUserId`

Flow:
1. Validates required fields
2. **Tier validation** (for admin-added guests):
   - Checks `qmsBasic` feature access
   - Checks location access limits
   - Checks daily queue entry limits
3. Normalizes phone number
4. Validates party size (1-20)
5. Initializes queue metadata if first entry of the day
6. Duplicate check: prevents same phone from being in queue twice (status = `waiting`)
7. Calculates position and estimated wait time
8. Creates entry with `push()` auto-generated key
9. Invalidates queue cache

### 2. Remove Guest from Queue

Function: `removeGuestFromQueue(removeData)`

Updates entry status to `removed`, records `removedAt`, `removalReason`, and `removedBy`. Recalculates positions for remaining entries.

### 3. Update Queue Entry Status

Function: `updateQueueEntryStatus(updateData)`

Valid status transitions: `waiting` -> `called` -> `seated` -> `removed`

Special timestamps:
- `calledAt` - set when status changes to `called`
- `seatedAt` - set when status changes to `seated`

Recalculates positions when status changes to non-waiting.

### 4. Estimated Wait Time Calculation

Function: `calculateEstimatedWaitTime(position, locationId)`

```
baseWait = position * 15 (minutes avg service time)
peakMultiplier = 1.5 (if 12-14 or 18-21 hours)
estimatedWait = round(baseWait * peakMultiplier / 5) * 5
```

### 5. Position Recalculation

Function: `recalculateQueuePositions(locationId, date)`

Sorts active (status = `waiting`) entries by `addedAt` timestamp, reassigns sequential positions starting from 1, recalculates wait times, and updates `currentCount` in metadata.

### 6. Bulk Operations

Function: `bulkQueueOperations(bulkData)`

Requires `qmsAdvanced` tier. Supports batch `call`, `seat`, and `remove` operations.

### 7. Queue Status Retrieval

Function: `getQueueStatus(locationId, date, userId)`

Returns metadata, sorted entries list, and statistics (total, waiting, called, seated, removed). Uses caching layer from `queueCache.js` for performance.

### 8. WhatsApp Self-Service Queue

Module: `functions/queueWhatsAppIntegration.js`

Conversational states (tracked in `queue-states/{phoneNumber}`):

| State | Action |
|-------|--------|
| `IDLE` | Entry point - guest sends "queue" or "join" |
| `WAITING_FOR_NAME` | Bot asks for guest name |
| `WAITING_FOR_PARTY_SIZE` | Bot asks for party size |
| `WAITING_FOR_LOCATION` | Bot lists locations, guest picks by number |
| `WAITING_FOR_SPECIAL_REQUESTS` | Optional special requests |
| `CONFIRMING_QUEUE_ENTRY` | Confirmation before adding to queue |
| `WAITING_FOR_LEAVE_CONFIRMATION` | Guest wants to leave queue |

Available locations are fetched from `locations` node (filtered by `status: 'active'`).

### 9. Guest Queue Position Lookup

Function: `getGuestQueuePosition(phoneNumber, locationId)`

Allows guests to check their current position via WhatsApp by phone number match.

## Tier-Based Access Control

### Feature Tiers

| Feature ID | Minimum Tier | Description |
|-----------|-------------|-------------|
| `qmsBasic` | `free` | Basic queue add/view |
| `qmsAdvanced` | `starter` | Bulk operations, multi-location |
| `qmsWhatsAppIntegration` | `starter` | WhatsApp queue notifications |
| `qmsAnalytics` | `professional` | Queue analytics and reporting |
| `qmsAutomation` | `enterprise` | Automated queue management |

### Resource Limits

| Limit | Free | Starter | Professional | Enterprise |
|-------|------|---------|-------------|-----------|
| Queue entries/day | 25 | 100 | 500 | Unlimited |
| Queue locations | 1 | 2 | 5 | Unlimited |
| Queue history days | 7 | 30 | 90 | Unlimited |

## API Endpoints

The queue functions are exposed via Cloud Functions (onCall or onRequest) and called from the frontend Vue.js component.

| Function | Purpose |
|----------|---------|
| `addGuestToQueue` | Add guest with tier validation |
| `removeGuestFromQueue` | Remove with reason tracking |
| `updateQueueEntryStatus` | Status transitions |
| `getQueueStatus` | Get full queue state |
| `bulkQueueOperations` | Batch operations |
| `getGuestQueuePosition` | Position lookup by phone |
| `getQMSTierInfo` | Tier info for current user |
| `getQMSUsageStats` | Usage stats (professional+) |
| `validateQMSWhatsAppIntegration` | Check WhatsApp access |

## Security Rules

```json
"queue": {
  ".read": "auth != null",
  ".write": "auth != null",
  "$locationId": {
    ".read": "auth != null",
    ".write": "auth != null",
    "entries": {
      ".indexOn": ["status", "createdAt", "phoneNumber", "estimatedWaitTime"],
      "$entryId": {
        ".validate": "newData.hasChildren(['phoneNumber', 'status', 'createdAt'])"
      }
    }
  }
}
```

## Caching

`queueCache.js` provides in-memory caching:
- `cacheQueueMetadata(locationId, date, data)` / `getCachedQueueMetadata()`
- `cacheQueueEntries(locationId, date, data)` / `getCachedQueueEntries()`
- `cacheLocationData(locationId, data)` / `getCachedLocationData()`
- `invalidateQueueCache(locationId, date)` - called after any mutation
- `perfMonitor.startMeasurement(label)` - performance tracking

## Known Gotchas

1. **Daily partitioning**: Queues reset daily. There is no automatic carryover of entries from one day to the next.
2. **Location access validation**: `validateQMSLocationAccess()` checks both basic location access (via `userLocations/{userId}/{locationId}`) and tier-based location count limits.
3. **No real-time listeners in Cloud Functions**: The queue status is fetched on demand. The frontend uses Firebase RTDB `onValue` listeners for real-time updates.
4. **Wait time estimation is basic**: Uses a flat 15-minute average with a peak hour multiplier. No machine learning or historical data analysis.
5. **Phone normalization duplicated**: `normalizePhoneNumber()` is implemented separately in multiple files (guest-management.js, booking-management.js, receiveWhatsappMessage.js, queueWhatsAppIntegration.js). The canonical version is in `functions/dataManagement.js`.
