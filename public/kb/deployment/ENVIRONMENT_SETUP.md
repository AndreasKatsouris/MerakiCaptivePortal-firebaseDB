# Environment Setup

> All environment variables, Firebase project configuration, and third-party API setup for the Sparks Hospitality platform.

---

## Table of Contents

1. [Environment Variables Reference](#environment-variables-reference)
2. [Firebase Project Configuration](#firebase-project-configuration)
3. [Twilio WhatsApp Setup](#twilio-whatsapp-setup)
4. [SendGrid Email Setup](#sendgrid-email-setup)
5. [Google Cloud Vision API Setup](#google-cloud-vision-api-setup)
6. [Client-Side Firebase Config](#client-side-firebase-config)
7. [Security Notes](#security-notes)

---

## Environment Variables Reference

All backend environment variables are stored in `functions/.env` (gitignored). A template is provided at `functions/.env.template`.

### Setup

```bash
cp functions/.env.template functions/.env
# Then edit functions/.env with actual values
```

### Required Variables

| Variable | Purpose | Format / Example |
|----------|---------|------------------|
| `TWILIO_ACCOUNT_SID` | Twilio account identifier | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio authentication token | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_PHONE_NUMBER` | WhatsApp-enabled Twilio number | `+1234567890` or `whatsapp:+1234567890` |
| `FIREBASE_PROJECT_ID` | Firebase project identifier | `merakicaptiveportal-firebasedb` |
| `FIREBASE_PRIVATE_KEY` | Service account private key | PEM-formatted key (newlines as `\n`) |
| `FIREBASE_CLIENT_EMAIL` | Service account email | `firebase-adminsdk-xxxxx@project.iam.gserviceaccount.com` |
| `SENDGRID_API_KEY` | SendGrid API key for email | `SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

### Optional Variables

| Variable | Purpose | Default | Format / Example |
|----------|---------|---------|------------------|
| `USE_TWILIO_TEMPLATES` | Use Twilio Content Templates instead of formatted messages | `false` | `true` or `false` |
| `TWILIO_CONTENT_SID_BOOKING_CONFIRMATION` | ContentSid for booking confirmation template | None | `HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_CONTENT_SID_BOOKING_STATUS` | ContentSid for booking status update template | None | `HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_CONTENT_SID_BOOKING_REMINDER` | ContentSid for booking reminder template | None | `HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_CONTENT_SID_RECEIPT` | ContentSid for receipt confirmation template | None | `HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_CONTENT_SID_WELCOME` | ContentSid for welcome message template | None | `HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_MESSAGING_SERVICE_SID` | Messaging Service for better delivery rates | None | `MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

### Variable Loading

Cloud Functions v2 automatically loads `functions/.env` via the `dotenv` package (declared in `functions/package.json`). The variables are available via `process.env.VARIABLE_NAME` throughout the functions codebase.

---

## Firebase Project Configuration

### Project Details

| Property | Value |
|----------|-------|
| Project ID | `merakicaptiveportal-firebasedb` |
| Database URL | `https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com` |
| Auth Domain | `merakicaptiveportal-firebasedb.firebaseapp.com` |
| Storage Bucket | `merakicaptiveportal-firebasedb.appspot.com` |
| Functions Region | `us-central1` |
| Hosting URLs | `merakicaptiveportal-firebasedb.web.app` and `.firebaseapp.com` |

### Firebase Admin SDK Initialization

The Admin SDK is initialized in `functions/index.js`:

```javascript
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}
```

It uses Application Default Credentials (ADC), which:
- In production: Uses the Cloud Functions service account automatically
- In emulators: Uses the emulator's built-in credentials
- For tests: Uses `FIREBASE_PRIVATE_KEY` and `FIREBASE_CLIENT_EMAIL` from environment

### Firebase Console Access

- **Console URL:** https://console.firebase.google.com/project/merakicaptiveportal-firebasedb
- **GCP Console:** https://console.cloud.google.com/home/dashboard?project=merakicaptiveportal-firebasedb

### Service Account

For local testing and CI/CD, a service account JSON key is needed:

1. Go to Firebase Console > Project Settings > Service accounts
2. Click "Generate new private key"
3. Save as `serviceAccountKey.json` (add to `.gitignore`)
4. Set environment variables from the JSON:
   - `FIREBASE_PROJECT_ID` = `project_id`
   - `FIREBASE_CLIENT_EMAIL` = `client_email`
   - `FIREBASE_PRIVATE_KEY` = `private_key` (with literal `\n` for newlines)

---

## Twilio WhatsApp Setup

### Account Setup

1. Create a Twilio account at https://www.twilio.com
2. Navigate to **Messaging > Try it Out > Send a WhatsApp message**
3. Follow the sandbox setup for development
4. For production, apply for a dedicated WhatsApp Business number

### Required Configuration

Set these in `functions/.env`:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=whatsapp:+14155238886   # Sandbox number or production number
```

### WhatsApp Webhook

The webhook URL for incoming WhatsApp messages must be configured in the Twilio Console:

```
https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/receiveWhatsAppMessage
```

This is handled by `functions/receiveWhatsappMessageEnhanced.js` which processes:
- Receipt image submissions (via Google Cloud Vision OCR)
- Menu/command interactions
- Booking inquiries
- Queue status requests

### Content Templates (Optional)

For production WhatsApp messages, Twilio Content Templates are recommended for reliability. See `functions/.env.template` for the full list of template ContentSid variables and the exact template bodies to create in the Twilio Console.

Setup steps:
1. Go to Twilio Console > Messaging > Content Template Builder
2. Create templates using the bodies in `.env.template`
3. Submit for WhatsApp approval (24-48 hours)
4. Get ContentSid values from approved templates
5. Update `.env` with ContentSid values
6. Set `USE_TWILIO_TEMPLATES=true`

### SDK Version

The project uses Twilio SDK v5.3.5 (functions) / v5.3.6 (root). These are in `functions/package.json` and `package.json` respectively.

---

## SendGrid Email Setup

### Account Setup

1. Create a SendGrid account at https://sendgrid.com
2. Go to **Settings > API Keys > Create API Key**
3. Give it "Full Access" or at minimum "Mail Send" permission

### Configuration

```bash
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### SDK Version

Uses `@sendgrid/client` v8.1.6 in `functions/package.json`.

### Usage in Codebase

SendGrid is used for:
- Guest data sync to SendGrid contacts (via `guestSync.js`)
- Email marketing campaigns
- Transactional emails

The client is initialized in `functions/sendgridClient.js`.

---

## Google Cloud Vision API Setup

### Enabling the API

1. Go to GCP Console > APIs & Services > Library
2. Search for "Cloud Vision API"
3. Click "Enable" for the project `merakicaptiveportal-firebasedb`

### Authentication

The Vision API uses the same Application Default Credentials as the Firebase Admin SDK. No separate API key is needed when running within Cloud Functions.

For local development with emulators, you may need to:

```bash
# Option 1: Use gcloud CLI
gcloud auth application-default login

# Option 2: Set service account key
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
```

### SDK Version

Uses `@google-cloud/vision` v4.3.2 in both `package.json` and `functions/package.json`.

### Usage in Codebase

The Vision API is used in `functions/receiptProcessor.js` for OCR processing of receipt images submitted via WhatsApp. It extracts text from receipt photos, which is then parsed by `functions/templateBasedExtraction.js` to identify brand, store, items, and total amount.

---

## Client-Side Firebase Config

The client-side Firebase configuration lives in `public/js/config/firebase-config.js`. This file contains the public Firebase config object:

```javascript
const firebaseConfig = {
    apiKey: "...",
    authDomain: "merakicaptiveportal-firebasedb.firebaseapp.com",
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    projectId: "merakicaptiveportal-firebasedb",
    storageBucket: "merakicaptiveportal-firebasedb.appspot.com",
    messagingSenderId: "...",
    appId: "...",
    measurementId: "..."
};
```

**Note:** These values are public by design (Firebase client SDKs require them to be embedded in client code). Security is enforced through:
- Firebase Auth (authentication)
- Security rules (authorization)
- App Check (optional, for abuse prevention)

### Firebase SDK Version

The client loads Firebase SDK v10.12.5 from the Google CDN:

```javascript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
```

### Global Exports

The Firebase config exports all initialized services and RTDB helpers to both ES module scope and `window.firebaseExports` for compatibility with non-module scripts.

---

## Security Notes

### What Must Never Be Committed

| File/Value | Why |
|------------|-----|
| `functions/.env` | Contains Twilio, SendGrid, and Firebase private keys |
| `serviceAccountKey.json` | Full admin access to Firebase project |
| `TWILIO_AUTH_TOKEN` | Can send messages and incur charges |
| `SENDGRID_API_KEY` | Can send emails on behalf of the account |
| `FIREBASE_PRIVATE_KEY` | Full admin access to all Firebase services |

### What Is Safe to Commit

| File/Value | Why |
|------------|-----|
| `functions/.env.template` | Contains only placeholder values |
| `firebase.json` | Public configuration, no secrets |
| `public/js/config/firebase-config.js` | Client-side config is public by design |
| `database.rules.json` | Security rules are enforced server-side |

### .gitignore Coverage

The root `.gitignore` includes `.env` to prevent accidental commits. The `functions/.gitignore` also ignores `.env` files. Verify these entries exist before committing:

```
# In root .gitignore
.env

# In functions/.gitignore (should include)
.env
.env.local
```
