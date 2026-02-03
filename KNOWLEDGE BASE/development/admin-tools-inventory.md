# Admin Tools Inventory

## Overview
This document categorizes the 52 admin tools found in `/public/admin_tools` by their purpose and usage status.

---

## 🟢 Production Admin Tools (Keep - Move to `/tools/admin`)

These are actively used administrative interfaces for production operations:

| Tool | Purpose | Last Modified |
|------|---------|---------------|
| **index.html** | Admin tools dashboard/landing page | 2025-09-04 |
| **booking-management.html** | Manage customer bookings | 2025-07-13 |
| **whatsapp-management.html** | WhatsApp message management | 2025-07-17 |
| **gp_analysis_dashboard.html** | Gross profit analysis dashboard | 2025-07-13 |
| **tier-visibility-manager.html** | Manage subscription tier visibility | 2025-06-27 |
| **admin-phone-mapping.html** | Map admin phone numbers | 2025-07-09 |
| **ocean_basket_roi_calculator.html** | ROI calculator tool | 2025-06-18 |

---

## 🟡 Development/Debugging Tools (Move to `/tools/dev`)

Tools used for development, debugging, and diagnostics:

### Authentication & Access
- **admin-verification-test.html** - Test admin verification flow (2025-07-02)
- **check-user-auth.html** - Check user authentication status (2025-06-18)
- **debug-auth-session.html** - Debug authentication sessions (2025-07-10)
- **test-auth-status.html** - Test authentication status (2025-06-18)
- **test-booking-access.html** - Test booking access permissions (2025-07-19)

### Tier & Subscription Testing
- **check-tier-features.html** - Check tier feature availability (2025-06-18)
- **test-tier-access.html** - Test tier access controls (2025-06-18)
- **test-tier-access-v2.html** - Updated tier access tests (2025-06-18)
- **test-tier-management.html** - Test tier management UI (2025-06-18)
- **test-subscription-page.html** - Test subscription page (2025-06-18)
- **test-subscription-fix.html** - Test subscription fixes (2025-07-16)
- **test-table-visibility.html** - Test table visibility rules (2025-06-18)

### Analytics Testing
- **test-analytics-admin.html** - Test admin analytics (2025-06-18)
- **test-analytics-simple.html** - Simple analytics test (2025-06-16)
- **test-analytics-with-sales.html** - Analytics with sales data (2025-06-18)
- **test-food-cost-analytics.html** - Food cost analytics test (2025-06-18)
- **verify-analytics.html** - Verify analytics functionality (2025-06-18)

### Food Cost Module
- **food-cost-test.html** - Food cost module test (2025-06-18)
- **test-food-cost-tables.html** - Test food cost tables (2025-06-18)
- **allocate-stock-to-locations.html** - Stock allocation tool (2025-06-18)
- **check-stock-data.html** - Check stock data integrity (2025-06-18)
- **generate-test-stock-data.html** - Generate test stock data (2025-06-18)

### Purchase Orders
- **test-advanced-purchase-orders.html** - Test advanced PO features (2025-06-20)
- **test-enhanced-purchase-order.html** - Test enhanced PO (2025-06-20)
- **test-purchase-order-fix.html** - Test PO fixes (2025-06-20)
- **purchase-order-workflow-diagnostic.html** - PO workflow diagnostics (2025-06-20)

### Firebase & Database
- **test-firebase-v9.html** - Test Firebase v9 SDK (2025-06-20)
- **test-firebase-rules.html** - Test Firebase security rules (2025-06-18)
- **test-firebase-paths.html** - Test Firebase data paths (2025-06-18)
- **firebase-performance-monitor.html** - Monitor Firebase performance (2025-09-04)

### Location & Navigation
- **test-locations.html** - Test location resolution (2025-06-18)
- **quick-location-diagnostic.html** - Quick location diagnostics (2025-06-20)
- **test-wms-navigation-fix.html** - Test WMS navigation fix (2025-07-19)

### Phone Number Management
- **test-phone-protection.html** - Test phone protection rules (2025-07-12)
- **fix-phone-numbers.html** - Phone number fixing utility (2025-07-12)

---

## 🔴 One-Time Migration/Fix Scripts (Archive)

Scripts that were created to fix specific issues or migrate data. Should be archived for reference but not actively maintained:

### Data Integrity & Migration
- **database-structure-migration.html** - Database schema migration (2025-06-20)
- **repair-data-integrity.html** - Data integrity repair tool (2025-06-20)
- **fix-guest-name-consistency.html** - Fix guest name issues (2025-07-09)
- **fix-user-roles.html** - Fix user role assignments (2025-06-18)
- **cleanup-orphaned-rewards.html** - Clean up orphaned rewards (2025-07-02)

### Tier Setup
- **initialize-subscription-tiers.html** - Initial tier setup (2025-06-27)
- **tier-standardization-tool.html** - Standardize tier data (2025-07-20)

### Admin Setup
- **admin-setup.html** - Admin account setup (2025-02-17)
- **setup-admin.html** - Another admin setup tool (2025-06-18)
- **temp-setup.html** - Temporary setup script (2025-02-17)

---

## Summary Statistics

| Category | Count | Recommendation |
|----------|-------|----------------|
| **Production** | 7 | Move to `/tools/admin` |
| **Development** | 32 | Move to `/tools/dev` |
| **Migration/Archive** | 13 | Archive or delete |
| **Total** | 52 | Restructure |

---

## Recommended Actions

### Immediate (This Week)

1. **Create directory structure**:
   ```
   tools/
   ├── admin/          # Production admin tools
   ├── dev/            # Development tools
   └── archive/        # One-time scripts
   ```

2. **Move production tools** to `tools/admin/`
   - These are actively used and should be easily accessible

3. **Move dev tools** to `tools/dev/`
   - Clearly separate from production tools
   - Consider adding authentication to prevent production access

4. **Archive migration scripts** to `tools/archive/`
   - Keep for reference but mark as deprecated
   - Consider deleting after 6 months if not needed

### Short-Term (This Month)

1. **Consolidate duplicate tools**:
   - Multiple analytics test pages → Single analytics test suite
   - Multiple tier access tests → Unified tier testing tool
   - Multiple admin setup pages → Single setup wizard

2. **Add tool documentation**:
   - Create README.md in each tools directory
   - Document purpose and usage of each tool
   - Add last-used dates

3. **Implement access control**:
   - Production tools: Require admin authentication
   - Dev tools: Only accessible in development environment
   - Archive: Read-only or require special flag to access

### Long-Term (Next Quarter)

1. **Build unified admin panel**:
   - Single dashboard with tabs/sections
   - Replace standalone HTML files with integrated features
   - Better user experience for admins

2. **Automate testing**:
   - Convert test tools to automated test suites
   - Integrate with CI/CD pipeline
   - Remove need for manual test tools

---

## Migration Checklist

- [ ] Create `/tools` directory structure
- [ ] Move 7 production tools to `/tools/admin`
- [ ] Move 32 dev tools to `/tools/dev`
- [ ] Move 13 migration scripts to `/tools/archive`
- [ ] Update navigation/links to new locations
- [ ] Create README.md for each tools directory
- [ ] Add deprecation notices to archived tools
- [ ] Test all production tools in new location
- [ ] Update deployment configuration if needed
- [ ] Document new tools organization in main docs

---

**Last Updated**: 2025-12-15
**Status**: Draft - Pending Review
