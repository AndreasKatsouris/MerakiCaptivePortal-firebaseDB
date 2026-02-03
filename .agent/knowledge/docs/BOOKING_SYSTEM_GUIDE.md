# Booking System Implementation Guide

## Overview

The booking system allows guests to create table reservations through the WhatsApp bot and provides admins with a comprehensive management interface. The system includes automated notifications, booking management, and status tracking.

## System Architecture

### Components

1. **WhatsApp Bot Integration** (`functions/menuLogic.js`)
   - Multi-step booking conversation flow
   - Booking state management
   - Guest booking creation
   - Admin notifications

2. **Admin Management Interface** (`public/admin_tools/booking-management.html`)
   - View all bookings
   - Create manual bookings
   - Update booking status
   - Send notifications

3. **Firebase Functions** (`functions/index.js`)
   - `sendGuestBookingNotification` - Send booking confirmations to guests
   - `sendGuestStatusNotification` - Send status updates to guests

4. **Database Structure**
   - `bookings/` - All booking records
   - `booking-states/` - Temporary booking flow states

## Database Schema

### Bookings Collection
```javascript
bookings: {
  bookingId: {
    id: string,                    // Unique booking ID
    guestName: string,             // Guest's name
    phoneNumber: string,           // Guest's phone number (normalized)
    date: string,                  // Booking date (YYYY-MM-DD)
    time: string,                  // Booking time (HH:MM or HH:MM AM/PM)
    location: string,              // Restaurant location
    section: string,               // Seating section preference
    numberOfGuests: number,        // Number of guests (1-20)
    specialRequests: string,       // Optional special requests
    status: string,                // 'pending', 'confirmed', 'cancelled'
    createdAt: timestamp,          // Creation timestamp
    updatedAt: timestamp,          // Last update timestamp
    createdBy: string,            // 'guest' or 'admin'
    adminUserId?: string           // Admin user ID if created by admin
  }
}
```

### Booking States Collection (Temporary)
```javascript
booking-states: {
  phoneNumber: {
    step: string,                  // Current step in booking flow
    guestName: string,             // Guest's name
    phoneNumber: string,           // Guest's phone number
    date?: string,                 // Selected date
    time?: string,                 // Selected time
    location?: string,             // Selected location
    section?: string,              // Selected section
    numberOfGuests?: number,       // Selected number of guests
    specialRequests?: string,      // Special requests
    startedAt: timestamp,          // When booking flow started
    updatedAt: timestamp           // Last update
  }
}
```

## WhatsApp Bot Booking Flow

### Guest-Initiated Booking Process

1. **Start Booking**
   - Trigger: Guest sends "make booking", "book table", "reserve table"
   - Response: Booking flow initiation with date selection

2. **Multi-Step Flow**
   - **Step 1: Date Selection**
     - Format: YYYY-MM-DD, "today", "tomorrow"
     - Validation: Date format and future dates
   
   - **Step 2: Time Selection**
     - Format: HH:MM, HH:MM AM/PM
     - Validation: Time format
   
   - **Step 3: Location Selection**
     - Examples: Ocean Basket The Grove, Ocean Basket Sandton
     - Validation: Minimum 3 characters
   
   - **Step 4: Section Selection**
     - Options: Inside, Outside/Patio, Bar Area, Private Dining
     - Validation: Minimum 2 characters
   
   - **Step 5: Number of Guests**
     - Range: 1-20 guests
     - Validation: Numeric input within range
   
   - **Step 6: Special Requests**
     - Optional: Birthday celebration, anniversary, etc.
     - Input: Free text or "none"

3. **Booking Confirmation**
   - Create booking record in database
   - Send confirmation to guest
   - Notify admin users via WhatsApp

### Command Patterns

```javascript
// Booking Commands
MAKE_BOOKING: [
  'make booking',
  'book table',
  'reserve table',
  'book a table',
  'reserve a table',
  'make reservation',
  'table booking'
]

VIEW_BOOKING: [
  'view booking',
  'my booking',
  'check booking',
  'my reservation',
  'booking status'
]

CANCEL_BOOKING: [
  'cancel booking',
  'cancel reservation',
  'stop booking',
  'stop reservation'
]
```

### Flow Management

- **State Persistence**: Booking states stored in Firebase
- **Cancellation**: "cancel booking" at any step
- **Validation**: Each step validates input before proceeding
- **Error Handling**: Clear error messages with retry instructions

## Admin Management Interface

### Features

