# Sparks Hospitality -- Third-Party Integrations

## Overview

The platform integrates with four primary third-party services:

| Service | Provider | SDK / Library | Purpose |
|---------|----------|---------------|---------|
| WhatsApp / SMS | Twilio | `twilio` 5.3.6 | Two-way WhatsApp messaging, template messages |
| Email Marketing | SendGrid | `@sendgrid/client` 8.1.6 | Marketing campaigns, contact syncing |
| Receipt OCR | Google Cloud Vision | `@google-cloud/vision` 4.3.2 | Image-to-text for receipt processing |
| WiFi Captive Portal | Cisco Meraki | Custom webhook handler | Guest capture via WiFi login |

---

## 1. Twilio -- WhatsApp & SMS

### Configuration

**File:** `functions/twilioClient.js`

```javascript
const twilio = require('twilio');
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE;
const client = twilio(accountSid, authToken);
```

**Environment Variables:**
| Variable | Description |
|----------|-------------|
| `TWILIO_SID` | Twilio Account SID |
| `TWILIO_TOKEN` | Twilio Auth Token |
| `TWILIO_PHONE` | Twilio WhatsApp-enabled phone number |

### Message Sending

**File:** `functions/utils/whatsappClient.js`

#### Free-Form Messages

```javascript
async function sendWhatsAppMessage(to, message) {
    const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    await client.messages.create({
        body: message,
        from: `whatsapp:${twilioPhone}`,
        to: whatsappTo
    });
}
```

#### Template Messages (ContentSid)

Twilio Content Templates are used for structured messages that comply with WhatsApp Business API requirements.

```javascript
async function sendWhatsAppTemplate(to, templateType, contentVariables, options = {}) {
    const template = TWILIO_TEMPLATES[templateType];
    const messageOptions = {
        contentSid: template.contentSid,
        contentVariables: JSON.stringify(contentVariables),
        from: `whatsapp:${twilioPhone}`,
        to: `whatsapp:${to}`
    };
    // Optional: messagingServiceSid for multi-number support
    await client.messages.create(messageOptions);
}
```

**Fallback behavior:** If template sending fails or ContentSid is not configured (`HXxxxxxxx` placeholder), the system falls back to a free-form text message via `buildFallbackMessage()`.

### Template Types

**File:** `functions/utils/whatsappTemplates.js`

| Template Type | Purpose | Variables |
|---------------|---------|-----------|
| Booking Confirmation | Confirms new booking | Guest name, date, time, location, party size |
| Booking Status Update | Status change notification | Guest name, status, booking details |
| Booking Reminder | Upcoming booking reminder | Guest name, date, time |
| Receipt Confirmation | Receipt processed notification | Guest name, amount, store |
| Welcome Message | New guest welcome | Guest name, location |
| Queue Manual Addition | Staff-added queue notification | Guest name, location, position, party size, wait time |
| Admin New Booking | Admin notification of new booking | Booking details |

### Inbound Message Handling

**Files:**
- `functions/receiveWhatsappMessage.js` -- Legacy handler
- `functions/receiveWhatsappMessageEnhanced.js` -- Enhanced multi-location handler

The enhanced handler:
1. Receives Twilio webhook POST with form-encoded data
2. Extracts sender phone number, message body, media URLs
3. Looks up location by WhatsApp number via `location-whatsapp-mapping`
4. Routes message through conversation flow (`menuLogic.js`)
5. Processes commands: bookings, queue joins, receipt uploads, rewards checks
6. Stores message in `whatsapp-message-history`

### Multi-Location WhatsApp Architecture

```
Twilio Webhook
     |
     v
receiveWhatsAppMessageEnhanced
     |
     |-- Lookup: location-whatsapp-mapping/{locationId}
     |-- Route to location-specific handler
     |
     v
menuLogic.js (conversation state machine)
     |
     +-- "1" -> Queue management
     +-- "2" -> Booking
     +-- "3" -> Check rewards
     +-- Receipt image -> OCR processing
```

### WhatsApp Management Functions

| Function | Purpose |
|----------|---------|
| `createWhatsAppNumber` | Register a new WhatsApp business number |
| `assignWhatsAppToLocation` | Map number to location |
| `getWhatsAppByLocation` | Lookup number for location |
| `getLocationByWhatsApp` | Reverse lookup |
| `getUserWhatsAppNumbers` | List user's numbers |
| `removeWhatsAppNumber` | Deregister a number |
| `getWhatsAppAnalytics` | Message analytics |

### RTDB Nodes

| Node | Purpose |
|------|---------|
| `whatsapp-numbers/{id}` | Registered business numbers |
| `location-whatsapp-mapping/{locationId}` | Number-to-location mapping |
| `whatsapp-tier-limits` | Per-tier messaging limits |
| `whatsapp-message-history/{messageId}` | Message audit trail |

---

## 2. SendGrid -- Email Marketing

### Configuration

**File:** `functions/sendgridClient.js` [TODO: verify exact filename]

Uses `@sendgrid/client` 8.1.6 for the Marketing API.

**Environment Variables:**
| Variable | Description |
|----------|-------------|
| `SENDGRID_API_KEY` | SendGrid API key |

### Contact Syncing

**Trigger:** `syncGuestToSendGrid` -- RTDB `onWrite` trigger on `guests/{phoneNumber}`

**Process:**
1. Guest profile is created or updated
2. If guest has an email address, sync to SendGrid
3. Contact data: `{ email, firstName, lastName, phoneNumber }`
4. Uses SendGrid Marketing Contacts API (`addContact`)

