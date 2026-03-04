# Receipt Processing

## Purpose

The Receipt Processing module handles the end-to-end pipeline for restaurant receipt digitization: image upload via WhatsApp, OCR text extraction via Google Cloud Vision, template-based or legacy data parsing, validation, and storage. It is the foundation for the rewards system, as validated receipts trigger reward processing.

## Key Files

| File | Description |
|------|-------------|
| `functions/receiptProcessor.js` | Main OCR pipeline: `processReceipt()`, `processReceiptWithoutSaving()`, legacy extraction functions |
| `functions/templateBasedExtraction.js` | Template-based extraction engine: `extractWithTemplates()`, `applyTemplate()` |
| `functions/receiptTemplateManager.js` | Template CRUD: `loadActiveTemplates()`, `updateTemplateStatistics()`, `logPatternMatch()` |
| `public/receipt-settings.html` | Admin UI for managing receipt templates |
| `public/js/modules/receipt-settings.js` | Frontend receipt settings module |
| `public/js/modules/receipt-template-creator.js` | Template creation/editing UI logic |
| `functions/receiveWhatsappMessage.js` | WhatsApp handler that triggers receipt processing on image messages |

## Data Model (RTDB Paths)

### `receipts/{receiptId}`

Processed receipt records (auto-generated push key):

```json
{
  "imageUrl": "https://storage.googleapis.com/...",
  "guestPhoneNumber": "+27827001116",
  "processedAt": 1721234567890,
  "status": "validated",
  "rawText": "OCEAN BASKET\nWaterfront\n...",
  "extractionMethod": "template",
  "templateId": "-NxYz123",
  "templateName": "Ocean Basket Standard",
  "confidence": 0.92,
  "date": "17/07/2025",
  "time": "14:30",
  "invoiceNumber": "INV-2025-001234",
  "totalAmount": 485.50,
  "subtotal": 421.74,
  "brandName": "Ocean Basket",
  "storeName": "Ocean Basket Waterfront",
  "fullStoreName": "Ocean Basket Waterfront V&A",
  "waiterName": "Sarah",
  "tableNumber": "T12",
  "items": [
    { "name": "Hake & Chips", "quantity": 2, "price": 165.00, "total": 330.00 },
    { "name": "Calamari Strips", "quantity": 1, "price": 91.74, "total": 91.74 }
  ],
  "validatedAt": 1721234567890,
  "campaignId": "summer_special"
}
```

### `receiptTemplates/{templateId}`

Admin-configured extraction templates:

```json
{
  "templateName": "Ocean Basket Standard",
  "brandName": "Ocean Basket",
  "status": "active",
  "priority": 1,
  "createdAt": 1721234567890,
  "createdBy": "admin-uid",
  "patterns": {
    "brandDetection": ["OCEAN BASKET", "Ocean Basket"],
    "datePattern": "\\d{2}/\\d{2}/\\d{4}",
    "timePattern": "\\d{2}:\\d{2}",
    "invoicePattern": "INV[-\\s]?\\d+",
    "totalPattern": "(?:TOTAL|Total|AMOUNT)\\s*[:\\s]*R?\\s*(\\d+[.,]\\d{2})",
    "itemPattern": "(.+?)\\s+(\\d+)\\s+R?\\s*(\\d+[.,]\\d{2})"
  },
  "statistics": {
    "totalAttempts": 150,
    "successCount": 135,
    "averageConfidence": 0.89,
    "lastUsed": 1721234567890
  }
}
```

### `receiptPatternLogs/{logId}`

Extraction attempt logs for template performance monitoring:

```json
{
  "receiptId": "receipt-push-key",
  "templateId": "-NxYz123",
  "templateName": "Ocean Basket Standard",
  "brandName": "Ocean Basket",
  "success": true,
  "confidence": 0.92,
  "extractedFields": { "date": true, "total": true, "items": true },
  "failureReasons": [],
  "processingTimeMs": 340,
  "timestamp": 1721234567890
}
```

### `debug/ocr-logs/{timestamp}`

Raw OCR text logs for debugging:

```json
{
  "timestamp": 1721234567890,
  "phoneNumber": "+27827001116",
  "imageUrl": "https://...",
  "rawOcrText": "OCEAN BASKET\nWATERFRONT...",
  "textLength": 1250
}
```

### `guest-receipts/{phoneNumber}/{receiptId}`

Index for looking up receipts by guest phone number. Value = `true`.

