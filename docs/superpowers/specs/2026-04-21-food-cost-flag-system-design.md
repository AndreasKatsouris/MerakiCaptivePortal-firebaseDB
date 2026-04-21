# Food Cost Flag System — Design Spec

**Date:** 2026-04-21
**Module:** `public/js/modules/food-cost/`
**Status:** Draft — awaiting user review

## 1. Purpose

When a user loads a new or existing stock data file in the Food Cost module, the platform should surface *flags* — signals that specific items need attention. Flags come from two sources:

- **Automatic** — the system detects anomalies (cost spikes, usage variance, dead stock, invalid values, missing items, high food-cost %) and flags likely culprits.
- **Manual** — users tag items with statuses like "Out of Stock" or "Off Menu" from the stock data table.

A flagged item with history must remain visible even when it is absent from the current upload (e.g., an item marked "Out of Stock" this week).

## 2. Scope (v1)

In scope:
- Six auto-flag rule types, one composite score, three severity levels.
- Eight manual flag tags, multi-tag per item, persistent per-item.
- Smart auto-clear rules (e.g., "Out of Stock" clears on reappearance with usage).
- Display of flagged-but-missing historical items via a toggle in the stock table, plus a dedicated Flags tab.
- Per-location threshold overrides with global defaults.
- Top tab navigation added to the Food Cost module page (Stock Data / Orders / Flags / Analytics).
- Flag badges inline in the stock data table; flag warnings on the order-review screen.

Out of scope for v1:
- Category-level threshold granularity (YAGNI — add if real usage demands it).
- Notifications (email / WhatsApp / push) for new flags.
- Flag-driven automation (auto-exclude flagged items from POs, etc.).
- Editing of auto-flag rule definitions via UI (rules are code-defined; only thresholds are configurable).

## 3. Architecture

The system splits along responsibility:

| Layer | Files | Owns |
|---|---|---|
| Shared service | `services/flag-service.js` (NEW) | Flag CRUD, Firebase I/O, identity hashing, auto-clear rules |
| Detection engine | `components/analytics/flag-detection-engine.js` (NEW) | Runs 6 auto-flag rules against a processed stock record, returns flag events |
| Display merger | `flag-display-merger.js` (NEW) | Takes processed stock array + active flags, returns merged view (current items + flagged-missing) |
| Manual tagging UI | `components/flags/` (NEW) | Flag column in stock table, tag modal, badges |
| Flags dashboard | `components/flags/flags-dashboard/` (NEW) | Full command center: list, filter, resolve, history |
| Module nav | `admin-dashboard.html` foodCostContent block (EDIT) | Top tab bar: Stock Data / Orders / Flags / Analytics |
| Data entry integration | `data-processor.js` (LIGHT EDIT) | Attach stable item key to each processed row; no merge logic |
| Stock table | `components/tables/EditableStockDataTable.js` (EDIT) | Render flag badges, support "Show flagged historical items" toggle |
| Order review | PO components (EDIT) | Show warning when order contains flagged items |

Rationale: `data-processor.js` is already 1097 lines. A separate `flag-display-merger.js` keeps parsing focused. Detection engine sits in analytics because it builds on the same historical data the analytics dashboard uses.

## 4. Data Model

### 4.1 Item Identity

Stock items need a stable identity across uploads so persistent flags survive. `itemCode` is unreliable — `data-processor.js:436` falls back to random IDs when itemCode is empty.

**Item key algorithm** (`flag-service.js#computeItemKey`):

```
if (itemCode && !itemCode.startsWith("ITEM-"))   // real code exists
  return `code:${itemCode}`;
else
  return `hash:${sha1(normalize(description) + "|" + normalize(category) + "|" + normalize(costCenter))}`;
```

`normalize` = trim, lowercase, collapse whitespace. The `code:` / `hash:` prefix makes the fallback origin explicit in storage.

`data-processor.js` attaches the computed `itemKey` to each row during processing. Everything downstream (service, merger, UI) keys off `itemKey`.

### 4.2 Firebase RTDB Schema

Three new nodes alongside existing `stockUsage/`:

```
stockItemFlags/
  {locationId}/
    {itemKey}/
      itemKey: string
      itemCode: string        // last seen
      description: string     // last seen
      category: string
      costCenter: string
      manualFlags: {
        {flagType}: {          // one of 8 types; multi-tag
          appliedBy: uid
          appliedAt: timestamp
          note: string | null
          expiresAt: timestamp | null
        }
      }
      autoFlags: {             // last evaluation result
        {ruleId}: {            // HIGH_FC_PCT | COST_SPIKE | USAGE_ANOMALY | DEAD_STOCK | MISSING_WITH_HISTORY | INVALID_VALUES
          severity: "critical" | "warning" | "info"
          score: number        // composite 0-100
          detectedAt: timestamp
          sourceRecordId: string   // stockUsage record that triggered this
          details: { ... }     // rule-specific payload
        }
      }
      lastSeenRecordId: string
      lastSeenAt: timestamp
      resolvedFlags: {         // audit trail of cleared flags, push-keyed
        {pushId}: {            // RTDB push key; trim to most recent 20 on write
          flagType: string     // manual type or auto rule id
          resolvedBy: uid
          resolvedAt: timestamp
          reason: string | null
        }
      }

stockFlagConfig/
  _defaults/                   // shipped defaults, read fallback
    thresholds: { ... }
  {locationId}/                // per-location override; merged over defaults
    thresholds: {
      foodCostPctWarning: 35
      foodCostPctCritical: 40
      unitCostSpikePct: 15
      usageVarianceStdDev: 2
      deadStockDaysThreshold: 28
      missingItemLookbackWeeks: 4
    }
    updatedBy: uid
    updatedAt: timestamp

stockFlagAudit/                // append-only, optional viewing
  {locationId}/
    {eventId}/                 // auto-generated push key
      itemKey, eventType, severity, actorUid, timestamp, payload
```

