# Tier Management Testing Guide

## Prerequisites

1. Ensure you have admin access to the dashboard
2. Firebase project should be properly configured
3. All tier management files should be deployed

## Step 1: Access Tier Management

1. **Login as Admin**
   - Navigate to your admin dashboard
   - Use your admin credentials to login

2. **Navigate to Tier Management**
   - In the admin dashboard sidebar, go to **Settings > Tier Management**
   - You should see the tier management interface

## Step 2: Create Test Tiers

### Create a Basic Tier

1. Click **"Add New Tier"**
2. Fill in the following details:
   ```
   Name: Basic
   Description: Essential features for small businesses
   Monthly Price: 29
   Annual Price: 290
   ```

3. **Select Features:**
   - ✓ Basic WiFi Access
   - ✓ WhatsApp Messaging
   - ✓ Basic Analytics
   - ✓ Guest Data Collection

4. **Set Limits:**
   - Monthly Users: 100
   - Locations: 1
   - Campaigns Per Month: 5

5. Click **"Add Tier"**

### Create a Professional Tier

1. Click **"Add New Tier"** again
2. Fill in:
   ```
   Name: Professional
   Description: Advanced features for growing businesses
   Monthly Price: 99
   Annual Price: 990
   ```

3. **Select Features:**
   - ✓ All Basic tier features
   - ✓ Advanced WiFi Features
   - ✓ WhatsApp Bot
   - ✓ Advanced Analytics
   - ✓ Campaign Management
   - ✓ Basic Rewards

4. **Set Limits:**
   - Monthly Users: 1000
   - Locations: 3
   - Campaigns Per Month: 20

5. Click **"Add Tier"**

### Create an Enterprise Tier

1. Click **"Add New Tier"**
2. Fill in:
   ```
   Name: Enterprise
   Description: Complete platform access for large businesses
   Monthly Price: 299
   Annual Price: 2990
   ```

3. **Select Features:**
   - ✓ Select all available features
   - Use the category filters to ensure you've selected everything

4. **Set Limits:**
   - Monthly Users: Infinity (type "Infinity")
   - Locations: Infinity
   - Campaigns Per Month: Infinity

5. Click **"Add Tier"**

## Step 3: Test Feature Dependencies

1. **Edit the Professional Tier**
   - Click the Edit button on the Professional tier
   - Try to uncheck "Basic Analytics"
   - You should see a toast message preventing this because "Advanced Analytics" depends on it

2. **Test Category Filtering**
   - In the edit modal, click on different category buttons
   - Verify that features filter correctly by category
   - Use the search box to find specific features

## Step 4: Create Test Users with Different Subscriptions

### Option A: Direct Database Update (Quick Testing)

1. Open Firebase Console
2. Go to Realtime Database
3. Add test subscriptions:

```json
{
  "subscriptions": {
    "testuser1": {
      "tierId": "basic",
      "status": "active",
      "startDate": "2024-01-01",
      "billingCycle": "monthly"
    },
    "testuser2": {
      "tierId": "professional",
      "status": "active",
      "startDate": "2024-01-01",
      "billingCycle": "monthly"
    },
    "testuser3": {
      "tierId": "enterprise",
      "status": "active",
      "startDate": "2024-01-01",
      "billingCycle": "monthly"
    }
  }
}
```

### Option B: Use the Enhanced User Subscription Manager

1. Navigate to **Users > Subscription Management**
2. Find or create test users
3. Assign different tiers to each user

## Step 5: Test Feature Access Control

### Test in Browser Console

1. Open the browser developer console (F12)
2. Import and test the feature access control:

```javascript
// Test feature access for current user
import('./js/modules/access-control/services/feature-access-control.js').then(module => {
  const featureAccessControl = module.default;
  
  // Check specific feature
  featureAccessControl.checkFeatureAccess('analyticsAdvanced').then(result => {
    console.log('Advanced Analytics Access:', result);
  });
  
  // Get all available features
  featureAccessControl.getAvailableFeatures().then(features => {
    console.log('Available Features:', features);
  });
  
  // Test upgrade options
  featureAccessControl.getUpgradeOptionsForFeature('analyticsRealtime').then(options => {
    console.log('Upgrade Options:', options);
  });
});
```

