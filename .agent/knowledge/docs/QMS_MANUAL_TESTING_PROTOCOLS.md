# QMS-Booking Tab Integration: Manual Testing Protocols

## Overview

This document provides comprehensive manual testing procedures and checklists for validating the QMS-Booking tab integration. These protocols are designed to catch issues that automated tests might miss and provide human validation of user experience quality.

## Testing Environment Setup

### Prerequisites
- [ ] Chrome (latest stable)
- [ ] Firefox (latest stable)
- [ ] Safari (latest stable - for macOS testing)
- [ ] Edge (latest stable)
- [ ] Test user accounts for each subscription tier
- [ ] Network throttling tools (built into browser DevTools)
- [ ] Screen reader software (NVDA/JAWS for accessibility testing)

### Test Data Requirements
```
User Accounts Required:
├── Free Tier User (free@test.com)
├── Starter Tier User (starter@test.com)
├── Professional Tier User (pro@test.com)
├── Professional Tier Admin (proadmin@test.com)
├── Enterprise Tier User (enterprise@test.com)
└── Enterprise Tier Admin (enterpriseadmin@test.com)

Test Locations:
├── Main Restaurant
├── Branch Location A
└── Branch Location B
```

---

## PROTOCOL 1: Container Selection and Vue Mounting Verification
**Frequency**: Before each release
**Duration**: 30 minutes
**Tester**: QA Engineer

### Test Checklist

#### 1.1 Admin Dashboard Context
- [ ] Navigate to admin-dashboard.html
- [ ] Login with admin credentials
- [ ] Navigate to QMS section
- [ ] **VERIFY**: Vue app container structure
  - [ ] `#queueManagementContent` exists
  - [ ] `#queueManagementVueContent` exists
  - [ ] `#queue-management-app` is child of `#queueManagementVueContent`
- [ ] **VERIFY**: Tab structure creation
  - [ ] `#adminQmsTabsNav` exists
  - [ ] `#admin-queue-tab` exists and is active
  - [ ] `#admin-booking-tab` exists
  - [ ] Tab content panes exist (`#admin-queue-pane`, `#admin-booking-pane`)

**Expected Results**:
- Vue app mounts in correct container hierarchy
- Admin tab structure created without duplicates
- No console errors related to container selection

#### 1.2 User Dashboard Context  
- [ ] Navigate to queue-management.html
- [ ] Login with enterprise user credentials
- [ ] **VERIFY**: Vue app container structure
  - [ ] `#queueManagementContent` exists
  - [ ] Vue app mounts in appropriate container
- [ ] **VERIFY**: User tab structure
  - [ ] `#qmsTabsNav` exists (if standalone page)
  - [ ] `#queue-tab` and `#booking-tab` exist
  - [ ] Tab content structure is correct

**Expected Results**:
- Vue app mounts in user context container
- User tab structure differs appropriately from admin structure
- Container selection follows documented priority order

#### 1.3 Edge Cases
- [ ] **Missing Container Test**: Remove `#queueManagementContent` via DevTools
- [ ] **Reload**: Refresh page
- [ ] **VERIFY**: Graceful failure or fallback behavior
- [ ] **Partial DOM Test**: Remove inner containers, keep main container
- [ ] **VERIFY**: Fallback container selection works

**Pass Criteria**:
- [ ] System handles missing containers gracefully
- [ ] Error messages are user-friendly
- [ ] No JavaScript crashes occur

---

## PROTOCOL 2: Tab Lifecycle and Navigation Testing
**Frequency**: Weekly regression
**Duration**: 45 minutes  
**Tester**: QA Engineer

### Test Checklist

#### 2.1 Initial Tab State Verification
- [ ] Fresh login to admin dashboard
- [ ] Navigate to QMS section
- [ ] **VERIFY**: Default tab states
  - [ ] Queue tab is active by default
  - [ ] Booking tab is inactive by default
  - [ ] Appropriate content is visible in active pane

#### 2.2 Basic Tab Navigation
- [ ] Click on booking tab
- [ ] **VERIFY**: Tab activation
  - [ ] Booking tab becomes active
  - [ ] Queue tab becomes inactive
  - [ ] Content pane visibility switches correctly
- [ ] Click back on queue tab
- [ ] **VERIFY**: Return navigation works
  - [ ] Queue tab active
  - [ ] Booking tab inactive
  - [ ] Content restored properly

