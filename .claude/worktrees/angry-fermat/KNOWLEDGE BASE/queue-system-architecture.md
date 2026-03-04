# Queue System Architecture Design

## Overview
The queue system provides a daily FIFO (First In, First Out) queuing mechanism for restaurant guests, integrated with the existing MerakiCaptivePortal platform. The system supports WhatsApp-based queue joining, admin dashboard management, and real-time synchronization.

## System Architecture

### Core Components

1. **Queue Database Layer** - Firebase Realtime Database storage
2. **Queue Management API** - Firebase Functions for queue operations
3. **WhatsApp Integration** - Twilio-based messaging for queue interactions
4. **Admin Dashboard** - Vue.js interface for queue management
5. **Real-time Synchronization** - Firebase listeners for live updates

### Technology Stack
- **Backend**: Firebase Functions, Firebase Realtime Database
- **Frontend**: Vue.js 3, Bootstrap 5
- **Integration**: WhatsApp (Twilio API), existing guest management
- **Security**: Firebase security rules, custom claims

## Database Schema Design

### 1. Daily Queue Storage

```javascript
// Firebase Realtime Database structure
queues: {
  [locationId]: {
    [dateString]: {                    // Format: YYYY-MM-DD
      metadata: {
        date: "2025-07-15",
        locationId: "location_123",
        locationName: "Ocean Basket The Grove",
        queueStatus: "active",         // active, paused, closed
        maxCapacity: 100,
        currentCount: 15,
        estimatedWaitTime: 25,         // minutes
        createdAt: timestamp,
        updatedAt: timestamp
      },
      entries: {
        [entryId]: {
          id: string,                  // Unique queue entry ID
          position: number,            // Queue position (1-based)
          guestName: string,           // Guest's name
          phoneNumber: string,         // Normalized phone number
          partySize: number,           // Number of guests (1-20)
          specialRequests: string,     // Optional special requests
          status: string,              // waiting, called, seated, removed
          estimatedWaitTime: number,   // Personal estimated wait (minutes)
          addedAt: timestamp,          // When added to queue
          updatedAt: timestamp,        // Last status update
          calledAt: timestamp,         // When called (if applicable)
          seatedAt: timestamp,         // When seated (if applicable)
          removedAt: timestamp,        // When removed (if applicable)
          addedBy: string,            // 'guest' or 'admin'
          adminUserId: string,         // Admin user ID if added by admin
          notificationsSent: {
            added: boolean,
            positionUpdate: boolean,
            called: boolean,
            reminder: boolean
          }
        }
      }
    }
  }
}
```

### 2. Queue States (Temporary)

```javascript
// Temporary storage for WhatsApp queue flow
queue-states: {
  [phoneNumber]: {
    step: string,                      // Current step in queue flow
    guestName: string,                 // Guest's name
    phoneNumber: string,               // Guest's phone number
    partySize: number,                 // Number of guests
    location: string,                  // Selected location
    specialRequests: string,           // Special requests
    startedAt: timestamp,              // When queue flow started
    updatedAt: timestamp               // Last update
  }
}
```

### 3. Queue History (Analytics)

```javascript
queue-history: {
  [locationId]: {
    [dateString]: {
      totalQueued: number,
      totalSeated: number,
      totalRemoved: number,
      averageWaitTime: number,
      peakQueueSize: number,
      hourlyStats: {
        [hour]: {                      // 0-23
          queued: number,
          seated: number,
          avgWaitTime: number
        }
      }
    }
  }
}
```

## API Design

### Queue Operations API

#### 1. Add Guest to Queue
```javascript
// Function: addGuestToQueue
// Path: /addGuestToQueue
// Method: POST
{
  locationId: string,
  guestName: string,
  phoneNumber: string,
  partySize: number,
  specialRequests?: string,
  addedBy: 'guest' | 'admin',
  adminUserId?: string
}

// Response:
{
  success: boolean,
  queueEntry: {
    id: string,
    position: number,
    estimatedWaitTime: number
  },
  message: string
}
```

