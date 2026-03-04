# WhatsApp Admin Tools Documentation

## Overview

The WhatsApp Admin Tools provide administrative capabilities for the WhatsApp rewards bot system. Admin users can access special commands and insights through WhatsApp messages by using their verified phone numbers **from the existing Sparks Hospitality platform admin system**.

## Integration with Existing Admin System

**Important**: This system integrates with your existing Sparks Hospitality platform admin system. It does **NOT** create a separate admin system. Instead, it:

1. **Uses existing admin users** from the `admin-claims` collection and `users` collection
2. **Maps phone numbers** to existing admin user accounts
3. **Leverages existing admin verification** through Firebase Auth custom claims
4. **Maintains platform security** by using the same admin verification system

## Features

- **Platform Admin Integration**: Uses existing admin users from your platform
- **Phone Number Mapping**: Maps WhatsApp phone numbers to existing admin accounts  
- **Daily Insights**: Access system statistics and metrics via WhatsApp
- **Role-Based Access**: Inherits admin roles from the existing platform
- **Web Interface**: HTML tool for mapping phone numbers to admin accounts

## Admin Commands

### 1. Admin Insights

**Command**: `admin insights`

**Alternative commands**:
- `admin daily insights`
- `admin stats`
- `admin dashboard`
- `admin daily stats`

**Description**: Get daily system statistics including:
- New guests signed up today
- Receipts uploaded today
- Rewards issued today
- Total system statistics

**Example Response**:
```
🤖 [ADMIN] Daily Insights - 2024-01-15

📈 Today's Activity:
• New Guests: 12
• Receipts Uploaded: 34
• Rewards Issued: 28

📊 System Totals:
• Total Active Guests: 1,245
• Total Receipts: 5,678
• Total Rewards: 4,892

🕐 Generated: 1/15/2024, 2:30:45 PM
```

**Access**: Only available to existing platform admin users with phone numbers

## Admin Verification Process

The system verifies admin access through the following steps:

1. **Phone Number Lookup**: Find user account with matching phone number
2. **Admin Claims Check**: Verify user exists in `admin-claims/{userId}` collection
3. **Role Verification**: Check if user has `role: 'admin'` or `isAdmin: true`
4. **Status Check**: Ensure user is active (not deleted/inactive)
5. **Final Authorization**: Grant access only if all checks pass

### Phone Number Fields Checked

The system looks for phone numbers in these user profile fields:
- `phoneNumber`
- `phone` 
- `businessPhone`

## Setting Up WhatsApp Admin Access

### Step 1: Verify Existing Admin User

Ensure the user is already an admin in your platform:
- User exists in `admin-claims/{userId}` collection, OR
- User has `role: 'admin'` or `isAdmin: true` in their profile
- User status is active

### Step 2: Add Phone Number to Admin User

**Method 1: Using the Web Interface**

1. Open `public/admin_tools/admin-phone-mapping.html` in your browser
2. Enter the admin user's email address
3. Click "Find Admin User" to verify they exist
4. Enter the phone number (with country code, e.g., +27123456789)
5. Click "Add Phone Number"

**Method 2: Direct Database Update**

```javascript
// Update existing admin user with phone number
await database.ref(`users/${adminUserId}`).update({
    phoneNumber: '27123456789', // normalized format
    whatsappAccessEnabled: true,
    updatedAt: Date.now()
});
```

### Step 3: Test WhatsApp Access

1. Use the test tool in the web interface, OR
2. Send a WhatsApp message: `admin insights`
3. Verify you receive admin data (not access denied)

## Database Integration

### Existing Collections Used

**Admin Claims**: `admin-claims/{userId}`
```json
{
  "admin-claims": {
    "user123": true,
    "user456": true
  }
}
```

**User Profiles**: `users/{userId}`
```json
{
  "users": {
    "user123": {
      "email": "admin@example.com",
      "displayName": "Admin User",
      "role": "admin",
      "phoneNumber": "27123456789",
      "status": "active",
      "whatsappAccessEnabled": true,
      "createdAt": 1705234567890,
      "updatedAt": 1705234567890
    }
  }
}
```

