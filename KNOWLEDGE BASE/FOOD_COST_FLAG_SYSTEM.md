# Food Cost Flag System

The flag system surfaces stock items that need operator attention — both
**manual** flags applied by staff and **auto** flags raised by the detection
engine after each upload. Flags are scoped to a `locationId`, keyed by a
stable `itemKey`, and persisted under `stockItemFlags/{locationId}`.

## Flag Types

### Manual flags (operator-applied via the FlagTagModal)

| Flag             | Default severity | Auto-clear behavior                      |
|------------------|------------------|------------------------------------------|
| `OUT_OF_STOCK`   | Warning          | Clears next upload where `usage > 0`     |
| `OFF_MENU`       | Info             | Manual only                              |
| `SEASONAL`       | Info             | Clears when `expiresAt` elapses          |
| `INVESTIGATION`  | Warning          | Manual only                              |
| `SUPPLIER_ISSUE` | Warning          | Manual only                              |
| `RECIPE_CHANGE`  | Info             | Decays after 8 weeks                     |
| `WASTAGE`        | Warning          | Manual only                              |
| `CUSTOM`         | Info             | Manual only; requires `customLabel ≤ 40` |

### Auto flags (raised per upload by the detection engine)

| Rule                   | Severity logic                                         |
|------------------------|--------------------------------------------------------|
| `INVALID_VALUES`       | Critical — negative qty, closing > available, neg cost |
| `COST_SPIKE`           | Warning ≥ 15%, Critical ≥ 30% above historical mean    |
| `USAGE_ANOMALY`        | Warning ≥ 2σ, Critical ≥ 3σ from historical mean       |
| `DEAD_STOCK`           | Info — opening>0, zero usage, idle ≥ 28 days           |
| `MISSING_WITH_HISTORY` | Info; Warning if also has unresolved manual flag       |
| `HIGH_FC_PCT`          | Warning ≥ 35%, Critical ≥ 40%; only items scoring ≥ 50 |

`HIGH_FC_PCT` uses a composite culprit score:
`100 × (0.4·contribution + 0.3·shareDeviation + 0.3·unitCostChange)`.

## Auto-clear

Runs as part of `runFlagPipeline` on every stock upload, before detection:

- `OUT_OF_STOCK` → cleared when item reappears with `usage > 0`.
- `SEASONAL` → cleared once `expiresAt` is in the past.
- `RECIPE_CHANGE` → cleared after 8 weeks elapsed since `appliedAt`.

Cleared flags emit `flag_auto_cleared` events into `stockFlagAudit/{loc}`.

## Thresholds

Default thresholds live in `flag-service.js → DEFAULT_THRESHOLDS` and are
seeded under `stockFlagConfig/_defaults/thresholds`. Per-location overrides
live under `stockFlagConfig/{locationId}/thresholds` — the resolution order
is **built-ins → seeded defaults → location overrides**.

To edit thresholds for a location:

1. Open the **Food Cost → Flags** tab.
2. Click **Settings**.
3. Update any of the nine threshold fields. Owners and admins only.

## UI Surfaces

- **Stock table**: Flags column with badge cluster + edit button (in edit
  mode). Historical-only items render as greyed `table-secondary` rows when
  the *Show flagged historical items* toggle is on.
- **Tab nav**: total flag count badge on the Flags tab; severity summary
  pill in the Food Cost section header.
- **Flags tab**: severity-ranked list with Severity / Source / Search
  filters, **Re-run detection** and **Settings** buttons.
- **Flag detail**: click *View* on any row — shows active and resolved
  flags, supports *Resolve all active*.
- **Orders / PO export**: pre-export gate lists any draft items that carry
  unresolved flags; user must explicitly confirm to proceed.

## Audit Trail

Every mutation writes to `stockFlagAudit/{locationId}` (push-keyed):

- `manual_flag_applied`
- `manual_flag_removed`
- `flag_resolved`
- `flag_auto_cleared`

`resolvedFlags` is a ring buffer trimmed to the most recent 20 per item.

## Pipeline

`runFlagPipeline({ locationId, recordId, processedItems, foodCostPct,
totalCurrentCost, historicalData })`:

1. Fetch resolved thresholds for the location.
2. Load existing flags.
3. Run auto-clear against the new upload.
4. Run detection across all rules.
5. `writeAutoFlags` for each detected item, storing item meta and
   `lastSeenRecordId`.

The pipeline is invoked automatically after `saveStockData` and is
non-blocking — failures are logged but do not surface to the user.

## Rollout Checklist

1. `firebase deploy --only database` — push the new flag-related rules.
2. Seed `stockFlagConfig/_defaults/thresholds` (admin console snippet, see
   plan Task 4).
3. `npm run build && firebase deploy --only hosting`.
4. Smoke test: open admin dashboard → Food Cost → confirm four tabs →
   upload test file → confirm auto-flags appear → manual tag → resolve.
5. Monitor `stockFlagAudit/{loc}` for the first week; tune thresholds via
   **Flags → Settings** if noise is high.

## Source Layout

```
public/js/modules/food-cost/
├── constants/flag-types.js          RULE_IDS, MANUAL_FLAG_TYPES, severities
├── services/
│   ├── flag-service.js              CRUD + auto-clear + audit
│   ├── flag-detection-engine.js     6 rules + culprit scorer + runDetection
│   └── historical-summary.js        per-itemKey rollup helper
├── flag-pipeline.js                 runFlagPipeline orchestrator
├── flag-display-merger.js           computeRowSeverity, mergeFlaggedHistoricalItems
├── components/flags/
│   ├── FlagBadge.js                 renderFlagBadgeCluster
│   ├── FlagTagModal.js              apply/remove manual flags
│   ├── FlagsDashboard.js            list + filters
│   ├── FlagDetailDrawer.js          detail view + resolve-all
│   └── FlagConfigPanel.js           per-location threshold editor
└── tests/                           vitest specs (93+ tests)
tests/e2e/food-cost-flags.spec.js    Playwright lifecycle journey
```
