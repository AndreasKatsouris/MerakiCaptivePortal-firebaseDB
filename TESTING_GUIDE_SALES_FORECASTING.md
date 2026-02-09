# Sales Forecasting - Testing Guide

## Quick Start Testing

### 1. Access the Feature
```
URL: https://your-domain.com/sales-forecasting.html
Local: http://localhost:5000/sales-forecasting.html
```

### 2. Prerequisites
- User must be authenticated
- User must have at least one location configured
- User subscription tier must have access to "salesForecasting" feature

### 3. Sample Data
Use the provided sample CSV file:
```
File: public/sample-data/sales-forecasting-sample.csv
Rows: 38 days of historical sales data
Format: date, revenue, transaction_qty, avg_spend
```

---

## Test Scenarios

### Scenario 1: First-Time User Flow
**Steps:**
1. Navigate to `/sales-forecasting.html`
2. Verify authentication redirect if not logged in
3. After login, check location selector appears
4. Select a location from dropdown
5. Upload sample CSV file via drag-and-drop or browse
6. Verify data appears in saved data list
7. Switch to "Forecast" tab
8. Generate forecast with default settings
9. Verify chart renders correctly
10. Save the forecast

**Expected Results:**
- Smooth authentication flow
- Clear location selection
- Upload succeeds with success toast
- Chart displays historical + forecast data
- Forecast saved with confirmation

---

### Scenario 2: Access Control Testing

#### Test A: User Without Access
**Steps:**
1. Login as user with Bronze tier (no forecasting access)
2. Navigate to `/sales-forecasting.html`
3. Observe behavior

**Expected:**
- Access denied message displayed
- Upgrade prompt shown
- Redirect to dashboard after 5 seconds

#### Test B: User With Access
**Steps:**
1. Login as user with Gold/Platinum tier
2. Navigate to `/sales-forecasting.html`

**Expected:**
- Module loads successfully
- All features accessible

---

### Scenario 3: Responsive Testing

#### Mobile (375px)
**Checks:**
- [ ] Header is readable and not truncated
- [ ] Location selector takes full width
- [ ] Tabs are scrollable if needed
- [ ] Upload zone is touch-friendly
- [ ] Charts are viewable (not cut off)
- [ ] Buttons are at least 44x44px
- [ ] Forms are easy to fill on mobile keyboard

#### Tablet (768px)
**Checks:**
- [ ] Two-column layout where appropriate
- [ ] Charts scale properly
- [ ] Navigation tabs fit in one row
- [ ] Cards maintain proper spacing

#### Desktop (1200px+)
**Checks:**
- [ ] Full layout displays correctly
- [ ] Charts are large and clear
- [ ] No excessive whitespace
- [ ] Sidebar/navigation works

---

### Scenario 4: Chart Visualization

**Test Points:**
1. **Forecast Chart**
   - Historical data in green
   - Forecast data in purple with dashed line
   - Confidence interval shaded area (if enabled)
   - Legend at bottom, clear labels
   - Currency formatted as "R 15,000"

2. **Comparison Chart**
   - Forecast vs Actual overlaid
   - Clear distinction between lines
   - Tooltip shows both values

3. **Method Performance Chart**
   - Bar chart with 4 methods
   - Accuracy % on Y-axis
   - Clear labels

4. **Seasonal Patterns Chart**
   - Line chart with smooth curve
   - Day-of-week or month labels
   - Average revenue displayed

**Interactions:**
- [ ] Hover tooltips work
- [ ] Legend items are clickable (toggle datasets)
- [ ] Charts responsive to window resize
- [ ] No performance lag with large datasets

---

### Scenario 5: Accessibility Testing

#### Keyboard Navigation
**Steps:**
1. Use only keyboard (no mouse)
2. Tab through all interactive elements
3. Use Enter/Space to activate buttons
4. Navigate forms with Tab/Shift+Tab

**Checks:**
- [ ] Focus indicators visible (blue outline)
- [ ] Tab order is logical
- [ ] All buttons/links accessible
- [ ] Form fields can be filled via keyboard
- [ ] Modals can be closed with Esc

#### Screen Reader Testing
**Tools:** NVDA (Windows) or VoiceOver (Mac)

**Checks:**
- [ ] Page title announced correctly
- [ ] Heading hierarchy makes sense (h1, h2, h3)
- [ ] Buttons have descriptive labels
- [ ] Form labels associated with inputs
- [ ] Error messages read aloud
- [ ] Toast notifications announced
- [ ] ARIA live regions work

#### Color Contrast
**Tool:** Browser DevTools or axe DevTools extension

**Checks:**
- [ ] Text meets WCAG AA (4.5:1 minimum)
- [ ] Large text meets WCAG AA (3:1 minimum)
- [ ] Icons/graphics have sufficient contrast
- [ ] Focus indicators visible against all backgrounds

---

### Scenario 6: Error Handling

#### Test A: Invalid File Upload
**Steps:**
1. Upload a .txt file instead of CSV
2. Upload CSV with missing columns
3. Upload CSV with invalid date format

**Expected:**
- Clear error message displayed
- Toast notification with error details
- No partial data saved