1. **Dashboard Statistics**
   - Total bookings
   - Pending bookings
   - Confirmed bookings
   - Today's bookings

2. **Booking Creation**
   - Guest information (name, phone)
   - Booking details (date, time, location, section, guests)
   - Special requests
   - Initial status selection

3. **Booking Management**
   - View all bookings with filtering
   - Update booking status
   - Send notifications to guests

4. **Filtering Options**
   - Status: pending, confirmed, cancelled
   - Date: specific date selection
   - Location: restaurant location

### Admin Actions

- **Confirm Booking**: Changes status to 'confirmed'
- **Cancel Booking**: Changes status to 'cancelled'
- **Notify Guest**: Sends booking details via WhatsApp
- **Create Booking**: Manual booking creation with guest notification

## Notification System

### Admin Notifications (New Bookings)

When a guest creates a booking, all admin users receive:

```
🍽️ **New Booking Request**

👤 Guest: [Guest Name]
📋 Booking ID: [Booking ID]
📅 Date: [Date]
🕐 Time: [Time]
📍 Location: [Location]
🪑 Section: [Section]
👥 Number of Guests: [Number]
🎉 Special Requests: [Requests]
📱 Phone: [Phone Number]

⏰ Status: Pending Confirmation

Please review and confirm this booking in the admin panel.
```

### Guest Notifications

#### Booking Confirmation
```
🎉 **Booking Confirmed!**

Hi [Guest Name],

Your table reservation has been confirmed:

📋 **Booking Details:**
• Booking ID: [ID]
• Date: [Date]
• Time: [Time]
• Location: [Location]
• Section: [Section]
• Number of Guests: [Number]
• Special Requests: [Requests]

✅ **Status:** Confirmed

We look forward to serving you! If you need to make any changes, please contact us.

🤖 This booking was created by our staff. Reply to this message if you have any questions.
```

#### Status Updates
```
✅ **Booking Status Update**

Hi [Guest Name],

Your booking has been confirmed! We look forward to serving you.

📋 **Booking Details:**
• Booking ID: [ID]
• Date: [Date]
• Time: [Time]
• Location: [Location]
• Section: [Section]
• Number of Guests: [Number]
• Special Requests: [Requests]

🤖 Reply to this message if you have any questions about your booking.
```

## Firebase Functions

### sendGuestBookingNotification

**Endpoint**: `https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/sendGuestBookingNotification`

**Method**: POST

**Request Body**:
```javascript
{
  id: string,
  guestName: string,
  phoneNumber: string,
  date: string,
  time: string,
  location: string,
  section: string,
  numberOfGuests: number,
  specialRequests: string,
  status: string
}
```

**Response**:
```javascript
{
  success: true,
  message: 'Guest notification sent successfully'
}
```

### sendGuestStatusNotification

**Endpoint**: `https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/sendGuestStatusNotification`

**Method**: POST

**Request Body**: Same as booking notification

**Response**: Same as booking notification

## Implementation Details

### Phone Number Normalization

```javascript
function normalizePhoneNumber(phoneNumber) {
    // Remove all non-digit characters except +
    let cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    // If it doesn't start with +, add country code
    if (!cleaned.startsWith('+')) {
        // Assume South African number if no country code
        cleaned = '+27' + cleaned;
    }
    
    return cleaned;
}
```

### Booking State Management

```javascript
// Save booking state
async function saveBookingState(phoneNumber, state) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    await set(ref(rtdb, `booking-states/${normalizedPhone}`), {
        ...state,
        updatedAt: Date.now()
    });
}

// Get booking state
async function getBookingState(phoneNumber) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const snapshot = await get(ref(rtdb, `booking-states/${normalizedPhone}`));
    return snapshot.val();
}
```

### Admin User Detection

```javascript
async function isAdminUser(phoneNumber) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    // Find user by phone number
    const usersSnapshot = await get(ref(rtdb, 'users'));
    const allUsers = usersSnapshot.val() || {};
    
    for (const [userId, userData] of Object.entries(allUsers)) {
        const userPhone = userData.phoneNumber || userData.phone || userData.businessPhone;
        if (userPhone && normalizePhoneNumber(userPhone) === normalizedPhone) {
            // Check admin claims
            const adminClaimsSnapshot = await get(ref(rtdb, `admin-claims/${userId}`));
            const isInAdminClaims = adminClaimsSnapshot.exists() && adminClaimsSnapshot.val() === true;
            const hasAdminRole = userData.role === 'admin' || userData.isAdmin === true;
            const isActive = userData.status !== 'inactive' && userData.status !== 'deleted';
            
            return (isInAdminClaims || hasAdminRole) && isActive;
        }
    }
    
    return false;
}
```

