# Sparks Hospitality (MerakiCaptivePortal-firebaseDB)

Multi-tenant restaurant management platform built on Firebase. Integrates WiFi guest capture, queue management, food cost analytics, sales forecasting, ROSS workflows, receipt OCR, rewards/vouchers, campaigns, and WhatsApp automation. Target: restaurant owners and managers in South Africa.

## Role

You are the primary development agent for this project. You have full read/write access to all source code, configuration, and infrastructure.

- Modify, create, and delete source code files
- Run builds, tests, and deployments
- Create and manage git branches, commits, and PRs
- Spawn agent teams for complex multi-module work

## Tech Stack

- **Frontend:** Vanilla JS + Vue 3 (selective migration), Bootstrap 5.3, Tailwind, Chart.js
- **Build:** Vite 6.0, deploys from `dist/` via `npm run build`
- **State:** Pinia 2.3.1 (Vue pages)
- **Backend:** Firebase Cloud Functions v7 + Express 4.21, Node.js 22
- **Database:** Firebase RTDB (primary), 30+ composite indexes
- **Auth:** Firebase Auth with custom claims, dual admin verification
- **Integrations:** Twilio (WhatsApp/SMS), SendGrid (email), Google Cloud Vision (OCR), Meraki API
- **Hosting:** Firebase Hosting (project: merakicaptiveportal-firebasedb)

## Conventions

- Immutable patterns: spread operators, no mutation
- SweetAlert2 for all user notifications (no native alert/confirm)
- `escapeHtml()` for XSS prevention in innerHTML (not needed in Vue templates — auto-escaped)
- Firebase RTDB index nodes for denormalized queries (e.g. `salesDataIndex/byLocation/{locId}`)
- Atomic deletes via multi-path `update(ref(rtdb), { path1: null, path2: null })`
- Vue 3 modules: Pinia stores, ES module imports, DDD-style structure (services/ + stores/ + components/ + constants/)
- SA date format (DD/MM/YYYY) default for ambiguous dates
- Chart.js uses CategoryScale (not TimeScale) to avoid ESM dual-package hazard
- See: `KNOWLEDGE BASE/development/CODING_STANDARDS.md` for full standards

## Key Paths

| Path | Purpose |
|------|---------|
| `functions/index.js` | 69+ Cloud Functions entry point |
| `functions/ross.js` | ROSS module functions |
| `database.rules.json` | RTDB security rules |
| `public/js/config/firebase-config.js` | Firebase init & exports |
| `public/js/modules/` | Feature modules (food-cost, ross, compliance, etc.) |
| `public/admin-dashboard.html` | Admin SPA (section switching) |
| `public/js/admin-dashboard.js` | Admin section orchestration |
| `scripts/build.js` | Build: copies public/ to dist/, Vite compiles Vue pages |
| `vite.config.js` | Vite 6 config, builds user-dashboard entry point |

## Knowledge Base

Primary KB: `KNOWLEDGE BASE/` (project root). Curated subset for UI: `public/kb/`.

| Working on...          | Read first                                                   |
|------------------------|--------------------------------------------------------------|
| Food cost module       | `KNOWLEDGE BASE/FOOD_COST_MODULE_README.md`                  |
| Queue / QMS            | `KNOWLEDGE BASE/queue-system-architecture.md`                |
| ROSS workflows         | `public/kb/features/ROSS.md`                                 |
| WhatsApp integration   | `KNOWLEDGE BASE/WHATSAPP_BOT_SOP.md`                        |
| Receipt processing     | `KNOWLEDGE BASE/RECEIPT_SETTINGS_COMPLETE_IMPLEMENTATION.md` |
| Sales forecasting      | `public/kb/features/SALES_FORECASTING.md`                    |
| Booking system         | `KNOWLEDGE BASE/BOOKING_SYSTEM_GUIDE.md`                     |
| Guest management       | `public/kb/features/GUEST_MANAGEMENT.md`                     |
| Access control / tiers | `KNOWLEDGE BASE/ACCESS-TIER-SYSTEM.md`                       |
| Campaigns & rewards    | `public/kb/features/CAMPAIGNS.md`                            |
| Database schema        | `KNOWLEDGE BASE/architecture/DATA_MODEL.md`                  |
| Security & rules       | `KNOWLEDGE BASE/security/SECURITY_OVERVIEW.md`               |
| DB rules               | `KNOWLEDGE BASE/security/DATABASE_RULES_GUIDE.md`            |
| Auth flow              | `KNOWLEDGE BASE/architecture/AUTHENTICATION_FLOW.md`         |
| Cloud Functions API    | `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md`              |
| Deployment             | `KNOWLEDGE BASE/deployment/DEPLOYMENT_GUIDE.md`              |
| DOM structure          | `KNOWLEDGE BASE/DOM_STRUCTURE_STANDARDS.md`                  |
| Module integration     | `KNOWLEDGE BASE/MODULE_INTEGRATION_SOP.md`                   |
| Phone normalization    | `KNOWLEDGE BASE/PHONE_NUMBER_NORMALIZATION_AUDIT.md`         |
| Full KB index          | `KNOWLEDGE BASE/README.md`                                   |

## Agent Teams

For complex multi-module work, spawn agent teams in isolated worktrees.

### Roles

| Role   | Specialization                                     |
|--------|----------------------------------------------------|
| COORD  | Orchestration, task assignment, plan approval       |
| ARCH   | System design, database schema, API contracts       |
| BACK   | Cloud Functions, database ops, integrations         |
| FRONT  | Vue components, admin dashboard, PWA                |
| MODULE | Feature module development (food-cost, ROSS, etc.)  |
| DEVOPS | Firebase hosting, deployment, CI/CD                 |
| QA     | Testing, cleanup, quality assurance                 |
| SEC    | Security rules, auth, compliance                    |

### Spawn Pattern

1. Create isolated git worktree for the work
2. Assign roles based on task scope (not all roles needed every time)
3. Use Sonnet for teammates, plan mode for approval gates
4. COORD reviews agent output before merging
5. Clean up worktree and team when done

## Agent Feedback Loop

Read at session start, update at session end.

| File | When | Purpose |
|------|------|---------|
| `KNOWLEDGE BASE/development/SELF_OPTIMIZATION.md` | Start (read) + end (update) | Workflow patterns, promoted after 3x validation |
| `KNOWLEDGE BASE/development/LESSONS.md` | End (if gotchas found) | Rolling log of non-obvious discoveries (max 20) |
| `KNOWLEDGE BASE/development/SCORECARD.md` | End | Self-evaluation against fixed rubric (max 10 entries) |
