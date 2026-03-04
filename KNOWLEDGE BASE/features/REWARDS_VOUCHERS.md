# Rewards and Vouchers

## Purpose

The Rewards and Vouchers system processes rewards when a guest's receipt is validated against a campaign. It manages voucher pools (pre-uploaded real voucher codes), assigns vouchers to rewards, tracks redemption, detects receipt fraud, and handles the full lifecycle from reward creation to redemption.

## Key Files

| File | Description |
|------|-------------|
| `functions/rewardsProcessor.js` | `processReward()` - main reward processing pipeline |
| `functions/voucherService.js` | Voucher pool management: `assignVoucherFromPool()`, `checkReceiptFraud()`, `markVoucherAsRedeemed()` |
| `functions/guardRail.js` | Campaign-receipt matching logic |
| `functions/receiveWhatsappMessage.js` | WhatsApp handler that triggers reward delivery |
| `functions/utils/timezoneUtils.js` | `formatToSASTDateTime()` for South African time zone formatting |

## Data Model (RTDB Paths)

### `rewards/{rewardId}`

Individual reward records:

```json
{
  "id": "-NxYz456def",
  "typeId": "discount_10_percent",
  "guestPhone": "+27827001116",
  "guestName": "John Doe",
  "campaignId": "summer_special",
  "receiptId": "-NxYz123abc",
  "value": 10,
  "type": "percentage_discount",
  "status": "available",
  "voucherCode": "OB-SUMMER-A1B2C3",
  "voucherAssigned": true,
  "voucherAssignedAt": 1721234567890,
  "createdAt": 1721234567890,
  "metadata": {},
  "expiresAt": 1723826567890
}
```

Status values:
- `available` - Voucher ready to use
- `pending` - Waiting for voucher replenishment (pool depleted)
- `redeemed` - Voucher used by guest
- `expired` - Past expiration date

### `guest-rewards/{phoneNumber}/{rewardId}`

Index node for looking up a guest's rewards. Value = `true`.

### `campaign-rewards/{campaignId}/{rewardId}`

Index linking campaigns to their generated rewards. Value = `true`.

### `voucherPools/{rewardTypeId}`

Pre-uploaded voucher pools:

```json
{
  "name": "Ocean Basket Summer Vouchers",
  "rewardTypeId": "discount_10_percent",
  "statistics": {
    "total": 100,
    "available": 45,
    "assigned": 50,
    "redeemed": 40,
    "expired": 5
  },
  "vouchers": {
    "OB-SUMMER-A1B2C3": {
      "status": "assigned",
      "expiryDate": 1723826567890,
      "assignedAt": 1721234567890,
      "assignedToReward": "-NxYz456def",
      "assignedToGuest": "+27827001116",
      "assignedToGuestName": "John Doe",
      "rewardId": "-NxYz456def"
    },
    "OB-SUMMER-D4E5F6": {
      "status": "available",
      "expiryDate": 1723826567890
    }
  }
}
```

Voucher status values: `available`, `assigned`, `redeemed`, `expired`

## Reward Processing Pipeline

### `processReward(guest, campaign, receiptData)`

1. **Input validation**: `validateInputs()` checks guest, campaign, and receipt data
2. **Fraud detection**: `checkReceiptFraud()` checks for duplicate receipt submission
3. **Receipt status update**: Updates receipt status to `validated`
4. **Already-processed check**: If receipt already validated, returns existing rewards
5. **Eligible rewards**: `processRewardTypes()` determines which reward types the guest qualifies for
6. **For each eligible reward**:
   a. Creates reward record with `push()` key
   b. Attempts voucher assignment from pool (`assignVoucherFromPool()`)
   c. If pool has voucher: assigns real code, status = `available`
   d. If pool depleted: no code, status = `pending`, `poolDepleted = true`
   e. If no pool exists: generates fallback random code, `usesRandomCode = true`
   f. Saves reward to `rewards/{rewardId}`
   g. Creates `guest-rewards/{phone}/{rewardId}` index

### Voucher Assignment

`assignVoucherFromPool(rewardTypeId, rewardData)`:

1. Loads pool from `voucherPools/{rewardTypeId}`
2. Iterates vouchers looking for `status === 'available'` AND `expiryDate > now`
3. Marks first available voucher as `assigned` with tracking metadata
4. Updates pool statistics
5. If pool depleted, calls `checkAndPauseCampaign()` to auto-pause

### Fraud Detection

`checkReceiptFraud(receiptData)`:

Checks `receipts` collection for duplicate receipt numbers and dates. Blocks reward processing if a match is found, returning `isFraud: true` with the original submission date.

### Voucher Redemption

`markVoucherAsRedeemed(voucherCode)`:

Updates voucher status to `redeemed` with timestamp. Called from the WhatsApp handler when a guest provides a voucher code.

### Pool Statistics

`updatePoolStatistics(rewardTypeId)`:

Recalculates counts across all voucher statuses (total, available, assigned, redeemed, expired) and writes to `voucherPools/{rewardTypeId}/statistics`.

### Pool Availability Check

`getPoolAvailability(rewardTypeId)`:

Returns `{ hasPool, availableCount, totalCount }` for a reward type.

## Guest-Rewards Index Structure

The `guest-rewards/{phoneNumber}` path must be an object (not a scalar). The rewards processor includes a safety check:

```javascript
if (parentSnapshot.exists() && typeof parentSnapshot.val() !== 'object') {
    // Clear parent path to allow object structure
    await set(parentRef, null);
}
```

This handles cases where the path was accidentally set to a non-object value.

## Fallback Code Generation

When no voucher pool exists:

`generateFallbackCode()` creates a random alphanumeric code. These are marked with `usesRandomCode: true` and are not tracked in any pool.

## Security Rules

```json
"rewards": {
  ".read": "auth != null",
  ".write": "auth != null",
  ".indexOn": ["status", "guestPhone", "campaignId"],
  "$rewardId": {
    ".write": "auth != null && (admin || new record || (guest phone matches && status != approved))",
    ".validate": "newData.hasChildren(['metadata', 'status', 'value', 'expiresAt'])"
  }
},
"guest-rewards": {
  "$phoneNumber": {
    ".indexOn": ["typeId"],
    ".read": "auth != null && (phone matches || admin)",
    ".write": "auth != null && (admin || phone matches)"
  }
}
```

## Known Gotchas

1. **Phone normalization in indexes**: The `guest-rewards` index uses the normalized phone number (with `+` prefix) as the key. The `normalizePhoneNumber()` function in `rewardsProcessor.js` handles this.
2. **Pool depletion auto-pause**: When a voucher pool is depleted, `checkAndPauseCampaign()` may auto-pause the associated campaign. Monitor campaign status after high-volume periods.
3. **Expiry date is timestamp, not date string**: Voucher `expiryDate` is a Unix timestamp in milliseconds, compared with `Date.now()`.
4. **Cascade name updates**: If a guest's name changes, `cascadeGuestNameUpdate()` in `guest-management.js` updates `guestName` across all reward records matching the phone number.
5. **Receipt validation is idempotent**: If a receipt is already `validated`, `processReward()` returns existing rewards rather than creating duplicates.
6. **SA timezone formatting**: Reward dates displayed to guests use `formatToSASTDateTime()` for SAST (UTC+2) formatting.
