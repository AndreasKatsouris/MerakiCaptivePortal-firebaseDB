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
 * Fetch the user's workflows. v1 rossGetWorkflows returns a flat list,
 * each entry already merged with the location's status / nextDueDate.
 *
 * Optional locationId filter narrows server-side.
 */
export async function getPlaybookWorkflows({ locationId } = {}) {
  const args = locationId ? { locationId } : {}
  const result = await callFunction('rossGetWorkflows', args)
  const workflows = Array.isArray(result?.workflows) ? result.workflows : []
  // Normalise location-prefixed fields (v1 quirk).
  return workflows.map((w) => ({
    ...w,
    nextDueDate: w.locationNextDueDate ?? w.nextDueDate ?? null,
    status: w.locationStatus ?? w.status ?? 'active',
  }))
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
