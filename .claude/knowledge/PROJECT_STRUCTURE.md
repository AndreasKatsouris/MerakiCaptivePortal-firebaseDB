# Project Structure Documentation
**Meraki Captive Portal with Firebase DB**

> [!WARNING]
> **STALE — last updated 2026-02-05.** Do not use as source of truth. This predates the Vue 3 selective migration, sales-forecasting module, Hi-Fi design system, and v2 surfaces. The tier names (Free/Pro/Enterprise) listed below are also out of date.
>
> **Canonical sources:**
> - Project overview + key paths + KB index: `/CLAUDE.md` (repo root)
> - Full knowledge base: `/KNOWLEDGE BASE/README.md`
>
> Kept here for historical reference only.

> **Purpose (original)**: This document outlines the canonical structure of the MerakiCaptivePortal-firebaseDB project. It should be maintained throughout the project's lifecycle to help developers and AI agents understand the codebase organization without extensive exploration.

> [!IMPORTANT]
> This document should be updated whenever significant structural changes are made to the project, such as adding new modules, reorganizing directories, or deprecating features.

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Root Directory Structure](#root-directory-structure)
3. [Frontend Architecture (`/public`)](#frontend-architecture-public)
4. [Backend Architecture (`/functions`)](#backend-architecture-functions)
5. [Documentation (`/docs`)](#documentation-docs)
6. [Development & Testing](#development--testing)
7. [Configuration Files](#configuration-files)
8. [Key Conventions](#key-conventions)

---

## Project Overview

This is a Firebase-hosted web application that provides:
- **Meraki WiFi Captive Portal** integration
- **Multi-tenant Restaurant Management System** with:
  - Guest management and loyalty programs
  - Queue management system (QMS)
  - Receipt processing and food cost analytics
  - WhatsApp integration for guest communication
  - Booking management
  - Campaign management (SendGrid integration)
- **Admin Dashboard** with comprehensive management tools
- **User Dashboard** for restaurant owners/managers
- **Tiered subscription system** (Free, Pro, Enterprise)

**Technology Stack**:
- Frontend: Vanilla HTML/CSS/JavaScript (modular architecture)
- Backend: Firebase Cloud Functions (Node.js)
- Database: Firebase Realtime Database + Firestore
- External APIs: Twilio (WhatsApp), SendGrid (Email), Meraki, Google Reviews

---

## Root Directory Structure

```
MerakiCaptivePortal-firebaseDB/
├── .agent-system/          # Agent development artifacts
├── .claude/                # Claude AI artifacts
├── .cursor/                # Cursor IDE configuration
├── .firebase/              # Firebase deployment cache
├── .github/                # GitHub workflows and CI/CD
├── .vscode/                # VS Code workspace settings
├── docs/                   # Comprehensive project documentation
├── documents/              # Project planning documents
├── extensions/             # Firebase extensions configuration
├── fixes/                  # Bug fix scripts and patches
├── functions/              # Firebase Cloud Functions (backend)
├── MULTI-AGENT/            # Multi-agent system development
├── public/                 # Frontend web application
├── scripts/                # Utility scripts
├── tests/                  # Test suites
├── .env                    # Environment variables (gitignored)
├── .env.template           # Environment variables template
├── database.rules.json     # Realtime Database security rules
├── eslint.config.js        # ESLint configuration
├── firebase.json           # Firebase project configuration
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Firestore indexes
├── package.json            # Root package dependencies
├── README.md               # Project README
└── storage.rules           # Firebase Storage security rules
```

---

## Frontend Architecture (`/public`)

The frontend is organized as a **modular, multi-page application** using vanilla JavaScript with a clear separation of concerns.

### Directory Structure

```
public/
├── css/                    # Stylesheets (organized by feature)
│   ├── admin-dashboard.css
│   ├── user-dashboard.css
│   ├── food-cost-analytics.css
│   ├── queue-management.css
│   └── ... (feature-specific styles)
├── js/                     # JavaScript modules and logic
│   ├── modules/            # Modular feature implementations
│   │   ├── access-control/      # Tier-based access control
│   │   ├── analytics/           # Analytics modules
│   │   ├── food-cost/           # Food cost analytics (70 files)
│   │   ├── receipts/            # Receipt processing
│   │   └── wifi/                # WiFi captive portal
│   ├── admin/              # Admin-specific logic
│   ├── auth/               # Authentication modules
│   ├── campaigns/          # Campaign management
│   ├── config/             # Frontend configuration
│   ├── services/           # Service layer abstractions
│   ├── shared/             # Shared utilities across features
│   ├── utils/              # Utility functions
│   ├── admin-dashboard.js  # Main admin dashboard controller
│   ├── user-dashboard.js   # Main user dashboard controller
│   ├── queue-management.js # Queue management controller
│   ├── guest-management.js # Guest management controller
│   ├── receipt-management.js # Receipt management controller
│   ├── reward-management.js  # Reward system controller
│   └── utils.js            # Global utilities (246KB - consider refactoring)
├── tools/                  # Admin and developer tools
│   ├── admin/              # Admin-only tools
│   ├── dev/                # Developer utilities (36 tools)
│   └── archive/            # Archived/deprecated tools
├── components/             # Reusable UI components
├── img/                    # Images and assets
├── fonts/                  # Web fonts
├── webfonts/               # FontAwesome webfonts
├── lib/                    # Third-party libraries
├── backup/                 # Backup files
├── *.html                  # HTML pages
│   ├── index.html               # Landing/captive portal
│   ├── admin-dashboard.html     # Admin dashboard (261KB)
│   ├── user-dashboard.html      # User dashboard
│   ├── admin-login.html         # Admin authentication
│   ├── user-login.html          # User authentication
│   ├── signup.html              # User registration
│   ├── queue-management.html    # Queue management interface
│   ├── receipt-settings.html    # Receipt template settings
│   ├── food-cost-analytics.html # Food cost analytics
│   ├── campaigns.html           # Campaign management
│   ├── guest-insights.html      # Guest analytics
│   ├── analytics.html           # General analytics
│   ├── wifi-login.html          # WiFi captive portal login
│   └── ... (other pages)
├── service-worker.js       # PWA service worker
└── manifest.json           # PWA manifest
```

### Frontend Architecture Patterns

- **Page Controllers**: Large dashboard files (e.g., `admin-dashboard.js`) act as orchestrators
- **Modular Features**: Complex features like food-cost analytics are broken into sub-modules
- **Shared Utilities**: Common functions in `utils/` directory
- **Component-Based UI**: Reusable components in `/components`
- **Service Layer**: API interactions abstracted in `/services`
- **Access Control**: Tier-based feature gating in `/modules/access-control`

> [!WARNING]
> The `utils.js` file is 246KB and should be considered for refactoring into smaller, focused modules.

---

## Backend Architecture (`/functions`)

Firebase Cloud Functions provide the serverless backend.

### Directory Structure

```
functions/
├── config/                 # Backend configuration
├── constants/              # Constants and enums
├── consent/                # GDPR/consent management
├── utils/                  # Backend utilities
│   ├── database-schema.js
│   ├── firebaseConfig.js
│   ├── templateManager.js
│   ├── timezoneUtils.js
│   ├── whatsappClient.js
│   ├── whatsappDatabaseSchema.js
│   └── whatsappTemplates.js
├── index.js                # Main Cloud Functions entry (107KB)
├── dataManagement.js       # Data CRUD operations
├── guardRail.js            # Security and validation
├── menuLogic.js            # Menu processing (74KB)
├── queueManagement.js      # Queue system backend
├── queueService.js         # Queue service layer
├── queueWhatsAppIntegration.js  # WhatsApp + Queue integration
├── queueAnalytics.js       # Queue analytics
├── queueCache.js           # Queue caching layer
├── receiptProcessor.js     # Receipt OCR and processing (60KB)
├── receiptTemplateManager.js    # Receipt template management
├── templateBasedExtraction.js   # Template-based data extraction
├── rewardsProcessor.js     # Loyalty rewards logic
├── voucherService.js       # Voucher management
├── guestSync.js            # Guest data synchronization
├── whatsappManagement.js   # WhatsApp message handling
├── receiveWhatsappMessage.js            # WhatsApp webhook handler (49KB)
├── receiveWhatsappMessageEnhanced.js    # Enhanced WhatsApp handler (55KB)
├── sendgridClient.js       # SendGrid email integration
├── twilioClient.js         # Twilio client configuration
├── .env                    # Functions environment variables
├── package.json            # Functions dependencies
└── ... (test and repair scripts)
```

### Key Backend Modules

| Module | Purpose | Size | Notes |
|--------|---------|------|-------|
| `index.js` | Main Cloud Functions entry point | 107KB | Exports all HTTP/schedule functions |
| `menuLogic.js` | Menu processing and business logic | 74KB | Consider refactoring |
| `receiptProcessor.js` | Receipt OCR and data extraction | 60KB | Core feature |
| `receiveWhatsappMessageEnhanced.js` | WhatsApp bot intelligence | 55KB | Active development |
| `queueManagement.js` | Queue system backend | 36KB | Integrated with WhatsApp |
| `guardRail.js` | Security validation layer | 25KB | Critical for data integrity |

### Cloud Functions Overview

The `index.js` exports multiple HTTP-triggered and scheduled Cloud Functions:
- Receipt processing endpoints
- WhatsApp webhook handlers
- Queue management APIs
- Guest sync scheduled jobs
- Data migration utilities
- Admin tool endpoints

> [!TIP]
> Use `firebase functions:log` to debug Cloud Functions in production.

---

## Documentation (`/docs`)

Comprehensive documentation organized by topic.

### Structure

```
docs/
├── README.md                    # Documentation index
├── architecture/                # System architecture docs
├── api/                         # API documentation
├── deployment/                  # Deployment guides
├── development/                 # Developer guides
├── features/                    # Feature documentation
├── updates/                     # Release notes and updates
├── ACCESS-TIER-SYSTEM.md        # Subscription tier documentation
├── ADMIN_TOOLS_README.md        # Admin tools guide
├── ANALYTICS_MODULE_README.md   # Analytics documentation
├── BOOKING_SYSTEM_GUIDE.md      # Booking system guide
├── FOOD_COST_MODULE_README.md   # Food cost analytics (41KB)
├── MODULE_INTEGRATION_SOP.md    # Module integration standards
├── RECEIPT_SETTINGS_*.md        # Receipt settings documentation (4 docs)
├── WHATSAPP_BOT_SOP.md          # WhatsApp bot operations (33KB)
├── WHATSAPP_TEMPLATES.md        # WhatsApp template reference
└── ... (50+ documentation files)
```

### Key Documentation Files

| Document | Purpose |
|----------|---------|
| `ACCESS-TIER-SYSTEM.md` | Explains Free/Pro/Enterprise tier system |
| `ADMIN_TOOLS_README.md` | Guide to admin tools in `/public/tools` |
| `BOOKING_SYSTEM_GUIDE.md` | Booking management feature overview |
| `FOOD_COST_MODULE_README.md` | Comprehensive food cost analytics guide |
| `MODULE_INTEGRATION_SOP.md` | Standards for adding new modules |
| `WHATSAPP_BOT_SOP.md` | WhatsApp bot setup and operations |
| `DATABASE_MIGRATION_GUIDE.md` | Database schema migration procedures |
| `DOM_STRUCTURE_STANDARDS.md` | Frontend DOM standards |

> [!NOTE]
> When adding new features, create corresponding documentation in `/docs/features/` following the MODULE_INTEGRATION_SOP.

---

## Development & Testing

### Directory Overview

```
tests/                      # Test suites (7 test files)
├── ... (unit and integration tests)

public/tools/dev/           # Developer utilities (36 tools)
├── ... (debugging and testing tools)

scripts/                    # Utility scripts
├── ... (automation scripts)

fixes/                      # Bug fix scripts (6 scripts)
├── ... (migration and repair scripts)

.vscode/                    # VS Code configuration
├── settings.json
└── extensions.json
```

### Testing Strategy

- **Frontend Testing**: Manual testing using dev tools in `/public/tools/dev/`
- **Backend Testing**: Test scripts in `/functions/test-*.js`
- **Integration Testing**: Guidelines in `/docs/integration-test-plan.md`
- **Manual QA**: Protocols in `/docs/QMS_MANUAL_TESTING_PROTOCOLS.md`

### Code Quality Tools

- **ESLint**: Configured in `eslint.config.js`
- **Prettier**: Configured in `.prettierrc.json`
- **Git Hooks**: (To be implemented)

---

## Configuration Files

### Environment Variables

| File | Location | Purpose |
|------|----------|---------|
| `.env.template` | Root | Template for root environment variables |
| `.env` | Root | Root environment variables (gitignored) |
| `functions/.env.template` | Functions | Template for Cloud Functions env vars |
| `functions/.env` | Functions | Cloud Functions environment variables (gitignored) |

> [!CAUTION]
> Never commit `.env` files. Always use `.env.template` as reference.

### Firebase Configuration

| File | Purpose |
|------|---------|
| `firebase.json` | Firebase hosting, functions, and service configuration |
| `firestore.rules` | Firestore security rules |
| `firestore.indexes.json` | Firestore composite indexes |
| `database.rules.json` | Realtime Database security rules |
| `storage.rules` | Firebase Storage security rules |
| `.firebaserc` | Firebase project aliases |
| `remoteconfig.template.json` | Firebase Remote Config template |

### Build & Package

| File | Purpose |
|------|---------|
| `package.json` | Root dependencies (build tools, linting) |
| `functions/package.json` | Cloud Functions dependencies |
| `eslint.config.js` | ESLint configuration |
| `.prettierrc.json` | Prettier code formatting |
| `jsconfig.json` | JavaScript project settings |
| `.gitignore` | Git ignore patterns |

---

## Key Conventions

### Naming Conventions

- **Files**: `kebab-case.js` for modules, `PascalCase.js` for classes
- **Functions**: `camelCase` for functions and variables
- **Database Paths**: `camelCase` for Realtime Database keys
- **CSS Classes**: `kebab-case` for CSS classes
- **HTML IDs**: `kebabCase` or `camelCase` for element IDs (ensure uniqueness)

### Module Organization

1. **Feature-based organization**: Group related files by feature (e.g., `/modules/food-cost/`)
2. **Shared utilities**: Common code in `/utils/` or `/shared/`
3. **Service abstraction**: API calls through service layer
4. **Access control**: Feature gating through `/modules/access-control/`

### Code Standards

- **DOM Standards**: Follow `/docs/DOM_STRUCTURE_STANDARDS.md`
- **Module Integration**: Follow `/docs/MODULE_INTEGRATION_SOP.md`
- **API Design**: Follow `/docs/api/` documentation
- **Testing**: Follow QMS testing protocols in `/docs/`

### Database Schema

- **Schema Reference**: `functions/utils/database-schema.js`
- **WhatsApp Schema**: `functions/utils/whatsappDatabaseSchema.js`
- **Migration Guide**: `/docs/DATABASE_MIGRATION_GUIDE.md`

> [!IMPORTANT]
> When modifying database structure, always update schema documentation and create migration scripts in `/fixes/`.

---

## Feature Modules

### Major Features

| Feature | Frontend | Backend | Documentation |
|---------|----------|---------|---------------|
| **Queue Management** | `/js/queue-management.js`<br>`/queue-management.html` | `/functions/queueManagement.js`<br>`/functions/queueService.js` | `/docs/queue-system-architecture.md` |
| **Food Cost Analytics** | `/js/modules/food-cost/*` (70 files)<br>`/food-cost-analytics.html` | `/functions/receiptProcessor.js`<br>`/functions/templateBasedExtraction.js` | `/docs/FOOD_COST_MODULE_README.md` |
| **WhatsApp Bot** | `/js/modules/whatsapp-message-history.js` | `/functions/receiveWhatsappMessageEnhanced.js`<br>`/functions/whatsappManagement.js` | `/docs/WHATSAPP_BOT_SOP.md` |
| **Receipt Settings** | `/js/modules/receipt-settings.js`<br>`/receipt-settings.html` | `/functions/receiptTemplateManager.js` | `/docs/RECEIPT_SETTINGS_COMPLETE_IMPLEMENTATION.md` |
| **Booking System** | `/js/modules/booking-management.js` | Queue management backend | `/docs/BOOKING_SYSTEM_GUIDE.md` |
| **Guest Management** | `/js/guest-management.js` | `/functions/guestSync.js` | User management docs |
| **Rewards/Loyalty** | `/js/reward-management.js` | `/functions/rewardsProcessor.js` | Rewards documentation |
| **Campaigns** | `/js/campaigns/*`<br>`/campaigns.html` | `/functions/sendgridClient.js` | SendGrid integration docs |
| **Access Control** | `/js/modules/access-control/*` | Tiers in database | `/docs/ACCESS-TIER-SYSTEM.md` |

---

## Migration & Maintenance

### Active Development Areas

Based on conversation history, these areas are under active development:

- ✅ **Admin Analytics Removal**: Cleaned up incomplete analytics
- 🔄 **User Dashboard V2**: Migration planning
- ✅ **Sidebar Menu Toggle**: Fixed collapse behavior
- ✅ **WhatsApp History Display**: Guest name fixes
- ✅ **Template Editor**: 3-step editing flow
- 🔄 **Sales Forecasting Module**: Planned for admin tools

### Deprecated/Archive

- `/public/tools/archive/`: Deprecated admin tools (15 items)
- `/public/backup/`: Backup HTML files
- Old receipt processing versions (replaced by enhanced versions)

### Cleanup Opportunities

> [!TIP]
> Consider these refactoring opportunities:
> - **Large Files**: `utils.js` (246KB), `admin-dashboard.js` (164KB), `admin-dashboard.html` (261KB)
> - **Consolidation**: Multiple WhatsApp message handlers (consider deprecating older versions)
> - **Documentation**: Some fix documentation could be moved to `/docs/updates/`

---

## Quick Reference

### Adding a New Feature

1. **Plan**: Create implementation plan following `/docs/MODULE_INTEGRATION_SOP.md`
2. **Frontend**:
   - Create module in `/public/js/modules/[feature-name]/`
   - Add HTML page if needed in `/public/[feature-name].html`
   - Add styles in `/public/css/[feature-name].css`
3. **Backend**:
   - Add Cloud Function in `/functions/[feature-name].js`
   - Export function in `/functions/index.js`
   - Update schema if needed
4. **Documentation**:
   - Create `/docs/[FEATURE_NAME]_README.md`
   - Update this PROJECT_STRUCTURE.md
5. **Testing**: Create test suite and manual testing protocol
6. **Access Control**: Add tier restrictions if applicable

### Common Development Tasks

| Task | Location | Command/Tool |
|------|----------|--------------|
| Deploy frontend | Root | `firebase deploy --only hosting` |
| Deploy functions | Root | `firebase deploy --only functions` |
| Test locally | Root | `firebase serve` |
| View logs | Root | `firebase functions:log` |
| Run tests | `/tests` | (Add test runner) |
| Format code | Root | `npm run format` |
| Lint code | Root | `npm run lint` |

---

## Contribution Guidelines

When working on this project:

1. **Always check this document first** to understand where code should live
2. **Follow the established patterns** in similar features
3. **Update documentation** when making structural changes
4. **Create migration scripts** for database schema changes in `/fixes/`
5. **Test thoroughly** using the protocols in `/docs/`
6. **Update this PROJECT_STRUCTURE.md** when adding/removing major components

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-28 | 1.0.0 | Initial project structure documentation |
| 2026-01-22 | 1.0.1 | Synced all documentation to agent knowledge base |

---

**Last Updated**: 2026-01-22  
**Maintained By**: Project Team  
**Next Review**: When significant structural changes occur
