# Guest Management

## Purpose

The Guest Management module is the central guest database for Sparks Hospitality. It captures, stores, and manages guest profiles keyed by phone number. Guests flow in via WiFi captive portal sign-ups, WhatsApp interactions, or manual admin entry. The module provides search, filtering, editing, deletion (with cascade), and engagement analytics.

## Key Files

| File | Description |
|------|-------------|
| `public/guest-management.html` | HTML page with sidebar, mounts Vue app at `#guest-management-app` |
| `public/js/guest-management.js` | Vue 3 component with full CRUD, search, pagination, analytics, cascade updates |
| `public/js/modules/access-control/services/subscription-service.js` | `canAddGuest()` check for tier-based guest limits |
| `public/js/utils/database-paginator.js` | `DatabasePaginator` utility for server-side cursor-based pagination |
| `functions/dataManagement.js` | Backend `normalizePhoneNumber()` used by Cloud Functions |
| `functions/guestSync.js` | Cloud Function for syncing guest data across systems |
| `database.rules.json` | Security rules for `guests` node |

## Data Model (RTDB Paths)

### `guests/{phoneNumber}`

Phone number (normalized, e.g. `+27827001116`) is the **database key**.

```json
{
  "name": "John Doe",
  "phoneNumber": "+27827001116",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-20T14:00:00.000Z",
  "consent": true,
  "tier": "Silver",
  "lastConsentPrompt": "2025-01-15T10:30:00.000Z",
  "consentPending": false,
  "lastCascadeUpdate": 1705312000000,
  "nameUpdateHistory": {
    "1705312000000": {
      "oldName": "Jon Doe",
      "newName": "John Doe",
      "updatedRecords": { "rewards": 2, "receipts": 1, "other": 0 }
    }
  }
}
```

### Related RTDB Nodes

| Path | Relationship |
|------|-------------|
| `receipts/{receiptId}` | Linked via `guestPhoneNumber` field |
| `rewards/{rewardId}` | Linked via `guestPhone` field |
| `guest-rewards/{phoneNumber}/{rewardId}` | Index node, value = `true` |
| `guest-receipts/{phoneNumber}/{receiptId}` | Index node for receipt lookups |
| `vouchers/{voucherId}` | May contain `guestPhone` field |
| `bookings/{bookingId}` | Contains `phoneNumber` field |

## Main Features

### 1. Phone Number Normalization

Three functions handle phone formats:

- **`normalizePhoneNumber(phone)`** - Strips `whatsapp:` prefix, ensures `+27` prefix for SA numbers, handles bare digit strings
- **`formatPhoneNumberForDisplay(phone)`** - Returns normalized format with `+` prefix
- **`validatePhoneNumber(phone)`** - Returns `{ isValid, error, normalized }`, rejects non-SA numbers

Normalization rules:
- `whatsapp:+27827001116` -> `+27827001116`
- `27827001116` -> `+27827001116`
- `0827001116` -> `+27827001116`

### 2. Guest Creation (Add Guest)

Flow:
1. `canAddGuest()` checks tier limit (free: 500, starter: 2000, professional: 10000, enterprise: unlimited)
2. If limit reached, SweetAlert2 prompt with "Upgrade Plan" button redirecting to `/user-subscription.html`
3. SweetAlert2 modal collects name + phone number
4. `validatePhoneNumber()` validates format
5. Duplicate check: `get(ref(rtdb, 'guests/{normalizedPhone}'))` - shows error if exists
6. `set()` writes new guest record with `tier: 'Bronze'`, `consent: false`
7. Idempotency: `isSubmittingGuest` flag prevents double-submit

### 3. Guest Search

- Name search: Firebase `orderByChild('name')` with `startAt(term)` / `endAt(term + '\uf8ff')` for prefix matching
- Phone search: If search term starts with digits, fetches all guests and filters client-side by key containing the term
- Status filter: `all`, `active` (last visit within 90 days), `inactive` (no activity in 90 days)
- URL parameters: `?status=active` persisted via `pushState`

### 4. Pagination

- Server-side cursor-based pagination using Firebase `limitToFirst(pageSize + 1)` and `startAfter(lastKey)`
- Default page size: 25 (options: 10, 25, 50, 100)
- `paginationHistory[]` array stores keys for backward navigation
- Total count queried separately on first page load

### 5. Guest Editing

- Name, loyalty tier (Bronze/Silver/Gold/Platinum), and consent status are editable
- Phone number is read-only after creation
- **Name change triggers cascade update** with confirmation dialog

