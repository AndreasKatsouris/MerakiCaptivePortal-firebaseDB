# Getting Started

> Local development setup for the Sparks Hospitality platform.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Clone and Install](#clone-and-install)
3. [Environment Configuration](#environment-configuration)
4. [Running Locally](#running-locally)
5. [Seed Data](#seed-data)
6. [Development Workflow](#development-workflow)
7. [Project Structure](#project-structure)
8. [Common Development Tasks](#common-development-tasks)

---

## Prerequisites

### Required Software

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 22+ | Runtime for Cloud Functions and build tools |
| **npm** | 10+ | Package manager (ships with Node.js) |
| **Firebase CLI** | Latest | Deploy and emulate Firebase services |
| **Git** | 2.x+ | Version control |
| **Java** | 11+ | Required by Firebase emulators (RTDB, Firestore) |

### Installing Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

### Verify Installation

```bash
node --version       # Should be 22.x
npm --version        # Should be 10.x
firebase --version   # Should show firebase-tools version
java -version        # Should be 11+
```

---

## Clone and Install

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_ORG/MerakiCaptivePortal-firebaseDB.git
cd MerakiCaptivePortal-firebaseDB
```

### 2. Install Root Dependencies

```bash
npm install
```

This installs frontend build tools (Vite, Tailwind, ESLint, Prettier) and shared libraries (Firebase client SDK, Chart.js, Bootstrap).

### 3. Install Functions Dependencies

```bash
cd functions
npm install
cd ..
```

This installs backend dependencies (Firebase Admin SDK, Twilio, SendGrid, Google Cloud Vision, Express).

### 4. Select Firebase Project

```bash
firebase use merakicaptiveportal-firebasedb
```

---

## Environment Configuration

### Backend Environment Variables

```bash
cp functions/.env.template functions/.env
```

Edit `functions/.env` with your actual credentials. At minimum for local development:

```bash
# Twilio (required for WhatsApp features)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=whatsapp:+1234567890

# Firebase (required for test scripts)
FIREBASE_PROJECT_ID=merakicaptiveportal-firebasedb
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# SendGrid (required for email features)
SENDGRID_API_KEY=SG.your_key

# Templates (optional, set to false for development)
USE_TWILIO_TEMPLATES=false
```

### Google Cloud Credentials (for Vision API / OCR)

For local receipt OCR testing:

```bash
# Option A: Use gcloud CLI auth
gcloud auth application-default login

# Option B: Set service account key path
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
```

See [ENVIRONMENT_SETUP.md](../deployment/ENVIRONMENT_SETUP.md) for the complete variable reference.

---

## Running Locally

### Option 1: Firebase Emulators (Recommended)

Run the full Firebase stack locally:

```bash
npm run emulators
```

This starts:
- **Auth emulator** on port 9099
- **Functions emulator** on port 5001
- **Firestore emulator** on port 8080
- **RTDB emulator** on port 9000
- **Hosting emulator** on port 5000
- **Storage emulator** on port 9199
- **Emulator UI** on auto-assigned port (shown in terminal)

Data is imported from `firebase-export/` and saved back on exit.

Access the app at: **http://localhost:5000**
Access the Emulator UI at the URL shown in the terminal output.

### Option 2: Vite Dev Server (Frontend Only)

For frontend-only development with hot module replacement:

```bash
npm run dev
```

Starts the Vite dev server on **http://localhost:5173**. The Firebase config auto-detects localhost and connects to emulators if they are running.

### Option 3: Combined (Emulators + Vite)

Run emulators in one terminal and Vite in another:

```bash
# Terminal 1
npm run emulators

# Terminal 2
npm run dev
```

Use the Vite URL (port 5173) for development with HMR, while emulators provide the backend.

### Tailwind CSS (Dashboard V2)

If working on the V2 dashboard design:

```bash
# Build Tailwind CSS once
npm run build-css-v2

# Watch for changes
npm run watch-css-v2
```

---

## Seed Data

### Emulator Data Persistence

The `npm run emulators` command includes `--import=./firebase-export` which loads previously saved emulator data. If this directory does not exist on first run, the emulators start with an empty database.

### Creating Test Users

Use the Emulator UI (Auth tab) to create test users, or use the test scripts:

```bash
# Run the login test which creates a test user if needed
node test-feature-12-login.cjs
```

This creates a user with:
- Email: `testuser.free@sparks.test`
- Password: `Test1234!`
- Subscription: `free` tier, `active` status

### Setting Up Admin Claims

Admin users need custom claims. In the emulator, you can:

1. Create a user in the Auth emulator
2. Call the `setupInitialAdmin` Cloud Function endpoint
3. Or manually set claims via the Firebase Admin SDK in a script

### Minimum Viable Data

For a working local environment, you need:

1. **Auth user** -- Created via emulator UI or test script
2. **User record** in RTDB at `users/{uid}` -- Created by registration flow
3. **Subscription** in RTDB at `subscriptions/{uid}` -- Created by registration flow
4. **At least one location** in RTDB at `locations/{locationId}` -- Created via onboarding
5. **User-location mapping** at `userLocations/{uid}/{locationId}` -- Created with location

---

## Development Workflow

### Branching

The project uses `master` as the main branch. Create feature branches:

```bash
git checkout -b feature/my-feature
```

### Code Style

The project uses ESLint and Prettier for code formatting:

```bash
# Lint all files
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Check formatting
npm run format:check

# Auto-format
npm run format
```

### Pre-commit Hooks

Husky is configured with `lint-staged` to run linting and formatting on staged files before each commit. The hooks are in the `package.json`:

```json
"husky": { "hooks": { "pre-commit": "lint-staged" } }
```

### Running Tests

Tests are standalone `.cjs` files in the project root:

```bash
# Run a specific test
node test-feature-41-guest-crud.cjs

# Run the login test
node test-feature-12-login.cjs
```

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for details.

---

## Project Structure

```
MerakiCaptivePortal-firebaseDB/
  public/                          # Firebase Hosting root (frontend)
    index.html                     # Landing/login page
    user-dashboard.html            # Main user dashboard
    admin-dashboard.html           # Admin dashboard
    queue-management.html          # Queue management page
    food-cost-analytics.html       # Food cost analytics
    sales-forecasting.html         # Sales forecasting module
    campaigns.html                 # Campaign management
    receipt-settings.html          # Receipt template configuration
    js/
      config/
        firebase-config.js         # Firebase client initialization
      modules/
        sales-forecasting/         # Sales forecasting ES module
          index.js
          forecast-engine.js
          sales-data-service.js
          forecast-analytics.js
          chart-config.js
      utils/
        error-handler.js           # Global error handling
        toast.js                   # SweetAlert2 toast notifications
        subscription-validation.js # Subscription data validation
        phone-number-protection.js # Phone number preservation
        admin-activity-monitor.js  # Admin activity tracking
    css/
    img/
  functions/                       # Cloud Functions (backend)
    index.js                       # Main entry point (69+ exports)
    config/
      firebase-admin.js            # Admin SDK setup
    constants/
      campaign.constants.js
    utils/
      whatsappClient.js            # Twilio WhatsApp messaging
    guardRail.js                   # Receipt-to-campaign matching
    receiptProcessor.js            # OCR receipt processing
    templateBasedExtraction.js     # Template-based receipt parsing
    queueManagement.js             # Queue CRUD operations
    queueWhatsAppIntegration.js    # Queue WhatsApp notifications
    queueAnalytics.js              # Queue analytics and cleanup
    queueCache.js                  # Queue performance caching
    subscriptionStatusManager.js   # Subscription expiry management
    whatsappManagement.js          # WhatsApp number management
    voucherService.js              # Voucher redemption logic
    guestSync.js                   # Guest data sync to SendGrid
    sendgridClient.js              # SendGrid email client
    projectManagement.js           # Admin project management
    receiptTemplateManager.js      # Receipt template CRUD
    dataManagement.js              # Data management utilities
    .env                           # Environment variables (gitignored)
    .env.template                  # Environment variable template
  database.rules.json              # RTDB security rules
  storage.rules                    # Cloud Storage security rules
  firestore.rules                  # Firestore security rules
  firebase.json                    # Firebase service configuration
  vite.config.js                   # Vite build configuration
  eslint.config.js                 # ESLint flat config
  package.json                     # Root dependencies and scripts
  test-feature-*.cjs               # Feature verification test scripts
```

---

## Common Development Tasks

### Adding a New Cloud Function

1. Write the function logic in a new file under `functions/`
2. Export it from `functions/index.js`
3. Test with emulators
4. Deploy: `firebase deploy --only functions:yourFunctionName`

### Adding a New Frontend Page

1. Create `public/your-page.html`
2. Include Firebase config: `<script type="module" src="/js/config/firebase-config.js"></script>`
3. Include Bootstrap and SweetAlert2 CDN links
4. Use `window.firebaseExports` for Firebase access in non-module scripts

### Modifying Database Rules

1. Edit `database.rules.json`
2. Test locally: rules are automatically applied in the RTDB emulator
3. Deploy: `firebase deploy --only database`

### Adding a New Database Node

1. Add rules in `database.rules.json` with appropriate read/write/validate rules
2. Add indexes with `.indexOn` for any fields you will query by
3. Test with emulators
4. Deploy rules, then use the node in your code

### Debugging Cloud Functions

```bash
# View live function logs
firebase functions:log

# View logs for a specific function
firebase functions:log --only functionName

# In emulator mode, logs appear directly in the terminal
```
