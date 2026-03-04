# WhatsApp Template Implementation Guide

## Overview

This document explains the WhatsApp template messaging system implemented in the platform, following Meta's best practices for WhatsApp Business API messaging.

## Architecture

### 1. Template Management System

**File**: `/functions/utils/whatsappTemplates.js`

- **Template Definitions**: Pre-defined message templates for different use cases
- **Parameter Builders**: Functions to build template parameters from data
- **Categories**: Templates organized by Meta's categories (utility, marketing, authentication)
- **Fallback Messages**: Dynamic messages when templates aren't available

### 2. Enhanced WhatsApp Client

**File**: `/functions/utils/whatsappClient.js`

- **Template Sending**: `sendWhatsAppTemplate()` function with fallback support
- **Convenience Functions**: Dedicated functions for each template type
- **Error Handling**: Automatic fallback to dynamic messages if templates fail
- **Backward Compatibility**: Maintains existing `sendWhatsAppMessage()` functionality

## Available Templates

### 1. Booking Confirmation (`booking_confirmation`)
- **Category**: Utility
- **Use Case**: Confirm new bookings created by admin
- **Parameters**: Guest name, booking details, status
- **Function**: `sendBookingConfirmationTemplate()`

### 2. Booking Status Update (`booking_status_update`)
- **Category**: Utility
- **Use Case**: Notify about booking status changes
- **Parameters**: Status emoji, guest name, status message, booking details
- **Function**: `sendBookingStatusTemplate()`

### 3. Booking Reminder (`booking_reminder`)
- **Category**: Utility
- **Use Case**: Remind guests about upcoming reservations
- **Parameters**: Guest name, date, time, location, number of guests
- **Function**: `sendBookingReminderTemplate()`

### 4. Receipt Confirmation (`receipt_confirmation`)
- **Category**: Utility
- **Use Case**: Confirm receipt processing and rewards earned
- **Parameters**: Guest name, rewards list, total points
- **Function**: `sendReceiptConfirmationTemplate()`

### 5. Welcome Message (`welcome_message`)
- **Category**: Utility
- **Use Case**: Welcome new users to the rewards program
- **Parameters**: Guest name
- **Function**: `sendWelcomeMessageTemplate()`

## Quick Setup Guide

### 1. **Current State (Ready to Use)**
The system is currently configured to use **Twilio with template-formatted messages** as a fallback. This provides:
- ✅ **Professional messaging** with consistent formatting
- ✅ **Immediate functionality** - no approval required
- ✅ **Meta-compliant structure** - ready for WhatsApp Business API

### 2. **Upgrade to WhatsApp Business API Templates**
To use actual WhatsApp Business API templates with template IDs:

