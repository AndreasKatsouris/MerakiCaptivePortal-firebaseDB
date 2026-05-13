// run-service.js — thin CF wrappers for ROSS run execution.
// Mirrors the fetch/auth shape of playbook-service.js exactly.
// Three exported functions: createRun, submitResponse, getRun.
//
// Critical 422 contract: submitResponse surfaces HTTP 422 as a return
// value { status: 422, requiredNote: true } rather than throwing, so
// the caller (run-store.commitResponse) can handle the "note required"
// flow without try/catch branching.

import { auth } from '../../../config/firebase-config.js'

const FUNCTIONS_BASE_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net'

// Low-level POST. Returns the raw Response so callers that need to
// inspect status (e.g. submitResponse's 422 branch) can do so. Most
// callers should prefer callFunction() which centralises the ok/error
// handling.
async function callFunctionRaw(functionName, data = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  const idToken = await user.getIdToken()
  return fetch(`${FUNCTIONS_BASE_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ data }),
  })
}

// Build an Error message from a non-ok Response. Reads the body via
// res.text() first so we still get useful diagnostics when the server
// returns HTML, a proxy error page, or a cold-start crash dump rather
// than JSON. If the text parses as JSON with an `.error` field, prefer
// that; otherwise append the raw text to a generic message.
async function errorMessageFrom(res, functionName) {
  const text = await res.text().catch(() => '')
  let body = {}
  try { body = text ? JSON.parse(text) : {} } catch { /* not JSON */ }
  if (body.error) return body.error
  return `${functionName} failed (${res.status})${text ? ': ' + text : ''}`
}

// High-level helper: throws on !res.ok with a useful message; returns
// the unwrapped `result`. Used by createRun and getRun.
async function callFunction(functionName, data = {}) {
  const res = await callFunctionRaw(functionName, data)
  if (!res.ok) {
    throw new Error(await errorMessageFrom(res, functionName))
  }
  const body = await res.json()
  return body.result
}

/**
 * Start a new run for a workflow at a location, or resume the existing
 * in-progress one (server is idempotent on completedAt: null).
 * CF: rossCreateRun({ workflowId, locationId })
 *
 * Server returns { success, runId, run, created } where `run` is the
 * actual record (startedAt, completedAt, responses?, etc.). We unwrap
 * to return the run object with runId guaranteed at the top level.
 */
export async function createRun({ workflowId, locationId }) {
  const result = await callFunction('rossCreateRun', { workflowId, locationId })
  return { ...(result.run || {}), runId: result.runId }
}

/**
 * Submit a task response within an in-progress run.
 * CF: rossSubmitResponse({ workflowId, locationId, runId, taskId, value, note? })
 *
 * Returns:
 *   { status: 200, result: { runId, status, ... } }  — success
 *   { status: 422, requiredNote: true, error: string } — value flagged, note required (NOT thrown)
 *
 * Throws on any other non-ok status.
 */
export async function submitResponse({ workflowId, locationId, runId, taskId, value, note }) {
  const payload = { workflowId, locationId, runId, taskId, value }
  if (note !== undefined && note !== null) payload.note = note
  const res = await callFunctionRaw('rossSubmitResponse', payload)
  if (res.status === 422) {
    const text = await res.text().catch(() => '')
    let body = {}
    try { body = JSON.parse(text) } catch { /* not JSON */ }
    // Server's 422 body uses { error, flagged: true } per functions/ross.js:1287.
    // Any 422 from rossSubmitResponse means a note is required.
    return { status: 422, requiredNote: true, error: body.error || null }
  }
  if (!res.ok) {
    throw new Error(await errorMessageFrom(res, 'rossSubmitResponse'))
  }
  const body = await res.json()
  return { status: 200, result: body.result }
}

/**
 * Fetch the current run state for a workflow at a location.
 * CF: rossGetRun({ workflowId, locationId })
 * Returns: { currentRun, previousResponses }
 */
export async function getRun({ workflowId, locationId }) {
  return callFunction('rossGetRun', { workflowId, locationId })
}