#### 2.3 Rapid Navigation Testing
- [ ] **Rapid Click Test**: Click between tabs quickly 10 times
- [ ] **VERIFY**: System stability
  - [ ] Final state is predictable
  - [ ] No duplicate content created
  - [ ] No JavaScript errors in console
- [ ] **Double-Click Test**: Double-click each tab
- [ ] **VERIFY**: No adverse effects

#### 2.4 Navigation During Loading
- [ ] Navigate to QMS section
- [ ] **Immediately** during page load, click booking tab
- [ ] **VERIFY**: Handling of premature navigation
  - [ ] System doesn't break
  - [ ] Eventually reaches consistent state
  - [ ] Loading indicators appropriate

#### 2.5 Context Switching
- [ ] Navigate to QMS section
- [ ] Switch to booking tab
- [ ] Navigate away to different admin section
- [ ] Return to QMS section
- [ ] **VERIFY**: State preservation
  - [ ] Booking tab still active (or reset to default appropriately)
  - [ ] Vue app reinitializes correctly
  - [ ] No memory leaks observed

**Pass Criteria**:
- [ ] All tab navigation functions correctly
- [ ] Rapid navigation doesn't cause instability
- [ ] Context switching preserves appropriate state
- [ ] No console errors during navigation

---

## PROTOCOL 3: Access Control Matrix Validation
**Frequency**: Before subscription system changes
**Duration**: 60 minutes
**Tester**: QA Engineer with access to all test accounts

### Test Matrix

| User Type | Tier | Booking Feature | Admin Status | Expected Booking Tab State |
|-----------|------|-----------------|--------------|----------------------------|
| User A | Free | No | No | Disabled + Lock Icon |
| User B | Starter | No | Yes | Disabled + Lock Icon |
| User C | Professional | Yes | No | Disabled + Lock Icon |
| User D | Professional | Yes | Yes | Enabled |
| User E | Enterprise | Yes | No | Enabled |
| User F | Enterprise | Yes | Yes | Enabled |

### Test Procedure for Each User Type

#### 3.1 User A (Free Tier, No Admin)
- [ ] Login with free tier account
- [ ] Navigate to queue-management.html
- [ ] **VERIFY**: Booking tab state
  - [ ] Tab has `disabled` class
  - [ ] Lock icon is visible (not `d-none`)
  - [ ] Hover shows appropriate tooltip
- [ ] Click booking tab
- [ ] **VERIFY**: Upgrade prompt behavior
  - [ ] SweetAlert/modal appears
  - [ ] Upgrade message mentions subscription tier requirement
  - [ ] "Upgrade" button present
  - [ ] "Cancel" button present
- [ ] Click "Upgrade" button
- [ ] **VERIFY**: Redirect behavior
  - [ ] Redirects to subscription page
  - [ ] URL contains appropriate parameters

#### 3.2 User D (Professional + Admin)
- [ ] Login with professional admin account
- [ ] Navigate to admin dashboard → QMS
- [ ] **VERIFY**: Booking tab state
  - [ ] Tab does NOT have `disabled` class
  - [ ] Lock icon is hidden (`d-none`)
  - [ ] No tooltip indicating restriction
- [ ] Click booking tab
- [ ] **VERIFY**: Content loading
  - [ ] Loading spinner appears
  - [ ] Booking management interface loads
  - [ ] No access denied messages
  - [ ] Interactive elements are functional

#### 3.3 User E (Enterprise, No Admin)
- [ ] Login with enterprise user account  
- [ ] Navigate to queue-management.html
- [ ] **VERIFY**: Booking tab enabled (enterprise exception)
  - [ ] Tab does NOT have `disabled` class
  - [ ] Lock icon is hidden
  - [ ] Can access booking features without admin privileges

### Test Timing Validation
- [ ] **Access Check Duration**: Time access verification process
- [ ] **VERIFY**: Completes within 2 seconds on normal network
- [ ] **VERIFY**: Shows loading state for delays >500ms
- [ ] **Network Delay Test**: Throttle network to 3G speeds
- [ ] **VERIFY**: Access verification still completes
- [ ] **VERIFY**: Appropriate timeout handling

**Pass Criteria**:
- [ ] All access control rules enforced correctly
- [ ] Appropriate feedback provided for each user type
- [ ] Access verification completes within reasonable time
- [ ] Network issues handled gracefully

---

## PROTOCOL 4: Performance and Loading Validation
**Frequency**: Before releases
**Duration**: 30 minutes
**Tester**: QA Engineer

### Performance Benchmarks

