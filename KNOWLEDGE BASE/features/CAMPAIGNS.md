# Campaign Management

## Purpose

The Campaign Management module enables restaurant owners to create and manage marketing campaigns that tie into the receipt-to-rewards pipeline. Campaigns define which receipts qualify for rewards, what reward types are offered, and targeting criteria. The module supports WhatsApp-based campaigns (via Twilio) and email campaigns (via SendGrid).

## Key Files

| File | Description |
|------|-------------|
| `public/campaigns.html` | Vue 3 campaign management UI with tier gating |
| `functions/guardRail.js` | `matchReceiptToCampaign()` - campaign-receipt matching logic |
| `functions/rewardsProcessor.js` | `processReward()` - triggered when receipt matches a campaign |
| `functions/sendgridClient.js` | SendGrid integration for email campaign contacts |
| `functions/receiveWhatsappMessage.js` | WhatsApp message handler that checks campaigns for receipt matching |
| `public/js/modules/access-control/services/access-control-service.js` | Campaign feature tier definitions |

## Data Model (RTDB Paths)

### `campaigns/{campaignId}`

Campaign configuration:

```json
{
  "name": "Summer Special 2025",
  "status": "active",
  "brandName": "Ocean Basket",
  "description": "Earn rewards on all Ocean Basket receipts this summer",
  "startDate": "2025-12-01",
  "endDate": "2026-02-28",
  "criteria": {
    "minimumSpend": 100,
    "validLocations": ["ocean_basket_waterfront", "ocean_basket_canal_walk"],
    "validDays": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
  },
  "rewardTypes": [
    {
      "typeId": "discount_10_percent",
      "name": "10% Off Next Visit",
      "description": "Get 10% off your next meal",
      "value": 10,
      "type": "percentage_discount"
    }
  ],
  "createdAt": 1721234567890,
  "updatedAt": 1721234567890,
  "createdBy": "admin-uid"
}
```

### `rewardTypes/{typeId}`

Reusable reward type definitions:

```json
{
  "name": "10% Discount Voucher",
  "category": "discount",
  "status": "active",
  "value": 10,
  "type": "percentage_discount"
}
```

### `campaign-rewards/{campaignId}/{rewardId}`

Index linking campaigns to generated rewards.

## Main Features

### 1. Campaign Creation

The `campaigns.html` Vue 3 app provides:
- Campaign name, description, and date range
- Brand selection (matches receipt brand detection)
- Minimum spend threshold
- Location filtering
- Day-of-week restrictions
- Reward type selection/creation

### 2. Campaign-Receipt Matching

`matchReceiptToCampaign(receiptData)` in `guardRail.js`:

1. Loads active campaigns from `campaigns` node
2. Matches on:
   - Brand name (receipt brand vs campaign brand)
   - Date range (receipt date within campaign period)
   - Minimum spend (receipt total >= threshold)
   - Location (if specified)
3. Returns the best matching campaign or null

### 3. WhatsApp Campaign Flow

When a guest sends a receipt image via WhatsApp:
1. Receipt is processed via OCR
2. `matchReceiptToCampaign()` finds matching campaign
3. `processReward()` creates rewards for the guest
4. Voucher code is sent back via WhatsApp message

### 4. Email Campaigns via SendGrid

`sendgridClient.js` provides:
- `addContact(contactData)` - adds/updates contacts in SendGrid Marketing Campaigns
- Syncs guest email, name, phone to SendGrid contact lists
- Uses SendGrid Marketing Campaigns API v3

Contact data mapping:
```javascript
{
  email: contactData.email,
  first_name: contactData.firstName,
  last_name: contactData.lastName,
  phone_number: contactData.phoneNumber,
  custom_fields: contactData.customFields
}
```

### 5. Tier-Gated Access

The campaign page checks tier access before rendering:

```javascript
// Feature access check in campaigns.html
<div v-if="!hasAccess" class="position-relative">
  <div class="locked-overlay">
    <i class="fas fa-lock fa-3x mb-3"></i>
    <h3>Campaigns Locked</h3>
    <p>Upgrade your subscription to create campaigns</p>
  </div>
</div>
```

Blurred content with lock overlay is shown for unauthorized tiers.

## Tier Gating

| Feature | Minimum Tier |
|---------|-------------|
| `campaignsBasic` | `starter` |
| `campaignsAdvanced` | `professional` |
| `campaignsCustom` | `enterprise` |

Resource limits:

| Limit | Free | Starter | Professional | Enterprise |
|-------|------|---------|-------------|-----------|
| Campaign templates | 0 | 5 | 20 | Unlimited |

## Security Rules

```json
"campaigns": {
  ".indexOn": ["status", "brandName"],
  ".read": "auth != null && (auth.token.admin === true || root.child('admin-claims').child(auth.uid).exists())",
  ".write": "auth != null && (auth.token.admin === true || root.child('admin-claims').child(auth.uid).exists())",
  "$campaignId": {
    ".validate": "newData.hasChildren(['name', 'status'])"
  }
},
"rewardTypes": {
  ".indexOn": ["status", "category"],
  ".read": "auth != null",
  ".write": "auth != null && auth.token.admin === true"
}
```

## Known Gotchas

1. **Admin-claims check**: Campaign access requires either `auth.token.admin === true` OR existence in `admin-claims/{uid}`. Regular users cannot access campaigns even on paid tiers without admin claims.
2. **Brand matching is string-based**: Receipt brand names must match campaign brand names exactly (case-sensitive). Template extraction should normalize brand names.
3. **SendGrid API key required**: The `SENDGRID_API_KEY` must be set via environment variable or Firebase Functions config. Without it, email campaigns silently fail with a console warning.
4. **No campaign analytics dashboard yet**: Campaign performance (receipts matched, rewards generated, redemption rates) must be calculated by querying related nodes. [TODO: verify if analytics view exists]
5. **Campaign status values**: `active`, `paused`, `ended`. Only `active` campaigns are matched against receipts.
