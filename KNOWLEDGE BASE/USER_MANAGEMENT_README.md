# User Management Module Documentation

## Overview

The User Management Module is a comprehensive system for managing platform users in the Laki Sparks platform. It provides functionality for user registration, authentication, subscription management, and location-based business management.

## Key Features

### 1. **User Registration & Authentication**
- Platform signup page with tier selection
- Separate user login page (distinct from admin login)
- Email/password authentication via Firebase Auth
- Remember me functionality
- Session management and auto-logout

### 2. **User Dashboard**
- Personalized dashboard with business metrics
- Real-time statistics (guests, campaigns, rewards, engagement)
- Quick action cards for common tasks
- Subscription status display

### 3. **Location Management**
- Create multiple business locations based on subscription tier
- Location details: name, address, phone, type, timezone
- Edit and delete locations
- Location-based analytics (coming soon)

### 4. **Admin User Management**
- View all registered users
- Edit user details and subscription status
- Soft delete users (maintains data integrity)
- User search and filtering
- Subscription tier management

## File Structure

```
public/
├── signup.html                 # User registration page
├── user-login.html            # User login page
├── user-dashboard.html        # User dashboard interface
├── js/
│   ├── signup.js             # Registration logic
│   ├── user-login.js         # User authentication
│   └── user-dashboard.js     # Dashboard functionality
└── js/modules/access-control/admin/
    └── enhanced-user-subscription-manager.js  # Admin user management
```

## Database Structure

### Users Collection (`users/{userId}`)
```javascript
{
  email: string,
  displayName: string,
  firstName: string,
  lastName: string,
  role: 'user' | 'admin',
  status: 'active' | 'inactive' | 'deleted',
  businessInfo: {
    businessName: string,
    businessType: string,
    businessAddress: string,
    businessPhone: string
  },
  createdAt: timestamp,
  lastLogin: timestamp,
  updatedAt: timestamp,
  updatedBy: string (userId)
}
```

### Subscriptions Collection (`subscriptions/{userId}`)
```javascript
{
  tier: string (tierID),
  status: 'active' | 'trial' | 'pastDue' | 'canceled' | 'none',
  startDate: timestamp,
  endDate: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  updatedBy: string (userId)
}
```

### User Locations Collection (`userLocations/{userId}/{locationId}`)
```javascript
{
  name: string,
  address: string,
  phone: string,
  type: 'restaurant' | 'cafe' | 'bar' | 'hotel' | 'retail' | 'other',
  timezone: string,
  status: 'active' | 'inactive',
  createdAt: timestamp,
  createdBy: string (userId),
  userId: string
}
```

## User Flows

### Registration Flow
1. User visits `/signup.html`
2. Selects subscription tier
3. Enters business information
4. Creates account credentials
5. System creates:
   - Firebase Auth account
   - User profile in database
   - Subscription record
   - Initial location (based on business info)
6. Redirects to user dashboard

### Login Flow
1. User visits `/user-login.html`
2. Enters email and password
3. System verifies:
   - Authentication credentials
   - User role (must be 'user', not 'admin')
   - Account status (must be 'active')
   - Subscription exists
4. Updates last login timestamp
5. Redirects to dashboard

### Location Management Flow
1. User clicks "Add Location" on dashboard
2. System checks location limit based on tier
3. User enters location details
4. Location saved to database
5. Dashboard updates with new location

## Subscription Tiers

Tiers control the number of locations a user can create:
- **Basic**: 1 location
- **Professional**: 3 locations
- **Enterprise**: Unlimited locations

## Security Considerations

1. **Authentication**
   - Firebase Auth handles secure password storage
   - Email verification recommended (not yet implemented)
   - Session tokens managed by Firebase

2. **Authorization**
   - User role verification on login
   - Tier-based feature restrictions
   - Admin-only access to user management

3. **Data Protection**
   - Soft delete preserves data integrity
   - User can only access their own data
   - Admin access logged with timestamps

## API Integration Points

### Firebase Services
- **Authentication**: User account management
- **Realtime Database**: User data storage
- **Cloud Functions**: (Future) Email notifications, data validation

### External Services (Future)
- **Payment Processing**: Subscription billing
- **Email Service**: Transactional emails
- **Analytics**: User behavior tracking

## Admin Features

### User Management Interface
Located in the admin dashboard under "Users & Subscriptions":
- User list with search/filter
- View user details and subscription
- Edit user information
- Change subscription tier/status
- Soft delete users

### Metrics Dashboard
- Total users by tier
- Active vs inactive users
- Revenue metrics
- User growth trends

## Best Practices

1. **Data Validation**
   - Validate all user inputs
   - Sanitize data before storage
   - Check tier limits before operations

2. **Error Handling**
   - User-friendly error messages
   - Detailed logging for debugging
   - Graceful fallbacks

3. **Performance**
   - Lazy load user data
   - Cache frequently accessed data
   - Optimize database queries

## Future Enhancements

1. **Email Verification**
   - Verify email on registration
   - Password reset functionality

2. **Advanced Location Features**
   - Operating hours
   - Menu/service management
   - Staff assignments

3. **Subscription Management**
   - Self-service upgrade/downgrade
   - Payment integration
   - Invoice generation

4. **Analytics Enhancement**
   - Location-specific analytics
   - Comparative reports
   - Export functionality

5. **Multi-language Support**
   - Internationalization
   - Timezone handling
   - Currency support

## Troubleshooting

### Common Issues

1. **Login Failures**
   - Check user role (must be 'user')
   - Verify account status
   - Confirm subscription exists

2. **Location Limit Errors**
   - Check user's subscription tier
   - Verify tier configuration in database

3. **Dashboard Loading Issues**
   - Check Firebase configuration
   - Verify database permissions
   - Review browser console for errors

### Debug Mode
Enable debug logging by setting in browser console:
```javascript
localStorage.setItem('debugMode', 'true');
```

## Support

For technical support or questions:
- Review Firebase logs for errors
- Check browser console for client-side issues
- Contact system administrator for tier changes

---

Last Updated: [Current Date]
Version: 1.0.0