| Metric | Threshold | Measurement Method |
|--------|-----------|-------------------|
| Initial Mount | < 500ms | DevTools Performance tab |
| Tab Switch | < 200ms | Manual stopwatch |
| Booking Tab Load | < 2000ms | DevTools Network tab |
| Memory Usage | < 50MB increase | DevTools Memory tab |

### Test Procedure

#### 4.1 Initial Loading Performance
- [ ] Clear browser cache and storage
- [ ] Open DevTools Performance tab
- [ ] Navigate to QMS section
- [ ] **MEASURE**: Time from navigation to Vue app visible
- [ ] **VERIFY**: < 500ms on standard connection
- [ ] **VERIFY**: < 2000ms on throttled 3G connection

#### 4.2 Tab Switching Performance
- [ ] Navigate to QMS section (ensure fully loaded)
- [ ] Start performance recording
- [ ] Click booking tab
- [ ] Stop recording when tab content visible
- [ ] **MEASURE**: Tab activation time
- [ ] **VERIFY**: < 200ms for tab switch
- [ ] **VERIFY**: < 2000ms for booking content load

#### 4.3 Memory Usage Testing
- [ ] Open DevTools Memory tab
- [ ] Take baseline memory snapshot
- [ ] Navigate through QMS tabs 10 times
- [ ] Take final memory snapshot
- [ ] **VERIFY**: Memory increase < 50MB
- [ ] **VERIFY**: No obvious memory leaks in heap

#### 4.4 Network Condition Testing
- [ ] **Good Network (Fiber)**: Test all operations
- [ ] **Slow 3G**: Test all operations
- [ ] **Offline**: Test graceful degradation
- [ ] **Intermittent**: Toggle network on/off during loading

**Pass Criteria**:
- [ ] All performance thresholds met
- [ ] Graceful degradation under poor network conditions
- [ ] Memory usage remains reasonable
- [ ] Loading states provide appropriate feedback

---

## PROTOCOL 5: Cross-Browser Compatibility Testing
**Frequency**: Before major releases
**Duration**: 2 hours
**Tester**: QA Engineer

### Browser Test Matrix

#### 5.1 Chrome (Primary Browser)
- [ ] **Full Feature Test**: Complete all Protocol 1-4 tests
- [ ] **DevTools Verification**: No console errors or warnings
- [ ] **Performance**: Meets all benchmarks

#### 5.2 Firefox
- [ ] **Basic Functionality**: Vue mounting, tab navigation
- [ ] **Access Control**: Test with professional user
- [ ] **Visual Consistency**: Compare with Chrome baseline
- [ ] **JavaScript Compatibility**: Check for Firefox-specific issues

#### 5.3 Safari (macOS)
- [ ] **Basic Functionality**: Vue mounting, tab navigation  
- [ ] **Webkit-Specific**: Test any Safari-specific behaviors
- [ ] **Performance**: Compare with Chrome benchmarks
- [ ] **Touch Events**: Test on iPad if available

#### 5.4 Edge
- [ ] **Basic Functionality**: Core features work
- [ ] **Legacy Compatibility**: Test any IE-legacy concerns
- [ ] **Performance**: Acceptable performance levels

### Cross-Browser Test Checklist
For each browser:
- [ ] Vue app initializes correctly
- [ ] Tab structure created properly
- [ ] Access control works
- [ ] Booking tab loads
- [ ] Visual styling consistent (95%+ match)
- [ ] No JavaScript errors unique to browser

**Pass Criteria**:
- [ ] Core functionality works in all target browsers
- [ ] Visual differences documented and acceptable
- [ ] Performance acceptable across browsers
- [ ] No browser-specific crashes

---

## PROTOCOL 6: Accessibility Testing
**Frequency**: Monthly
**Duration**: 45 minutes
**Tester**: Accessibility specialist or trained QA

### Screen Reader Testing

#### 6.1 NVDA/JAWS Testing
- [ ] **Navigation Setup**: Start screen reader
- [ ] Navigate to QMS section using only keyboard
- [ ] **Tab Structure**: 
  - [ ] Tab list announced correctly
  - [ ] Tab roles identified
  - [ ] Active tab state announced
- [ ] **Tab Navigation**:
  - [ ] Arrow keys navigate between tabs
  - [ ] Enter/Space activates tabs
  - [ ] Tab content changes announced
- [ ] **Content Reading**:
  - [ ] Queue content readable
  - [ ] Booking access messages clear
  - [ ] Error states announced appropriately

