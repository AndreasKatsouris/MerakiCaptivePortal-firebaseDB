# Corporate Compliance Module

The Corporate Compliance Module is a dedicated regulatory tracker for multi-entity restaurant groups operating in South Africa. It consolidates compliance obligations across SARS, CIPC, Department of Labour, franchise boards, and liquor boards into a single operational view with deadline calculation, filing status tracking, audit logging, obligation management, and entity-level oversight.

---

## Table of Contents

1. [Overview](#overview)
2. [File Structure](#file-structure)
3. [Access Control](#access-control)
4. [Database Structure (RTDB)](#database-structure)
5. [Obligations Catalogue](#obligations-catalogue)
6. [Deadline Calculation Engine](#deadline-calculation-engine)
7. [Firebase Service API](#firebase-service-api)
8. [Audit Service](#audit-service)
9. [UI Components](#ui-components)
10. [Cloud Functions](#cloud-functions)
11. [Initialization Flow](#initialization-flow)
12. [Navigation](#navigation)
13. [Implementation Status](#implementation-status)
14. [Resolved Issues](#resolved-issues)
15. [Dependencies](#dependencies)
16. [Future Roadmap](#future-roadmap)

---

## Overview

The module solves a critical operational problem: restaurant groups with multiple registered entities (private companies, close corporations, franchise subsidiaries) must track dozens of overlapping regulatory deadlines across different government authorities. Missing a single deadline can result in SARS penalties, CIPC deregistration, or Department of Labour enforcement action.

**Target users:** Authenticated users on the Professional or Enterprise subscription tier. Access is enforced via subscription tier-gating (`featureAccessControl.checkFeatureAccess('corporateCompliance')`), replacing the previous admin-claim-only guard.

**Key capabilities:**
- **Entity registry** -- Track all registered entities with CIPC status, AR/BO compliance badges, incorporation dates, and dormancy status
- **Obligation tracking** -- 25+ obligation definitions across monthly, bi-annual, annual, and once-off categories
- **Obligations manager** -- Full CRUD panel for adding, editing, and deleting obligation definitions via SweetAlert2 dialogs
- **Deadline calculation** -- Multiple rule types covering SARS, CIPC, DoL, and franchise-specific schedules, including manual due dates for per-entity obligations
- **Filing management** -- Record filings per entity per obligation per year with audit metadata, entity-level filtering, and priority-sorted display
- **Multi-year history** -- Year selector with 4-year range (current year -2 through current year +1)
- **Audit trail** -- Structured audit log recording all compliance changes with actor identity and timestamps
- **Priority sorting** -- Obligations sorted by urgency (overdue first, then upcoming with "NEXT DUE" highlight)

**Current scope:** 9 entities (8 active, 1 dormant) with obligations spanning PAYE, VAT, provisional tax, CIPC annual returns, beneficial ownership, compensation fund, skills development, employment equity, liquor licensing, and more.

---

## File Structure

| Category | File Path | Lines |
|----------|-----------|-------|
| HTML Shell | `public/corporate-compliance.html` | 100 |
| CSS | `public/css/corporate-compliance.css` | 292 |
| Module Entry | `public/js/modules/compliance/index.js` | 52 |
| Entity Registry | `public/js/modules/compliance/components/entity-registry.js` | 915 |
| Compliance Tracker | `public/js/modules/compliance/components/compliance-tracker.js` | 952 |
| Obligations Manager | `public/js/modules/compliance/components/obligations-manager.js` | 788 |
| Firebase Service | `public/js/modules/compliance/services/firebase-service.js` | 418 |
| Audit Service | `public/js/modules/compliance/services/audit-service.js` | 53 |
| Deadline Calculator | `public/js/modules/compliance/utils/deadline-calculator.js` | 303 |
| HTML Escape Utilities | `public/js/modules/compliance/utils/html-escape.js` | 28 |
| Seed Function | `functions/seedComplianceData.js` | 74 |
| Seed Data | `functions/compliance-seed-data.js` | 531 |

```
public/
  corporate-compliance.html          <- standalone page (also renderable in admin dashboard content pane)
  css/corporate-compliance.css       <- dedicated stylesheet (includes .next-due-row highlight)
  js/modules/compliance/
    index.js                         <- module entry, exports initializeComplianceModule()
    components/
      entity-registry.js             <- entity table rendering, AR/BO badge toggles, Add/Edit/Delete entity
      compliance-tracker.js          <- obligation table, priority sorting, entity filter, filing dialogs, manual due dates
      obligations-manager.js         <- obligation CRUD panel with SweetAlert2 dialogs, entity filter
    services/
      firebase-service.js            <- RTDB CRUD for compliance/{uid}/ node + location loader + obligation CRUD
      audit-service.js               <- structured audit log writer (fire-and-forget)
    utils/
      deadline-calculator.js         <- deadline rule types, VAT lookup table, filing status logic
      html-escape.js                 <- escapeHtml() and escapeAttr() for XSS prevention

functions/
  seedComplianceData.js              <- HTTP Cloud Function (admin-only idempotent seed)
  compliance-seed-data.js            <- entity + obligation + settings seed data
```

---

## Access Control

The module enforces access at three levels:

### 1. Page Guard (Client-Side) -- Subscription Tier-Gating

`corporate-compliance.html` uses the platform's feature access control system instead of a direct admin-claim check. The `corporateCompliance` feature is registered in `platform-features.js` (category: `management`) and enabled for Professional and Enterprise subscription tiers:

```js
// On page load
featureAccessControl.checkFeatureAccess('corporateCompliance');
// Redirects with an upgrade prompt if user's subscription tier does not include this feature
```

The `PLATFORM_MODULES` map includes `compliance: 'Corporate Compliance'` for navigation registration.

### 2. Firebase RTDB Rules

```json
"compliance": {
  "$uid": {
    ".read": "auth != null && auth.uid === $uid",
    ".write": "auth != null && auth.uid === $uid",
    "entities": {
      ".indexOn": ["status", "cipcStatus", "oversight"],
      "$entityId": {
        ".validate": "newData.hasChildren(['name', 'registrationNumber', 'type', 'status'])"
      }
    },
    "obligations": {
      "$obligationId": {
        ".validate": "newData.hasChildren(['name', 'category', 'deadlineRule'])",
        "name": {
          ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 200"
        },
        "category": {
          ".validate": "newData.val().matches(/^(monthly|biannual|annual|once_off)$/)"
        },
        "deadlineRule": {
          ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 60"
        },
        "fixedDeadline": {
          ".validate": "!newData.exists() || (newData.isString() && newData.val().matches(/^[0-9]{2}-[0-9]{2}$/))"
        },
        "authority": {
          ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 100)"
        },
        "defaultOwner": {
          ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 200)"
        }
      }
    },
    "filings": {
      "$year": {
        ".validate": "$year.matches(/^[0-9]{4}$/)",
        "$entityId": {
          ".validate": "$entityId.matches(/^[A-Za-z0-9_-]+$/)",
          ".indexOn": ["status", "dueDate"],
          "$obligationId": {
            ".validate": "newData.hasChildren(['status']) || newData.hasChildren(['manualDueDate'])",
            "filedBy": {
              ".validate": "newData.isString() && newData.val().length <= 200"
            },
            "notes": {
              ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 1000)"
            }
          }
        }
      }
    },
    "audit-log": {
      "$entryId": {
        ".validate": "newData.hasChildren(['action', 'actorUid', 'timestamp'])"
      }
    }
  }
}
```

The `compliance/$uid` access rule uses `auth.uid === $uid` (without requiring `auth.token.admin === true`). Admin enforcement has been moved to the application layer via subscription tier checks, allowing any authenticated user on the correct tier to access their own compliance data.

Key validation rules:
- **Entities:** require `name`, `registrationNumber`, `type`, and `status` fields
- **Obligations:** require `name` (max 200 chars), `category` (enum), and `deadlineRule` (max 60 chars). Optional fields `fixedDeadline` (MM-DD regex), `authority` (max 100 chars), and `defaultOwner` (max 200 chars) have field-level validation
- **Filings:** year paths validated as four-digit strings, entity IDs validated against path-safe characters. Filing records require either `status` or `manualDueDate` (relaxed from requiring `status` only, to support manual due date writes without affecting status). `filedBy` capped at 200 characters, `notes` at 1000 characters
- **Audit log:** entries require `action`, `actorUid`, and `timestamp`

### 3. Cloud Function Auth

The `seedComplianceData` function validates the Bearer token and checks `admin === true` before writing.

---

## Database Structure

All compliance data lives under `compliance/{uid}/` in Firebase RTDB, scoped per authenticated user.

> **Multi-tenancy:** Each user's compliance data is isolated under their UID. The `getBasePath()` internal helper in `firebase-service.js` resolves the current user's UID and returns `compliance/{uid}` as the base path for all reads and writes.

### Entities

```
compliance/{uid}/entities/{registrationNumber}
  name: string                        <- company legal name
  registrationNumber: string          <- CIPC format: K/M + year + 6 digits
  type: "PRIVATE COMPANY" | "CLOSE CORPORATION"
  status: "active" | "dormant"
  purpose: string                     <- business description
  cipcStatus: "IN BUSINESS" | "DORMANT"
  oversight: string | null            <- director name responsible
  oversightPhone: string | null
  arCompliant: boolean                <- Annual Return filed this cycle?
  boCompliant: boolean                <- Beneficial Ownership filed?
  financialYearEnd: "MM-DD" | null    <- e.g. "02-28" for February
  incorporationDate: ISO 8601 | null  <- used for CIPC anniversary deadline calculation
  licenceExpiryDate: ISO 8601 | null  <- franchise/liquor entities
  linkedLocationIds: string[]         <- array of Firebase location push keys
  createdAt: ISO 8601
  updatedAt: ISO 8601
```

> **Note:** The `registrationNumber` serves as the entity key. CIPC registration numbers follow the format `K2015/123456/07` (private company) or `CK1998/012345/23` (close corporation).

### Obligations

```
compliance/{uid}/obligations/{obligationId}
  id: string                          <- e.g. "paye_monthly", "cipc_annual_return"
  name: string                        <- human-readable obligation name (max 200 chars)
  category: "monthly" | "biannual" | "annual" | "once_off"
  frequency: string                   <- display text e.g. "Monthly", "Annually"
  deadlineRule: string                <- one of the supported rule types (max 60 chars; see Deadline Engine)
  fixedDeadline: "MM-DD" | null       <- for fixed_date rules (validated as MM-DD regex)
  authority: string | null            <- "SARS" | "CIPC" | "DoL" | etc. (max 100 chars)
  defaultOwner: string | null         <- e.g. "Accountant", "Director" (max 200 chars)
  appliesToAll: boolean               <- applies to every active entity?
  appliesToEntityIds: string[] | null <- specific entities if not all
  requiresEmployees: boolean          <- only for entities with employees
  requiresVatRegistration: boolean    <- only for VAT-registered entities
  requiresSDL: boolean               <- only for SDL-liable entities
  requiresMinEmployees: number | null <- minimum employee count threshold
  optional: boolean                   <- e.g. provisional tax 3rd top-up
  custom: boolean                     <- true for user-created obligations (set by createObligation)
  penaltyNote: string | null          <- consequence of non-compliance
  notes: string | null                <- additional context
  createdAt: ISO 8601
  updatedAt: ISO 8601
```

### Filings

```
compliance/{uid}/filings/{year}/{registrationNumber}/{obligationId}
  status: "filed" | "in_progress" | "not_applicable"
  dueDate: "YYYY-MM-DD"
  filedDate: "YYYY-MM-DD"
  filedBy: string                     <- who filed (max 200 chars)
  notes: string                       <- optional notes (max 1000 chars)
  manualDueDate: "YYYY-MM-DD" | null  <- manually set due date for per-entity obligations
  updatedBy: string                   <- user email or UID
  updatedAt: ISO 8601
```

> **Note:** Filings are keyed by year, then registration number, then obligation ID. This allows efficient lookups per entity per year and supports multi-year historical tracking. The filing validation rule accepts records with either `status` or `manualDueDate`, allowing manual due date writes without requiring a status field.

### Audit Log

```
compliance/{uid}/audit-log/{entryId}
  action: string                      <- one of AUDIT_ACTIONS constants (e.g. "entity_created", "filing_marked")
  actorUid: string                    <- UID of the user who performed the action
  actorEmail: string | null           <- email of the actor (if available)
  timestamp: ISO 8601                 <- when the action occurred
  entityId: string | null             <- affected entity registration number
  entityName: string | null           <- affected entity name
  obligationId: string | null         <- affected obligation ID (for obligation/filing events)
  before: Object | null               <- state before the change
  after: Object | null                <- state after the change
  changes: string[] | null            <- list of changed field names (for update events)
```

Entries are written via Firebase `push()` so each gets a unique, chronologically-ordered key. Validation requires `action`, `actorUid`, and `timestamp` fields.

### Reminder Settings (Schema Only)

The reminder settings schema is defined but not yet wired to any notification system:

```
compliance/reminder-settings/
  reminders.enabled: boolean
  channels:
    whatsapp: boolean
    email: boolean
  schedule:
    daysBeforeDue: number[]           <- e.g. [7, 3, 1]
    dailyCheckTime: string            <- e.g. "08:00"
    timezone: string                  <- e.g. "Africa/Johannesburg"
```

---

## Obligations Catalogue

The module tracks 21+ regulatory obligations across four categories. All obligation definitions are stored in `compliance/obligations/` and seeded via the `seedComplianceData` Cloud Function. Additional custom obligations can be created through the Obligations Manager panel.

### Monthly Obligations (3)

| Obligation | Authority | Deadline Rule | Conditional |
|-----------|-----------|---------------|-------------|
| PAYE / UIF / SDL (EMP201) | SARS | 7th of following month | Requires employees |
| VAT Return (VAT201) | SARS | Last day of following month | VAT registered only |
| Ocean Basket Royalty & Marketing Levy | Franchisor | Fixed per franchise agreement | Franchise entities only |

### Bi-Annual Obligations (3)

| Obligation | Authority | Deadline Rule |
|-----------|-----------|---------------|
| Provisional Tax -- 1st Payment | SARS | 6 months after financial year-end |
| Provisional Tax -- 2nd Payment | SARS | Financial year-end date |
| PAYE Interim Reconciliation (EMP501) | SARS | SARS-announced (typically Sep/Oct) |

### Annual Obligations (13)

| Obligation | Authority | Deadline Rule | Conditional |
|-----------|-----------|---------------|-------------|
| PAYE Annual Reconciliation (EMP501) | SARS | SARS-announced (typically Apr/May) | Requires employees |
| Compensation Fund (W.As.2) | DoL | 31 March fixed date | Requires employees |
| CIPC Annual Return | CIPC | 30 business days after incorporation anniversary | All active entities |
| Beneficial Ownership Declaration | CIPC | 30 business days after incorporation anniversary | All active entities |
| Annual Financial Statements (AFS) | CIPC/SARS | 6 months after financial year-end | All entities |
| Corporate Income Tax Return (ITR14) | SARS | 12 months after financial year-end | All entities |
| Provisional Tax -- 3rd Top-Up | SARS | 6 months after FYE + 6 months | Optional |
| Skills Development WSP/ATR | CATHSSETA | 30 April fixed date | SDL-liable entities |
| Employment Equity Report | DoL | 15 January fixed date | 50+ employees |
| Liquor Licence Renewal | Provincial Liquor Board | Per licence expiry date | Licensed entities only |
| Health & Safety (OHS Act) | DoL | Per inspection anniversary | All entities |
| B-BBEE Compliance | IRBA/Verification Agency | Annually | All entities |
| Financial Year-End | Internal | Per entity setting | All entities |

### Once-Off Obligations (2-3)

| Obligation | Authority | Notes |
|-----------|-----------|-------|
| Section 42 Asset-for-Share Transfer | SARS/CIPC | Corporate restructuring events |
| Intercompany Agreements | Internal/SARS | Transfer pricing documentation |
| Voluntary Deregistration | CIPC | For dormant entities |

---

## Deadline Calculation Engine

The `deadline-calculator.js` module implements multiple deadline rule types that calculate the next due date for each obligation based on entity-specific data (financial year-end, incorporation date, licence expiry). It also supports manual due dates for obligations that cannot be formula-calculated.

### Supported Rule Types

```js
// Fixed-date rules
'fixed_date'                                  // Uses fixedDeadline "MM-DD" field (e.g. "03-31" for Compensation Fund)

// Relative-to-month rules
'day_7_following_month'                       // PAYE = 7th of following month
'first_week_following_month'                  // First week of following month (alias for 7th)
'last_business_day_of_month_following_period' // VAT bimonthly = last day of filing month (uses VAT_FILING_MONTH lookup)

// CIPC anniversary-based
'30_business_days_after_anniversary'          // CIPC Annual Return (42 calendar days approximation)
'filed_with_cipc_annual_return'               // Beneficial Ownership (same deadline as CIPC AR)

// Financial year-end relative rules
'6_months_after_tax_year_start'              // Provisional Tax 1st payment
'last_day_of_financial_year'                 // Provisional Tax 2nd payment
'6_months_after_financial_year_end'          // AFS, Provisional Tax 1st
'12_months_after_financial_year_end'         // ITR14
'aligned_to_financial_year_end'              // FYE deadline

// SARS-announced windows
'sars_announced_sep_oct_window'              // PAYE interim recon (October 31 as proxy)
'april_1_to_may_31_window'                   // PAYE annual recon (May 31 as proxy)

// Manual / per-entity variable dates (require manualDueDate in filing record)
'per_entity_licence_expiry'                  // Liquor licence renewal
'per_entity_inspection_anniversary'          // OHS inspection
'manual'                                     // Custom / manual date
```

### Year-End Relative Rules

The `YEAR_END_RELATIVE_RULES` set identifies rules that depend on entity financial year-end data:

```js
const YEAR_END_RELATIVE_RULES = new Set([
  '6_months_after_tax_year_start',
  'last_day_of_financial_year',
  '6_months_after_financial_year_end',
  '12_months_after_financial_year_end',
  'aligned_to_financial_year_end'
]);
```

### Manual Rules

The `MANUAL_RULES` set identifies obligations whose due dates are set manually per entity rather than calculated from a formula:

```js
const MANUAL_RULES = new Set([
  'manual',
  'per_entity_licence_expiry',
  'per_entity_inspection_anniversary'
]);
```

For these rules, `calculateNextDueDate()` returns `null`. The actual due date is stored in the filing record's `manualDueDate` field and set via the "Set Due Date" action in the compliance tracker (requires entity filter to be active).

### VAT Bimonthly Filing Month Lookup

The VAT Category B bimonthly filing logic uses a lookup table instead of an even/odd month check:

```js
const VAT_FILING_MONTH = [0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 0];
// Index = current month (0-indexed), Value = filing month (0-indexed)
// Jan->Jan, Feb->Mar, Mar->Mar, Apr->May, May->May, Jun->Jul,
// Jul->Jul, Aug->Sep, Sep->Sep, Oct->Nov, Nov->Nov, Dec->Jan(next year)
```

### Financial Year-End Parsing

The `parseFinancialYearEnd(fye, year)` function handles "MM-DD" format strings (e.g. "02-28") and pure numeric month strings (e.g. "02"). The `getEntityYearEnd(entity, year)` helper delegates to this parser, which correctly produces a valid `Date` object from "MM-DD" strings that would fail with `new Date()`.

### Month Addition with Clamping

The `addMonths(date, months)` function clamps to the last day of the target month to prevent date overflow. For example, adding 1 month to January 31 returns February 28 (or 29 in a leap year) instead of rolling into March.

### Business Days Approximation

The CIPC annual return requires filing within 30 business days of the incorporation anniversary. The calculator uses a calendar-day approximation:

```js
const BUSINESS_DAYS_30_AS_CALENDAR = 42; // 30 business days ~ 42 calendar days
```

> **Note:** This is an approximation. It does not account for South African public holidays. For critical CIPC deadlines, always verify against the actual business-day count.

### Filing Status Logic

```js
getFilingStatus(dueDate, filing)
// Returns one of: 'filed' | 'overdue' | 'pending' | 'in_progress' | 'not_applicable'

// Decision logic:
// 1. If filing exists and filing.status === 'filed'         -> 'filed'
// 2. If filing exists and filing.status === 'not_applicable'-> 'not_applicable'
// 3. If filing exists and filing.status === 'in_progress'   -> 'in_progress'
// 4. If dueDate < today and no filed status                 -> 'overdue'
// 5. Otherwise                                              -> 'pending'
```

### Status Color Coding

| Status | Color | Meaning |
|--------|-------|---------|
| Filed | Green badge | Obligation completed for this period |
| Overdue | Red badge | Deadline has passed without filing |
| Pending (due soon) | Orange badge | Due within 30 days |
| Pending (OK) | Green outline | Due date more than 30 days away |
| In Progress | Blue badge | Filing started but not yet submitted |
| Not Applicable | Grey badge | Obligation does not apply to this entity |

---

## Firebase Service API

The `firebase-service.js` module exports all RTDB operations for the compliance module. All paths are resolved relative to `compliance/{uid}/` using the authenticated user's UID.

### Internal Helpers

| Helper | Purpose |
|--------|---------|
| `getBasePath()` | Returns `compliance/{uid}` using the current authenticated user's UID |
| `validatePathSegment(value, label)` | Validates path segments against `/^[A-Za-z0-9_-]+$/` to prevent path traversal attacks |

### Read Operations

| Function | Signature | Purpose |
|----------|-----------|---------|
| `loadEntities()` | `() -> Promise<Object>` | Load all entities from `compliance/{uid}/entities/` |
| `loadObligations()` | `() -> Promise<Object>` | Load all obligation definitions |
| `loadFilings(year)` | `(year) -> Promise<Object>` | Load filings for a specific calendar year |
| `loadLocations()` | `() -> Promise<Array>` | Fetch user's locations from `userLocations/{uid}` index, then resolve full records from `locations/{locationId}`. Returns `[{id, name, address, city}]` sorted by name |

### Entity Operations

| Function | Signature | Purpose |
|----------|-----------|---------|
| `createEntity(entityData)` | `(entityData) -> Promise<Object>` | Create a new entity with duplicate guard. Sets `arCompliant` and `boCompliant` to `false`, stamps `createdAt` and `updatedAt`. Fires `ENTITY_CREATED` audit event |
| `updateEntity(registrationNumber, updates)` | `(registrationNumber, updates) -> Promise<void>` | Partial update of entity fields. Does not touch compliance flags. Fires `ENTITY_UPDATED` audit event with before/after state and list of changed fields |
| `deleteEntity(registrationNumber)` | `(registrationNumber) -> Promise<void>` | Atomic multi-path delete: removes the entity record and its filing records for years 2024 through `currentYear + 1` (dynamic range) in a single `update()` call with null values. Fires `ENTITY_DELETED` audit event |
| `updateEntityCompliance(entityId, flags)` | `(entityId, flags) -> Promise<void>` | Update compliance flags (`arCompliant`, `boCompliant`). Fires `AR_TOGGLED` or `BO_TOGGLED` audit event |

### Filing Operations

| Function | Signature | Purpose |
|----------|-----------|---------|
| `updateFilingStatus(year, entityId, obligationId, data)` | `(year, entityId, obligationId, data) -> Promise<void>` | Create or update a filing status record. Fires `FILING_MARKED` audit event |
| `setManualDueDate(year, entityId, obligationId, dateStr)` | `(year, entityId, obligationId, dateStr) -> Promise<void>` | Partial update writing only `manualDueDate` and `updatedAt` to the filing node. Does NOT touch filing `status`. Used for obligations with `manual`, `per_entity_licence_expiry`, or `per_entity_inspection_anniversary` deadline rules |

### Obligation Operations

| Function | Signature | Purpose |
|----------|-----------|---------|
| `createObligation(obligationId, data)` | `(obligationId, data) -> Promise<Object>` | Create a new obligation definition. Rejects if `obligationId` already exists. Sets `custom: true`, stamps `createdAt` and `updatedAt`. Fires `OBLIGATION_CREATED` audit event |
| `updateObligation(obligationId, updates)` | `(obligationId, updates) -> Promise<void>` | Partial update of obligation fields. Fires `OBLIGATION_UPDATED` audit event with before/after state and list of changed fields |
| `deleteObligation(obligationId)` | `(obligationId) -> Promise<void>` | Atomically removes the obligation definition and all associated filing records across all entities and years (2024 through `currentYear + 1`) using multi-path `update()` with null values. Fires `OBLIGATION_DELETED` audit event |

> **Design note:** Errors are NOT caught in the service layer -- they bubble up to the calling component so the UI can present contextual feedback via SweetAlert2. All mutation functions fire audit events as fire-and-forget (`.catch(() => {})`) to avoid blocking the main flow.

---

## Audit Service

The `audit-service.js` module provides structured audit logging for all compliance changes.

### Constants

```js
export const AUDIT_ACTIONS = {
  ENTITY_CREATED:     'entity_created',
  ENTITY_UPDATED:     'entity_updated',
  ENTITY_DELETED:     'entity_deleted',
  FILING_MARKED:      'filing_marked',
  AR_TOGGLED:         'ar_toggled',
  BO_TOGGLED:         'bo_toggled',
  OBLIGATION_CREATED: 'obligation_created',
  OBLIGATION_UPDATED: 'obligation_updated',
  OBLIGATION_DELETED: 'obligation_deleted'
};
```

### API

| Function | Signature | Purpose |
|----------|-----------|---------|
| `logAuditEvent(action, details)` | `(string, Object) -> Promise<void>` | Appends a structured entry to `compliance/{uid}/audit-log` via Firebase `push()`. Entry includes `action`, `actorUid`, `actorEmail`, `timestamp`, plus all properties from `details` |

All audit writes are fire-and-forget. Callers invoke `logAuditEvent(...).catch(() => {})` so that audit failures never block the primary operation. The audit service automatically captures the current user's UID and email from `auth.currentUser`.

---

## UI Components

### Entity Registry Panel

The entity registry is the first panel on the page. It displays all registered entities in a two-column layout with full CRUD capabilities.

**Layout:**
- Header row with "Entity Registry" title and **Add Entity** button (green, top-right)
- Left column (8 cols): Active entities table
- Right column (4 cols): Dormant entities table

**Active entity table columns:**
| Column | Description |
|--------|-------------|
| Name | Legal company name |
| Reg # | CIPC registration number |
| Purpose | Business description |
| CIPC Status | "IN BUSINESS" or "DORMANT" |
| AR | Annual Return compliance badge (clickable) |
| BO | Beneficial Ownership compliance badge (clickable) |
| Oversight | Director name responsible for entity |
| Actions | Edit (pencil) and Delete (trash) buttons per row |

**Badge interaction:**
- Clicking an AR or BO badge opens a SweetAlert2 confirmation dialog
- Toggling updates `arCompliant` or `boCompliant` in Firebase and fires an audit event
- The DOM is updated in-place after successful write (no full page re-render)
- Badges display as green (Compliant) or red (Non-Compliant)
- In-flight guard prevents concurrent writes from rapid badge clicks

**Add Entity:**
- Opens an 11-field SweetAlert2 form dialog (600px wide)
- Required fields: Registration Number, Entity Name, Entity Type, Purpose
- Optional fields: Status (default: active), CIPC Status (default: IN BUSINESS), Financial Year-End (MM-DD format), Incorporation Date (date picker), Oversight Contact, Oversight Phone, Notes
- **Linked Locations:** Checkbox list populated asynchronously from `loadLocations()`, stored as `linkedLocationIds[]`
- Client-side validation: required field checks, MM-DD regex for FYE
- Calls `createEntity()` with duplicate guard (rejects if registration number exists)
- On success: updates local arrays immutably, re-renders table cards in-place, shows toast notification

**Edit Entity:**
- Per-row pencil button opens a pre-filled SweetAlert2 form
- Includes Financial Year-End editor and Incorporation Date picker
- Calls `updateEntity(registrationNumber, updates)` for partial update
- Compliance flags (`arCompliant`, `boCompliant`) are excluded from the edit form -- they are managed via badge toggles only

**Delete Entity:**
- Per-row trash button opens a SweetAlert2 confirmation dialog
- Shows entity name for verification
- Calls `deleteEntity(registrationNumber)` which performs an atomic multi-path delete (entity record + filing records for 2024 through `currentYear + 1`)
- On success: removes entity from local arrays, re-renders table cards

**Truncation fix:** The `truncate()` helper slices raw text before HTML-escaping, preventing broken entity references when text is cut mid-character in table cells.

**Summary header:** Shows total counts with badges -- e.g. "Active: 8 | Dormant: 1"

### Compliance Tracker Panel

The compliance tracker is the second panel. It shows all obligations sorted by priority with filing status per entity, entity filtering, and manual due date support.

**Priority sort order:** Obligations are sorted by urgency rather than category grouping:
1. **Overdue** -- oldest first (date ascending)
2. **Pending / upcoming** -- soonest first. The first non-overdue pending item receives a "NEXT DUE" badge and an amber left-border highlight via the `.next-due-row` CSS class
3. **In Progress** -- no date ordering
4. **Not Applicable**
5. **Filed**

**Table columns:**
| Column | Description |
|--------|-------------|
| # | Row number |
| Obligation | Obligation name (plus "NEXT DUE" badge on the first upcoming item) |
| Frequency | Monthly / Bi-Annual / Annual / Once-Off (HTML-escaped) |
| Authority | SARS, CIPC, DoL, etc. |
| Next Due | Calculated deadline with color coding |
| Applies To | Entity count or specific entity names |
| Owner | Default responsible party (Accountant, Director, etc.) |
| Status | Filing status badge |
| Action | "Mark Filed" / "Set Due Date" / "Select entity" depending on context |

**Entity filter dropdown:** At the top of the tracker, alongside the year selector, a dropdown allows filtering to a single entity. Options include "All Entities" plus each active entity by name. Changing the selection re-renders the table body immediately with filtered and priority-sorted obligations. When an entity filter is active:
- Due dates and statuses are computed specifically for that entity
- "Mark Filed" targets only the selected entity (not batch across all)
- Manual-rule obligations show "Set Due Date" or "Update Date" buttons

**Year selector:** A dropdown with 4 options (`currentYear - 2`, `currentYear - 1`, `currentYear`, `currentYear + 1`). Changing the year re-fetches filings from Firebase and re-renders the table body with a loading spinner during the fetch.

**Manual due dates:** For obligations with `per_entity_licence_expiry`, `per_entity_inspection_anniversary`, or `manual` deadline rules:
- Entity filter must be active to set a date
- Action column shows a "Set Due Date" button (or "Update Date" if a date is already stored)
- Clicking opens a date picker dialog; saving writes `manualDueDate` to the filing record via `setManualDueDate()`
- Once set, the action column shows both "Update Date" and "Mark Filed" buttons
- In "All Entities" view: shows a "Select entity" hint instead of action buttons
- The manual due date drives overdue/upcoming status like any calculated obligation

**Mark Filed dialog:** Clicking the "Mark Filed" button opens a SweetAlert2 dialog with:
- **Filed date** -- Date picker input
- **Filed by** -- Text input (max 200 characters)
- **Notes** -- Textarea (max 1000 characters)
- **Applicable entities** -- Based on entity filter (single entity when filtered, all applicable entities when unfiltered)

Filing writes use `Promise.all()` to batch-update all selected entities in parallel, with per-entity due date calculation for anniversary and year-end rules.

**Cancel fix:** The "Mark Filed" button is re-enabled when the dialog is cancelled (previously remained disabled on cancel).

### Obligations Manager Panel

The obligations manager is the third panel. It provides full CRUD capabilities for obligation definitions via SweetAlert2 dialogs.

**Layout:**
- Card with "Obligations Manager" header
- Entity filter dropdown in the card header -- filters the obligation list to show only obligations applicable to the selected entity
- "Add Obligation" button (green, top-right)
- Sortable table grouped by category (monthly, bi-annual, annual, once-off) then alphabetically by name within each group

**Table columns:**
| Column | Description |
|--------|-------------|
| # | Row number |
| Obligation | Name (with "custom" badge for user-created obligations) |
| Category | monthly / biannual / annual / once_off |
| Authority | Regulatory authority |
| Deadline Rule | Rule type shown in monospace code formatting |
| Applies To | "All Entities" or specific entity names |
| Owner | Default responsible party |
| Actions | Edit (pencil) and Delete (trash) buttons per row |

**Add Obligation:**
- Opens a 9-field SweetAlert2 dialog (600px wide)
- Required fields: Name, Category, Deadline Rule, Applies To (all or specific entities)
- Optional fields: Obligation ID (auto-generated from name via `slugify()`), Frequency (auto-filled from category if blank), Authority, Fixed Deadline (shown only when rule is `fixed_date`), Default Owner
- Entity checkboxes shown/hidden dynamically based on "All Entities" vs "Specific Entities" radio selection
- Calls `createObligation(obligationId, data)` with duplicate guard
- On success: updates local obligations map immutably, re-renders table, shows toast

**Edit Obligation:**
- Per-row pencil button opens a pre-filled SweetAlert2 dialog
- Obligation ID shown as read-only in monospace font (cannot be changed after creation)
- Calls `updateObligation(obligationId, updates)` for partial update
- On success: updates local state immutably, re-renders table

**Delete Obligation:**
- Per-row trash button opens a SweetAlert2 warning dialog showing the obligation name
- Calls `deleteObligation(obligationId)` which atomically removes the obligation definition plus all associated filing records across all entities and years
- On success: removes from local state using object destructuring, re-renders table

**Concurrency guard:** A `handlerInProgress` flag prevents listener stacking from rapid clicks or dialog cancels. The flag is cleared in `.finally()` blocks so the UI always returns to a functional state.

**Event delegation:** Click events are handled via a single container-level listener that routes to the appropriate handler. The listener is removed and re-attached on each re-render to prevent stacking.

---

## Cloud Functions

### seedComplianceData

| Property | Value |
|----------|-------|
| Trigger | HTTP POST |
| Auth | Bearer token, requires `admin === true` claim |
| Purpose | Idempotent seed of compliance data |
| File | `functions/seedComplianceData.js` |
| Data | `functions/compliance-seed-data.js` (531 lines) |

**What it seeds:**
- `compliance/{uid}/entities/` -- 9 company entities (all with `financialYearEnd: "02-28"`)
- `compliance/{uid}/obligations/` -- 21+ obligation definitions
- `compliance/{uid}/settings/` -- Default reminder configuration

**Usage:**

```bash
# Seed compliance data (requires admin Firebase ID token)
curl -X POST https://<region>-<project>.cloudfunctions.net/seedComplianceData \
  -H "Authorization: Bearer <admin-id-token>"
```

> **Important:** The seed data file (`compliance-seed-data.js`) lives server-side only in the `functions/` directory. Company names, CIPC registration numbers, and director contact details are NOT included in the client-side bundle.

**Idempotency:** The function checks for existing data before writing. It is safe to re-run without duplicating records.

**Seed data fixes applied:**
- All 9 entities now have `financialYearEnd: "02-28"` (previously `null` on all entities, which caused null year-end for anniversary/FYE rules)
- The `vat_bimonthly` obligation correctly has `appliesToEntityIds` populated with the 6 trading entity IDs
- The `decoded` variable is declared with `let` before the try block, preventing `ReferenceError: decoded is not defined` at the `compliance/undefined` path

---

## Initialization Flow

The module follows this startup sequence when `corporate-compliance.html` loads:

```
DOMContentLoaded
  -> featureAccessControl.checkFeatureAccess('corporateCompliance')
    -> (fail) Upgrade prompt + redirect
    -> (pass) onAuthStateChanged(user)
      -> initializeComplianceModule('compliance-app')
        -> scaffold panel layout:
             <div id="panel-entity-registry">
             <div id="panel-compliance-tracker">
             <div id="panel-obligations-manager">
        -> Promise.all([
             loadEntities(),
             loadObligations(),
             loadFilings(currentYear)
           ])
        -> filterEntities by status (active vs dormant)
        -> updateSummaryBadges()
        -> await renderEntityRegistry()
        -> await renderComplianceTracker()
        -> await renderObligationsManager()
```

Data loading is parallelized via `Promise.all()` for entities, obligations, and filings. After all data is loaded, the UI renders three panels in sequence: entity registry, compliance tracker, and obligations manager. Location data for the entity form's linked-locations checkboxes is loaded lazily via `loadLocations()` when the Add or Edit Entity dialog opens.

---

## Navigation

The compliance module supports two access modes:

**Embedded in admin dashboard:** When accessed from the Corporate Compliance card on `admin-dashboard.html`, the module renders natively in the dashboard's content pane. There is no iframe and no double sidebar -- the compliance UI replaces the dashboard content area directly.

**Standalone page:** When accessed directly via `corporate-compliance.html`, the page renders with a clean green header containing a "Back to Dashboard" link that navigates to `admin-dashboard.html`. The admin sidebar is removed from the standalone page to avoid navigation conflicts.

---

## Implementation Status

### Complete

- Entity registry with active/dormant split view
- AR/BO compliance badge toggles with SweetAlert2 confirmation
- 25+ obligation definitions across all four categories
- Deadline calculation engine with multiple rule types
- VAT bimonthly filing month lookup table (replacing inverted even/odd logic)
- Financial year-end parsing via `parseFinancialYearEnd()` (fixes Invalid Date for "MM-DD" strings)
- Month addition with last-day clamping (fixes February overflow)
- Fixed-date rule without erroneous next-year advance
- Filing status tracking and recording per entity per year
- Multi-year filing history via year selector (4-year range: currentYear-2 to currentYear+1)
- SweetAlert2 dialogs for all user interactions
- Responsive layout (desktop + mobile bottom navigation)
- XSS protection via `escapeHtml()` and `escapeAttr()` utilities (including `obligation.frequency` in tracker rows)
- SRI integrity hashes on all CDN resources
- Idempotent seed Cloud Function with admin auth
- Multi-tenancy -- compliance data scoped to `compliance/{uid}/` per user
- Security rules hardening -- schema validation on entities, obligations, filings, and audit log
- Input validation -- `maxlength` attributes on all form inputs + JS validation in SweetAlert2 `preConfirm`
- Dynamic `updatedBy` -- uses `auth.currentUser.email || auth.currentUser.uid` via `currentUserIdentifier()` helper
- Subscription tier-gating -- access controlled via `featureAccessControl.checkFeatureAccess('corporateCompliance')` for Professional and Enterprise tiers
- Add Entity UI -- 11-field SweetAlert2 form with location multi-select, incorporation date picker, and duplicate guard
- Edit Entity UI -- per-row pre-filled form including Financial Year-End editor and Incorporation Date picker
- Delete Entity UI -- per-row confirmation dialog with atomic multi-path delete (entity + dynamic year range of filings)
- Linked Locations -- entities can be associated with Firebase locations via `linkedLocationIds[]`
- Entity truncation fix -- `truncate()` slices raw text before HTML-escaping
- Audit trail -- structured audit log in `compliance/{uid}/audit-log` with 9 action types, fire-and-forget writes
- Obligations Manager -- full CRUD panel for obligation definitions with entity filter, SweetAlert2 dialogs, and `slugify()` auto-ID generation
- Priority sort -- obligations sorted by urgency (overdue, pending, in_progress, not_applicable, filed) with date-based sub-sorting
- NEXT DUE highlight -- first upcoming pending obligation receives a "NEXT DUE" badge and `.next-due-row` amber left-border CSS class
- Entity filter (tracker) -- dropdown to filter obligations and compute per-entity due dates and statuses
- Per-entity filing -- "Mark Filed" targets only the selected entity when entity filter is active
- Manual due dates -- "Set Due Date" / "Update Date" action for `manual`, `per_entity_licence_expiry`, and `per_entity_inspection_anniversary` rules via `setManualDueDate()`
- Cancel fix -- "Mark Filed" button re-enabled on dialog cancel
- Service account key gitignore -- `*-adminsdk-*.json` added to `.gitignore`
- `corporateCompliance` feature registered in `platform-features.js` with Professional and Enterprise tier access

### Partial / In Progress

- Loading states and button debounce during async operations

### Not Yet Implemented

| Feature | Description | Priority |
|---------|-------------|----------|
| Reminder notifications | WhatsApp/email via Twilio for upcoming deadlines | Medium |
| Reporting & export | Compliance summary as PDF or CSV download | Medium |
| Analytics dashboard | Filing completion rates and overdue trends over time | Low |

---

## Resolved Issues

All issues from the original hardening plan have been resolved. The full plan was documented at: `docs/plans/2026-03-04-corporate-compliance-hardening.md`

### Critical Issues

| ID | Issue | Resolution |
|----|-------|------------|
| C1 | Multi-tenancy -- data not scoped per user | Fixed -- compliance data scoped to `compliance/{uid}/` |
| C2 | Service account key (`*-adminsdk-*.json`) not in `.gitignore` | Fixed -- pattern added to `.gitignore` |
| C3 | No tier-gating enforcement -- module accessible without subscription check | Fixed -- `featureAccessControl.checkFeatureAccess('corporateCompliance')` enforces Professional/Enterprise tier |
| C4 | `decoded` variable not declared before try block in `seedComplianceData.js` | Fixed -- `let decoded` declared before try block, preventing `ReferenceError` |

### High Issues

| ID | Issue | Resolution |
|----|-------|------------|
| H1 | `getEntityYearEnd` used `new Date(fye)` which returned Invalid Date for "02-28" strings | Fixed -- delegates to `parseFinancialYearEnd(fye, year)` which correctly parses "MM-DD" format |
| H2 | `fixed_date` rule erroneously advanced past deadlines to next year | Fixed -- removed the "advance" branch; returns the fixed date for the requested year |
| H3 | VAT bimonthly logic had inverted even/odd month check | Fixed -- replaced with `VAT_FILING_MONTH` lookup table `[0,2,2,4,4,6,6,8,8,10,10,0]` |
| H4 | `obligation.frequency` not escaped in tracker table rows (stored XSS) | Fixed -- frequency value passed through `escapeHtml()` |
| H6 | `incorporationDate` date picker missing from entity forms | Fixed -- date picker added to both Add Entity and Edit Entity SweetAlert2 forms |
| H7 | All 9 seed entities had `financialYearEnd: null` | Fixed -- all entities now have `financialYearEnd: "02-28"` in seed data |
| H8 | `addMonths()` did not clamp to last day of target month (February overflow) | Fixed -- clamps to `Math.min(date.getDate(), lastDay)` to prevent rollover |
| H9 | Year selector only showed 2 options | Fixed -- expanded to 4 options: `currentYear-2` through `currentYear+1` |
| H10 | `truncate()` escaped HTML before slicing, potentially breaking entity references | Fixed -- slices raw text before escaping |

### Medium Issues

| ID | Issue | Resolution |
|----|-------|------------|
| M3 | Concurrent AR/BO badge clicks could cause race conditions | Mitigated -- `pendingBadgeUpdates` Set guards against in-flight duplicates |
| M1 | No `maxlength` validation in filing dialog inputs | Fixed -- HTML `maxlength` attributes on all inputs + JS validation in SweetAlert2 `preConfirm` |
| H9 (orig) | Hardcoded `updatedBy: 'director'` in two components | Fixed -- replaced with `auth.currentUser.email \|\| auth.currentUser.uid` via `currentUserIdentifier()` helper |

### Previously Open (Now Complete)

| ID | Issue | Resolution |
|----|-------|------------|
| C3 (orig) | No audit trail for compliance changes | Complete -- `audit-service.js` writes structured entries to `compliance/{uid}/audit-log` for all 9 action types |

---

## Dependencies

| Library | Version | Source | Purpose |
|---------|---------|--------|---------|
| Bootstrap | 5.3.0 | cdnjs CDN | Layout, badges, tables, responsive grid |
| Font Awesome | 6.0.0 | cdnjs CDN | Icons throughout the UI |
| SweetAlert2 | 11.14.5 | jsDelivr CDN | Confirmation dialogs, form dialogs, error alerts |
| Firebase SDK | 10.x | Firebase CDN | Authentication and Realtime Database |

All CDN resources include SRI integrity hashes for supply-chain security.

---

## Future Roadmap

### 1. WhatsApp Reminder Notifications

Wire the existing reminder settings schema to Twilio WhatsApp integration:
- 7-day, 3-day, and 1-day reminders before deadlines
- Daily summary of overdue obligations
- Configurable per-entity notification preferences

### 2. Reporting & Export

Generate compliance summary reports as PDF or CSV:
- Per-entity compliance scorecard
- Year-over-year comparison
- Outstanding obligations by authority

### 3. Analytics Dashboard

Filing completion rate charts, overdue trend lines, and authority-level compliance breakdowns using Chart.js.
