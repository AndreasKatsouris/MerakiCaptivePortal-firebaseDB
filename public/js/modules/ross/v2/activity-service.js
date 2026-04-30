// Activity service. Wraps the v1 rossGetReports Cloud Function which
// returns one row per (workflowId × locationId) pair with current
// completion stats and any per-location history records.
//
// Mental-model framing: "what did Ross do?" — the execution log of the
// playbook. Today every row is a human-walked workflow; once the agent
// is online the same shape will hold agent-run rows.

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
 * Fetch the activity report — one row per workflow×location across
 * everything the caller can see. Optionally narrow by locationId.
 *
 * Each row carries:
 *   { workflowId, name, category, recurrence,
 *     locationId, locationName, status, nextDueDate,
 *     tasksTotal, tasksCompleted, completionRate,
 *     history: [{ completedAt, ... }] }
 */
export async function getActivityReport({ locationId } = {}) {
  const args = locationId ? { locationId } : {}
  const result = await callFunction('rossGetReports', args)
  return Array.isArray(result?.report) ? result.report : []
}

/**
 * Fetch run history for one workflow×location pair. Returns runs
 * newest-first, capped at `limit` (server enforces ≤100). Used by the
 * drill-down view; the main Activity tab uses the embedded history
 * from getActivityReport for the at-a-glance summary.
 */
export async function getWorkflowRunHistory({ workflowId, locationId, limit = 20 }) {
  if (!workflowId || !locationId) {
    throw new Error('workflowId and locationId are required')
  }
  // Server caps at 100; clamp client-side for defence-in-depth + intent clarity.
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100)
  const result = await callFunction('rossGetRunHistory', { workflowId, locationId, limit: safeLimit })
  return Array.isArray(result?.runs) ? result.runs : []
}