1. **Set up WhatsApp Business Account**:
   - Go to [business.facebook.com](https://business.facebook.com)
   - Create WhatsApp Business Account
   - Set up WhatsApp Business API

2. **Get API Credentials**:
   - Access Token from Meta Business Manager
   - Phone Number ID from WhatsApp API Setup
   - Business Account ID from Business Settings

3. **Register Templates**:
   ```bash
   # Copy environment template
   cp functions/.env.template functions/.env
   
   # Update with your credentials
   # Set USE_WHATSAPP_BUSINESS_API=false initially
   
   # Register templates
   cd functions
   node setup-templates.js setup
   ```

4. **Wait for Approval** (24-48 hours)

5. **Update Configuration**:
   - Update template IDs in `whatsappTemplates.js`
   - Set `USE_WHATSAPP_BUSINESS_API=true`
   - Test template sending

## Implementation Details

### Template Structure

```javascript
{
    name: 'template_name',
    category: TEMPLATE_CATEGORIES.UTILITY,
    language: 'en',
    status: 'approved',
    template: {
        namespace: 'your_namespace',
        name: 'template_name',
        language: { code: 'en' },
        components: [
            {
                type: 'header',
                format: 'text',
                text: 'Header Text'
            },
            {
                type: 'body',
                text: 'Body with {{1}} parameters',
                parameters: [
                    { type: 'text', text: 'parameter_name' }
                ]
            },
            {
                type: 'footer',
                text: 'Footer text'
            }
        ]
    }
}
```

### Parameter Building

Each template has a dedicated parameter builder function:

```javascript
function buildBookingConfirmationParams(booking) {
    return [
        booking.guestName,
        booking.id,
        booking.date,
        booking.time,
        booking.location,
        booking.section,
        booking.numberOfGuests.toString(),
        booking.specialRequests || 'None',
        booking.status
    ];
}
```

### Fallback System

If template sending fails, the system automatically falls back to dynamic messages:

```javascript
async function sendWhatsAppTemplate(to, templateType, parameters, options = {}) {
    try {
        // Try to send template
        const fallbackMessage = buildFallbackMessage(templateType, parameters);
        await client.messages.create({
            body: fallbackMessage,
            from: `whatsapp:${twilioPhone}`,
            to: whatsappTo
        });
    } catch (error) {
        // If template fails, use fallback message
        if (options.fallbackMessage) {
            await sendWhatsAppMessage(to, options.fallbackMessage);
        }
    }
}
```

## Integration Points

### 1. Booking Management

**File**: `/public/admin_tools/booking-management.html`

- **Notify Button**: Uses `sendBookingConfirmationTemplate()` when admin clicks notify
- **Status Updates**: Uses `sendBookingStatusTemplate()` when booking status changes
- **Endpoints**: Updated to use correct Firebase Functions URLs

### 2. Firebase Functions

**File**: `/functions/index.js`

- **`sendGuestBookingNotification`**: HTTP endpoint for booking confirmations
- **`sendGuestStatusNotification`**: HTTP endpoint for status updates
- **CORS Enabled**: Allows cross-origin requests from admin tools

### 3. WhatsApp Bot

**File**: `/functions/receiveWhatsappMessage.js`

- **Welcome Messages**: Can use `sendWelcomeMessageTemplate()` for new users
- **Receipt Confirmations**: Can use `sendReceiptConfirmationTemplate()` for rewards
- **Backward Compatibility**: Existing dynamic messages still work

## Usage Examples

### Sending Booking Confirmation

```javascript
const booking = {
    guestName: 'John Doe',
    id: 'BK001',
    date: '2025-01-15',
    time: '19:00',
    location: 'Main Restaurant',
    section: 'Terrace',
    numberOfGuests: 4,
    specialRequests: 'Window table',
    status: 'confirmed'
};

await sendBookingConfirmationTemplate('+27821234567', booking);
```

### Sending Status Update

```javascript
const booking = {
    ...bookingData,
    status: 'cancelled'
};

await sendBookingStatusTemplate('+27821234567', booking);
```

### Using in Admin Tools

```javascript
// In booking-management.html
async function notifyGuest(bookingId) {
    try {
        const booking = allBookings.find(b => b.id === bookingId);
        await sendBookingNotification(booking);
        showSuccessToast('Guest notification sent successfully');
    } catch (error) {
        showErrorToast('Failed to send notification');
    }
}
```

## Benefits

### 1. **Consistency**
- All messages follow the same structure and branding
- Consistent formatting across all communication channels

### 2. **Compliance**
- Follows Meta's WhatsApp Business API best practices
- Proper categorization of message types
- Template approval workflow ready

### 3. **Reliability**
- Fallback system ensures messages are always sent
- Error handling prevents message failures
- Backward compatibility with existing system

### 4. **Scalability**
- Easy to add new templates
- Parameter-based system supports dynamic content
- Template versioning and management

### 5. **Professionalism**
- Professional message formatting
- Branded headers and footers
- Clear call-to-action buttons (when supported)

## Migration Path

### Current State (✅ Implemented)
1. **Template System**: Created with fallback to dynamic messages
2. **Booking Notifications**: Updated to use templates
3. **API Endpoints**: Fixed to use correct Firebase Functions URLs
4. **Error Handling**: Improved with proper fallback mechanisms

### Future Enhancements
1. **WhatsApp Business API**: Migrate from Twilio to WhatsApp Business API
2. **Template Approval**: Implement template approval workflow
3. **Localization**: Add support for multiple languages
4. **Analytics**: Track template performance and delivery rates
5. **Interactive Elements**: Add buttons and quick reply options

## Testing

### Local Testing
```bash
# Test template functionality
node -e "
const { sendBookingConfirmationTemplate } = require('./functions/utils/whatsappClient');
const booking = { guestName: 'Test User', id: 'TEST001', date: '2025-01-15', time: '19:00', location: 'Test Location', section: 'Test Section', numberOfGuests: 2, specialRequests: 'None', status: 'confirmed' };
sendBookingConfirmationTemplate('+27821234567', booking);
"
```

### Production Testing
1. **Create Test Booking**: Use booking management tool to create test booking
2. **Click Notify Button**: Test template message sending
3. **Update Status**: Test status update templates
4. **Verify Fallback**: Ensure fallback messages work if templates fail

## Error Handling

### Template Failures
- Automatic fallback to dynamic messages
- Detailed error logging
- User-friendly error messages in admin tools

### API Failures
- Retry mechanisms for transient failures
- Graceful degradation to manual messaging
- Clear error reporting to administrators

## Security Considerations

### Data Protection
- Phone numbers are normalized and validated
- Template parameters are sanitized
- No sensitive data logged in templates

### Access Control
- Only authenticated admins can send notifications
- Template access controlled by user roles
- API endpoints protected with proper authentication

## Monitoring

### Logging
- Template usage tracking
- Error rate monitoring
- Performance metrics

### Alerts
- Failed template deliveries
- High error rates
- System degradation

This implementation provides a robust foundation for WhatsApp template messaging while maintaining backward compatibility and ensuring reliable message delivery.