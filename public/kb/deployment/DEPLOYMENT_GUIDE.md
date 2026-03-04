# Deployment Guide

> Sparks Hospitality Platform -- Firebase Deployment Reference

---

## Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Prerequisites](#prerequisites)
3. [Firebase Project Structure](#firebase-project-structure)
4. [Deploying to Production](#deploying-to-production)
5. [Deploying Individual Services](#deploying-individual-services)
6. [Emulator Setup (Local Development)](#emulator-setup-local-development)
7. [Environment Variables](#environment-variables)
8. [CORS Configuration](#cors-configuration)
9. [Caching and Headers](#caching-and-headers)
10. [Post-Deployment Verification](#post-deployment-verification)
11. [Rollback Procedures](#rollback-procedures)
12. [Troubleshooting](#troubleshooting)

---

## Deployment Overview

The Sparks Hospitality platform is deployed entirely on Firebase infrastructure:

| Service | Purpose | Config File |
|---------|---------|-------------|
| **Firebase Hosting** | Static frontend (HTML, JS, CSS) | `firebase.json` -> `hosting` |
| **Cloud Functions** | Backend API (69+ functions) | `functions/index.js` |
| **Realtime Database (RTDB)** | Primary data store | `database.rules.json` |
| **Firestore** | Secondary (currently disabled) | `firestore.rules` |
| **Cloud Storage** | Receipt images, logos | `storage.rules` |
| **Firebase Auth** | User authentication | Managed via Firebase Console |

**Project ID:** `merakicaptiveportal-firebasedb`
**Region:** `us-central1` (Cloud Functions)
**Database URL:** `https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com`

---

## Prerequisites

1. **Node.js 22+** -- Required for Cloud Functions runtime
2. **Firebase CLI** -- Install globally:
   ```bash
   npm install -g firebase-tools
   ```
3. **Authenticated Firebase CLI:**
   ```bash
   firebase login
   ```
4. **Project selected:**
   ```bash
   firebase use merakicaptiveportal-firebasedb
   ```
5. **Functions dependencies installed:**
   ```bash
   cd functions && npm install && cd ..
   ```
6. **Root dependencies installed:**
   ```bash
   npm install
   ```

---

## Firebase Project Structure

```
MerakiCaptivePortal-firebaseDB/
  firebase.json              # All Firebase service configuration
  database.rules.json        # RTDB security rules
  firestore.rules            # Firestore security rules (secondary)
  storage.rules              # Cloud Storage security rules
  functions/
    index.js                 # Main Cloud Functions entry point (69+ exports)
    package.json             # Functions dependencies (Node 22)
    .env                     # Secret environment variables (gitignored)
    .env.template            # Template for required env vars
    config/
      firebase-admin.js      # Admin SDK initialization
    constants/
      campaign.constants.js  # Shared constants
    utils/
      whatsappClient.js      # Twilio WhatsApp client
  public/                    # Firebase Hosting root
    js/
      config/
        firebase-config.js   # Client-side Firebase initialization
      modules/               # Feature modules (ES modules)
      utils/                 # Shared utilities
    css/
    img/
    *.html                   # Page templates
```

---

## Deploying to Production

### Full Deploy (All Services)

```bash
firebase deploy
```

This deploys hosting, functions, database rules, firestore rules, and storage rules simultaneously.

### Recommended: Deploy with a Message

```bash
firebase deploy -m "Description of changes"
```

### Build Frontend First (if using Vite)

The frontend uses Vite for development but is served as static files via Firebase Hosting from the `public/` directory. The Vite build outputs to `dist/`:

```bash
npm run build          # Builds to dist/
```

**Note:** The current `firebase.json` serves directly from `public/`, not `dist/`. If you switch to serving the Vite build output, update `firebase.json`:

```json
{
  "hosting": {
    "public": "dist"
  }
}
```

---

## Deploying Individual Services

### Hosting Only

```bash
firebase deploy --only hosting
```

### Cloud Functions Only

```bash
firebase deploy --only functions
```

### Specific Functions

```bash
firebase deploy --only functions:health,functions:receiveWhatsAppMessage
```

### Database Rules Only

```bash
firebase deploy --only database
```

### Storage Rules Only

```bash
firebase deploy --only storage
```

### Firestore Rules Only

```bash
firebase deploy --only firestore:rules
```

---

## Emulator Setup (Local Development)

The project includes full emulator configuration in `firebase.json`:

| Emulator | Port |
|----------|------|
| Auth | 9099 |
| Functions | 5001 |
| Firestore | 8080 |
| Realtime Database | 9000 |
| Hosting | 5000 |
| Storage | 9199 |
| Emulator UI | Auto-assigned |

### Starting Emulators

```bash
# Start all emulators with data import/export
npm run emulators
# Equivalent to: firebase emulators:start --import=./firebase-export --export-on-exit

# Start emulators without data persistence
firebase emulators:start

# Start only specific emulators
firebase emulators:start --only functions,database

# Export emulator data manually
npm run emulators:export
# Equivalent to: firebase emulators:export ./firebase-export
```

### Emulator Data Persistence

The `--import=./firebase-export --export-on-exit` flags in the npm script ensure that:
- Data from previous sessions is imported on start
- Data is automatically saved when emulators stop
- The `firebase-export/` directory contains the serialized data

### Client-Side Emulator Detection

The client-side Firebase config (`public/js/config/firebase-config.js`) automatically connects to emulators when running on localhost:

```javascript
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    connectDatabaseEmulator(rtdb, 'localhost', 9000);
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

### Vite Dev Server

For frontend development with hot reload:

```bash
npm run dev
# Starts Vite dev server on port 5173
```

**Important:** The Vite dev server (port 5173) is separate from the Firebase Hosting emulator (port 5000). When using Vite for development, the emulator connections still work because the hostname check is `localhost`.

---

## Environment Variables

Cloud Functions environment variables are stored in `functions/.env` (gitignored). Copy from the template:

```bash
cp functions/.env.template functions/.env
```

See [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) for the full list of required variables.

### Firebase Functions Config (Legacy)

Some older functions may use `functions.config()`. The project has migrated to `dotenv` for environment variables. The `.env` file in `functions/` is automatically loaded by Firebase Functions v2.

---

## CORS Configuration

The backend explicitly whitelists these origins in `functions/index.js`:

```javascript
const cors = require('cors')({
    origin: [
        'http://localhost:3000',
        'http://localhost:5000',
        'http://localhost:8000',
        'https://merakicaptiveportal-bda0f.web.app',
        'https://merakicaptiveportal-bda0f.firebaseapp.com',
        'https://merakicaptiveportal-firebasedb.web.app',
        'https://merakicaptiveportal-firebasedb.firebaseapp.com'
    ],
    credentials: true
});
```

**Note:** Some endpoints (like `createTestData`) use `Access-Control-Allow-Origin: *` which is less secure. This should be restricted to the whitelist in production.

---

## Caching and Headers

Firebase Hosting headers are configured in `firebase.json`:

| Resource | Cache-Control | Notes |
|----------|---------------|-------|
| `**/*.js` | `public, max-age=31536000, immutable` | Aggressive caching for JS bundles |
| `js/modules/**/*.js` | `public, max-age=60` | Short cache for feature modules |
| `**/*.mjs` | `public, max-age=31536000, immutable` | ES module files |
| `**/*.css` | `public, max-age=31536000, immutable` | Stylesheets |
| `**/*.html` | `public, max-age=0, must-revalidate` | Always fresh HTML |

**Module headers** include security headers:
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Opener-Policy: same-origin`

### SPA Rewrite Rule

All non-asset requests are rewritten to `index.html` for SPA routing:

```json
{
  "source": "!/(js/**|css/**|img/**|...)",
  "destination": "/index.html"
}
```

---

## Post-Deployment Verification

### 1. Health Check

After deploying functions, verify the health endpoint:

```bash
curl https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/health
```

Expected response:
```json
{
  "status": "ok",
  "database": { "status": "connected" },
  "service": "sparks-hospitality-functions"
}
```

### 2. Hosting Verification

```bash
curl -I https://merakicaptiveportal-firebasedb.web.app
```

### 3. Database Rules Deployment

After deploying rules, test with the Firebase CLI:

```bash
firebase database:rules:get
```

### 4. Functions Listing

```bash
firebase functions:list
```

### 5. Check Function Logs

```bash
firebase functions:log --only health
```

---

## Rollback Procedures

### Hosting Rollback

Firebase Hosting maintains release history. To rollback:

```bash
# List previous releases
firebase hosting:channel:list

# Or use the Firebase Console:
# Console > Hosting > Release History > Rollback
```

### Functions Rollback

There is no built-in rollback for Cloud Functions. Options:

1. **Git-based rollback:** Check out the previous commit and redeploy
   ```bash
   git checkout <previous-commit> -- functions/
   firebase deploy --only functions
   ```
2. **Disable a broken function:** In the Firebase Console, disable the specific function

### Database Rules Rollback

Database rules have no version history in the CLI. Maintain rules in version control:

```bash
git checkout <previous-commit> -- database.rules.json
firebase deploy --only database
```

---

## Troubleshooting

### Functions Deployment Fails

```
Error: Failed to create function ...
```

- Check Node.js version matches `engines.node` in `functions/package.json` (currently `"22"`)
- Ensure all dependencies are installed: `cd functions && npm install`
- Check for syntax errors: `node -c functions/index.js`

### CORS Errors in Production

- Verify the requesting origin is in the CORS whitelist in `functions/index.js`
- Check that preflight `OPTIONS` requests are handled
- For `onCall` functions, CORS is handled automatically by the Firebase SDK

### Emulator Connection Issues

- Ensure no other services are using emulator ports (5000, 5001, 8080, 9000, 9099, 9199)
- Kill stale processes: check for lingering Java processes from previous emulator runs
- Check `firebase-debug.log` for detailed error information

### "Permission Denied" in Production

- Verify `database.rules.json` was deployed: `firebase deploy --only database`
- Check that the user has the correct custom claims (`admin` token)
- Review the specific rule path in the database rules guide

### Function Timeout

- Default timeout for HTTP functions is 60 seconds
- Scheduled functions have separate timeout configuration
- Consider increasing memory allocation for heavy operations (OCR, data processing)
