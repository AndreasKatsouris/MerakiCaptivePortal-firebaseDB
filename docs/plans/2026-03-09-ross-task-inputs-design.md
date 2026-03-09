# ROSS Task Input Types — Design Document

**Date:** 2026-03-09
**Feature:** Typed task inputs for ROSS workflows and templates
**Scope:** All input types, run-based response storage, builder UI, execution UI, reports

---

## Context

ROSS tasks are currently boolean — a staff member ticks a task complete with no captured data. This feature enriches tasks with typed inputs (photo, text, temperature, etc.) to support checklists that require evidence, readings, or sign-off. Responses are stored per-run, preserving full history for recurring workflows.

---

## Input Types

| Type | `inputConfig` fields | `value` type | Notes |
|------|---------------------|--------------|-------|
| `checkbox` | — | `boolean` | Current behaviour, unchanged |
| `text` | `{ maxLength, placeholder }` | `string` | Free-form notes |
| `number` | `{ unit, min, max, requiredNote }` | `number` | Auto-flagged if outside range |
| `temperature` | `{ unit ('°C'/'°F'), min, max, failLabel, requiredNote }` | `number` | Auto-flagged if outside range |
| `yes_no` | `{ trueLabel, falseLabel }` | `boolean` | Pass/fail with custom labels |
| `dropdown` | `{ options: string[] }` | `string` | Pick from preset list |
| `timestamp` | — | `number` | Unix ms, defaults to now |
| `photo` | `{ maxPhotos }` | `string[]` | Firebase Storage URLs |
| `signature` | — | `string` | Firebase Storage URL (canvas → PNG) |
| `rating` | `{ min, max, labels: string[] }` | `number` | Star rating |

### `requiredNote` flag

Applies to `temperature` and `number` types. When `requiredNote: true` and the submitted value breaches the configured threshold, the staff member must enter an explanatory text note before the response can be submitted. This forces accountability — a manager reviewing a flagged run sees both the breach value and the staff note.

---

## Data Model

### Task object (definition — stored in workflow/template)

```json
{
  "id": "task-uuid",
  "title": "Check fridge temperature",
  "description": "Optional detail",
  "required": true,
  "order": 0,
  "inputType": "temperature",
  "inputConfig": {
    "unit": "°C",
    "max": 4,
    "failLabel": "Too warm — escalate immediately",
    "requiredNote": true
  },
  "assignedTo": "staffMemberId"
}
```

`inputType` defaults to `"checkbox"` for backward compatibility with existing tasks. `inputConfig` is omitted for `checkbox` and `timestamp` types.

### Runs node (new)

```
ross/
  runs/
    {uid}/
      {workflowId}/
        {locationId}/
          {runId}/
            id: string
            workflowId: string
            locationId: string
            startedAt: number
            completedAt: number | null
            completedBy: string | null
            responses/
              {taskId}/
                inputType: string
                value: any              ← shape varies by inputType
                note: string | null     ← required when flagged + requiredNote
                flagged: boolean        ← auto-set for temperature/number breach
                respondedAt: number
                respondedBy: string
```

### Photo / signature storage

Firebase Storage path: `ross/photos/{uid}/{workflowId}/{runId}/{taskId}/{filename}`

---

## Cloud Functions

### New functions

| Function | Auth | Description |
|----------|------|-------------|
| `rossCreateRun` | `verifyAdmin` | Open a new run for a workflow + location. Idempotent — returns existing open run if one already exists. |
| `rossSubmitResponse` | `verifyAdmin` | Submit a typed response for one task within a run. Auto-sets `flagged: true` if value breaches threshold. Enforces `requiredNote` — rejects submission if flagged and note is missing. Marks run `completedAt` when all required tasks have responses. |
| `rossGetRun` | `verifyAdmin` | Get the current open run with all responses. Also returns previous completed run's responses as `previousResponses` map (for "last time" reference in UI). |
| `rossGetRunHistory` | `verifyAdmin` | Paginated list of completed runs for a workflow + location. Powers Reports tab. |

### Modified functions

| Function | Change |
|----------|--------|
| `rossManageTask` | Add `inputType` and `inputConfig` to allowed fields on create/update. Validate `inputType` against the allowed enum. |
| `rossCompleteTask` | Retained for `checkbox` tasks (backward compat). For all other input types, `rossSubmitResponse` is the entry point. |

### Run lifecycle

```
Staff opens workflow
  → rossCreateRun (idempotent)
  → returns: { runId, responses: {}, previousResponses: { taskId: value } }

Staff submits each task response
  → rossSubmitResponse({ runId, taskId, value, note? })
  → auto-flags if threshold breached
  → rejects if flagged + requiredNote + note missing
  → when all required tasks responded: completedAt written, history record written

Next due date advances
  → existing rossScheduledReminder logic unchanged
```

---

## Frontend

### Builder / Template editor

Each task row gains:
- **Input type dropdown** — defaults to `checkbox`
- **Config panel** (shown when type is selected):
  - `temperature` / `number`: unit, min, max, fail label, required note toggle
  - `dropdown`: editable option list (add/remove)
  - `rating`: max value, optional labels per star
  - `text`: max length, placeholder
  - `yes_no`: true label, false label
  - `photo`: max photos
  - Others: no config

### Workflow execution (Workflows tab)

When staff expand an active workflow:

1. `rossCreateRun` called on open (idempotent)
2. Each task renders its input control (see table below)
3. Previous run value shown as subtle hint: *"Last time: 3.2°C"*
4. Flagged responses (threshold breach) shown with red indicator inline
5. If `requiredNote: true` and flagged — note textarea required before submit button enables
6. Each task submitted individually via `rossSubmitResponse`
7. When all required tasks responded — run auto-completes, workflow marked done

### Input controls

| Type | UI control |
|------|-----------|
| `checkbox` | Current tick button (unchanged) |
| `text` | Textarea |
| `number` / `temperature` | Number input + unit label + threshold badge; red border if flagged |
| `yes_no` | Two-button toggle (custom labels) |
| `dropdown` | `<select>` |
| `timestamp` | Datetime-local input, defaults to now |
| `photo` | File input with `capture="environment"` for mobile camera; thumbnail previews; upload on submit |
| `signature` | Canvas draw pad (signature_pad library or custom canvas); clear button; saved as PNG to Storage |
| `rating` | Clickable star row (1–N) |

### Reports tab

- Per workflow: list of completed runs — date, completed-by, flagged task count badge
- Expand a run → all task responses rendered inline with their values
- Flagged responses highlighted in amber/red with staff note shown below

---

## Deferred (Phase 2)

- Barcode / QR code scan
- File upload (PDF attachments)
- Export runs to PDF or CSV
- Offline support / response queue for poor connectivity

---

## Success Criteria

- All 10 input types renderable in builder and execution UI
- `rossCreateRun` is idempotent — opening a workflow twice does not create two runs
- `rossSubmitResponse` rejects flagged temperature/number responses with `requiredNote: true` and no note
- Previous run values visible as reference in execution UI
- Completed runs visible in Reports tab with flagged task count
- Existing `checkbox` tasks work without any data migration
- No `console.log`, no hardcoded values, no mutation patterns
