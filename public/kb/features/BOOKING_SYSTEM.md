# Booking System

## Purpose

The Booking System allows restaurant staff to create, manage, and track table reservations. It is a Vue 3 component with tier-gated access, integrated with the queue management system, guest records, and location management. Bookings include guest linkage via phone number, date/time scheduling, and status tracking.

## Key Files

| File | Description |
|------|-------------|
| `public/js/modules/booking-management.js` | Vue 3 `BookingManagementApp` component with full CRUD |
| `public/js/modules/access-control/components/feature-guard.js` | `FeatureGuard` component used for tier gating |
| `public/js/services/booking-permission-service.js` | `BookingPermissionService` for access validation |
| `public/js/auth/admin-claims.js` | `AdminClaims` for admin status checking |
| `database.rules.json` | Security rules for `bookings` node |

## Data Model (RTDB Paths)

### `bookings/{bookingId}`

Individual booking records (auto-generated push key):

```json
{
  "guestName": "John Doe",
  "phoneNumber": "+27827001116",
  "date": "2025-07-20",
  "time": "19:30",
  "location": "ocean_basket_waterfront",
  "numberOfGuests": 4,
  "status": "confirmed",
  "specialRequests": "Window table, birthday celebration",
  "createdAt": 1721234567890,
  "updatedAt": 1721234567890,
  "createdBy": "admin-uid"
}
```

Status values: `pending`, `confirmed`, `cancelled`

Required fields (enforced by security rules): `guestName`, `phoneNumber`, `date`, `time`, `location`, `numberOfGuests`, `status`, `createdAt`

## Main Features

### 1. Booking Creation

SweetAlert2 modal collects:
- Guest name
- Phone number (normalized with `+27` prefix)
- Date and time
- Location (from user's accessible locations)
- Number of guests
- Special requests (optional)

Phone normalization uses the same logic as guest management:
```javascript
function normalizePhoneNumber(phoneNumber) {
    // Strips whatsapp: prefix
    // Ensures +27 prefix for SA numbers
    // Handles 0-prefixed local numbers
}
```

### 2. Booking List View

Table view with columns:
- Guest Name
- Phone
- Date
- Time
- Location
- Party Size
- Status (badge-colored)
- Actions (View, Edit, Cancel)

### 3. Filtering

- **Date filter**: Calendar date picker
- **Location filter**: Dropdown of user's accessible locations
- **Status filter**: All, Pending, Confirmed, Cancelled

### 4. Statistics Cards

Top-level cards showing:
- Total Bookings
- Pending count
- Confirmed count
- Today's bookings count

### 5. FeatureGuard Integration

The entire booking component is wrapped in a `FeatureGuard`:

```html
<FeatureGuard
    feature="bookingManagement"
    :show-placeholder="true"
    :show-upgrade-button="true"
    placeholder-message="Booking Management System is available for Professional and Enterprise plans...">
```

If the user's tier lacks `bookingManagement` access, a placeholder with upgrade prompt is shown.

### 6. Guest Linkage

Bookings are linked to guests via the `phoneNumber` field. When creating a booking, the phone number is normalized to match the guest record key in the `guests` node.

### 7. Queue Integration

The booking system integrates with the queue management system - bookings can be converted to queue entries when guests arrive. [TODO: verify the exact integration mechanism]

## Tier Gating

| Feature | Minimum Tier |
|---------|-------------|
| `bookingManagement` | `free` (enabled for testing) |
| `bookingAdvanced` | `professional` |
| `bookingAnalytics` | `professional` |

Resource limits:

| Limit | Free | Starter | Professional | Enterprise |
|-------|------|---------|-------------|-----------|
| Booking entries | 50 | 200 | 1000 | Unlimited |
| Booking history days | 30 | 60 | 365 | Unlimited |

## Security Rules

```json
"bookings": {
  ".read": "auth != null && (admin || admin-claims exists)",
  ".write": "auth != null && (admin || admin-claims exists)",
  ".indexOn": ["status", "date", "location", "createdAt"],
  "$bookingId": {
    ".read": "admin || admin-claims || location owner || userLocations access",
    ".write": "admin || admin-claims || location owner || userLocations access",
    ".validate": "newData.hasChildren(['guestName', 'phoneNumber', 'date', 'time', 'location', 'numberOfGuests', 'status', 'createdAt'])"
  }
}
```

The security rules enforce location-based access: users can only read/write bookings for locations they own or have access to via `userLocations/{uid}/{locationId}`.

## UI Components

- **Statistics row**: 4 Bootstrap cards with counts
- **Filter bar**: Date, Location dropdown, Status dropdown, New Booking + Refresh buttons
- **Bookings table**: Responsive table with sortable columns
- **Create/Edit modal**: SweetAlert2 form with all booking fields
- **Empty state**: Shown when no bookings match filters

## Known Gotchas

1. **`bookingManagement` set to `free` tier**: The booking feature is currently set to `free` tier for testing. This may need to be changed to `professional` for production.
2. **Admin-claims required for read/write**: Even with a paid tier, the user must have admin claims to access bookings at the security rules level. This means regular guest users cannot make self-service bookings via the web UI.
3. **Location access validation**: Security rules check both `locations/{locationId}/ownerId` and `userLocations/{uid}/{locationId}` for booking access. Both reads (existing data) and writes (new data) are validated.
4. **No real-time updates**: The booking list is refreshed manually. There are no `onValue` listeners for real-time booking updates.
5. **Phone number normalization duplicated**: `normalizePhoneNumber()` is defined locally in `booking-management.js`, duplicating the logic from `guest-management.js`.