#### 6.2 Keyboard Navigation
- [ ] **Tab Order**: Use only Tab key to navigate
  - [ ] Logical tab order through interface
  - [ ] No keyboard traps
  - [ ] All interactive elements reachable
- [ ] **Focus Indicators**:
  - [ ] Visible focus rings on all elements
  - [ ] High contrast focus indicators
  - [ ] Focus not hidden behind other elements
- [ ] **Activation**:
  - [ ] Enter activates buttons/links
  - [ ] Space activates buttons
  - [ ] Arrow keys work in tab navigation

#### 6.3 Visual Accessibility
- [ ] **Color Contrast**: Test with color analyzer
  - [ ] Text meets WCAG AA standards (4.5:1)
  - [ ] Interactive elements meet contrast requirements
  - [ ] Focus indicators sufficient contrast
- [ ] **High Contrast Mode**: Test in Windows High Contrast
  - [ ] All elements remain visible
  - [ ] Boundaries clearly defined
  - [ ] Text readable in all modes
- [ ] **Zoom Testing**: Test at 200% zoom
  - [ ] Layout remains usable
  - [ ] Text doesn't overflow containers
  - [ ] Horizontal scrolling minimal

**Pass Criteria**:
- [ ] WCAG AA compliance achieved
- [ ] Screen reader experience functional
- [ ] Keyboard navigation complete
- [ ] Visual accessibility standards met

---

## PROTOCOL 7: Error Scenario Testing
**Frequency**: Before releases
**Duration**: 45 minutes
**Tester**: QA Engineer

### Controlled Error Injection

#### 7.1 Network Error Simulation
- [ ] **Setup**: Use DevTools Network tab
- [ ] **Offline Test**: Disable network, attempt QMS access
  - [ ] **VERIFY**: Appropriate offline message
  - [ ] **VERIFY**: No JavaScript crashes
  - [ ] **VERIFY**: Retry mechanism available
- [ ] **Firebase Errors**: Block Firebase requests
  - [ ] Navigate to QMS section
  - [ ] **VERIFY**: Graceful degradation
  - [ ] **VERIFY**: Error messages user-friendly
- [ ] **Intermittent Failures**: Random network disconnection
  - [ ] **VERIFY**: System recovers when connection restored

#### 7.2 JavaScript Error Simulation
- [ ] **Vue Errors**: Use DevTools Console to break Vue
  ```javascript
  // Inject this in console before navigation
  window.Vue = undefined;
  ```
- [ ] Navigate to QMS
- [ ] **VERIFY**: Error handling and fallback UI
- [ ] **Module Loading Errors**: Block booking-management.js
- [ ] Click booking tab
- [ ] **VERIFY**: Booking error state displayed

#### 7.3 DOM Manipulation Errors
- [ ] Navigate to QMS section
- [ ] Use DevTools to delete key containers
- [ ] Refresh page
- [ ] **VERIFY**: System handles missing DOM elements
- [ ] **VERIFY**: Appropriate error messages shown

#### 7.4 User Account Issues
- [ ] **Session Expiry**: Simulate token expiration
- [ ] **Permission Changes**: Downgrade user mid-session
- [ ] **VERIFY**: System detects and handles auth changes

**Pass Criteria**:
- [ ] No unhandled JavaScript exceptions
- [ ] User-friendly error messages displayed
- [ ] Recovery mechanisms available
- [ ] System remains stable after errors

---

## PROTOCOL 8: Real User Workflow Testing
**Frequency**: Before releases
**Duration**: 90 minutes
**Tester**: Business user or QA with business knowledge

### Complete User Journeys

#### 8.1 Restaurant Owner (Admin) Journey
**Scenario**: Restaurant owner wants to manage both queue and bookings

- [ ] **Step 1**: Login to admin dashboard
  - [ ] Use realistic login credentials
  - [ ] Note any login difficulties
- [ ] **Step 2**: Access queue management
  - [ ] Navigate using typical user patterns
  - [ ] Observe loading times and feedback
- [ ] **Step 3**: Review current queue
  - [ ] Check queue statistics make sense
  - [ ] Verify data displays correctly
- [ ] **Step 4**: Switch to booking management
  - [ ] Click booking tab
  - [ ] Wait for content to load
  - [ ] Note loading time and UX
- [ ] **Step 5**: Attempt booking operations
  - [ ] Check booking statistics
  - [ ] Try to create/modify bookings
  - [ ] Navigate back to queue
- [ ] **Overall Experience Rating**: 1-10 scale