#### Test B: Network Errors
**Steps:**
1. Disconnect network mid-upload
2. Attempt to generate forecast while offline

**Expected:**
- Error state displayed
- User-friendly error message
- Retry option provided

#### Test C: Authentication Timeout
**Steps:**
1. Leave page open for extended period
2. Try to perform action after session expires

**Expected:**
- Redirect to login with appropriate message
- Return to forecasting page after login

---

### Scenario 7: Performance Testing

#### Large Dataset
**Test:**
- Upload 365 days of historical data
- Generate forecast for 90 days ahead

**Metrics:**
- Upload time < 5 seconds
- Forecast generation < 10 seconds
- Chart render time < 2 seconds
- Page remains responsive

#### Memory Leaks
**Test:**
1. Generate multiple forecasts in sequence
2. Switch between views repeatedly
3. Upload and delete data multiple times

**Check:**
- Memory usage stable (use DevTools Performance)
- No chart instances left orphaned
- Event listeners properly cleaned up

---

### Scenario 8: Data Integrity

#### Test A: Forecast Persistence
**Steps:**
1. Generate and save forecast
2. Refresh page
3. Verify saved forecast appears in list
4. Load saved forecast
5. Verify data matches original

#### Test B: Adjustment Tracking
**Steps:**
1. Generate forecast
2. Make manual adjustments
3. Save adjustments
4. Reload forecast
5. Verify adjustments persisted

---

## Browser Compatibility Testing

### Desktop Browsers
- [ ] **Chrome 100+**: Full functionality
- [ ] **Firefox 95+**: Full functionality
- [ ] **Safari 15+**: Full functionality
- [ ] **Edge 100+**: Full functionality

### Mobile Browsers
- [ ] **Mobile Safari (iOS 14+)**: Touch interactions work
- [ ] **Chrome Mobile (Android 9+)**: Upload and charts work
- [ ] **Samsung Internet**: Basic functionality

### Known Issues
- Internet Explorer: Not supported (deprecated)
- Opera Mini: Limited chart interactivity

---

## Regression Testing

### After Code Changes
1. Run through Scenario 1 (First-Time User Flow)
2. Verify charts render correctly
3. Check responsive behavior on mobile
4. Test file upload functionality
5. Verify access control still works

### Before Production Deployment
1. Complete all test scenarios above
2. Performance test with realistic data
3. Accessibility audit with axe DevTools
4. Cross-browser smoke test
5. Check error logs for warnings

---

## Automated Testing (Future)

### Unit Tests
```javascript
// Example test structure
describe('SalesForecastingModule', () => {
    test('initializes with correct state', () => {
        const module = new SalesForecastingModule({...});
        expect(module.currentView).toBe('upload');
    });

    test('normalizes uploaded data correctly', () => {
        // ...
    });
});
```

### Integration Tests
- Test Firebase data flow
- Test authentication integration
- Test feature access control

### E2E Tests (Playwright/Cypress)
```javascript
test('user can upload data and generate forecast', async ({ page }) => {
    await page.goto('/sales-forecasting.html');
    await page.selectOption('#sf-location', 'location-123');
    await page.setInputFiles('#sf-file-input', 'sample.csv');
    // ...
});
```

---

## Bug Report Template

When reporting issues, please include:

### Environment
- Browser: Chrome 120.0.6099
- OS: Windows 11
- Screen size: 1920x1080
- User tier: Gold

### Steps to Reproduce
1. Navigate to...
2. Click on...
3. Upload file...
4. Observe error...

### Expected Behavior
What should have happened

### Actual Behavior
What actually happened

### Screenshots
Attach relevant screenshots

### Console Errors
Copy any errors from browser console

### Additional Context
Any other relevant information

---

## Testing Checklist Summary

Before marking Feature #254 as complete:

**Functional**
- [x] Authentication flow
- [x] Access control
- [x] File upload
- [x] Forecast generation
- [x] Chart rendering
- [x] Data persistence
- [x] Error handling

**Visual**
- [x] Matches design system
- [x] Consistent styling
- [x] Proper spacing
- [x] Icon alignment

**Responsive**
- [ ] Mobile (< 576px)
- [ ] Tablet (576px - 992px)
- [ ] Desktop (> 992px)

**Accessibility**
- [x] Keyboard navigation
- [x] ARIA labels
- [x] Color contrast
- [ ] Screen reader (to be tested)

**Performance**
- [ ] Load time < 3s
- [ ] No memory leaks
- [ ] Smooth animations

**Browser Compatibility**
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile browsers

---

## Next Steps

1. Complete manual testing using this guide
2. Address any issues found
3. Conduct user acceptance testing (UAT)
4. Deploy to staging environment
5. Final smoke test in staging
6. Deploy to production
7. Monitor for 24-48 hours
8. Collect user feedback

---

## Support Resources

- **Documentation**: See SALES_FORECASTING_UX_OVERHAUL.md
- **Sample Data**: public/sample-data/sales-forecasting-sample.csv
- **Module Code**: public/js/modules/sales-forecasting/
- **Styles**: public/css/sales-forecasting.css

**Version**: 2.1.5-20250606
**Last Updated**: 2026-02-09
