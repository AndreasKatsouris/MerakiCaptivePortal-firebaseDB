# WhatsApp Integration

## Purpose

WhatsApp is the primary guest interaction channel for Sparks Hospitality. The integration handles incoming messages via Twilio webhooks, manages a conversational bot flow (name collection, consent, receipt processing, rewards, queue management), sends notifications, and supports multi-location WhatsApp number management with tier-based limits.

## Key Files

| File | Description |
|------|-------------|
| `functions/receiveWhatsappMessage.js` | Main webhook handler for incoming WhatsApp messages |
| `functions/receiveWhatsappMessageEnhanced.js` | Enhanced version with additional features |
| `functions/twilioClient.js` | Twilio client initialization and phone number config |
| `functions/utils/whatsappClient.js` | `sendWhatsAppMessage()`, `sendWelcomeMessageTemplate()`, `sendReceiptConfirmationTemplate()` |
| `functions/menuLogic.js` | `processMessage()` - conversational menu routing |
| `functions/consent/consent-handler.js` | `checkConsent()`, `handleConsentFlow()`, `isConsentMessage()`, `requiresConsent()` |
| `functions/whatsappManagement.js` | WhatsApp number CRUD, location assignment, tier validation |
| `functions/utils/whatsappDatabaseSchema.js` | Database schema helpers for WhatsApp data structures |
| `functions/queueWhatsAppIntegration.js` | WhatsApp queue self-service flow |
| `public/js/modules/whatsapp-message-history.js` | Frontend message history viewer |

## Data Model (RTDB Paths)

### `whatsapp-numbers/{whatsappNumberId}`

Registered WhatsApp business numbers:

```json
{
  "phoneNumber": "+27123456789",
  "displayName": "Ocean Basket Main Line",
  "userId": "admin-uid",
  "status": "active",
  "createdAt": 1721234567890,
  "metadata": {
    "provider": "twilio",
    "twilioSid": "PNXXXXXXXXX"
  }
}
```

### `location-whatsapp-mapping/{locationId}`

Maps locations to their WhatsApp numbers:

```json
{
  "locationId": "ocean_basket_waterfront",
  "whatsappNumberId": "-NxYz789",
  "phoneNumber": "+27123456789",
  "userId": "admin-uid",
  "assignedAt": 1721234567890
}
```

### `whatsapp-message-history/{messageId}`

Message log for all WhatsApp interactions:

```json
{
  "locationId": "ocean_basket_waterfront",
  "messageType": "receipt_submission",
  "direction": "inbound",
  "timestamp": 1721234567890,
  "phoneNumber": "+27827001116",
  "body": "Here is my receipt",
  "mediaUrl": "https://...",
  "status": "processed"
}
```

### `whatsapp-tier-limits`

Tier-based limits for WhatsApp features (admin-configurable).

### `queue-states/{phoneNumber}`

Queue conversation state (see [QUEUE_MANAGEMENT.md](QUEUE_MANAGEMENT.md)).

## Incoming Message Flow

### `receiveWhatsAppMessage(req, res)`

Entry point for Twilio webhook (`POST`):

1. **Validate request**: Checks for POST method, required fields (`Body`, `From`)
2. **Normalize phone number**: Strips `whatsapp:` prefix, ensures `+27` format
3. **Get or create guest**: Loads from `guests/{phoneNumber}`, creates if new
4. **Name collection**: If guest has no name (new guest), enters name collection flow
5. **Consent check**: If guest lacks consent, triggers consent flow
6. **Consent response handling**: Detects yes/no responses for consent prompts
7. **Message type routing**: Routes to appropriate handler

### Name Collection Flow

If `guestData.name` is missing, `'N/A'`, or empty:
- Bot asks "What is your name?"
- Guest replies with name
- Name is saved to `guests/{phoneNumber}/name`
- Welcome message template is sent

### Consent Flow

Module: `functions/consent/consent-handler.js`

- `checkConsent(guestData)` - returns `{ hasConsent: boolean }`
- `handleConsentFlow(guestData, message)` - manages consent prompt/response
- `isConsentMessage(body)` - detects if message is a consent response
- `requiresConsent(guestData)` - checks if consent is needed

Consent states:
- `consentPending: true` on guest record during flow
- `consent: true` when accepted
- Rejection triggers opt-out messaging

Accepted responses: `yes`, `y`, `agree`, `accept`, `ok`, `okay` (case-insensitive)

### Message Type Routing

