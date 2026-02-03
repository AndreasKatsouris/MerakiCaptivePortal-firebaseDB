# Tier Management Testing Guide

## Overview
This guide will walk you through testing all the enhanced features of the Tier Management section in the Enhanced User Subscription Manager module.

## Prerequisites

1. **Firebase Setup**: Ensure your Firebase project is configured with:
   - Authentication enabled
   - Realtime Database enabled
   - Admin user logged in

2. **Dependencies**: The module requires:
   - Vue.js 2.6+
   - Bootstrap 5.1+
   - Font Awesome 6.0+
   - Chart.js 3.9+

## Step 1: Access the Test Page

1. Open your local server or file in browser: `public/test-tier-management.html`
2. Open browser console (F12) to monitor for errors
3. Ensure you're logged in as an admin user

## Step 2: Navigate to Tier Management

1. Click on the **"Tier Management"** tab
2. You should see:
   - Tier Overview Cards (4 default tiers)
   - Tier Migration Tools
   - Recent Tier Changes table
   - Tier Configuration table
   - Tier Performance Analytics

## Step 3: Test Feature Comparison

### Test the Feature Comparison Matrix:
1. Click **"Show Feature Comparison"** button
2. Verify the comparison table displays:
   - All tiers as columns
   - Monthly prices
   - Location limits
   - Device limits
   - Feature checkmarks/crosses
3. Click **"Hide Feature Comparison"** to collapse

### What to look for:
- ✅ Responsive table layout
- ✅ Color-coded tier headers
- ✅ Proper formatting of limits (Infinity → "Unlimited")
- ✅ Visual checkmarks for features

## Step 4: Test Tier Overview Cards

### Each tier card should display:
1. **User Count**: Current users in that tier
2. **Monthly Price**: Formatted currency
3. **MRR**: Monthly Recurring Revenue calculation
4. **Limits**: Locations and devices per location
5. **"View Users" button**: Click to filter users by tier

### Test actions:
1. Click **"View Users"** on any tier card
2. Verify it switches to Status Management view with tier filter applied
3. Return to Tier Management tab

## Step 5: Test Tier Migration Tools

### Basic Migration:
1. Select a **"From Tier"** (e.g., Basic)
2. Select a **"To Tier"** (e.g., Premium)
3. Note the user count shown in parentheses
4. Click **"Migrate Users"**
5. Review the migration preview showing:
   - Number of users affected
   - Revenue impact calculation
6. Confirm or cancel the migration

### Migration Validation:
- ✅ Cannot select same tier for from/to
- ✅ Shows warning if no users in source tier
- ✅ Calculates revenue impact correctly
- ✅ Updates user counts after migration

## Step 6: Test Tier Configuration

### View Configuration:
1. Review the Tier Configuration table showing:
   - Tier ID (code format)
   - Tier Name
   - Monthly Price
   - Features (as badges)
   - Active/Inactive status
   - Action buttons

### Test Tier Status Toggle:
1. Find a tier with 0 users
2. Click the ban/check icon to toggle status
3. Verify status badge updates
4. Note: Tiers with active users cannot be deactivated

### Edit Tier (for custom tiers):
1. Click edit icon on non-core tiers
2. Note: Core tiers (free, basic, pro, premium) are protected
3. For custom tiers, editing should open modal (if implemented)

## Step 7: Test Performance Analytics

### Revenue Chart:
1. Verify the **"Revenue by Tier"** bar chart displays
2. Check that bars correspond to (price × users)
3. Hover over bars to see exact values

### Retention Chart:
1. Verify the **"30-Day Retention by Tier"** line chart
2. Check retention percentages (50-100% range)
3. Note the upward trend from free to premium

### Migration Patterns:
1. Review the **"Tier Migration Patterns"** table
2. Check for:
   - From → To visual flow
   - Count of migrations
   - Revenue impact (green for positive, red for negative)
   - Common reasons listed

## Step 8: Test Data Scenarios

### Create Test Data:
```javascript
// In browser console, create test migrations
const testMigration = {
  userId: 'test-user-1',
  from: 'basic',
  to: 'premium',
  timestamp: Date.now(),
  adminUser: 'admin@test.com'
};

// This would normally be done through the UI
console.log('Test migration:', testMigration);
```

### Monitor Real-time Updates:
1. Make changes in another tab/window
2. Verify charts and tables update automatically
3. Check that tier counts refresh

## Step 9: Performance Testing

### Load Testing:
1. Monitor page performance with many users
2. Check chart rendering speed
3. Verify smooth scrolling in tables

### Responsive Design:
1. Resize browser window
2. Test on mobile viewport
3. Verify cards stack properly
4. Check table horizontal scroll

## Step 10: Error Handling

### Test Error Scenarios:
1. **No Firebase connection**: Disconnect internet briefly
2. **No admin permissions**: Test with regular user
3. **Invalid data**: Try migrations with no users
4. **Missing tier data**: Check graceful handling

## Expected Behaviors

### ✅ Successful Tests:
- All UI elements render correctly
- Charts display with proper data
- Migrations show preview before execution
- Real-time updates work
- Responsive design adapts to screen size
- Error messages are user-friendly

### ❌ Common Issues:
- **Charts not showing**: Check if Chart.js is loaded
- **No data**: Ensure Firebase has tier and user data
- **Permission denied**: Verify admin authentication
- **Vue errors**: Check console for template syntax issues

## Testing Checklist

- [ ] Feature Comparison Matrix toggle works
- [ ] Tier cards show correct calculations
- [ ] View Users navigation works
- [ ] Migration tool validates selections
- [ ] Migration preview shows revenue impact
- [ ] Tier configuration table loads
- [ ] Status toggle works (for eligible tiers)  
- [ ] Revenue chart displays correctly
- [ ] Retention chart shows data
- [ ] Migration patterns table populates
- [ ] Responsive design works on mobile
- [ ] Error states handled gracefully

## Debugging Tips

1. **Check Console**: Look for any JavaScript errors
2. **Network Tab**: Verify Firebase requests succeed
3. **Vue DevTools**: Install browser extension for Vue debugging
4. **Firebase Console**: Check Realtime Database for data structure

## Sample Test Flow

1. Load test page
2. Navigate to Tier Management
3. Toggle Feature Comparison
4. Click View Users on a tier
5. Return and test migration tool
6. Check analytics charts
7. Review migration patterns
8. Test responsive design
9. Create test migration
10. Verify all data updates

## Next Steps

After testing, you should:
1. Document any issues found
2. Verify all features work as expected
3. Test with different user roles
4. Check performance with large datasets
5. Validate business logic accuracy 