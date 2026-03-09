# Sparks Hospitality -- System Overview

## What Is This Platform?

Sparks Hospitality (formerly MerakiCaptivePortal-firebaseDB) is a **multi-tenant restaurant management platform** built for the South African hospitality market. It replaces disconnected point tools with a single integrated system covering WiFi guest capture, queue management, booking systems, receipt processing (OCR), food cost analytics, sales forecasting, purchase orders, rewards and loyalty programs, marketing campaigns, and WhatsApp automation.

## Target Audience

| Persona | Description |
|---------|-------------|
| **Restaurant Owner** | Single-location or multi-location operator. Primary user. Full access to own data. |
| **General Manager** | Manages day-to-day operations across locations. Financial + guest data access. |
| **Kitchen Manager** | Focuses on food cost analytics and stock management. No guest data access. |
| **Floor Manager** | Queue management, bookings, guest interaction. No financial access. |
| **Platform Admin** | Super admin with platform-wide access (Sparks staff). |

Users are typically non-technical. The platform must automate administrative work and surface actionable insights from operational data.

## Tech Stack Summary

### Frontend

| Layer | Technology | Notes |
|-------|------------|-------|
| Core | Vanilla JavaScript, HTML5 | Legacy pages |
| Frameworks | Vue 3 (selective pages) | Incremental migration target |
| CSS | Bootstrap 5.3.0 + Tailwind CSS | Dual styling systems |
| Charts | Chart.js | CategoryScale for forecasting |
| Icons | Font Awesome 6.0 | |
| Build | Vite 6.0 | Dev server + bundling |
| State | Pinia 2.3.1 | Vue stores |
| HTTP | Axios 1.7.8 | API calls |
| Notifications | SweetAlert2 | All user-facing alerts |

### Backend

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Node.js 22 | Cloud Functions runtime |
| Framework | Firebase Cloud Functions v7.0.3 + Express 4.21.1 | 69+ deployed functions |
| Admin SDK | Firebase Admin 12.7.0 | Server-side Firebase operations |
| Functions API | v1 (`firebase-functions`) + v2 (`firebase-functions/v2/https`) | Mixed usage |

### Database

| Component | Technology | Notes |
|-----------|------------|-------|
| Primary | Firebase Realtime Database (RTDB) | All operational data |
| Secondary | Firestore | Currently disabled / future migration candidate |
| Indexes | 30+ composite indexes | On phone, location, timestamp, status fields |

### Hosting & Infrastructure

| Component | Details |
|-----------|---------|
| Hosting | Firebase Hosting |
| Project ID | `merakicaptiveportal-firebasedb` |
| Database URL | `https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com` |
| Region | `us-central1` |
| Emulators | Auth (9099), Functions (5001), Firestore (8080), RTDB (9000), Hosting (5000), Storage (9199) |

### Third-Party Integrations

| Integration | Library / SDK | Purpose |
|-------------|---------------|---------|
| Twilio | twilio 5.3.6 | WhatsApp messaging + SMS |
| SendGrid | @sendgrid/client 8.1.6 | Email marketing campaigns |
| Google Cloud Vision | @google-cloud/vision 4.3.2 | Receipt OCR processing |
| Meraki Dashboard API | Custom webhook handler | WiFi captive portal data |

## Deployment Model

```
                    Firebase Hosting
                          |
               +----------+----------+
               |                     |
         Static Assets         Cloud Functions (69+)
         (public/)             (functions/)
               |                     |
               +----------+----------+
                          |
              Firebase Realtime Database
                    (Primary)
                          |
                   Firebase Auth
              (Email/Password + Custom Claims)
```

### Key Configuration Files

| File | Purpose |
|------|---------|
| `firebase.json` | Hosting config, rewrites, emulator ports, database rules path |
| `database.rules.json` | RTDB security rules for all nodes |
| `firestore.rules` | Firestore security rules (currently unused) |
| `storage.rules` | Cloud Storage security rules |
| `functions/index.js` | Cloud Functions entry point -- all exports |
| `public/js/config/firebase-config.js` | Frontend Firebase initialization + emulator detection |

### Frontend Module System

The frontend uses ES module imports from CDN-hosted Firebase SDK (`gstatic.com/firebasejs/10.12.5/`). A global `window.firebaseExports` object bridges module and non-module scripts. A `firebaseReady` custom event signals initialization completion.

```
public/
  js/
    config/firebase-config.js     -- Firebase init, emulator config
    auth/auth.js                  -- Auth manager
    modules/
      access-control/             -- Subscription tier gating
        services/
          access-control-service.js
          subscription-service.js
          platform-features.js
          role-access-control.js
          feature-access-control.js
        components/
          feature-guard.js
          upgrade-prompt/
        admin/
          tier-management.js
          subscription-status-manager.js
      sales-forecasting/          -- Forecast engine, charts, analytics
      ross/                       -- Vue 3 CDN app for workflow automation
        index.js                  -- Main Vue app (mount/unmount lifecycle)
        services/
          ross-service.js         -- Cloud Functions API client
      [other modules]
```

### CORS Configuration

Cloud Functions accept requests from:
- `http://localhost:3000` / `:5000` / `:8000`
- `https://merakicaptiveportal-bda0f.web.app`
- `https://merakicaptiveportal-bda0f.firebaseapp.com`
- `https://merakicaptiveportal-firebasedb.web.app`
- `https://merakicaptiveportal-firebasedb.firebaseapp.com`

### Emulator Detection

The frontend (`firebase-config.js`) auto-detects `localhost` / `127.0.0.1` and connects to local emulators. This enables full offline development with no production dependencies.

## Platform Modules

| Module | Key Features | Tier Required |
|--------|-------------|---------------|
| WiFi Captive Portal | Guest capture via Meraki API | Free |
| Guest Management | CRM, phone normalization, profiles | Free (basic), Professional (advanced) |
| Queue Management (QMS) | Real-time queue, WhatsApp notifications | Free (basic), Starter (advanced) |
| Booking System | Table reservations, status tracking | Free (basic), Professional (advanced) |
| Receipt Processing | OCR via Google Vision, template matching | Free (manual), Professional (automated) |
| Food Cost Analytics | Stock usage, cost calculations | Professional (basic), Enterprise (advanced) |
| Sales Forecasting | ML-lite predictions, holiday awareness | Starter (basic), Professional (advanced) |
| Campaigns | Email/WhatsApp marketing | Starter (basic), Professional (advanced) |
| Rewards & Loyalty | Points, vouchers, redemption | Starter (basic), Professional (advanced) |
| WhatsApp Integration | Twilio-powered bot, multi-location routing | Starter (basic), Professional (advanced) |
| ROSS | Workflow automation, recurring checklists, templates, staff assignment | Admin (templates: Super Admin) |
| Project Management | Internal project tracking (admin) | Admin only |
| Performance Monitor | Cloud Functions metrics, cold starts | Admin only |
