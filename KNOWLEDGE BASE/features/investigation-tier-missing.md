# Investigation: Why `tierId` Field is Missing from Subscription Data

## Critical Symptom
When Enterprise user logs in:
```
Raw subscription data: {features: {…}, history: {…}, lastUpdated: 1764345805397, limits: {…}, metadata: {…}, …}
Resolved tier ID: free  ← Should be "enterprise"
```

The subscription object **does NOT contain `tierId` or `tier` field** at all, causing tier to default to `'free'`.

## What SHOULD Happen

### Database Creation (functions/index.js:343-355)
Subscriptions are created with this structure:
```javascript
{
    userId: userId,
    tierId: selectedTier,              // ← SHOULD EXIST
    status: 'trial',
    startDate: TIMESTAMP,
    trialEndDate: ...,
    features: tierData.features,       // ← Embedded from tier definition
    limits: tierData.limits,           // ← Embedded from tier definition
    metadata: {
        signupSource: 'web',
        initialTier: selectedTier
    }
}
```

### What the Console Shows
User's subscription object actually has:
```javascript
{
    features: {...},                   // ← Present (from tier at creation)
    history: {...},                    // ← Present
    lastUpdated: 1764345805397,        // ← Present
    limits: {...},                     // ← Present (from tier at creation)
    metadata: {...},                   // ← Present
    // ❌ MISSING: tierId
    // ❌ MISSING: tier
    // ❌ MISSING: userId (not visible in log)
    // ❌ MISSING: status (not visible in log)
}
```

## Possible Root Causes

### Hypothesis 1: Data Transformation by subscription-tier-fix.js
**File:** `public/js/utils/subscription-tier-fix.js` line 250-265

The `fixUserSubscriptionData()` function processes subscriptions:
```javascript
if (!subscription.tier) {
    if (subscription.tierId) {
        updates[`subscriptions/${userId}/tier`] = subscription.tierId;
        updates[`subscriptions/${userId}/tierId`] = null;  // ← REMOVES tierId!
        needsUpdate = true;
    }
}
```

**Problem:** This code might be:
1. Reading a subscription that HAS `tierId`
2. Converting it to `tier`
3. Setting `tierId` to `null`
4. When this gets re-fetched, tierId is gone

**Evidence:** Lines 252 show setting `tierId = null` explicitly

### Hypothesis 2: Cloud Function Converting tierId → tier
**Possibility:** A Cloud Function might be intercepting subscription updates and converting all `tierId` fields to `tier` fields before saving.

### Hypothesis 3: Database Rules Stripping Field
**Possibility:** Firebase rules might be preventing certain fields from being written or read.

Looking at `database.rules.json`:
```json
"subscriptions": {
  ".indexOn": ["userId", "tier", "status", "expirationDate"],
  "$uid": {
    ".read": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
    ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
  }
}
```

The index includes `"tier"` not `"tierId"` - suggesting the schema expects `tier`, not `tierId`!

### Hypothesis 4: Multiple Schema Versions in Use
**Most Likely:** The codebase has multiple incompatible schema versions:
- **Old code writes:** `{tierId: "enterprise", status: "trial", features: {...}, limits: {...}}`
- **Old code expects:** `subscription.tier` (line 103 of feature-access-control.js before my fix)
- **New code writes:** Different structure entirely
- **Database indexes:** Expect `tier` field

## Key Evidence

1. **database.rules.json index** uses `"tier"` not `"tierId"` (line 25)
2. **functions/index.js** creates with `tierId` field (line 345)
3. **feature-access-control.js** expects `subscription.tier` (original code line 103)
4. **Console logs** show subscription has `features`, `limits`, `metadata` but NO `tierId`
5. **subscription-tier-fix.js** explicitly sets `tierId = null` under certain conditions

## The Data Inconsistency Problem

There's a **fundamental mismatch** between what different parts of the system expect:

| Component | Expects | Source |
|-----------|---------|--------|
| functions/index.js | `tierId` | Creates subscriptions with `tierId` |
| database.rules.json | `tier` | Indexes use `tier` |
| feature-access-control.js (old) | `tier` | Line 103 reads `subscription.tier` |
| subscription-tier-fix.js | `tierId` OR `tier` | Converts between them |
| Console logs | Neither visible | Subscription missing both fields |

## Questions to Answer Before Fix

1. **What field name is actually in the database?** Check Firebase console for a sample subscription
2. **Is there a migration script that converted tierId → tier?** Check if database was migrated
3. **Does subscription-tier-fix trigger on user login?** Line 30 of user-dashboard.js calls `runCompleteDatabaseFix()`
4. **What does runCompleteDatabaseFix actually do?** It might be stripping tierId!

## Recommended Investigation Steps

1. **Check Firebase Database Console:**
   - Look at `subscriptions/uE2zjwuqMvN081HIfTKr7h2uD872` directly
   - Is there a `tierId` field? Or `tier` field?
   - What are ALL the fields present?

2. **Add More Logging:**
   - Log entire subscription object (not just summary)
   - Log what `runCompleteDatabaseFix()` is doing on line 30
   - Check if `fixUserSubscriptionData()` is modifying the data

3. **Check Existing Data:**
   - Is this user's subscription an OLD subscription created before schema changed?
   - Does the data need migration/repair?

## Next Steps (DO NOT IMPLEMENT YET)

Once we confirm which field is actually in the database, we can:
1. Fix the read logic to use the correct field
2. Ensure all writes use the same field name
3. Run a data migration if needed
4. Update all code to use consistent field naming

## Critical Files to Review

- `functions/index.js` - Creates subscriptions (line 343-355)
- `database.rules.json` - Schema/indexes (line 25)
- `public/js/utils/subscription-tier-fix.js` - Modifies subscriptions (line 250-265)
- `public/js/modules/access-control/services/feature-access-control.js` - Reads subscriptions (line 103)
- Firebase Console - Actual data in database