#### 8.2 Restaurant Manager (Professional + Admin) Journey
**Scenario**: Manager needs both queue and booking access

- [ ] **Step 1**: Login and navigate to QMS
- [ ] **Step 2**: Daily queue management tasks
  - [ ] Add guests to queue
  - [ ] Update guest statuses
  - [ ] Send notifications
- [ ] **Step 3**: Switch to booking management
  - [ ] Access should be immediate (admin privileges)
  - [ ] Full booking functionality available
- [ ] **Step 4**: Return to queue management
  - [ ] Context switch should be smooth
  - [ ] No data loss or state issues

#### 8.3 Enterprise User (Non-Admin) Journey
**Scenario**: Enterprise customer accessing booking features

- [ ] **Step 1**: Login to user dashboard
- [ ] **Step 2**: Navigate to queue management
- [ ] **Step 3**: Use basic queue features
- [ ] **Step 4**: Access booking management
  - [ ] Should work without admin privileges (enterprise exception)
  - [ ] Full booking functionality available
  - [ ] Experience smooth and intuitive

#### 8.4 Free User Discovery Journey
**Scenario**: Free user discovers upgrade opportunities

- [ ] **Step 1**: Login with free account
- [ ] **Step 2**: Navigate to queue management
- [ ] **Step 3**: Attempt to access booking
  - [ ] Clear indication of restriction
  - [ ] Compelling upgrade messaging
  - [ ] Easy path to upgrade information
- [ ] **Step 4**: Follow upgrade path
  - [ ] Information clear and accurate
  - [ ] No broken links or errors

**Pass Criteria**:
- [ ] All user journeys complete without blocking issues
- [ ] Performance meets user expectations
- [ ] Upgrade paths are clear and functional
- [ ] Overall experience rated 7/10 or higher

---

## Test Execution and Reporting

### Test Session Documentation

#### Before Testing
- [ ] Environment setup verified
- [ ] Test data prepared
- [ ] Browser versions recorded
- [ ] Network conditions noted

#### During Testing
- [ ] Document all issues found
- [ ] Screenshot/video major problems
- [ ] Note performance measurements
- [ ] Record user experience feedback

#### After Testing
- [ ] Compile issue summary
- [ ] Prioritize findings
- [ ] Verify issue reproducibility
- [ ] Create detailed bug reports

### Issue Classification

**CRITICAL**: System crashes, data loss, security issues
- Blocks release
- Requires immediate fix

**HIGH**: Major functionality broken, poor UX
- Should be fixed before release
- May require release delay

**MEDIUM**: Minor functionality issues, UX concerns
- Fix if time permits
- Document for future release

**LOW**: Cosmetic issues, nice-to-have improvements
- Future release consideration
- Document as enhancement

### Test Completion Criteria

#### Must Pass (Release Blockers)
- [ ] All Protocol 1-3 tests pass
- [ ] No CRITICAL issues found
- [ ] Performance thresholds met
- [ ] Core user workflows complete

#### Should Pass (Release Concerns)
- [ ] Protocol 4-8 tests mostly pass
- [ ] No more than 3 HIGH issues
- [ ] Cross-browser compatibility acceptable
- [ ] Accessibility meets WCAG AA

#### Nice to Pass (Quality Goals)
- [ ] All tests pass completely
- [ ] No MEDIUM issues
- [ ] User experience rated 8+/10
- [ ] Error recovery excellent

---

## Quick Smoke Test (5-Minute Version)

For rapid validation during development:

### Admin Dashboard Quick Check
- [ ] Login → QMS → Vue app loads → Tabs exist → Booking tab accessible

### User Context Quick Check  
- [ ] Enterprise user → Queue management → Booking tab works

### Access Control Quick Check
- [ ] Free user → Queue management → Booking tab disabled with upgrade prompt

### Error Handling Quick Check
- [ ] Disconnect network → Refresh QMS → Error handling visible

**Pass/Fail**: All 4 quick checks must pass for code to be considered stable.

---

## Conclusion

These manual testing protocols provide comprehensive coverage of the QMS-Booking tab integration from multiple perspectives:

- **Technical validation** ensures the implementation works correctly
- **User experience validation** ensures the system is usable and intuitive  
- **Business validation** ensures the access control and upgrade paths work as intended
- **Quality validation** ensures the system meets accessibility and performance standards

Regular execution of these protocols will catch issues that automated tests miss and ensure a high-quality user experience for all subscription tiers and user contexts.