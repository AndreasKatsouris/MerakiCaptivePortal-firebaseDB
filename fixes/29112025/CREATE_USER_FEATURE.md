# Create User Feature Implementation

## Date: November 29, 2025

## Feature Overview
Added ability for admins to create new non-admin users directly from the Admin Dashboard's Users & Locations Management section, with full control over subscription tier and admin status.

## Problem Solved
- No way to create test users or new users without them self-registering
- Needed ability to create users with specific subscription tiers (Free, Starter, Professional, Enterprise)
- Required admin-only user creation for testing and client onboarding

## Implementation

### 1. Frontend UI Changes (users-locations-management.js)

#### Added "Create User" Button
**File:** `public/js/admin/users-locations-management.js` (Lines 252-256)

Added button in the Users panel search/filter bar:
```javascript
<button class="btn btn-primary w-100" id="createUserBtn">
    <i class="fas fa-user-plus me-2"></i>Create User
</button>
```

#### Added Create User Modal
**File:** `public/js/admin/users-locations-management.js` (Lines 376-444)

Comprehensive modal form with fields for:
- First Name & Last Name (required)
- Email (required - becomes login email)
- Temporary Password (required, min 6 chars)
- Business Name (optional)
- Phone Number (optional)
- Subscription Tier (required) - dropdown with Free/Starter/Professional/Enterprise
- Admin User checkbox (grants full system access)

#### Added Event Listeners
**File:** `public/js/admin/users-locations-management.js` (Lines 597-606)

```javascript
// Create user button - opens modal
const createUserBtn = document.getElementById('createUserBtn');
createUserBtn?.addEventListener('click', () => {
    const modal = new bootstrap.Modal(document.getElementById('createUserModal'));
    modal.show();
});

// Confirm create user - calls createNewUser()
const confirmCreateUserButton = document.getElementById('confirmCreateUser');
confirmCreateUserButton?.addEventListener('click', () => this.createNewUser());
```

#### Added createNewUser() Method
**File:** `public/js/admin/users-locations-management.js` (Lines 1277-1358)

**Features:**
- Validates all required fields
- Enforces 6-character minimum password
- Calls Firebase Cloud Function with authenticated admin token
- Handles success/error states
- Clears form and reloads user list on success

**Request Flow:**
```javascript
POST https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/createUserAccount
Headers:
  - Authorization: Bearer {adminIdToken}
  - Content-Type: application/json
Body:
  {
    email, password, firstName, lastName,
    businessName, phoneNumber, tier, isAdmin
  }
```

### 2. Backend Cloud Function (functions/index.js)

#### New Function: createUserAccount
**File:** `functions/index.js` (Lines 598-727)

**Security:**
- Requires valid Firebase Auth token (Bearer token)
- Verifies caller is an admin via admin-claims check
- Returns 401 for unauthorized, 403 for non-admin

**Validation:**
- Checks all required fields present
- Validates tier is one of: free, starter, professional, enterprise
- Returns 400 for validation failures

**User Creation Process:**
1. **Firebase Auth Account** - Creates user with email/password
2. **Admin Claims** (if requested) - Sets custom claims and admin-claims record
3. **User Record** - Creates complete user profile in `users/{uid}`
4. **Subscription Record** - Creates proper subscription in `subscriptions/{uid}` with:
   - `tierId` field (not legacy `tier`)
   - `metadata.initialTier` for backward compatibility
   - Embedded features and limits from tier definition
   - `metadata.signupSource: 'admin'` to track creation method
   - `metadata.createdBy` to track which admin created the user

**Response:**
```json
{
  "success": true,
  "message": "User created successfully",
  "userId": "firebase-uid",
  "email": "user@example.com",
  "tier": "enterprise",
  "isAdmin": false
}
```

## Technical Details

### Subscription Structure
The function creates subscriptions with the CORRECT structure that works with our tier resolution fixes:

```javascript
{
  userId: "firebase-uid",
  tierId: "enterprise",           // ← Primary field
  status: "active",
  startDate: TIMESTAMP,
  features: {...},                 // Embedded from tier
  limits: {...},                   // Embedded from tier
  metadata: {
    signupSource: "admin",
    initialTier: "enterprise",     // ← Fallback for old code
    createdBy: "admin-uid"
  }
}
```

This ensures:
- ✅ Works with our metadata.initialTier fallback (from Enterprise tier fix)
- ✅ Has proper `tierId` field for current code
- ✅ Tracks who created the user and how
- ✅ No tier/tierId conflicts

### Security Model
- **Admin-only:** Only users in admin-claims can create accounts
- **Token-based:** Uses Firebase ID token for authentication
- **CORS-enabled:** Allows web dashboard to call the function
- **Audit trail:** Tracks creation source and creator in metadata

### Error Handling
- Form validation on client side
- Server-side validation of all inputs
- Graceful handling of Firebase Auth errors (duplicate email, etc.)
- User-friendly error messages displayed in modal
- Console logging for debugging

## Files Modified

1. **public/js/admin/users-locations-management.js**
   - Line 252-256: Added Create User button
   - Line 376-444: Added Create User modal
   - Line 597-606: Added event listeners
   - Line 1277-1358: Added createNewUser() method

2. **functions/index.js**
   - Line 598-727: Added createUserAccount Cloud Function

## Deployment Steps

### 1. Deploy Cloud Function
```bash
cd functions
firebase deploy --only functions:createUserAccount
```

### 2. Verify Deployment
Check Firebase Console → Functions → createUserAccount should be listed

### 3. Test Access
- Log in as admin user
- Navigate to Admin Dashboard → Users & Locations tab
- Click "Create User" button
- Modal should appear

## Testing Checklist

- [ ] Deploy Cloud Function to Firebase
- [ ] Test button appears in Users panel (admin only)
- [ ] Modal opens when button clicked
- [ ] Form validation works (required fields, min password length)
- [ ] Create Free tier user successfully
- [ ] Create Starter tier user successfully
- [ ] Create Professional tier user successfully
- [ ] Create Enterprise tier user successfully
- [ ] Create Admin user successfully (check admin-claims created)
- [ ] Verify created user can log in with provided credentials
- [ ] Verify subscription has correct tierId field
- [ ] Verify tier resolves correctly (not defaulting to free)
- [ ] Verify features are accessible based on tier
- [ ] Test error handling (duplicate email, weak password)
- [ ] Verify user appears in Users list after creation

## Usage Instructions

### For Admins:
1. Go to Admin Dashboard
2. Click "Users & Locations" tab
3. Click "Create User" button (top right of search bar)
4. Fill in user details:
   - **First Name & Last Name:** User's full name
   - **Email:** Login email (must be unique)
   - **Password:** Temporary password (user should change after first login)
   - **Business Name:** Optional, for organization tracking
   - **Phone Number:** Optional contact number
   - **Subscription Tier:** Select appropriate tier
   - **Admin User:** Check only if user needs admin access
5. Click "Create User"
6. User will appear in list and can immediately log in

### Notes for Created Users:
- Users receive the email and password provided by admin
- They should change their password after first login
- No email verification required (admin-created accounts)
- Subscription is immediately active
- Features available based on selected tier

## Benefits

1. **Testing:** Can create test users on any tier instantly
2. **Client Onboarding:** Set up client accounts with proper tier
3. **Admin Management:** Quickly add team members as admins
4. **No Self-Service Required:** Users don't need to register themselves
5. **Tier Control:** Admin decides subscription level from start

## Future Enhancements

Potential improvements:
- Send email to new user with credentials
- Password reset link generation
- Bulk user import from CSV
- Copy/duplicate user feature
- User templates for common setups
