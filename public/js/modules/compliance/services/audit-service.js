/**
 * Audit Service for Corporate Compliance Module
 *
 * Writes structured audit log entries to compliance/{uid}/audit-log
 * using Firebase push() so each entry gets a unique, time-ordered key.
 *
 * All writes are fire-and-forget — callers should .catch(() => {}) on the
 * returned Promise rather than awaiting it to avoid blocking the main flow.
 */

import { auth, rtdb, ref, push } from '../../../config/firebase-config.js';

// ---------------------------------------------------------------------------
// Audit action constants
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = {
  ENTITY_CREATED: 'entity_created',
  ENTITY_UPDATED: 'entity_updated',
  ENTITY_DELETED: 'entity_deleted',
  FILING_MARKED:  'filing_marked',
  AR_TOGGLED:     'ar_toggled',
  BO_TOGGLED:     'bo_toggled',
  OBLIGATION_CREATED: 'obligation_created',
  OBLIGATION_UPDATED: 'obligation_updated',
  OBLIGATION_DELETED: 'obligation_deleted'
};

// ---------------------------------------------------------------------------
// logAuditEvent
// ---------------------------------------------------------------------------

/**
 * Append a structured audit log entry to compliance/{uid}/audit-log.
 *
 * @param {string} action  — One of the AUDIT_ACTIONS values
 * @param {Object} details — Arbitrary context (entityId, before, after, etc.)
 * @returns {Promise<void>}
 */
export async function logAuditEvent(action, details) {
  const user = auth.currentUser;
  if (!user) return;

  const entry = {
    action,
    actorUid:   user.uid,
    actorEmail: user.email || null,
    timestamp:  new Date().toISOString(),
    ...details
  };

  await push(ref(rtdb, `compliance/${user.uid}/audit-log`), entry);
}
