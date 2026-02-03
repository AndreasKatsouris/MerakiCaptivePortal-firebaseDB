# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Meraki Captive Portal application built with Firebase (hosting, functions, real-time database, Firestore) that provides WiFi authentication and a comprehensive business management platform. The application includes guest management, queue management, food cost analytics, receipt processing, WhatsApp integration, and a tiered access control system.

## Architecture

### Frontend Structure
- **HTML Pages**: Located in `PUBLIC/` directory - static pages for different user interfaces
- **JavaScript Modules**: Located in `PUBLIC/js/modules/` - modular ES6 system with feature-specific modules
- **Core Services**: Located in `PUBLIC/js/` - authentication, configuration, and utility services
- **CSS**: Located in `PUBLIC/css/` - styling for all components

### Backend Structure  
- **Firebase Functions**: Located in `functions/` directory - Node.js serverless functions
- **Database**: Uses both Firebase Realtime Database and Firestore
- **WhatsApp Integration**: Twilio-based messaging system for guest communication
- **Receipt Processing**: Google Vision API for OCR and automated data extraction

### Key Modules

#### Access Control System (`js/modules/access-control/`)
- Tiered subscription system (Bronze, Silver, Gold, Platinum)
- Feature gating based on subscription levels
- User management and subscription services
- Location-based access control

#### Food Cost Module (`js/modules/food-cost/`)
- Vue.js-based application for food cost analysis
- Purchase order management
- Historical usage tracking
- Analytics dashboard with charts and forecasting
- Location-based cost tracking

#### Analytics Module (`js/modules/analytics/`)
- Data visualization and reporting
- Integration with food cost analytics
- Chart management and data processing

## Common Development Commands

### Firebase Development
```bash
# Start Firebase emulators for local development
firebase emulators:start

# Deploy to Firebase hosting
firebase deploy --only hosting

# Deploy Firebase functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:functionName

# View Firebase logs
firebase functions:log
```

### Functions Development
```bash
# Navigate to functions directory
cd functions

# Install dependencies
npm install

# Start functions emulator only
npm run serve

# Deploy functions
npm run deploy
```

## Module System

The application uses ES6 modules with dynamic imports. Key patterns:

### Module Loading
- Modules are versioned with query parameters (e.g., `?v=2.1.5-20250606`)
- Use `ensureFirebaseInitialized()` before Firebase operations
- Import modules using relative paths from `js/modules/`

### Feature Guards
```javascript
import { FeatureGuard } from './modules/access-control/components/feature-guard.js';
// Use FeatureGuard.checkAccess(feature, userTier) before showing features
```

### Firebase Configuration
- Firebase config is centralized in `js/config/firebase-config.js`
- Exports both Firebase SDK instances and window globals for non-module scripts
- Uses Firebase v10 with modular SDK

## Database Schema

### Firebase Realtime Database
- **guests/**: Guest information and check-ins
- **locations/**: Location-specific data and settings
- **subscriptions/**: User subscription and tier information
- **receipts/**: Receipt processing and food cost data
- **queue/**: Queue management for different locations

### Firestore
- Used for complex queries and structured data
- WhatsApp message logs and templates
- Analytics and reporting data

## Key File Locations

### Configuration
- `firebase.json`: Firebase project configuration
- `js/config/firebase-config.js`: Firebase SDK initialization
- `functions/config/firebase-admin.js`: Server-side Firebase config

### Main Entry Points
- `index.html`: Main captive portal page
- `admin-dashboard.html`: Admin interface
- `user-dashboard.html`: User management interface
- `food-cost-analytics.html`: Food cost analytics interface

### Core Services
- `functions/index.js`: Main Firebase functions entry point
- `js/auth/auth.js`: Authentication services
- `js/guest-management.js`: Guest data management
- `js/queue-management.js`: Queue system integration

## Development Guidelines

### Testing
- No automated test framework configured
- Manual testing recommended for UI components
- Use Firebase emulators for local testing
- Test functions locally before deployment

### Module Integration
- Always check feature access before displaying UI elements
- Use consistent error handling patterns
- Maintain backward compatibility when updating modules
- Follow the existing versioning pattern for cache busting

### Firebase Functions
- Functions are organized by feature (queue, WhatsApp, receipt processing)
- Use CORS middleware for web client access
- Environment variables should be set via Firebase config
- Regional deployment is configured for us-central1

### Security
- API keys are visible in client-side code (normal for Firebase web apps)
- Authentication required for admin functions
- Location-based data isolation implemented
- Subscription tier validation on both client and server

## WhatsApp Integration

The system includes comprehensive WhatsApp messaging capabilities:
- Template-based messaging system
- Queue notifications and updates
- Guest communication workflows
- Multi-location support with number assignment

## Subscription Tiers

The platform implements a 4-tier system:
- **Bronze**: Basic features
- **Silver**: Enhanced analytics
- **Gold**: Advanced features + queue management
- **Platinum**: Full feature access

Each tier has specific feature access controls implemented throughout the application.