## Error Handling

### Validation Errors

- **Date Format**: Clear format examples provided
- **Time Format**: Multiple format support (24h, 12h with AM/PM)
- **Number Range**: Guests limited to 1-20 with validation
- **Required Fields**: All required fields validated before proceeding

### System Errors

- **Database Errors**: Graceful error handling with retry mechanisms
- **Network Errors**: Connection timeout handling
- **WhatsApp API Errors**: Message delivery failure handling

### User Experience

- **Clear Instructions**: Step-by-step guidance with examples
- **Cancellation**: Easy cancellation at any step
- **Status Updates**: Real-time booking status updates
- **Help Integration**: Booking commands included in help menu

## Testing Procedures

### Manual Testing

1. **Booking Flow Testing**
   - Test each step of the booking process
   - Validate input validation
   - Test cancellation at each step
   - Verify booking creation and notification

2. **Admin Interface Testing**
   - Test booking creation
   - Test status updates
   - Test filtering functionality
   - Test notification sending

3. **Integration Testing**
   - Test end-to-end booking flow
   - Test admin notification delivery
   - Test guest notification delivery
   - Test booking state persistence

### Test Data

```javascript
// Sample booking data for testing
const testBooking = {
    guestName: 'John Doe',
    phoneNumber: '+27123456789',
    date: '2024-02-15',
    time: '19:00',
    location: 'Ocean Basket The Grove',
    section: 'Inside',
    numberOfGuests: 4,
    specialRequests: 'Birthday celebration',
    status: 'pending'
};
```

## Deployment

### Prerequisites

1. Firebase Functions deployed
2. WhatsApp Bot configured
3. Admin users set up with phone numbers
4. Database rules configured

### Deployment Steps

1. **Deploy Firebase Functions**
   ```bash
   firebase deploy --only functions
   ```

2. **Update Admin Interface**
   - Ensure correct Firebase function URLs
   - Test admin authentication
   - Verify booking management functionality

3. **Test WhatsApp Integration**
   - Test booking flow with real phone numbers
   - Verify admin notifications
   - Test guest notifications

## Monitoring and Maintenance

### Key Metrics

- **Booking Volume**: Number of bookings per day/week
- **Completion Rate**: Percentage of started bookings completed
- **Response Time**: Average time to complete booking flow
- **Error Rate**: Percentage of booking failures

### Regular Maintenance

- **Database Cleanup**: Remove old booking states
- **Notification Monitoring**: Verify WhatsApp delivery rates
- **Admin Interface Updates**: Keep booking management up to date
- **Performance Optimization**: Monitor Firebase function performance

## Security Considerations

### Data Protection

- **Phone Number Handling**: Proper normalization and validation
- **Admin Access**: Verified admin user authentication
- **Data Encryption**: Firebase security rules enforcement
- **Input Validation**: Comprehensive input sanitization

### Access Control

- **Admin Interface**: Restricted to verified admin users
- **Firebase Functions**: CORS and authentication validation
- **Database Access**: Proper Firebase security rules
- **WhatsApp Integration**: Secure webhook handling

## Future Enhancements

### Potential Features

1. **Booking Modifications**: Allow guests to modify existing bookings
2. **Recurring Bookings**: Support for repeat reservations
3. **Booking Reminders**: Automated reminder notifications
4. **Availability Checking**: Real-time table availability
5. **Integration with POS**: Connect with restaurant POS systems
6. **Multi-language Support**: Support for multiple languages
7. **Booking Analytics**: Advanced booking analytics dashboard
8. **Guest Preferences**: Store and use guest preferences
9. **Waitlist Management**: Booking waitlist functionality
10. **SMS Backup**: SMS notifications as backup to WhatsApp

### Technical Improvements

1. **Caching**: Implement booking data caching
2. **Real-time Updates**: Live booking updates in admin interface
3. **Mobile App**: Dedicated mobile app for booking management
4. **API Documentation**: Comprehensive API documentation
5. **Automated Testing**: Comprehensive test suite
6. **Performance Monitoring**: Advanced performance monitoring
7. **Backup Systems**: Automated backup procedures
8. **Scalability**: Support for multiple restaurant locations

---

*Last Updated: February 2024*
*Version: 1.0* 