### 6. Cascade Guest Name Update

Function: `cascadeGuestNameUpdate(phoneNumber, oldName, newName)`

Steps:
1. Scans `rewards` node - updates `guestName` where `guestPhone` matches
2. Scans `receipts` node - updates `guestName` where `guestPhoneNumber` matches
3. Scans `vouchers`, `notifications`, `analytics-cache` - updates where phone matches
4. Records `lastCascadeUpdate` and `nameUpdateHistory` on guest record

Uses multi-path `update(ref(rtdb), updates)` for atomic batch writes per collection.

### 7. Guest Deletion

Flow:
1. SweetAlert2 confirmation with guest name and phone
2. Warning: "This will only delete the guest record" (not rewards/receipts)
3. Pre-deletion verification: `get()` confirms record exists
4. `remove(guestRef)` deletes the record
5. Post-deletion verification: confirms record is gone
6. Local state refresh and verification
7. `isDeletingGuest` flag prevents double-delete

**Note:** For full cascade deletion (guest + rewards + receipts), the data management tools in admin should be used separately.

### 8. Guest Metrics Calculation

`calculateGuestMetrics(guestData)` computes:

| Metric | Calculation |
|--------|-------------|
| `visitCount` | Count of receipts with matching phone |
| `totalSpent` | Sum of `totalAmount` from receipts |
| `averageSpend` | `totalSpent / visitCount` |
| `lastVisit` | Most recent `processedAt` or `createdAt` from receipts |
| `favoriteStore` | Store with highest receipt count |
| `engagementScore` | Recency-weighted score (0-100) |

Engagement score formula:
- `recencyScore = max(0, 100 - (daysSinceLastActivity * 100/30))` (decays over 30 days)
- `consentScore = consent ? 20 : 0`
- `finalScore = round(recencyScore * 0.8 + consentScore * 0.2)`

### 9. Loyalty Tier Calculation

```javascript
if (totalSpend > 10000 && visitCount > 20) return 'PLATINUM';
if (totalSpend > 5000 && visitCount > 10) return 'GOLD';
if (totalSpend > 2000 && visitCount > 5) return 'SILVER';
return 'BRONZE';
```

### 10. Fix Data Consistency Tool

The "Fix Name Consistency" button scans all guests and runs `cascadeGuestNameUpdate()` for each to ensure names are synchronized across all related records. Includes a 100ms delay between guests to avoid overwhelming RTDB.

## UI Components

- **Stats cards**: Total Guests, Active This Month (30 days), Avg Engagement, Total Revenue
- **Guest table**: Sortable columns (Name, Phone, Visit Frequency, Total Spent, Avg Spend, Engagement, Favorite Store, Last Visit)
- **Engagement bar**: Color-coded progress bar (green >= 80, blue >= 60, yellow >= 40, red < 40)
- **Action buttons**: View, Analytics, Edit, Delete per guest
- **Debug button**: Compares database vs UI state, finds mismatches
- **Pagination controls**: First, Previous, Next with page size selector

## Security Rules

```json
"guests": {
  ".read": "auth != null",
  ".write": "auth != null && auth.token.admin === true",
  ".indexOn": ["phoneNumber", "locationId", "createdAt", "email", "nameCollectedAt", "name"],
  "$phoneNumber": {
    ".read": "auth != null && (auth.token.phone_number === $phoneNumber || auth.token.admin === true)",
    ".write": "auth != null && (auth.token.phone_number === $phoneNumber || auth.token.admin === true)"
  }
}
```

## Known Gotchas

1. **Phone number as key**: The phone number is the RTDB key. Changing a phone number requires deleting and re-creating the guest record.
2. **Receipt fetching per guest**: `calculateGuestMetrics()` fetches ALL receipts from the database for each guest to filter client-side. This is an N+1 problem that scales poorly.
3. **Cascade update scans entire collections**: The cascade name update reads all rewards, receipts, and other collections. This works for small datasets but will be slow at scale.
4. **No XSS protection in edit modal**: The edit modal injects guest name directly into HTML template literals. The view modal uses raw `guest.name` in interpolation. SweetAlert2 handles some escaping but the `${guest.name}` in HTML strings is a potential vector.
5. **Active/inactive threshold differs**: Analytics summary uses 30-day threshold for "Active This Month", but status filter uses 90-day threshold for active/inactive classification.