After name and consent are established:

1. **Image with MediaUrl0**: Triggers receipt processing pipeline
2. **Text "menu"/"help"**: Shows interactive menu via `processMessage()`
3. **Text "queue"/"join"**: Enters queue management flow
4. **Text "status"/"position"**: Queue position lookup
5. **Text "rewards"/"voucher"**: Reward/voucher status check
6. **Voucher code**: Triggers redemption via `markVoucherAsRedeemed()`
7. **Default**: Processed by `menuLogic.js` conversational handler

## WhatsApp Number Management

### Cloud Functions (whatsappManagement.js)

| Function | Purpose |
|----------|---------|
| `initializeWhatsAppSchemaFunction` | Initialize DB schema (admin only) |
| `createWhatsAppNumberFunction` | Register new WhatsApp number with tier validation |
| `assignWhatsAppToLocationFunction` | [TODO: verify] Link number to location |
| `getUserWhatsAppNumbers(userId)` | Get all numbers for a user |
| `getUserLocationMappings(userId)` | Get location-to-number mappings |

All management functions require authentication and admin access (checked via custom claims and `admin-claims` node).

### Tier Validation

`validateWhatsAppAssignment(userId, locationId)` checks:
- User subscription tier
- Number of WhatsApp numbers allowed per tier
- Location assignment limits

Returns `{ isValid, message, reason, upgradeRequired, recommendedTier }`.

## Outbound Messaging

### `sendWhatsAppMessage(phoneNumber, message)`

Sends a free-form text message via Twilio. Used for:
- Queue position updates
- Reward notifications
- Consent prompts
- General responses

### `sendWelcomeMessageTemplate(phoneNumber, guestName)`

Sends the approved welcome message template to new guests. Twilio requires pre-approved templates for the first message to a user (within 24-hour window rules).

### `sendReceiptConfirmationTemplate(phoneNumber, receiptData)`

Sends receipt confirmation with extracted details (brand, total, date).

## Tier Gating

| Feature | Minimum Tier |
|---------|-------------|
| `whatsappBasic` | `starter` |
| `whatsappAdvanced` | `professional` |

WhatsApp tier limits from `WHATSAPP_TIER_LIMITS`:

| Resource | Free | Starter | Professional | Enterprise |
|----------|------|---------|-------------|-----------|
| WhatsApp numbers | 0 | 1 | 3 | Unlimited |
| Messages/month | 0 | 500 | 2000 | Unlimited |

[TODO: verify exact tier limit values from `whatsappDatabaseSchema.js`]

## Security Rules

```json
"whatsapp-numbers": {
  ".read": "auth != null",
  ".write": "auth != null",
  ".indexOn": ["userId", "status", "createdAt"],
  "$whatsappNumberId": {
    ".read": "auth != null && (admin || owner)",
    ".write": "auth != null && (admin || owner || new record)",
    ".validate": "newData.hasChildren(['phoneNumber', 'displayName', 'userId', 'status', 'createdAt'])"
  }
},
"location-whatsapp-mapping": {
  ".read": "auth != null",
  ".write": "auth != null",
  "$locationId": {
    ".read": "auth != null && (admin || owner)",
    ".write": "auth != null && (admin || owner || new record)",
    ".validate": "newData.hasChildren(['locationId', 'whatsappNumberId', 'phoneNumber', 'userId', 'assignedAt'])"
  }
},
"whatsapp-message-history": {
  ".read": "auth != null",
  ".write": "auth != null",
  ".indexOn": ["locationId", "messageType", "timestamp", "phoneNumber"]
}
```

## Known Gotchas

1. **Twilio 24-hour window**: After a user messages you, you have 24 hours to respond with free-form messages. After that, only pre-approved templates can be sent.
2. **Phone normalization consistency**: The webhook handler has its own `normalizePhoneNumber()` implementation. Ensure it matches the canonical version in `functions/dataManagement.js`.
3. **Consent flow blocks all other interactions**: If `consentPending` is true, the bot only processes consent responses. All other messages are ignored until consent is resolved.
4. **Guest creation from WhatsApp**: New guests created via WhatsApp initially have `name: 'N/A'` until name collection completes. The `(Name Pending)` display in guest management reflects this.
5. **Environment variables required**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and the WhatsApp number must be configured in `.env` or Firebase Functions config.
6. **Webhook URL**: The Twilio webhook URL must point to the deployed `receiveWhatsAppMessage` Cloud Function endpoint.
