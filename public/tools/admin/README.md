# Admin Tools

Production-ready administrative interfaces for daily operations.

## Available Tools

### User & Location Management
- **admin-phone-mapping.html** - Map admin phone numbers to locations

### Business Analytics
- **gp_analysis_dashboard.html** - Gross profit analysis dashboard
- **ocean_basket_roi_calculator.html** - ROI calculator tool
- **sales-forecasting.html** - Sales forecasting with trend and seasonal analysis

### Booking Management
- **booking-management.html** - Manage customer bookings and reservations

### WhatsApp Management
- **whatsapp-management.html** - WhatsApp message management interface
- **whatsapp-management.js** - Supporting JavaScript

### Subscription & Access
- **tier-visibility-manager.html** - Manage subscription tier visibility

### Forecasting & Analytics
- **sales-forecasting.html** - Sales forecasting with multiple algorithms

### Dashboard
- **index.html** - Main admin tools landing page

## Access

These tools require admin authentication and are intended for production use.

**URL**: `/tools/admin/`

## Security

⚠️ **Important**: These tools should only be accessible to authenticated administrators. Ensure proper access controls are in place before deployment.

## Developing New Admin Tools

### Authentication Setup

All admin tools must implement proper Firebase authentication. Follow this pattern:

#### 1. Import Paths

Admin tools are located at `/tools/admin/`, so imports must go **up two levels** to reach the root `/js/` directory:

```javascript
// ✅ CORRECT - Go up two levels from /tools/admin/
import { auth, rtdb, ref, get, set, onAuthStateChanged } from '../../js/config/firebase-config.js';
import { AdminClaims } from '../../js/auth/admin-claims.js';

// ❌ WRONG - Only goes up one level to /tools/js/ (doesn't exist)
import { auth, ... } from '../js/config/firebase-config.js';
```

#### 2. Authentication Initialization Pattern

Use this proven pattern from `booking-management.html` and `sales-forecasting.html`:

```javascript
async function initializeAdminAuth() {
    try {
        // Wait for Firebase auth to be ready
        await new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                console.log('[YourTool] Auth state ready, user:', user ? user.email : 'null');
                unsubscribe();
                resolve();
            });
        });

        // Get current user
        const user = auth.currentUser;
        
        if (!user) {
            console.log('[YourTool] No user found, redirecting...');
            window.location.href = '../../admin-dashboard.html';
            return;
        }

        // Force token refresh and verify admin status
        await user.getIdToken(true);
        const hasAdminAccess = await AdminClaims.verifyAdminStatus(user);
        
        if (!hasAdminAccess) {
            console.warn('[YourTool] User does not have admin privileges');
            window.location.href = '../../admin-dashboard.html';
            return;
        }

        console.log('[YourTool] Admin verification successful');
        // Hide loading overlay and initialize your tool
        document.getElementById('loadingOverlay').classList.add('hidden');
        initializeYourTool();
        
    } catch (error) {
        console.error('[YourTool] Authentication error:', error);
        window.location.href = '../../admin-dashboard.html';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeAdminAuth);
```

#### 3. Loading Overlay

Include a loading overlay while authentication is in progress:

```html
<div id="loadingOverlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.95); display: flex; align-items: center; justify-content: center; z-index: 9999;">
    <div class="text-center">
        <div class="spinner-border text-primary mb-3"></div>
        <h5>Verifying Admin Access...</h5>
    </div>
</div>
```

### Common Issues & Troubleshooting

**Issue**: Page hangs on "Verifying Admin Access"
- **Cause**: Incorrect import paths
- **Solution**: Verify imports use `../../js/` not `../js/`
- **Debug**: Check browser console for `SyntaxError: Unexpected token '<'`

**Issue**: Authentication fails silently
- **Cause**: Missing `onAuthStateChanged` wait
- **Solution**: Use the pattern above to wait for auth state to be ready
- **Debug**: Check console logs show "Auth state ready"

**Issue**: Module not found errors
- **Cause**: Import paths don't match file location
- **Solution**: Count directory levels carefully (admin tools need `../../`)

---

**Last Updated**: 2026-01-08
