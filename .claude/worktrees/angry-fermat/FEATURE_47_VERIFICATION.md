# Feature #47: Complete Location Setup Workflow - VERIFICATION

## Test Date: 2026-02-06

## Feature Description
Verify location creation, configuration, and assignment flow.

## Test Steps

### ✅ Step 1: Create new location
- Created test location with unique ID `location-f47-{timestamp}`
- Set all required fields: name, address, phone, type, timezone, currency, language
- Status set to 'active'
- Successfully saved to Firebase RTDB at `locations/{locationId}`

### ✅ Step 2: Set timezone, currency, language
- Timezone: `Africa/Johannesburg`
- Currency: `ZAR`
- Language: `en`
- All configuration values correctly set and retrieved

### ✅ Step 3: Assign location to user
- Created bidirectional reference in `userLocations/{userId}/{locationId}`
- User-location mapping verified successfully
- Assignment persisted correctly

### ✅ Step 4: Configure POS settings
- Enabled POS integration
- Provider: `pilot_pos`
- API key, store ID, and sync settings configured
- Sync interval: 300 seconds (5 minutes)
- Settings saved to `locations/{locationId}/posSettings`
- All POS configuration verified

### ✅ Step 5: Configure labour settings
- Enabled labour integration
- Provider: `deputy`
- API key, enterprise ID, and sync settings configured
- Sync interval: 600 seconds (10 minutes)
- Shift and break tracking enabled
- Settings saved to `locations/{locationId}/labourSettings`
- All labour configuration verified

### ✅ Step 6: Verify location appears in location selector
- Queried user locations via `userLocations/{userId}`
- Found location successfully
- Retrieved location details from main locations node
- Location name, status, and type all correct
- Location ready for use in selector dropdown

## Persistence Verification
- Waited 2 seconds to simulate page refresh
- Re-queried all location data
- All configuration persisted:
  - Base location data ✅
  - POS settings ✅
  - Labour settings ✅
  - Timezone/currency/language ✅

## Database Structure Verified
```
locations/
  {locationId}/
    - name, address, phone, type
    - timezone, currency, language
    - status, createdAt, createdBy, userId
    posSettings/
      - enabled, provider, apiKey, storeId
      - syncInterval, syncEnabled
    labourSettings/
      - enabled, provider, apiKey, enterpriseId
      - syncInterval, syncEnabled
      - trackShifts, trackBreaks

userLocations/
  {userId}/
    {locationId}: true
```

## Mock Data Check
✅ No mock data patterns detected
✅ All operations use real Firebase RTDB
✅ No globalThis, devStore, or mockDb patterns found

## Test Script
File: `test-feature-47-location-workflow.cjs`
- Comprehensive workflow test
- Creates real data in Firebase
- Verifies all configuration steps
- Confirms persistence
- Clean up performed

## Result
✅ **PASSING** - All 6 workflow steps completed successfully
✅ All configuration persists correctly
✅ Real Firebase RTDB integration confirmed