**Conditions:**
- Skipped if guest has no email
- Skipped if guest data was deleted

### Campaign Integration

Campaigns module uses SendGrid for email delivery:
- Email templates are managed in the platform
- Recipient lists are built from guest data
- Campaign status is tracked in `campaigns/{campaignId}`

---

## 3. Google Cloud Vision -- Receipt OCR

### Configuration

**File:** `functions/receiptProcessor.js`

```javascript
const vision = require('@google-cloud/vision');
```

Uses Application Default Credentials (ADC) from the Firebase project service account. No separate API key needed when deployed to Firebase.

**Feature Flag:**
```javascript
const USE_TEMPLATE_EXTRACTION = process.env.USE_TEMPLATE_EXTRACTION !== 'false';
```

### OCR Pipeline

```
Receipt Image (URL)
     |
     v
Google Cloud Vision API
  detectReceiptText(imageUrl)
     |
     v
Raw OCR Text
     |
     v
Template-Based Extraction (if enabled)
  extractWithTemplates(ocrText)
     |
     +-- Match against receiptTemplates
     +-- Brand-specific parsing patterns
     |
     v
Parsed Receipt Data
  { total, items, brandName, date, tax, ... }
     |
     v
Validation & Storage
  receipts/{receiptId}
  guest-receipts/{phoneNumber}/{receiptId}
```

### Template-Based Extraction

**File:** `functions/templateBasedExtraction.js`

Receipt templates stored in `receiptTemplates/{templateId}` define brand-specific parsing patterns. Templates are matched by brand name and applied in priority order.

**Template Structure:**
```json
{
  "templateName": "Ocean Basket Standard",
  "brandName": "Ocean Basket",
  "patterns": {
    "total": "regex pattern for total extraction",
    "items": "regex pattern for line items",
    "date": "regex pattern for date"
  },
  "status": "active",
  "priority": 1
}
```

### Cloud Functions for OCR

| Function | Purpose |
|----------|---------|
| `ocrReceiptForTemplate` | Run OCR on an image URL for template testing/creation |
| `getReceiptTemplates` | List all templates with filtering |
| `createReceiptTemplate` | Create new brand template |
| `updateReceiptTemplate` | Modify template patterns |
| `deleteReceiptTemplate` | Remove template |
| `getTemplatePerformance` | Template success rate metrics |

### RTDB Nodes

| Node | Purpose |
|------|---------|
| `receipts/{id}` | Processed receipt records |
| `guest-receipts/{phone}/{id}` | Per-guest receipt index |
| `receiptTemplates/{id}` | OCR template definitions |
| `receiptPatternLogs/{id}` | Template matching audit log |
| `debug/ocr-logs/{id}` | OCR processing debug logs |

---

## 4. Cisco Meraki -- WiFi Captive Portal

### Configuration

The Meraki integration uses a webhook-based approach. The Meraki dashboard is configured to POST scanning API data to the `merakiWebhook` Cloud Function.

### Webhook Handler

**Cloud Function:** `merakiWebhook` (HTTP, v2 onRequest)

**GET Request (Handshake):**
```javascript
const validator = "371de0de57b8741627daa5e30f25beb917614141";
return res.status(200).send(validator);
```
Returns a validator string that Meraki uses to verify the webhook URL.

**POST Request (Data):**
```javascript
const sharedSecret = 'Giulietta!16';
if (req.body.secret !== sharedSecret) {
    return res.status(403).send('Unauthorized');
}
// Store scanning data
const ref = admin.database().ref('scanningData').push();
ref.set(data);
```

> **Security Note:** The shared secret is hardcoded in the function. Consider moving to environment variables.

### Data Flow

```
Guest connects to WiFi
     |
     v
Meraki Captive Portal
  (public/index.html)
     |
     |-- Guest enters: phone, email, name
     |-- Data written to wifiLogins/{sessionId}
     |
     v
syncWifiToGuest (RTDB trigger)
     |
     |-- Normalizes phone number
     |-- Creates/updates guests/{phoneNumber}
     |-- Sets source: 'wifi_login'
     |
     v
syncGuestToSendGrid (RTDB trigger)
     |
     |-- If email exists, sync to SendGrid
     |
     v
Meraki Scanning API (parallel)
     |
     |-- POST to merakiWebhook
     |-- Stores in scanningData
```

### WiFi Login Data Shape

```json
{
  "phoneNumber": "+27821234567",
  "email": "guest@example.com",
  "name": "Jane Doe",
  "node_mac": "AA:BB:CC:DD:EE:FF",
  "timestamp": 1700000000000
}
```

### RTDB Nodes

| Node | Purpose |
|------|---------|
| `wifiLogins/{sessionId}` | Raw WiFi login events |
| `scanningData/{dataId}` | Meraki scanning API data |
| `activeUsers` | Currently connected users |
| `guests/{phoneNumber}` | Synced guest profiles |

---

## Integration Environment Variables Summary

| Variable | Service | Required |
|----------|---------|----------|
| `TWILIO_SID` | Twilio | Yes |
| `TWILIO_TOKEN` | Twilio | Yes |
| `TWILIO_PHONE` | Twilio | Yes |
| `SENDGRID_API_KEY` | SendGrid | Yes |
| `USE_TEMPLATE_EXTRACTION` | Receipt OCR | No (default: enabled) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Google Vision | Auto (Firebase ADC) |

All secrets are managed via Firebase Functions environment configuration (`functions.config()`) or `.env` files. The Twilio client uses `dotenv` to load credentials.