#### 2. Remove Guest from Queue
```javascript
// Function: removeGuestFromQueue
// Path: /removeGuestFromQueue
// Method: POST
{
  locationId: string,
  entryId: string,
  reason: 'seated' | 'no_show' | 'cancelled' | 'admin_removed',
  adminUserId?: string
}

// Response:
{
  success: boolean,
  message: string
}
```

#### 3. Update Queue Entry Status
```javascript
// Function: updateQueueEntryStatus
// Path: /updateQueueEntryStatus
// Method: POST
{
  locationId: string,
  entryId: string,
  status: 'waiting' | 'called' | 'seated' | 'removed',
  adminUserId?: string
}

// Response:
{
  success: boolean,
  updatedEntry: object,
  message: string
}
```

#### 4. Get Queue Status
```javascript
// Function: getQueueStatus
// Path: /getQueueStatus
// Method: GET
// Query: locationId, date?

// Response:
{
  success: boolean,
  queueData: {
    metadata: object,
    entries: array,
    statistics: object
  }
}
```

#### 5. Bulk Queue Operations
```javascript
// Function: bulkQueueOperations
// Path: /bulkQueueOperations
// Method: POST
{
  locationId: string,
  operations: [
    {
      type: 'call' | 'seat' | 'remove',
      entryId: string,
      reason?: string
    }
  ],
  adminUserId: string
}
```

### WhatsApp Integration API

#### 1. Process Queue Message
```javascript
// Function: processQueueMessage
// Path: /processQueueMessage
// Method: POST
{
  phoneNumber: string,
  message: string,
  messageType: 'text' | 'button_reply'
}

// Response:
{
  success: boolean,
  reply: string,
  requiresInput: boolean,
  currentStep?: string
}
```

#### 2. Send Queue Notifications
```javascript
// Function: sendQueueNotification
// Path: /sendQueueNotification
// Method: POST
{
  phoneNumber: string,
  notificationType: 'position_update' | 'called' | 'reminder',
  queueData: object
}
```

## Integration Architecture

### 1. Guest Management Integration

```javascript
// Shared functions with existing guest management
import { 
  normalizePhoneNumber, 
  validatePhoneNumber, 
  formatPhoneNumberForDisplay 
} from './guest-management.js';

// Queue entry creation with guest validation
async function createQueueEntry(guestData) {
  // Validate and normalize phone number
  const validation = validatePhoneNumber(guestData.phoneNumber);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }
  
  // Check if guest exists in system
  const existingGuest = await getGuestByPhone(validation.normalized);
  
  // Create queue entry with guest context
  const queueEntry = {
    ...guestData,
    phoneNumber: validation.normalized,
    guestId: existingGuest?.id || null,
    guestHistory: existingGuest?.queueHistory || []
  };
  
  return queueEntry;
}
```

### 2. Location-Based Multi-Tenancy

```javascript
// Location isolation following existing patterns
function getLocationQueuePath(locationId, date) {
  return `queues/${locationId}/${date}`;
}

// Location access control
function validateLocationAccess(userId, locationId) {
  return checkUserLocationAccess(userId, locationId);
}
```

### 3. WhatsApp Menu Integration

```javascript
// Integration with existing menuLogic.js
const queueMenuOptions = {
  'join queue': 'START_QUEUE_FLOW',
  'queue status': 'CHECK_QUEUE_STATUS',
  'leave queue': 'LEAVE_QUEUE_FLOW'
};

// Extended menu processing
function processQueueMenuSelection(phoneNumber, selection) {
  switch(selection) {
    case 'START_QUEUE_FLOW':
      return initiateQueueFlow(phoneNumber);
    case 'CHECK_QUEUE_STATUS':
      return checkUserQueueStatus(phoneNumber);
    case 'LEAVE_QUEUE_FLOW':
      return initiateLeaveQueueFlow(phoneNumber);
  }
}
```

