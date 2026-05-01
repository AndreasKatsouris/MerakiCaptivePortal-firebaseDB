// Playbook service. Thin wrapper around the v1 ROSS Cloud Functions
// that backs the v2 Playbook tab. The mental model has shifted —
// "workflows + templates" are the **rules and procedures the future
// AI agent runs against**, not staff checklists. The data model and
// CFs are unchanged; only the framing in the UI evolves.
//
// All shapes returned here mirror what v1 returns, so swapping the
// fetcher (e.g. to streaming CFs or a future agent endpoint) is a
// body replacement.

import { auth } from '../../../config/firebase-config.js'

const FUNCTIONS_BASE_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net'

async function callFunction(functionName, data = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  const idToken = await user.getIdToken()
  const res = await fetch(`${FUNCTIONS_BASE_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ data }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${functionName} failed (${res.status}): ${text}`)
  }
  const json = await res.json()
  return json.result || json
}

/**
 * Fetch the user's workflows. v1 `rossGetWorkflows` returns one entry
 * per workflow with all locations nested under `w.locations`, UNLESS
 * a `locationId` arg is passed — then the server hoists status / tasks
 * to the top level (functions/ross.js:632).
 *
 * The v2 surface assumes one card per (workflowId, locationId) pair —
 * it keys on `${w.workflowId}::${w.locationId}` and reads
 * `w.locationName` / `w.tasks`. To keep client state consistent with
 * that assumption, we **flatten client-side** when no locationId arg
 * is supplied: one row per location, with `locationId`, `locationName`,
 * `locationStatus`, `locationNextDueDate`, `tasks`, `locationAssignedTo`,
 * `activatedAt` hoisted. This mirrors the server's `locationId` branch.
 *
 * Required for Phase 4e.1 — `rossManageTask` needs a real `locationId`
 * per row. Also fixes a latent bug in the workflow editor where
 * `editingWorkflow.locationId` was undefined.
 */
export async function getPlaybookWorkflows({ locationId } = {}) {
  const args = locationId ? { locationId } : {}
  const result = await callFunction('rossGetWorkflows', args)
  const workflows = Array.isArray(result?.workflows) ? result.workflows : []

  // Server already flattened — just normalise the legacy aliases.
  if (locationId) {
    return workflows.map((w) => ({
      ...w,
      locationId: w.locationId || locationId,
      nextDueDate: w.locationNextDueDate ?? w.nextDueDate ?? null,
      status: w.locationStatus ?? w.status ?? 'active',
    }))
  }

  // No filter: server returned one entry per workflow with `locations`
  // nested. Flatten to one row per (workflowId, locationId) pair.
  const flat = []
  for (const w of workflows) {
    const locs = (w.locations && typeof w.locations === 'object') ? w.locations : {}
    const ids = Object.keys(locs)
    if (ids.length === 0) {
      // Defensive: a workflow with no locations is malformed — keep it
      // visible but mark the location fields null so the UI doesn't
      // silently drop it.
      flat.push({
        ...w,
        locationId: null,
        locationName: null,
        locationStatus: null,
        locationNextDueDate: null,
        locationAssignedTo: null,
        activatedAt: null,
        tasks: {},
        nextDueDate: w.nextDueDate ?? null,
        status: w.status ?? 'active',
      })
      continue
    }
    for (const locId of ids) {
      const loc = locs[locId] || {}
      flat.push({
        ...w,
        locationId: locId,
        locationName: loc.locationName || locId,
        locationStatus: loc.status ?? 'active',
        locationNextDueDate: loc.nextDueDate ?? null,
        locationAssignedTo: loc.locationAssignedTo ?? null,
        activatedAt: loc.activatedAt ?? null,
        tasks: loc.tasks || {},
        // Hoisted aliases for legacy consumers (workflow card + editor).
        nextDueDate: loc.nextDueDate ?? w.nextDueDate ?? null,
        status: loc.status ?? w.status ?? 'active',
      })
    }
  }
  return flat
}

/**
 * Fetch all templates the user can see (their own + public). Optional
 * category filter is server-side.
 */
export async function getPlaybookTemplates({ category } = {}) {
  const args = category ? { category } : {}
  const result = await callFunction('rossGetTemplates', args)
  return Array.isArray(result?.templates) ? result.templates : []
}

// --- Mutation wrappers (Phase 4d.1) ---------------------------------
//
// All return the parsed `result` object. Callers should handle errors
// at the store layer (saving / saveError) rather than try/catch here,
// matching the people-service convention.

export function createWorkflow(payload) {
  return callFunction('rossCreateWorkflow', payload)
}

export function updateWorkflow({ workflowId, updates }) {
  return callFunction('rossUpdateWorkflow', { workflowId, updates })
}

export function deleteWorkflow({ workflowId }) {
  return callFunction('rossDeleteWorkflow', { workflowId })
}

export function activateWorkflow(payload) {
  return callFunction('rossActivateWorkflow', payload)
}

// --- Template mutation wrappers (Phase 4d.2, superAdmin only) -------
//
// rossCreateTemplate accepts { name, category, description, recurrence,
// daysBeforeAlert, subtasks, tags } (functions/ross.js line 192).
// rossUpdateTemplate's allowedFields list (line 256) is the same set,
// passed as { templateId, updates }. Server enforces verifySuperAdmin;
// the client only gates the UI for clarity.
export function createTemplate(payload) {
  return callFunction('rossCreateTemplate', payload)
}

export function updateTemplate({ templateId, updates }) {
  return callFunction('rossUpdateTemplate', { templateId, updates })
}

export function deleteTemplate({ templateId }) {
  return callFunction('rossDeleteTemplate', { templateId })
}

// Phase 4e — exported for the upcoming per-task editor (inputType /
// inputConfig matrix). Not consumed yet by 4d.1; lands here so the
// service surface stays one place. payload: { workflowId, locationId,
// action: 'create'|'update'|'delete', taskId?, taskData? }
export function manageTask(payload) {
  return callFunction('rossManageTask', payload)
}
