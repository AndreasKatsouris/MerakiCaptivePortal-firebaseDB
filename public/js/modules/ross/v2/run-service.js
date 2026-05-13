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
  return res
}

/**
 * Start a new run for a workflow at a location.
 * CF: rossCreateRun({ workflowId, locationId })
 * Returns: { runId, status, responses, ... }
 */
export async function createRun({ workflowId, locationId }) {
  const res = await callFunction('rossCreateRun', { workflowId, locationId })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `rossCreateRun failed (${res.status})`)
  }
  const body = await res.json()
  return body.result
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
  const res = await callFunction('rossSubmitResponse', payload)
  if (res.status === 422) {
    const body = await res.json().catch(() => ({}))
    return { status: 422, requiredNote: body.requiredNote === true, error: body.error || null }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `rossSubmitResponse failed (${res.status})`)
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
  const res = await callFunction('rossGetRun', { workflowId, locationId })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `rossGetRun failed (${res.status})`)
  }
  const body = await res.json()
  return body.result
}