## Real-time Synchronization Architecture

### 1. Firebase Listeners Setup

```javascript
// Admin dashboard real-time listeners
class QueueManager {
  constructor(locationId) {
    this.locationId = locationId;
    this.setupRealtimeListeners();
  }
  
  setupRealtimeListeners() {
    // Listen for queue entries changes
    const queueRef = ref(rtdb, `queues/${this.locationId}/${this.getCurrentDate()}/entries`);
    
    // Real-time queue updates
    onValue(queueRef, (snapshot) => {
      const entries = snapshot.val();
      this.updateQueueDisplay(entries);
      this.updateQueueStatistics(entries);
    });
    
    // Listen for metadata changes
    const metadataRef = ref(rtdb, `queues/${this.locationId}/${this.getCurrentDate()}/metadata`);
    onValue(metadataRef, (snapshot) => {
      const metadata = snapshot.val();
      this.updateQueueMetadata(metadata);
    });
  }
  
  updateQueueDisplay(entries) {
    // Update Vue.js reactive data
    this.queueEntries = Object.values(entries || {})
      .sort((a, b) => a.position - b.position);
  }
}
```

### 2. Position Management System

```javascript
// Automatic position management
async function recalculateQueuePositions(locationId, date) {
  const queuePath = `queues/${locationId}/${date}/entries`;
  const entriesSnapshot = await get(ref(rtdb, queuePath));
  const entries = entriesSnapshot.val();
  
  if (!entries) return;
  
  // Sort active entries by addedAt timestamp
  const activeEntries = Object.values(entries)
    .filter(entry => entry.status === 'waiting')
    .sort((a, b) => a.addedAt - b.addedAt);
  
  // Update positions
  const updates = {};
  activeEntries.forEach((entry, index) => {
    updates[`${queuePath}/${entry.id}/position`] = index + 1;
  });
  
  await update(ref(rtdb), updates);
}
```

### 3. Wait Time Estimation

```javascript
// Dynamic wait time calculation
function calculateEstimatedWaitTime(position, locationId, currentTime) {
  const averageServiceTime = getLocationAverageServiceTime(locationId);
  const historicalData = getLocationHistoricalData(locationId);
  const currentHour = new Date(currentTime).getHours();
  
  // Base calculation
  let estimatedWait = position * averageServiceTime;
  
  // Adjust for time of day
  const hourlyMultiplier = historicalData.hourlyMultipliers[currentHour] || 1;
  estimatedWait *= hourlyMultiplier;
  
  // Round to nearest 5 minutes
  return Math.round(estimatedWait / 5) * 5;
}
```

## Security Architecture

### 1. Firebase Security Rules

```javascript
// Queue-specific security rules
{
  "rules": {
    "queues": {
      "$locationId": {
        ".read": "auth != null",
        ".write": "auth != null && (auth.token.admin === true || root.child('admin-claims').child(auth.uid).exists())",
        "$date": {
          ".read": "auth != null",
          ".write": "auth != null && (auth.token.admin === true || root.child('admin-claims').child(auth.uid).exists())",
          "entries": {
            "$entryId": {
              ".read": "auth != null && (auth.token.admin === true || auth.token.phone_number === data.child('phoneNumber').val())",
              ".write": "auth != null && (auth.token.admin === true || (auth.token.phone_number === data.child('phoneNumber').val() && data.child('addedBy').val() === 'guest'))"
            }
          }
        }
      }
    },
    "queue-states": {
      "$phoneNumber": {
        ".read": "auth != null && (auth.token.admin === true || auth.token.phone_number === $phoneNumber)",
        ".write": "auth != null && (auth.token.admin === true || auth.token.phone_number === $phoneNumber)"
      }
    }
  }
}
```

### 2. Access Control

