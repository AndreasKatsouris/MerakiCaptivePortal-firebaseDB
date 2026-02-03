# Admin Tools & Utilities

This directory contains all administrative tools, test utilities, and debugging tools for the Meraki Captive Portal system.

## Directory Structure

### Testing & Debugging Tools
- `test-food-cost-tables.html` - Tests table header visibility and styling in Food Cost module
- `test-table-visibility.html` - Tests table visibility across components and modal overlays
- `test-analytics-admin.html` - Admin analytics testing page
- `test-analytics-with-sales.html` - Sales analytics testing page  
- `test-analytics-simple.html` - Simple analytics verification
- `test-food-cost-analytics.html` - Comprehensive food cost analytics testing
- `test-tier-management.html` - Enhanced user subscription manager testing
- `test-firebase-paths.html` - Firebase database paths testing
- `test-firebase-rules.html` - Firebase security rules testing
- `test-auth-status.html` - Authentication status verification
- `test-locations.html` - Location data testing
- `test-tier-access.html` - Tier access control testing (v1)
- `test-tier-access-v2.html` - Tier access control testing (v2)
- `test-subscription-page.html` - Subscription page functionality testing
- `food-cost-test.html` - Basic food cost functionality testing

### Data Checking & Verification Tools
- `check-stock-data.html` - Stock usage data integrity verification
- `verify-analytics.html` - Food cost analytics features verification
- `check-tier-features.html` - Subscription tier features verification
- `check-user-auth.html` - User authentication and permissions verification

### Data Generation & Management Tools
- `generate-test-stock-data.html` - Realistic stock usage data generator
- `allocate-stock-to-locations.html` - Stock data migration utility
- `ocean_basket_roi_calculator.html` - Ocean Basket campaign ROI calculator
- `../js/modules/food-cost/cost-driver.html` - Cost driver analysis tool (moved to food cost module)

### System Utilities & Fixes
- `fix-user-roles.html` - User role assignment scanner and fixer
- `setup-admin.html` - Initial admin account setup utility
- `admin-setup.html` - Alternative admin account setup tool
- `temp-setup.html` - Temporary development setup utility

### Documentation
- `ANALYTICS_TEST_DATA_GUIDE.md` - Guide for analytics testing data
- `STOCK_ALLOCATION_TOOL_README.md` - Stock allocation tool documentation
- `TIER_MANAGEMENT_TESTING_GUIDE.md` - Tier management testing guide

## Access

### From Admin Dashboard (Recommended)
Access all tools through the Admin Dashboard → Settings → Admin Tools menu item. This opens the tools within the dashboard interface for a seamless experience.

### Direct URL
Navigate directly to `/public/admin_tools/` for the standalone tools index page.

## Integration Features

### Dashboard Integration
- **Embedded Interface**: Admin tools are now seamlessly integrated into the admin dashboard as a section
- **Dynamic Loading**: Tools content is loaded dynamically when the section is accessed
- **Automatic Path Resolution**: All tool links are automatically updated to work from within the dashboard
- **Search Functionality**: Full search capability is preserved within the dashboard integration
- **New Tab Opening**: Individual tools open in new tabs for focused work while maintaining dashboard access

## Usage Guidelines

1. **Testing Tools**: Use these for verifying functionality after code changes
2. **Verification Tools**: Run these to check data integrity and system status
3. **Generation Tools**: Use for creating test data and managing configurations
4. **Utility Tools**: Administrative tools for system maintenance

## Security Note

These tools contain administrative functions and should only be accessed by authorized administrators. Many tools require admin-level authentication to function properly.

## Tool Categories

### 🐛 Testing & Debugging (16 tools)
Tools for testing system functionality and debugging issues

### 🔍 Data Checking & Verification (4 tools)  
Tools for verifying data integrity and system status

### ⚙️ Data Generation & Management (3 tools)
Tools for generating test data and managing configurations

### 🔧 System Utilities & Fixes (4 tools)
Administrative utilities for system maintenance

---

*Last updated: January 2025*
*Total tools in admin_tools: 27*
*Additional tools in modules: 1* 