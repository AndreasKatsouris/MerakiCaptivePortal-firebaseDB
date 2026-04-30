// People service. Wraps rossGetStaff (read) and rossManageStaff (write)
// Cloud Functions. Mental model: "who's in the loop?" — staff that
// Ross can route tasks to today, and (later) the human approvers
// for agent-driven steps.
//
// Staff are scoped to (callerUid × locationId) — only the workflow
// creator's staff appear here. Server enforces verifyUserOrAdmin and
// verifyLocationAccess on every call.

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
 * Fetch staff for a given location. Returns sorted array.
 */
export async function getStaffForLocation(locationId) {
  if (!locationId) throw new Error('locationId required')
  const result = await callFunction('rossGetStaff', { locationId })
  return Array.isArray(result?.staff) ? result.staff : []
}

/**
 * Create / update / delete a staff member. The server keys the data
 * by callerUid so any change here is per-creator scope.
 *
 *   action: 'create' | 'update' | 'delete'
 *   staffId: required for update + delete
 *   staffData: { name, role?, phone?, email?, notificationChannels? }
 *              (only required for create + update; ignored for delete)
 */
export async function manageStaff({ locationId, action, staffId, staffData }) {
  if (!locationId) throw new Error('locationId required')
  if (!action) throw new Error('action required')
  return callFunction('rossManageStaff', { locationId, action, staffId, staffData })
}