```javascript
// Queue access validation
async function validateQueueAccess(userId, locationId, operation) {
  const user = await admin.auth().getUser(userId);
  const customClaims = user.customClaims || {};
  
  // Admin access
  if (customClaims.admin === true) {
    return true;
  }
  
  // Location-specific access
  const locationAccessSnapshot = await get(ref(rtdb, `userLocations/${userId}/${locationId}`));
  if (!locationAccessSnapshot.exists()) {
    throw new Error('Access denied: User not authorized for this location');
  }
  
  // Operation-specific validation
  const allowedOperations = locationAccessSnapshot.val().permissions || [];
  if (!allowedOperations.includes(operation)) {
    throw new Error(`Access denied: Operation '${operation}' not permitted`);
  }
  
  return true;
}
```

## Data Management

### 1. Daily Queue Cleanup

```javascript
// Automated cleanup function
exports.cleanupOldQueues = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep 7 days
  
  const queuesRef = ref(rtdb, 'queues');
  const snapshot = await get(queuesRef);
  const allQueues = snapshot.val();
  
  const updates = {};
  
  Object.keys(allQueues).forEach(locationId => {
    Object.keys(allQueues[locationId]).forEach(dateString => {
      const queueDate = new Date(dateString);
      if (queueDate < cutoffDate) {
        // Move to archive before deletion
        updates[`queue-history/${locationId}/${dateString}`] = generateQueueSummary(allQueues[locationId][dateString]);
        updates[`queues/${locationId}/${dateString}`] = null;
      }
    });
  });
  
  await update(ref(rtdb), updates);
});
```

### 2. Analytics Data Generation

```javascript
// Queue analytics calculation
function generateQueueSummary(queueData) {
  const entries = Object.values(queueData.entries || {});
  
  return {
    totalQueued: entries.length,
    totalSeated: entries.filter(e => e.status === 'seated').length,
    totalRemoved: entries.filter(e => e.status === 'removed').length,
    averageWaitTime: calculateAverageWaitTime(entries),
    peakQueueSize: queueData.metadata.maxCapacity || 0,
    hourlyStats: generateHourlyStats(entries)
  };
}
```

## Performance Considerations

### 1. Database Indexing

```javascript
// Recommended indexes for queue operations
{
  "queues": {
    ".indexOn": ["locationId", "date", "status", "addedAt", "position"]
  },
  "queue-states": {
    ".indexOn": ["phoneNumber", "updatedAt"]
  }
}
```

### 2. Caching Strategy

```javascript
// Queue metadata caching
const queueCache = new Map();

async function getCachedQueueMetadata(locationId, date) {
  const cacheKey = `${locationId}-${date}`;
  
  if (queueCache.has(cacheKey)) {
    const cached = queueCache.get(cacheKey);
    if (Date.now() - cached.timestamp < 30000) { // 30 second cache
      return cached.data;
    }
  }
  
  const metadata = await getQueueMetadata(locationId, date);
  queueCache.set(cacheKey, { data: metadata, timestamp: Date.now() });
  
  return metadata;
}
```

## Implementation Timeline

### Phase 1: Core Infrastructure (Day 1-2)
- Database schema implementation
- Basic API functions
- Firebase security rules

### Phase 2: WhatsApp Integration (Day 3-4)
- Queue flow implementation
- Message processing
- Notification system

### Phase 3: Admin Dashboard (Day 5-6)
- Vue.js queue management interface
- Real-time synchronization
- Bulk operations

### Phase 4: Testing & Optimization (Day 7)
- Integration testing
- Performance optimization
- Security validation

## Success Metrics

1. **Functional Requirements**
   - Queue entry creation/removal
   - Position management
   - Real-time updates
   - WhatsApp integration

2. **Performance Requirements**
   - <2 second response time for queue operations
   - <1 second real-time update propagation
   - Support for 100+ concurrent queue entries per location

3. **Security Requirements**
   - Location-based access control
   - Guest data protection
   - Admin operation logging

---

**Architecture Status**: COMPLETE
**Review Required**: All specialist agents
**Next Phase**: Implementation planning and task delegation