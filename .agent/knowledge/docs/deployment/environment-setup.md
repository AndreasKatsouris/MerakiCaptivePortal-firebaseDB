# Environment Setup Guide

## Overview

This project uses environment variables for configuration. Different environments (development, staging, production) use different `.env` files.

## Quick Start

1. **Copy the template**:
   ```powershell
   cp .env.template .env
   ```

2. **Update values** in `.env` with your actual credentials

3. **Never commit** `.env` files (already in `.gitignore`)

## Environment Files

### Root Directory: `.env`
Used by the client-side application and build tools.

**Required Variables**:
- Firebase client configuration
- Application URLs
- Feature flags

### Functions Directory: `functions/.env`
Used by Firebase Cloud Functions (backend).

**Required Variables**:
- Twilio credentials
- Firebase service account
- SendGrid API key
- Google Cloud Vision API

## Required Services

### 1. Firebase

**What it's for**: Database, authentication, hosting, cloud functions

**Setup**:
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **Project Settings** > **Service Accounts**
4. Click **Generate New Private Key**
5. Update `.env` with values from the JSON file

**Required Variables**:
```
FIREBASE_PROJECT_ID=
FIREBASE_DATABASE_URL=
FIREBASE_STORAGE_BUCKET=
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
```

### 2. Twilio

**What it's for**: WhatsApp messaging, SMS notifications

**Setup**:
1. Go to [Twilio Console](https://console.twilio.com)
2. Get Account SID and Auth Token from dashboard
3. Set up WhatsApp sender in **Messaging** > **Try it Out** > **Send a WhatsApp message**
4. (Optional) Create Content Templates for WhatsApp

**Required Variables**:
```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=whatsapp:+14155238886
```

**Optional - WhatsApp Templates**:
```
USE_TWILIO_TEMPLATES=true
TWILIO_CONTENT_SID_BOOKING_CONFIRMATION=HXxxxxx...
TWILIO_CONTENT_SID_BOOKING_STATUS=HXxxxxx...
TWILIO_CONTENT_SID_BOOKING_REMINDER=HXxxxxx...
TWILIO_CONTENT_SID_RECEIPT=HXxxxxx...
TWILIO_CONTENT_SID_WELCOME=HXxxxxx...
```

See `functions/.env.template` for template bodies.

### 3. SendGrid

**What it's for**: Email marketing, contact synchronization

**Setup**:
1. Go to [SendGrid Console](https://app.sendgrid.com)
2. Go to **Settings** > **API Keys**
3. Create a new API key with **Full Access**

**Required Variables**:
```
SENDGRID_API_KEY=SG.xxxxx...
```

### 4. Google Cloud Vision (Optional)

**What it's for**: Receipt OCR (optical character recognition)

**Setup**:
1. Enable Vision API in [Google Cloud Console](https://console.cloud.google.com)
2. Create credentials (API Key or Service Account)

**Required Variables**:
```
GOOGLE_CLOUD_VISION_API_KEY=
```

### 5. Meraki (Optional)

**What it's for**: WiFi captive portal integration

**Setup**:
1. Log in to Meraki Dashboard
2. Organization > Configure > API Access
3. Enable API access and generate key

**Required Variables**:
```
MERAKI_API_KEY=
MERAKI_ORGANIZATION_ID=
MERAKI_NETWORK_ID=
```

## Environment-Specific Configuration

### Development (Local)

File: `.env` and `functions/.env`

```env
NODE_ENV=development
APP_URL=http://localhost:5000
DEBUG=true
LOG_LEVEL=debug
```

### Staging

Use Firebase Remote Config or separate `.env.staging` files:

```env
NODE_ENV=staging
APP_URL=https://staging-your-app.firebaseapp.com
DEBUG=true
LOG_LEVEL=info
```

### Production

**Critical**: Use Firebase environment configuration for secrets:

```bash
firebase functions:config:set twilio.account_sid="ACxxxxx"
firebase functions:config:set twilio.auth_token="your_token"
firebase functions:config:set sendgrid.api_key="SG.xxxxx"
```

```env
NODE_ENV=production
APP_URL=https://your-app.firebaseapp.com
DEBUG=false
LOG_LEVEL=warn
```

## Security Best Practices

### ✅ DO:
- Use `.env.template` as documentation
- Store secrets in password manager
- Use Firebase functions:config for production
- Rotate API keys regularly
- Use different credentials per environment

### ❌ DON'T:
- Commit `.env` files to git
- Share credentials in Slack/email
- Use production credentials in development
- Hard-code credentials in source code
- Use the same secrets across environments

## Troubleshooting

### "Missing environment variable" error

1. Check `.env` file exists
2. Verify variable name matches `.env.template`
3. Restart development server after changes
4. For Cloud Functions, redeploy after updating

### Firebase Functions not reading .env

Cloud Functions need special configuration:

```bash
# Set via CLI
firebase functions:config:set service.key="value"

# View current config
firebase functions:config:get

# Access in code
const functions = require('firebase-functions');
const apiKey = functions.config().service.key;
```

### Variables not loading in browser

Client-side environment variables need `VITE_` prefix:

```env
# ❌ Won't work in browser
FIREBASE_API_KEY=xxx

# ✅ Will work
VITE_FIREBASE_API_KEY=xxx
```

Access with: `import.meta.env.VITE_FIREBASE_API_KEY`

## Feature Flags

Enable/disable features via environment variables:

```env
ENABLE_QUEUE_MANAGEMENT=true
ENABLE_RECEIPT_PROCESSING=true
ENABLE_BOOKING_SYSTEM=true
ENABLE_FOOD_COST_MODULE=false  # Disable in staging
ENABLE_CAMPAIGNS=true
```

## Support

For questions or issues with environment setup:
1. Check this documentation
2. Review `.env.template` comments
3. Check Firebase Console for service status
4. Review Twilio/SendGrid dashboards for API issues