### Test UI Components

1. **Test Feature Guard**
   - Navigate to a section that uses feature guards
   - Login with different test users
   - Verify that content shows/hides based on tier

2. **Test Feature Buttons**
   - Find buttons that use the FeatureButton component
   - Click on them with different user tiers
   - Verify upgrade prompts appear for locked features

## Step 6: Test the Analytics Example

1. **Create a test page** with the analytics example:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Analytics Test</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
</head>
<body>
    <div id="app" class="container mt-5">
        <analytics-dashboard></analytics-dashboard>
    </div>
    
    <script type="module">
        import AnalyticsDashboard from './js/modules/access-control/examples/analytics-with-feature-guard.js';
        
        const { createApp } = Vue;
        
        createApp({
            components: {
                AnalyticsDashboard
            }
        }).mount('#app');
    </script>
</body>
</html>
```

2. **Test with different users:**
   - Login as a Basic tier user: Should only see basic metrics
   - Login as a Professional tier user: Should see basic + advanced metrics
   - Login as an Enterprise tier user: Should see everything including real-time

## Step 7: Test Upgrade Flows

1. **Test Access Denied Messages**
   - Login as a Basic tier user
   - Try to access advanced features
   - Verify the upgrade prompt shows correct tier options

2. **Test Upgrade Button**
   - Click "Upgrade to Access" in the prompt
   - Verify it suggests the correct tiers that include the feature
   - Check that pricing is displayed correctly

## Step 8: Performance Testing

1. **Test Caching**
   ```javascript
   // In console, check cache behavior
   const start = Date.now();
   featureAccessControl.getCurrentUserSubscription().then(() => {
     console.log('First call:', Date.now() - start, 'ms');
     
     // Second call should be faster (cached)
     const start2 = Date.now();
     featureAccessControl.getCurrentUserSubscription().then(() => {
       console.log('Cached call:', Date.now() - start2, 'ms');
     });
   });
   ```

2. **Test Cache Expiration**
   - Wait 5 minutes or call `featureAccessControl.clearCache()`
   - Verify data is fetched fresh

## Step 9: Edge Cases to Test

1. **No Subscription**
   - Create a user without any subscription
   - Verify all features show as locked
   - Check that upgrade prompts work

2. **Invalid Tier**
   - Manually set a user's tierId to something that doesn't exist
   - Verify the system handles this gracefully

3. **Feature Not in Any Tier**
   - Try to access a feature that isn't assigned to any tier
   - Verify appropriate error handling

## Step 10: Integration Testing Checklist

- [ ] Tier CRUD operations work correctly
- [ ] Features can be assigned/unassigned from tiers
- [ ] Feature dependencies prevent invalid configurations
- [ ] Users see only features from their tier
- [ ] Upgrade prompts show correct tier options
- [ ] Feature guards hide/show content appropriately
- [ ] Feature buttons disable/enable based on access
- [ ] Caching improves performance
- [ ] Error states are handled gracefully
- [ ] UI is responsive and user-friendly

## Debugging Tips

### Check Firebase Rules

Ensure your database rules allow reading tiers and subscriptions:
```json
{
  "rules": {
    "tiers": {
      ".read": "auth != null",
      ".write": "auth != null && auth.token.admin === true"
    },
    "subscriptions": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
        ".write": "auth != null && auth.token.admin === true"
      }
    }
  }
}
```

### Common Issues

1. **"No features defined"**
   - Check that platform-features.js is loaded
   - Verify the import path is correct

2. **Features not saving**
   - Check browser console for errors
   - Verify Firebase write permissions
   - Ensure tier ID format is correct

3. **Access always denied**
   - Check user authentication status
   - Verify subscription data exists
   - Check tier assignment is correct

### Monitoring

Watch the browser console for helpful debug messages:
- `[TierManagement]` - Tier management operations
- `[FeatureAccess]` - Feature access checks
- `[FeatureGuard]` - Component lifecycle events

## Next Steps

After testing:
1. Document any issues found
2. Adjust tier configurations based on testing
3. Plan rollout to production users
4. Set up monitoring for feature usage
5. Create user documentation for the upgrade process
