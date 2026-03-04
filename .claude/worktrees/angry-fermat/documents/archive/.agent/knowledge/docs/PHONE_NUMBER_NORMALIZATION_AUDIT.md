# Phone Number Normalization Audit & Update Guide

## Context & Problem Statement

The platform has been updated to use consistent phone number normalization to resolve database inconsistencies. Previously, phone numbers were stored and looked up in different formats across the system:

- WhatsApp format: `whatsapp:+27827001116`
- Database storage: `+27827001116` (with + prefix)
- Database lookups: `27827001116` (without + prefix)

This inconsistency caused:
- Reward processing failures
- User lookup failures  
- Database index mismatches
- Command processing errors

## Solution Implemented

A normalizePhoneNumber() function has been created and implemented in key files:

```javascript
/**
 * Normalize phone number format by removing + prefix and whatsapp: prefix
 * @param {string} phoneNumber - Phone number to normalize  
 * @returns {string} Normalized phone number without + prefix
 */
function normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';
    return phoneNumber.replace(/^(whatsapp:|\+)/, '');
}
```

## Files Already Updated
- functions/receiveWhatsappMessage.js
- functions/menuLogic.js
- functions/guardRail.js
- functions/rewardsProcessor.js

## Systematic Audit Task

**Objective**: Find and update ALL instances of phone number handling throughout the platform to use consistent normalization.

### Phase 1: Discovery

**Search for these patterns across the entire codebase:**

1. Phone number extraction patterns:
   ```bash
   grep -r "From\|phoneNumber\|phone" --include="*.js" .
   grep -r "whatsapp:" --include="*.js" .
   grep -r "\+27\|\.replace.*\+" --include="*.js" .
   ```

2. Database operation patterns:
   ```bash
   grep -r "guests/\|guest-rewards/\|rewards/" --include="*.js" .
   grep -r "phoneNumber\|guestPhone" --include="*.js" .
   ```

3. Function calls that handle phone numbers:
   ```bash
   grep -r "getGuest\|createGuest\|getUserReward\|sendWhatsApp" --include="*.js" .
   ```

### Phase 2: Analysis

**For each file found, check:**

1. **Input Processing**:
   - How does it receive phone numbers?
   - Does it handle `whatsapp:` prefix?
   - Does it handle `+` prefix?

2. **Database Operations**:
   - How are phone numbers used in database paths?
   - Are phone numbers used as keys or values?
   - Are lookups consistent with storage format?

3. **Function Parameters**:
   - Are phone numbers passed between functions consistently?
   - Do function signatures expect normalized or raw phone numbers?

### Phase 3: Standardization

**For each file that needs updating:**

1. **Add the normalization function** (if not already present):
   ```javascript
   function normalizePhoneNumber(phoneNumber) {
       if (!phoneNumber) return '';
       return phoneNumber.replace(/^(whatsapp:|\+)/, '');
   }
   ```

2. **Update phone number extraction**:
   ```javascript
   // OLD:
   const phoneNumber = req.body.From.replace('whatsapp:', '');
   
   // NEW:
   const phoneNumber = normalizePhoneNumber(req.body.From);
   ```

3. **Update database operations**:
   ```javascript
   // OLD:
   const guestRef = ref(`guests/${phoneNumber}`);
   
   // NEW:
   const normalizedPhone = normalizePhoneNumber(phoneNumber);
   const guestRef = ref(`guests/${normalizedPhone}`);
   ```

4. **Update function calls**:
   ```javascript
   // OLD:
   await someFunction(req.body.From);
   
   // NEW:
   await someFunction(normalizePhoneNumber(req.body.From));
   ```

### Phase 4: Priority Files to Check

**High Priority** (likely to have phone number handling):
```
functions/
├── dataManagement.js
├── twilioClient.js
├── voucherService.js
├── utils/whatsappClient.js
├── consent/consentmanagement.js
└── consent/consent-handler.js

public/js/
├── admin/
│   ├── user-management.js
│   └── users-locations-management.js
├── user-dashboard.js
├── user-login.js
├── guest-management.js
└── signup.js
```

**Medium Priority** (might have phone number references):
```
public/js/modules/
├── user-subscription.js
├── receipts/ReceiptManager.js
├── wifi/WifiManager.js
└── analytics/components/
```

### Phase 5: Testing Strategy

**After each update, verify:**

1. **Database Consistency**:
   - All phone numbers stored in same format
   - All lookups use same format
   - Indexes are consistent

2. **Function Integration**:
   - Functions pass phone numbers correctly
   - No breaking changes to existing functionality

3. **End-to-End Flow**:
   - Receipt processing works
   - User commands work
   - Reward system works

### Phase 6: Documentation

**Create documentation for:**

1. **Phone Number Standards**:
   - Always use normalized format internally
   - Document the normalization function
   - Specify when to normalize (at input boundaries)

2. **Developer Guidelines**:
   - How to handle phone numbers in new code
   - Common patterns to follow
   - Testing requirements

## Implementation Checklist

- [ ] **Search Phase**: Identify all files with phone number handling
- [ ] **Analysis Phase**: Categorize findings by risk/impact
- [ ] **Update Phase**: Apply normalization systematically
- [ ] **Testing Phase**: Verify each update works correctly
- [ ] **Integration Phase**: Test full system functionality
- [ ] **Documentation Phase**: Update developer guidelines

## Expected Outcome

After completion:
- All phone numbers handled consistently across the platform
- No more database lookup mismatches
- Reliable reward processing
- Consistent user experience
- Easier maintenance and debugging

## Risk Mitigation

- **Backup database** before major changes
- **Test in staging** environment first
- **Update one component at a time**
- **Monitor logs** for errors after each update
- **Have rollback plan** ready

## Search Commands to Run

```bash
# Find all JavaScript files with phone number handling
find . -name "*.js" -exec grep -l "phoneNumber\|phone\|From\|whatsapp:" {} \;

# Find database path patterns
find . -name "*.js" -exec grep -l "guests/\|guest-rewards/\|rewards/" {} \;

# Find WhatsApp related functions
find . -name "*.js" -exec grep -l "sendWhatsApp\|receiveWhatsApp\|twilio" {} \;
```

## Common Patterns to Update

1. **Request handling**:
   ```javascript
   // OLD
   const from = req.body.From.replace('whatsapp:', '');
   
   // NEW
   const from = normalizePhoneNumber(req.body.From);
   ```

2. **Database operations**:
   ```javascript
   // OLD
   const path = `guests/${phoneNumber}`;
   
   // NEW
   const path = `guests/${normalizePhoneNumber(phoneNumber)}`;
   ```

3. **Function parameters**:
   ```javascript
   // OLD
   function getUserData(phoneNumber) {
       const cleanPhone = phoneNumber.replace(/^\+/, '');
       // ...
   }
   
   // NEW
   function getUserData(phoneNumber) {
       const cleanPhone = normalizePhoneNumber(phoneNumber);
       // ...
   }
   ```

This guide should be used systematically to ensure complete phone number normalization across the entire platform. 