### 4.3 Security Rules

- `stockItemFlags/{locationId}`: read/write if admin OR user has `userLocations/{uid}/{locationId}` entry. Validate `itemKey` pattern, severity enum, flag type enum.
- `stockFlagConfig/_defaults`: read auth != null; write admin only.
- `stockFlagConfig/{locationId}`: read/write location-scoped (same pattern as above).
- `stockFlagAudit/{locationId}`: write auth != null + location-scoped; read admin + location owners. Server-style append-only (no update/delete via client).

## 5. Auto-Flag Rules

Each rule produces 0..N flag events per stock record upload.

| Rule ID | Trigger | Severity mapping |
|---|---|---|
| `HIGH_FC_PCT` | Overall food cost % exceeds threshold | >warning → Warning; >critical → Critical. Identifies culprits (see §5.1). |
| `COST_SPIKE` | Item unit cost up >threshold vs trailing mean | >15% Warning; >30% Critical |
| `USAGE_ANOMALY` | Item usage outside ±N σ of historical mean | 2σ Warning; 3σ Critical |
| `DEAD_STOCK` | Item in file with opening balance but zero usage for N days | Info |
| `MISSING_WITH_HISTORY` | Item absent from current file but present in last N weeks | Info (elevates to Warning if it has an unresolved manual flag) |
| `INVALID_VALUES` | Negative closing, closing > opening + purchases, negative unit cost | Critical |

### 5.1 Culprit Identification for HIGH_FC_PCT

Composite score per item (0–100), pick top items above score threshold:

```
score = 0.4 * normalizedContribution       // item cost / total cost, normalized
      + 0.3 * historicalShareDeviation     // |currentShare - meanHistoricalShare| / stdDev
      + 0.3 * unitCostChangeFactor         // recent unit cost vs trailing mean
```

Reuses `OrderCalculator.calculateCriticalityScore` (`order-calculator-advanced.js`) as the backbone — flag detection extends it with contribution and share-deviation inputs rather than duplicating.

### 5.2 Severity Rollup

An item's displayed severity = highest severity across all its active flags (manual + auto). Manual tags have implicit severity: `OUT_OF_STOCK`, `SUPPLIER_ISSUE`, `INVESTIGATION` → Warning; `WASTAGE` → Warning; others → Info.

## 6. Manual Flag Types

Multi-tag per item. Eight types:

| Type | Persistence | Auto-clear rule |
|---|---|---|
| `OUT_OF_STOCK` | Persistent | Clears when item reappears with usage > 0 |
| `OFF_MENU` | Persistent | Never auto-clears; requires explicit resolve |
| `SEASONAL` | Persistent with optional expiry | Clears on expiresAt |
| `INVESTIGATION` | Persistent | Never auto-clears |
| `SUPPLIER_ISSUE` | Persistent | Never auto-clears |
| `RECIPE_CHANGE` | Persistent with 8-week decay | Auto-expires 8 weeks after applied |
| `WASTAGE` | Per-record — stored on the `stockUsage/{recordId}/wastageFlags/{itemKey}` child, not in `stockItemFlags`. Not carried across uploads. | N/A |
| `CUSTOM` | Persistent | Requires explicit resolve |

`CUSTOM` carries a free-text label (max 40 chars, HTML-escaped).

Each manual flag stores `appliedBy`, `appliedAt`, optional `note`, optional `expiresAt`.

## 7. Display Behavior

### 7.1 Top Tab Navigation (Food Cost Module)

Inside `#foodCostContent` in `admin-dashboard.html`, replace the current single content block with a Bootstrap `nav-tabs` bar:

```
[Stock Data]  [Orders]  [Flags (N)]  [Analytics]
```

- Default tab: **Stock Data**.
- **Flags** badge shows count of unresolved Critical + Warning flags across current location.
- **Analytics** re-surfaces the currently orphaned analytics dashboard (routed through `food-cost-analytics.html` content or inlined — see §10).

### 7.2 Stock Data Tab

- New **Flags** column in `EditableStockDataTable`: shows badge cluster (severity-colored pills) per row. Click → opens tag modal.
- Toolbar toggle: **Show flagged historical items**. When enabled, `flag-display-merger` injects rows for items with active flags but absent from current file. Injected rows are greyed, zeros in numeric cells, sorted alongside normal items, clearly labeled ("Historical — not in current file").
- Manual flag apply flow: row flag-cell click → modal lists 8 types + existing flags on item + note field → Save writes to `stockItemFlags/{locationId}/{itemKey}/manualFlags`.