## Processing Pipeline

### Step 1: Image Receipt via WhatsApp

When a guest sends an image via WhatsApp:
1. `receiveWhatsappMessage.js` detects `MediaUrl0` in the Twilio webhook payload
2. Calls `processReceipt(imageUrl, phoneNumber)`

### Step 2: OCR with Google Cloud Vision

`detectReceiptText(imageUrl)` sends the image to Google Cloud Vision API for text detection. Returns `textAnnotations` array.

Validation checks:
- Result exists
- `textAnnotations` is non-empty
- Full text is non-empty

### Step 3: Template-Based Extraction (Primary)

If `USE_TEMPLATE_EXTRACTION` feature flag is enabled (default: `true`):

1. `extractWithTemplates(fullText, brandHint)` loads active templates sorted by priority
2. For each template, `applyTemplate(template, ocrText)` tries to match:
   - Brand detection patterns
   - Date/time extraction via regex
   - Invoice number extraction
   - Total amount extraction
   - Line item parsing
3. Calculates confidence score based on successful field extractions
4. Accepts if confidence >= 0.7 (70%)
5. Logs attempt to `receiptPatternLogs`
6. Updates template statistics

### Step 4: Legacy Extraction (Fallback)

If template extraction fails or is disabled:

1. `extractStoreDetails(fullText)` - identifies brand and location from text
2. `extractItems(fullText)` - parses item lines with name, quantity, price
3. `extractReceiptDetails(fullText)` - extracts date, time, invoice number, total, waiter, table

Legacy extraction throws errors for:
- Unknown brand (brand not in known list)
- Zero items extracted
- Missing or zero total amount

### Step 5: Validation

- **Date validation**: `validateReceiptDate(date)` ensures receipt is from the current month
- **Required fields**: date, invoice number, total amount (items are optional for template extraction)
- **Duplicate detection**: Handled by `checkReceiptFraud()` in rewards processing

### Step 6: Storage

Receipt data is saved to `receipts/{pushKey}` with status `pending_validation`. Status progresses to `validated` when rewards are processed.

## Receipt Settings Admin UI

The admin can:
- Create new extraction templates with regex patterns
- Set template priority (determines try order)
- Activate/deactivate templates
- View template performance statistics (success rate, average confidence)
- Test templates against sample OCR text

## Security Rules

```json
"receipts": {
  ".indexOn": ["phoneNumber", "guestPhoneNumber", "locationId", "status", "processedAt", "createdAt"],
  ".read": "auth != null",
  ".write": "auth != null"
},
"receiptTemplates": {
  ".indexOn": ["brandName", "status", "priority", "createdAt"],
  ".read": "auth != null",
  ".write": "auth != null && auth.token.admin === true",
  "$templateId": {
    ".validate": "newData.hasChildren(['templateName', 'brandName', 'patterns', 'status', 'priority', 'createdAt', 'createdBy'])"
  }
},
"receiptPatternLogs": {
  ".read": "auth != null && auth.token.admin === true",
  ".write": true,
  ".indexOn": ["templateId", "success", "timestamp", "brandName"]
}
```

## Tier Gating

| Feature | Minimum Tier |
|---------|-------------|
| `receiptProcessingManual` | `free` (50 receipts/month) |
| `receiptProcessingAutomated` | `professional` (500 receipts/month) |
| Enterprise | Unlimited receipts |

## Known Gotchas

1. **Template priority ordering**: Templates are tried in ascending priority order. Set lower numbers for more common brands.
2. **Confidence threshold at 0.7**: If no template reaches 70% confidence, the system falls back to legacy extraction. Tune template patterns to improve confidence.
3. **Date validation is current-month only**: Receipts from previous months are rejected. This prevents old receipts from being submitted for rewards.
4. **Debug logging enabled by default**: `debugLogging = true` in `receiptProcessor.js` writes raw OCR text to `debug/ocr-logs/`. Set to `false` in production to reduce database writes.
5. **Items are optional in template extraction**: Template extraction considers items as optional. Only date, invoice number, and total amount are mandatory.
6. **Google Cloud Vision dependency**: The `@google-cloud/vision` package (v4.3.2) requires proper GCP credentials. In Firebase Cloud Functions, these are provided automatically via the service account.
7. **Feature flag**: `USE_TEMPLATE_EXTRACTION` env var can disable template extraction entirely by setting it to `'false'`.