## Phone Number Format

Phone numbers are normalized by removing:
- `whatsapp:` prefix
- `+` prefix
- Any non-digit characters

Example transformations:
- `+27123456789` → `27123456789`
- `whatsapp:+27123456789` → `27123456789`
- `27123456789` → `27123456789`

## Security Features

1. **Existing Platform Security**: Uses your existing admin verification system
2. **Phone Number Verification**: Only verified phone numbers can access admin commands
3. **Active Status Check**: Inactive admin users cannot access admin commands
4. **Role Verification**: Checks both admin-claims and user roles
5. **Access Logging**: All admin command usage is logged with timestamps

## Testing Admin Functionality

### 1. Verify Admin User Exists

```javascript
// Check if user is in admin-claims
const adminSnapshot = await database.ref('admin-claims/USER_ID').once('value');
const isAdmin = adminSnapshot.exists() && adminSnapshot.val() === true;

// Check user role
const userSnapshot = await database.ref('users/USER_ID').once('value');
const userData = userSnapshot.val();
const hasAdminRole = userData.role === 'admin' || userData.isAdmin === true;
```

### 2. Test Phone Number Mapping

1. Use the admin phone mapping tool
2. Enter your admin email and find your account
3. Add your phone number
4. Test access using the tool

### 3. Test WhatsApp Admin Command

1. Ensure your phone number is mapped to your admin account
2. Send WhatsApp message: `admin insights`
3. You should receive daily insights data
4. Non-admin numbers should receive access denied

## Error Handling

The system includes comprehensive error handling:

- **User Not Found**: No user account with that phone number
- **Not Admin**: User exists but has no admin privileges
- **Inactive User**: Admin user exists but is inactive/deleted
- **Database Errors**: Graceful handling of database connection issues
- **Command Errors**: Proper error responses for malformed commands

## Integration with Existing System

The admin functionality integrates seamlessly with your existing platform:

1. **Uses Existing Admins**: No separate admin accounts needed
2. **Same Security Model**: Uses your existing admin-claims and user roles
3. **Existing Database**: Works with your current database structure
4. **Platform Consistency**: Maintains security patterns from your platform

## Common Use Cases

### Add Phone Number to Existing Admin

```javascript
// Admin user already exists in platform
// Just add phone number for WhatsApp access
await database.ref(`users/${existingAdminUserId}`).update({
    phoneNumber: '27123456789',
    whatsappAccessEnabled: true,
    updatedAt: Date.now()
});
```

### Check If Phone Has Admin Access

```javascript
// The system will automatically:
// 1. Find user by phone number
// 2. Check admin-claims/{userId}
// 3. Check user.role === 'admin'
// 4. Verify user is active
// 5. Grant/deny access accordingly
```

## Troubleshooting

### Common Issues

1. **"Access denied" message**:
   - Verify phone number is in admin user profile
   - Check if user exists in admin-claims
   - Ensure user has admin role
   - Verify user status is active

2. **User not found by phone**:
   - Check phone number format (should be normalized)
   - Verify phone number is saved in user profile
   - Check phoneNumber, phone, or businessPhone fields

3. **Admin user exists but no WhatsApp access**:
   - Phone number may not be mapped to the account
   - Use the admin phone mapping tool to add it

### Debugging Steps

1. Use the admin phone mapping tool to test phone numbers
2. Check Firebase console for admin-claims and users data
3. Verify phone number normalization
4. Check user profile for admin role/status
5. Review WhatsApp bot logs for admin verification process

## Support

For issues or questions regarding the admin tools:
1. Use the admin phone mapping tool for diagnosis
2. Check the existing platform admin system first
3. Verify phone number mapping to admin accounts
4. Review logs for admin verification process

---

*Last Updated: January 2024*
*Version: 2.0 - Integrated with Platform Admin System* 