### 7.3 Flags Tab

List/table view grouped by severity:
- Filters: severity, flag type (auto vs manual), resolved/unresolved, search by name.
- Actions per row: view item detail, resolve (with optional reason), dismiss (soft-delete flag, retains audit).
- Top strip: summary counts, "Re-run detection" button (manually re-evaluates current loaded record against config).
- Detail drawer: flag history, linked stock record, resolved/dismissed audit trail, note edit.

### 7.4 Orders Tab

Existing purchase order workflow. New: **pre-submit warning modal** lists any flagged items in the current draft PO. User can proceed or cancel. No automatic blocking.

### 7.5 Analytics Tab

Loads the existing analytics dashboard (`analytics-dashboard.js`). No functional changes in this spec; resurfacing only.

## 8. Data Flow

### 8.1 Stock File Upload

```
1. User uploads file → data-processor parses → rows enriched with itemKey
2. Record saved to stockUsage/{recordId}
3. flag-service runs auto-clear pass over location's manualFlags (e.g., OUT_OF_STOCK items now reappearing)
4. flag-detection-engine runs 6 rules against processed record + historical data
5. Auto-flag results written to stockItemFlags/{locationId}/{itemKey}/autoFlags
6. flag-display-merger produces final table view
7. UI renders with badges; Flags tab count updates
```

### 8.2 Manual Flag Apply

```
1. User clicks flag column → modal
2. User picks tag(s) + optional note
3. flag-service writes to stockItemFlags/{locationId}/{itemKey}/manualFlags/{flagType}
4. Audit event pushed to stockFlagAudit
5. UI updates badge cluster optimistically; rolls back on write failure
```

### 8.3 Flag Resolve

```
1. User clicks resolve on Flags tab
2. flag-service moves flag entry to resolvedFlags array (ring-buffered to 20)
3. Audit event recorded
4. Severity rollup recomputed for item
```

## 9. Configuration

Thresholds resolve in this order: location override → global defaults. Shipped defaults:

```
foodCostPctWarning: 35
foodCostPctCritical: 40
unitCostSpikePct: 15             // Warning threshold
unitCostSpikeCriticalPct: 30
usageVarianceStdDev: 2            // Warning
usageVarianceCriticalStdDev: 3
deadStockDaysThreshold: 28
missingItemLookbackWeeks: 4
highFcPctCulpritMinScore: 50
```

Flags tab includes a settings panel (admin/owner only) to edit the location overrides. Global defaults are read-only from the UI.

## 10. Known Constraints and Decisions

- **Analytics resurfacing approach:** The Analytics tab loads the existing `analytics-dashboard.js` inside `#foodCostAnalyticsPane`. The standalone `food-cost-analytics.html` page remains as a direct-link fallback. No rewrite of analytics in this scope.
- **data-processor edit boundary:** Only two changes — add `itemKey` computation per row, expose the computation via `flag-service`. No other logic moves.
- **Performance:** Detection engine runs against already-loaded processed data + cached historical from `historical-usage-service` — no extra RTDB reads on typical upload. Single write batch for auto-flag results.
- **Multi-location:** Flags are location-scoped. Switching location reloads flag data.
- **Vue migration compatibility:** Components follow the existing pattern in `components/` (not Vue 3 / Pinia). Future migration moves them alongside the rest of the module.
- **Immutability:** All state updates in the service use spread operators; no in-place mutation of flag objects.
- **XSS:** Custom flag labels and notes pass through `escapeHtml` before injection into any non-Vue template.

## 11. Testing Strategy

- **Unit tests** (`tests/flag-service.test.js`, `tests/flag-detection-engine.test.js`):
  - Identity: same item description/category yields same hash key; itemCode change yields different key (expected).
  - Auto-clear: OUT_OF_STOCK clears on usage reappearance; SEASONAL clears on expiresAt.
  - Each auto-flag rule: triggers at threshold, does not trigger below, severity correct.
  - Composite score bounds (0–100).
- **Integration tests** (`tests/flag-flow.integration.test.js`):
  - Full upload → detection → persistence cycle against Firebase emulator.
  - Merger output includes flagged-missing items.
  - Security rules: location-scoped read/write enforcement.
- **E2E** (Playwright journey):
  - Upload file → apply manual flag → switch tabs → see flag in Flags tab → resolve → flag clears from stock table badge.
- **Coverage target:** 80%+ across new files.

## 12. Rollout

1. Feature branch in isolated worktree (does not touch live workflow).
2. Agent team spawns (ARCH / BACK / FRONT / MODULE / QA / SEC) per existing CLAUDE.md pattern.
3. COORD reviews each role's output before merge.
4. Deploy during a quiet window for the owner's active stock operations.
5. Post-deploy: 1-week monitoring — audit log reviewed for unexpected auto-flag frequency; thresholds tuned if noisy.

## 13. Open Items

None at spec sign-off. Thresholds may need tuning during rollout — expected.
