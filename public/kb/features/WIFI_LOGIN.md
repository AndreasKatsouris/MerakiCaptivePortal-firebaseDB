# WiFi Login (Meraki Captive Portal)

## Purpose

The WiFi Login module is the origin of the Sparks Hospitality platform. It provides a branded captive portal for Cisco Meraki WiFi networks that captures guest data (name, phone, email) when they connect to the restaurant's WiFi. This creates the initial guest record in the database, which then feeds into all other modules (rewards, campaigns, queue management, etc.).

## Key Files

| File | Description |
|------|-------------|
| `public/index.html` | Landing page / marketing site (NOT the captive portal) |
| `public/js/modules/wifi/WifiManager.js` | `WifiManager` class for device tracking and settings |
| `functions/guestSync.js` | Cloud Function for syncing WiFi-captured guests to the main guest database |
| `database.rules.json` | Security rules for `wifiLogins`, `activeUsers`, `scanningData` nodes |

## Data Model (RTDB Paths)

### `wifiLogins/{loginId}`

Records of WiFi captive portal authentications:

```json
{
  "phoneNumber": "+27827001116",
  "name": "John Doe",
  "email": "john@example.com",
  "locationId": "ocean_basket_waterfront",
  "timestamp": 1721234567890,
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "apMac": "11:22:33:44:55:66",
  "clientIp": "10.0.0.15"
}
```

### `activeUsers/{userId}`

Currently connected WiFi users.

### `scanningData/{dataId}`

Meraki scanning API data (device proximity/presence).

```json
"scanningData": {
  ".read": "auth != null",
  ".write": "auth != null",
  "$dataId": {
    ".write": "auth != null"
  }
}
```

### `userPreferences/{userId}`

User preferences captured during WiFi login.

## Captive Portal Flow

### Meraki Integration

1. Guest connects to restaurant WiFi network (Cisco Meraki managed)
2. Meraki redirects to the captive portal splash page
3. Guest fills in name, phone number (and optionally email)
4. Form submission:
   - Saves to `wifiLogins` node
   - Creates/updates `guests/{phoneNumber}` record
   - Meraki grant URL is called to allow internet access
5. Guest is redirected to a success/welcome page

### Meraki Parameters

The captive portal URL receives Meraki query parameters:
- `base_grant_url` - URL to call for granting access
- `user_continue_url` - URL to redirect after login
- `node_mac` - AP MAC address
- `client_ip` - Client IP address
- `client_mac` - Client MAC address

### Guest Data Capture

When a guest logs in via WiFi:
- Phone number is normalized using the standard `normalizePhoneNumber()` logic
- A guest record is created at `guests/{normalizedPhone}` if it doesn't exist
- If the guest already exists, the record is updated with the latest WiFi login timestamp
- The WiFi login is recorded separately in `wifiLogins` for analytics

## WifiManager Class

`public/js/modules/wifi/WifiManager.js` manages the admin view of WiFi data:

### State
```javascript
{
  devices: [],
  reports: [],
  settings: null,
  loading: false,
  currentView: null,
  filters: {
    deviceType: null,
    location: null,
    dateRange: null
  }
}
```

### Methods
- `initialize()` - Cache DOM, setup listeners, load initial data
- `fetchDevices()` - Load connected device list
- `fetchSettings()` - Load WiFi configuration
- `handleSettingsSubmit(formData)` - Save WiFi settings
- `handleFilterChange(key)` - Apply device filters
- `renderCurrentView()` - Update the display

### DOM Elements
- `#wifiSettingsForm` - Settings form
- `#devicesTable` - Connected devices table
- `#wifiReportsTable` - WiFi usage reports
- Filter inputs: `#deviceTypeFilter`, `#locationFilter`, `#dateRangeFilter`

## Tier Gating

| Feature | Minimum Tier |
|---------|-------------|
| `wifiBasic` | `free` |
| `wifiAdvancedCollection` | `starter` |

Basic WiFi captive portal is available on the free tier. Advanced data collection (device analytics, presence tracking) requires the starter tier.

## Security Rules

```json
"wifiLogins": {
  ".read": "auth != null",
  ".write": true
},
"activeUsers": {
  ".read": "auth != null",
  ".write": true
},
"userPreferences": {
  ".read": "auth != null",
  ".write": true
}
```

**Note:** `wifiLogins`, `activeUsers`, and `userPreferences` have `.write: true` (unauthenticated writes allowed). This is because the captive portal splash page submits data before the guest is authenticated in Firebase.

## Known Gotchas

1. **Public write access**: The `wifiLogins`, `activeUsers`, and `userPreferences` nodes allow unauthenticated writes. This is intentional for the captive portal flow but represents a security consideration. Input validation should be handled at the function level.
2. **Meraki API dependency**: The captive portal requires a configured Cisco Meraki network with splash page redirect enabled. The Meraki Dashboard API (separate from Firebase) manages network configuration.
3. **Guest sync timing**: There may be a delay between the WiFi login and the guest record appearing in the guest management UI, depending on Cloud Function cold start times.
4. **No offline captive portal**: The captive portal requires internet access to load. If the Meraki AP cannot reach Firebase, the splash page will not function.
5. **Landing page vs captive portal**: `public/index.html` is the marketing landing page for Sparks Hospitality, NOT the WiFi captive portal splash page. The actual splash page configuration depends on the Meraki network setup.
