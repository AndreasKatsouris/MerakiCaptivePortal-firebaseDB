# Sparks Hospitality — Knowledge Base

> **Access this knowledge base from within the Admin Dashboard → Knowledge Base (sidebar link)**

---

## Architecture

| Document | Description |
|----------|-------------|
| [System Overview](architecture/SYSTEM_OVERVIEW.md) | Platform purpose, tech stack, deployment model |
| [Data Model](architecture/DATA_MODEL.md) | Full Firebase RTDB schema, node structure, indexes |
| [Subscription Tiers](architecture/SUBSCRIPTION_TIERS.md) | Free/Starter/Professional/Enterprise — features & gating |
| [Authentication Flow](architecture/AUTHENTICATION_FLOW.md) | Firebase Auth, admin claims, role-based access |

---

## API Reference

| Document | Description |
|----------|-------------|
| [Cloud Functions Catalog](api/CLOUD_FUNCTIONS_CATALOG.md) | All 69 functions: triggers, inputs, outputs |
| [Third-Party Integrations](api/INTEGRATIONS.md) | Twilio, SendGrid, Google Vision, Meraki API |

---

## Features

| Document | Description |
|----------|-------------|
| [Guest Management](features/GUEST_MANAGEMENT.md) | Guest capture, search, edit, delete, phone normalization |
| [Queue Management](features/QUEUE_MANAGEMENT.md) | Queue system, WhatsApp notifications, tier gating |
| [Food Cost Analytics](features/FOOD_COST_ANALYTICS.md) | Recipe costing, purchase orders, stock allocation |
| [Sales Forecasting](features/SALES_FORECASTING.md) | Forecast engine, SA holidays, confidence intervals |
| [Receipt Processing](features/RECEIPT_PROCESSING.md) | OCR pipeline, template extraction, data normalization |
| [Campaigns](features/CAMPAIGNS.md) | Campaign management, WhatsApp & email campaigns |
| [Rewards & Vouchers](features/REWARDS_VOUCHERS.md) | Reward types, voucher creation, redemption |
| [WhatsApp Integration](features/WHATSAPP_INTEGRATION.md) | Twilio setup, bot workflow, message templates |
| [Booking System](features/BOOKING_SYSTEM.md) | Booking management, queue integration, guest linkage |
| [WiFi Login](features/WIFI_LOGIN.md) | Meraki captive portal integration, guest capture |
| [Access Control](features/ACCESS_CONTROL.md) | Subscription tiers, feature gating, custom claims |
| [Project Management](features/PROJECT_MANAGEMENT.md) | Internal project tracking module |

---

## Deployment

| Document | Description |
|----------|-------------|
| [Deployment Guide](deployment/DEPLOYMENT_GUIDE.md) | firebase deploy, hosting, functions, CI/CD |
| [Environment Setup](deployment/ENVIRONMENT_SETUP.md) | All env vars, Firebase config, API keys |

---

## Development

| Document | Description |
|----------|-------------|
| [Getting Started](development/GETTING_STARTED.md) | Local dev setup, emulators, seed data |
| [Coding Standards](development/CODING_STANDARDS.md) | Patterns, immutability, error handling, conventions |
| [Testing Guide](development/TESTING_GUIDE.md) | Test structure, how to run, what to test |

---

## Security

| Document | Description |
|----------|-------------|
| [Security Overview](security/SECURITY_OVERVIEW.md) | Auth patterns, RTDB rules analysis, strengths & gaps |
| [Database Rules Guide](security/DATABASE_RULES_GUIDE.md) | Breakdown of database.rules.json, how to extend |

---

*Last updated: 2026-02-18*
