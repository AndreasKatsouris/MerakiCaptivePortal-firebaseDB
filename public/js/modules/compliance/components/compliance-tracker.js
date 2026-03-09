/**
 * Compliance Tracker Panel Component
 * Corporate Compliance Module
 *
 * Renders the full obligation tracker table grouped by category,
 * with deadline calculation, status badges, and "Mark Filed" actions.
 * Receives pre-loaded data — re-fetches filings only on year change.
 */

import { updateFilingStatus, loadFilings, setManualDueDate } from '../services/firebase-service.js';
import { calculateNextDueDate, formatDueDate, getFilingStatus } from '../utils/deadline-calculator.js';
import { escapeHtml, escapeAttr } from '../utils/html-escape.js';
import { auth } from '../../../config/firebase-config.js';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

/**
 * Returns the current authenticated user's email, uid, or 'unknown' as fallback.
 * @returns {string}
 */
function currentUserIdentifier() {
  const user = auth.currentUser;
  return user ? (user.email || user.uid) : 'unknown';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = ['monthly', 'biannual', 'annual', 'once_off'];

const CATEGORY_LABELS = {
  monthly: 'Monthly',
  biannual: 'Bi-Annual',
  annual: 'Annual',
  once_off: 'Once-Off'
};

const CATEGORY_ICONS = {
  monthly: 'fas fa-sync-alt',
  biannual: 'fas fa-calendar-week',
  annual: 'fas fa-calendar-check',
  once_off: 'fas fa-flag-checkered'
};

const STATUS_CONFIG = {
  filed: { cssClass: 'badge-filed', label: 'Filed' },
  pending: { cssClass: 'badge-pending', label: 'Pending' },
  overdue: { cssClass: 'badge-overdue', label: 'Overdue' },
  in_progress: { cssClass: 'badge-in-progress', label: 'In Progress' },
  not_applicable: { cssClass: 'badge-na', label: 'N/A' }
};

/** Priority order for "worst status" logic (higher index = worse). */
const STATUS_SEVERITY = ['not_applicable', 'filed', 'in_progress', 'pending', 'overdue'];

/** Obligation deadline rules that require a manually-set per-entity due date. */
const MANUAL_RULES = new Set([
  'manual',
  'per_entity_licence_expiry',
  'per_entity_inspection_anniversary'
]);

/**
 * Return a [priority, timestamp] sort key for priority-based table ordering.
 * Priority: overdue(0) → pending(1) → in_progress(2) → not_applicable(3) → filed(4)
 * Within the same priority, sort by due-date timestamp ASC (soonest/most-overdue first).
 * Items with no date sort after items with dates (MAX_SAFE_INTEGER timestamp).
 * @param {string}   status
 * @param {Date|null} dueDate
 * @returns {[number, number]}
 */
function getPrioritySortKey(status, dueDate) {
  const ts = dueDate instanceof Date && !isNaN(dueDate.getTime())
    ? dueDate.getTime()
    : Number.MAX_SAFE_INTEGER;
  switch (status) {
    case 'overdue':        return [0, ts];
    case 'pending':        return [1, ts];
    case 'in_progress':   return [2, ts];
    case 'not_applicable': return [3, 0];
    case 'filed':          return [4, 0];
    default:               return [5, 0];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Capitalise the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
function capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, '-');
}

/**
 * Determine which entity IDs an obligation applies to.
 * @param {Object}        obligation     — Obligation definition
 * @param {Array<Object>} activeEntities — Active entity objects
 * @returns {string[]} Array of entity registration numbers
 */
function getApplicableEntityIds(obligation, activeEntities) {
  if (obligation.appliesToAll) {
    return activeEntities.map(e => e.registrationNumber);
  }
  if (obligation.appliesToEntityIds && obligation.appliesToEntityIds.length > 0) {
    return obligation.appliesToEntityIds;
  }
  return [];
}

/**
 * Build a display string for the "Applies To" column.
 * Truncates to 3 entity names with a "+N more" suffix.
 * @param {Object}        obligation     — Obligation definition
 * @param {Array<Object>} activeEntities — Active entity objects
 * @returns {string} HTML string
 */
function buildAppliesToDisplay(obligation, activeEntities) {
  if (obligation.appliesToAll) {
    return '<span class="text-success"><i class="fas fa-globe me-1"></i>All Entities</span>';
  }

  if (!obligation.appliesToEntityIds || obligation.appliesToEntityIds.length === 0) {
    return '<span class="text-muted">&mdash;</span>';
  }

  const entityMap = new Map(activeEntities.map(e => [e.registrationNumber, e.name]));
  const names = obligation.appliesToEntityIds
    .map(id => entityMap.get(id) || id)
    .filter(Boolean);

  if (names.length <= 3) {
    return escapeHtml(names.join(', '));
  }

  const visible = names.slice(0, 2).map(n => escapeHtml(n));
  const remaining = names.length - 2;
  const allNames = names.map(n => escapeHtml(n)).join(', ');
  return `${visible.join(', ')} <span class="text-muted" title="${escapeAttr(allNames)}">+${remaining} more</span>`;
}

/**
 * Calculate the earliest due date across all applicable entities for an obligation.
 * For obligations that don't depend on entity data, a single date is returned.
 * @param {Object}        obligation     — Obligation definition
 * @param {Array<Object>} activeEntities — Active entity objects
 * @param {number}        year           — Target year
 * @returns {Date|null}
 */
function calculateEarliestDueDate(obligation, activeEntities, year) {
  const entityIds = getApplicableEntityIds(obligation, activeEntities);

  // For non-entity-specific rules, calculate once with no entity
  if (!obligation.yearEndRelative
      && obligation.deadlineRule !== '30_business_days_after_anniversary'
      && obligation.deadlineRule !== 'filed_with_cipc_annual_return') {
    return calculateNextDueDate(obligation, null, year);
  }

  // Entity-specific: find earliest across applicable entities
  const entityMap = new Map(activeEntities.map(e => [e.registrationNumber, e]));
  let earliest = null;

  for (const entityId of entityIds) {
    const entity = entityMap.get(entityId);
    if (!entity) continue;
    const dueDate = calculateNextDueDate(obligation, entity, year);
    if (dueDate && (!earliest || dueDate < earliest)) {
      earliest = dueDate;
    }
  }

  // If no entity had the required data, try with null to get null back
  if (earliest === null && entityIds.length > 0) {
    return calculateNextDueDate(obligation, entityMap.get(entityIds[0]) || null, year);
  }

  return earliest;
}

/**
 * Determine the "worst" filing status across all applicable entities.
 * Severity order: overdue > pending > in_progress > filed > not_applicable
 * @param {Object}        obligation     — Obligation definition
 * @param {Array<Object>} activeEntities — Active entity objects
 * @param {Object}        filings        — Year filings map (entityId -> obligationId -> filing)
 * @param {Date|null}     dueDate        — Calculated due date (earliest across entities)
 * @param {number}        year           — Filing year (used for per-entity due date calculation)
 * @returns {string} Worst status string
 */
function getWorstStatus(obligation, activeEntities, filings, dueDate, year) {
  const entityIds = getApplicableEntityIds(obligation, activeEntities);

  if (entityIds.length === 0) {
    return getFilingStatus(dueDate, null);
  }

  const entityMap = new Map(activeEntities.map(e => [e.registrationNumber, e]));
  let worstIndex = -1;

  for (const entityId of entityIds) {
    const entityFilings = filings[entityId] || {};
    const filing = entityFilings[obligation.id] || null;
    let entityDueDate = dueDate;
    if (obligation.yearEndRelative
        || obligation.deadlineRule === '30_business_days_after_anniversary'
        || obligation.deadlineRule === 'filed_with_cipc_annual_return') {
      entityDueDate = calculateNextDueDate(obligation, entityMap.get(entityId) || null, year);
    }
    const status = getFilingStatus(entityDueDate, filing);
    const severityIndex = STATUS_SEVERITY.indexOf(status);
    if (severityIndex > worstIndex) {
      worstIndex = severityIndex;
    }
  }

  return worstIndex >= 0 ? STATUS_SEVERITY[worstIndex] : 'pending';
}

/**
 * Build the status badge HTML for a given status.
 * @param {string} status
 * @returns {string} Badge HTML
 */
function buildStatusBadge(status) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return `<span class="badge ${config.cssClass}">${config.label}</span>`;
}

/**
 * Build the action button HTML for an obligation row.
 *
 * @param {string}      obligationId
 * @param {string}      status
 * @param {string}      entityIdsJson    — JSON string of applicable entity IDs
 * @param {Object|null} manualCtx        — { entityId, hasDate } when obligation uses a manual rule;
 *                                         null for calculated rules
 * @returns {string} Button HTML
 */
function buildActionButton(obligationId, status, entityIdsJson, manualCtx = null) {
  if (status === 'filed') {
    return '<span class="text-success"><i class="fas fa-check-circle"></i></span>';
  }
  if (status === 'not_applicable') {
    return '<span class="text-muted">&mdash;</span>';
  }

  // Manual-rule obligations: require per-entity date to be set first
  if (manualCtx) {
    if (!manualCtx.entityId) {
      // No entity filter active: prompt user to filter first
      return `<span class="text-muted small" title="Select an entity to set the due date">
        <i class="fas fa-calendar-alt me-1"></i>Select entity</span>`;
    }

    const setDateLabel = manualCtx.hasDate ? 'Update Date' : 'Set Due Date';
    const setDateBtn = `<button
      class="btn btn-sm btn-outline-secondary set-manual-date-btn me-1"
      data-obligation-id="${escapeAttr(obligationId)}"
      data-entity-id="${escapeAttr(manualCtx.entityId)}"
      title="${setDateLabel}"
    ><i class="fas fa-calendar-alt me-1"></i>${setDateLabel}</button>`;

    if (manualCtx.hasDate) {
      // Date is set: also show Mark Filed
      return setDateBtn + `<button
        class="btn btn-sm btn-outline-success mark-filed-btn"
        data-obligation-id="${escapeAttr(obligationId)}"
        data-entity-ids='${escapeAttr(entityIdsJson)}'
        title="Mark as Filed"
      ><i class="fas fa-check me-1"></i>Filed</button>`;
    }

    // No date set yet: only show Set Due Date
    return setDateBtn;
  }

  return `<button
    class="btn btn-sm btn-outline-success mark-filed-btn"
    data-obligation-id="${escapeAttr(obligationId)}"
    data-entity-ids='${escapeAttr(entityIdsJson)}'
    title="Mark as Filed"
  ><i class="fas fa-check me-1"></i>Mark Filed</button>`;
}

// ---------------------------------------------------------------------------
// Table builders
// ---------------------------------------------------------------------------

/**
 * Build the table body HTML grouped by category.
 * @param {Array<Object>} activeEntities
 * @param {Object}        obligations — Map of id -> obligation
 * @param {Object}        filings     — Year filings
 * @param {number}        year
 * @returns {string} tbody inner HTML
 */
function buildTableBody(activeEntities, obligations, filings, year) {
  const obligationList = Object.values(obligations);
  const grouped = {};

  for (const category of CATEGORY_ORDER) {
    grouped[category] = [];
  }

  for (const obl of obligationList) {
    const cat = obl.category || 'annual';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(obl);
  }

  let rowNumber = 0;
  let html = '';

  for (const category of CATEGORY_ORDER) {
    const items = grouped[category];
    if (!items || items.length === 0) continue;

    const icon = CATEGORY_ICONS[category] || 'fas fa-folder';
    const label = CATEGORY_LABELS[category] || capitalise(category);

    html += `
      <tr class="category-header">
        <td colspan="9">
          <i class="${icon} me-2"></i>${label}
          <span class="badge bg-secondary ms-2">${items.length}</span>
        </td>
      </tr>`;

    for (const obligation of items) {
      rowNumber++;
      const dueDate = calculateEarliestDueDate(obligation, activeEntities, year);
      const status = getWorstStatus(obligation, activeEntities, filings, dueDate, year);
      const entityIds = getApplicableEntityIds(obligation, activeEntities);
      const entityIdsJson = JSON.stringify(entityIds);

      // Determine deadline CSS class
      let deadlineCss = '';
      if (dueDate instanceof Date && !isNaN(dueDate.getTime()) && status !== 'filed') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0) {
          deadlineCss = 'deadline-overdue';
        } else if (daysDiff <= 30) {
          deadlineCss = 'deadline-upcoming';
        } else {
          deadlineCss = 'deadline-ok';
        }
      }

      html += `
      <tr data-obligation-id="${escapeAttr(obligation.id)}" data-row-status="${status}">
        <td class="text-muted">${rowNumber}</td>
        <td><strong>${escapeHtml(obligation.name)}</strong></td>
        <td>${escapeHtml(capitalise(obligation.frequency))}</td>
        <td>${escapeHtml(obligation.authority || '')}</td>
        <td class="${deadlineCss}">${formatDueDate(dueDate, obligation.deadlineRule)}</td>
        <td>${buildAppliesToDisplay(obligation, activeEntities)}</td>
        <td>${escapeHtml(obligation.defaultOwner || '')}</td>
        <td class="status-cell">${buildStatusBadge(status)}</td>
        <td class="action-cell">${buildActionButton(obligation.id, status, entityIdsJson)}</td>
      </tr>`;
    }
  }

  if (rowNumber === 0) {
    html = `
      <tr>
        <td colspan="9" class="text-center text-muted py-4">
          <i class="fas fa-clipboard-list fa-2x mb-2 d-block opacity-50"></i>
          No obligations found.
        </td>
      </tr>`;
  }

  return html;
}

/**
 * Build the table body HTML sorted by filing priority.
 * Order: overdue (date ASC) → pending (date ASC) → in_progress → not_applicable → filed
 * The first non-overdue pending/in_progress upcoming row is highlighted as "Next Due".
 *
 * When entityFilterId is supplied, only obligations applicable to that entity are shown,
 * and due dates / statuses are computed for that specific entity.
 *
 * @param {Array<Object>} activeEntities
 * @param {Object}        obligations    — Map of id -> obligation
 * @param {Object}        filings        — Year filings (entityId -> obligationId -> filing)
 * @param {number}        year
 * @param {string|null}   entityFilterId — registrationNumber to filter to, or null for all
 * @returns {string} tbody inner HTML
 */
function buildTableBodyPrioritySorted(activeEntities, obligations, filings, year, entityFilterId) {
  let obligationList = Object.values(obligations);

  // When filtering by entity, only include applicable obligations
  if (entityFilterId) {
    obligationList = obligationList.filter(obl => {
      const ids = getApplicableEntityIds(obl, activeEntities);
      return ids.includes(entityFilterId);
    });
  }

  const entityMap = new Map(activeEntities.map(e => [e.registrationNumber, e]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Compute due date, status, and entity IDs for each obligation
  const items = obligationList.map(obligation => {
    let dueDate, status, entityIds;

    if (entityFilterId) {
      // Per-entity view: calculate exactly for this entity
      const entity = entityMap.get(entityFilterId) || null;
      const filing = (filings[entityFilterId] || {})[obligation.id] || null;

      // For manual-rule obligations, use the stored manualDueDate from the filing record
      if (MANUAL_RULES.has(obligation.deadlineRule) && filing && filing.manualDueDate) {
        const parsed = new Date(filing.manualDueDate);
        dueDate = isNaN(parsed.getTime()) ? null : parsed;
      } else {
        dueDate = calculateNextDueDate(obligation, entity, year);
      }

      status = getFilingStatus(dueDate, filing);
      entityIds = [entityFilterId];
    } else {
      dueDate = calculateEarliestDueDate(obligation, activeEntities, year);
      status = getWorstStatus(obligation, activeEntities, filings, dueDate, year);
      entityIds = getApplicableEntityIds(obligation, activeEntities);
    }

    const isManualRule = MANUAL_RULES.has(obligation.deadlineRule);
    // manualCtx is set for manual-rule obligations to carry context into buildActionButton
    const manualCtx = isManualRule
      ? {
          entityId: entityFilterId || null,
          hasDate: entityFilterId
            ? !!(((filings[entityFilterId] || {})[obligation.id] || {}).manualDueDate)
            : false
        }
      : null;

    return { obligation, dueDate, status, entityIds, manualCtx };
  });

  // Sort by priority
  items.sort((a, b) => {
    const [pa, ta] = getPrioritySortKey(a.status, a.dueDate);
    const [pb, tb] = getPrioritySortKey(b.status, b.dueDate);
    if (pa !== pb) return pa - pb;
    if (ta !== tb) return ta - tb;
    return (a.obligation.name || '').localeCompare(b.obligation.name || '');
  });

  // Find the "Next Due" row: first upcoming (non-overdue) pending/in_progress with a future date
  let nextDueIndex = -1;
  for (let i = 0; i < items.length; i++) {
    const { status, dueDate } = items[i];
    if ((status === 'pending' || status === 'in_progress')
        && dueDate instanceof Date
        && !isNaN(dueDate.getTime())
        && dueDate >= today) {
      nextDueIndex = i;
      break;
    }
  }

  if (items.length === 0) {
    const msg = entityFilterId ? 'No obligations apply to this entity.' : 'No obligations found.';
    return `
      <tr>
        <td colspan="9" class="text-center text-muted py-4">
          <i class="fas fa-clipboard-list fa-2x mb-2 d-block opacity-50"></i>
          ${msg}
        </td>
      </tr>`;
  }

  let html = '';

  for (let i = 0; i < items.length; i++) {
    const { obligation, dueDate, status, entityIds, manualCtx } = items[i];
    const isNextDue = i === nextDueIndex;
    const entityIdsJson = JSON.stringify(entityIds);

    // Deadline CSS class
    let deadlineCss = '';
    if (dueDate instanceof Date && !isNaN(dueDate.getTime()) && status !== 'filed') {
      const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      if (daysDiff < 0) deadlineCss = 'deadline-overdue';
      else if (daysDiff <= 30) deadlineCss = 'deadline-upcoming';
      else deadlineCss = 'deadline-ok';
    }

    const rowClass = isNextDue ? ' class="next-due-row"' : '';
    const nextDueBadge = isNextDue
      ? ' <span class="badge bg-warning text-dark" style="font-size:0.65rem;vertical-align:middle;">NEXT DUE</span>'
      : '';

    html += `
      <tr data-obligation-id="${escapeAttr(obligation.id)}" data-row-status="${status}"${rowClass}>
        <td class="text-muted">${i + 1}</td>
        <td><strong>${escapeHtml(obligation.name)}</strong>${nextDueBadge}</td>
        <td>${escapeHtml(capitalise(obligation.frequency))}</td>
        <td>${escapeHtml(obligation.authority || '')}</td>
        <td class="${deadlineCss}">${formatDueDate(dueDate, obligation.deadlineRule)}</td>
        <td>${buildAppliesToDisplay(obligation, activeEntities)}</td>
        <td>${escapeHtml(obligation.defaultOwner || '')}</td>
        <td class="status-cell">${buildStatusBadge(status)}</td>
        <td class="action-cell">${buildActionButton(obligation.id, status, entityIdsJson, manualCtx)}</td>
      </tr>`;
  }

  return html;
}

/**
 * Build the full card HTML for the compliance tracker panel.
 * @param {Array<Object>} activeEntities
 * @param {Object}        obligations
 * @param {Object}        filings
 * @param {number}        year
 * @returns {string} Complete card HTML
 */
function buildTrackerCard(activeEntities, obligations, filings, year) {
  const currentYear = new Date().getFullYear();

  const entityOptions = activeEntities
    .map(e => `<option value="${escapeAttr(e.registrationNumber)}">${escapeHtml(e.name)}</option>`)
    .join('');

  return `
    <div class="card entity-card">
      <div class="card-header d-flex align-items-center justify-content-between flex-wrap gap-2">
        <span>
          <i class="fas fa-tasks text-success me-2"></i>
          <strong>Compliance Tracker</strong>
        </span>
        <div class="d-flex gap-2">
          <select class="form-select form-select-sm" id="compliance-entity-filter" style="width: auto; min-width: 160px;">
            <option value="">All Entities</option>
            ${entityOptions}
          </select>
          <select class="form-select form-select-sm" id="compliance-year-selector" style="width: auto;">
            ${[currentYear - 2, currentYear - 1, currentYear, currentYear + 1]
              .map(y => `<option value="${y}" ${year === y ? 'selected' : ''}>${y}</option>`)
              .join('')}
          </select>
        </div>
      </div>
      <div class="card-body p-0">
        <div class="compliance-table-wrapper">
          <table class="table table-hover compliance-table mb-0" style="font-size:0.85rem;">
            <thead class="table-light">
              <tr>
                <th style="width: 40px;">#</th>
                <th>Obligation</th>
                <th>Frequency</th>
                <th>Authority</th>
                <th>Next Due</th>
                <th>Applies To</th>
                <th>Owner</th>
                <th style="width: 100px;">Status</th>
                <th style="width: 130px;">Action</th>
              </tr>
            </thead>
            <tbody id="compliance-tracker-tbody">
              ${buildTableBodyPrioritySorted(activeEntities, obligations, filings, year, null)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * Handle "Set Due Date" button clicks for manual-rule obligations.
 * Stores the date in the filing record as manualDueDate.
 * Re-renders the affected row on success.
 *
 * @param {MouseEvent}    event
 * @param {Object}        obligations    — Map of id -> obligation
 * @param {Object}        filingsRef     — Current filings state
 * @param {number}        year
 * @param {Function}      setFilings     — Immutable state setter
 */
async function handleSetManualDueDate(event, obligations, filingsRef, year, setFilings) {
  const btn = event.target.closest('.set-manual-date-btn');
  if (!btn) return;

  const obligationId = btn.getAttribute('data-obligation-id');
  const entityId     = btn.getAttribute('data-entity-id');
  const obligation   = obligations[obligationId];
  if (!obligation || !entityId) return;

  // Pre-fill with existing manualDueDate if already set
  const existingDate = ((filingsRef[entityId] || {})[obligationId] || {}).manualDueDate || '';

  const actionBtn = btn;
  if (actionBtn) actionBtn.disabled = true;

  try {
    const result = await Swal.fire({
      title: `Set Due Date — ${escapeHtml(obligation.name)}`,
      html: `
        <div class="mb-2 text-muted small">Set the expiry / due date for this entity.</div>
        <div class="mb-3">
          <label class="form-label">Due Date</label>
          <input type="date" id="swal-manual-due-date" class="form-control"
                 value="${escapeAttr(existingDate)}">
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#0d6efd',
      confirmButtonText: 'Save Due Date',
      preConfirm: () => {
        const dateVal = document.getElementById('swal-manual-due-date').value;
        if (!dateVal) {
          Swal.showValidationMessage('Please select a due date');
          return false;
        }
        return dateVal;
      }
    });

    if (actionBtn) actionBtn.disabled = false;
    if (!result.isConfirmed || !result.value) return;

    const dateStr = result.value;

    await setManualDueDate(year, entityId, obligationId, dateStr);

    // Update local filings state immutably
    const updatedFilings = {
      ...filingsRef,
      [entityId]: {
        ...(filingsRef[entityId] || {}),
        [obligationId]: {
          ...((filingsRef[entityId] || {})[obligationId] || {}),
          manualDueDate: dateStr
        }
      }
    };
    setFilings(updatedFilings);

    Swal.fire({
      toast: true,
      icon: 'success',
      title: 'Due date saved',
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true
    });

    // Trigger tbody refresh by dispatching a synthetic change on the entity filter
    // (the simplest way to re-render with updated filings state)
    const entityFilterEl = document.getElementById('compliance-entity-filter');
    if (entityFilterEl) entityFilterEl.dispatchEvent(new Event('change'));
  } catch (error) {
    if (actionBtn) actionBtn.disabled = false;
    Swal.fire({ title: 'Error', text: `Failed to save due date: ${error.message}`, icon: 'error' });
  }
}

/**
 * Handle "Mark Filed" button clicks via event delegation.
 * Shows a SweetAlert2 dialog and writes to Firebase for each applicable entity.
 *
 * @param {MouseEvent}    event
 * @param {Object}        obligations    — Map of id -> obligation
 * @param {Array<Object>} activeEntities — Active entity list
 * @param {number}        year           — Current filing year
 * @param {Object}        filingsRef     — Current filings state (will be replaced immutably via callback)
 */
async function handleMarkFiled(event, obligations, activeEntities, year, filingsRef, setFilings) {
  const btn = event.target.closest('.mark-filed-btn');
  if (!btn) return;

  const obligationId = btn.getAttribute('data-obligation-id');
  const entityIdsRaw = btn.getAttribute('data-entity-ids');

  const obligation = obligations[obligationId];
  if (!obligation) return;

  let entityIds;
  try {
    entityIds = JSON.parse(entityIdsRaw);
  } catch {
    entityIds = [];
  }

  // Calculate due date for the ISO string
  const dueDate = calculateEarliestDueDate(obligation, activeEntities, year);
  const dueDateISO = dueDate instanceof Date && !isNaN(dueDate.getTime())
    ? dueDate.toISOString().split('T')[0]
    : '';

  const todayISO = new Date().toISOString().split('T')[0];

  const actionBtn = document.querySelector(`tr[data-obligation-id="${CSS.escape(obligationId)}"] .action-cell button`);
  if (actionBtn) actionBtn.disabled = true;

  try {
    const result = await Swal.fire({
      title: `Mark "${escapeHtml(obligation.name)}" as Filed`,
      html: `
        <div class="mb-3">
          <label class="form-label">Filed Date</label>
          <input type="date" id="swal-filed-date" class="form-control" value="${todayISO}">
        </div>
        <div class="mb-3">
          <label class="form-label">Filed By</label>
          <input type="text" id="swal-filed-by" class="form-control" placeholder="e.g., Lourens Kruger" maxlength="200">
        </div>
        <div class="mb-3">
          <label class="form-label">Notes (optional)</label>
          <textarea id="swal-notes" class="form-control" rows="2" maxlength="1000"></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#198754',
      confirmButtonText: 'Mark as Filed',
      preConfirm: () => {
        const filedDate = document.getElementById('swal-filed-date').value;
        const filedBy = document.getElementById('swal-filed-by').value.trim();
        const notes = document.getElementById('swal-notes')?.value?.trim() || '';

        if (filedBy.length > 200) {
          Swal.showValidationMessage('Filed by name must be 200 characters or fewer');
          return false;
        }
        if (notes.length > 1000) {
          Swal.showValidationMessage('Notes must be 1000 characters or fewer');
          return false;
        }
        if (!filedDate) {
          Swal.showValidationMessage('Please enter a filed date.');
          return false;
        }
        if (!filedBy) {
          Swal.showValidationMessage('Please enter who filed this');
          return false;
        }

        return {
          filedDate,
          filedBy,
          notes
        };
      }
    });

    if (!result.isConfirmed || !result.value) {
      if (actionBtn) actionBtn.disabled = false;
      return;
    }

    const formValues = result.value;

    const entityMap = new Map(activeEntities.map(e => [e.registrationNumber, e]));

    // Write all entities in parallel — per-entity due date for anniversary/year-end rules
    const filingRecords = new Map();
    await Promise.all(
      entityIds.map(entityId => {
        let entityDueDateISO = dueDateISO;
        if (obligation.yearEndRelative
            || obligation.deadlineRule === '30_business_days_after_anniversary'
            || obligation.deadlineRule === 'filed_with_cipc_annual_return') {
          const entityDueDate = calculateNextDueDate(obligation, entityMap.get(entityId) || null, year);
          entityDueDateISO = entityDueDate instanceof Date && !isNaN(entityDueDate.getTime())
            ? entityDueDate.toISOString().split('T')[0]
            : '';
        }
        const record = {
          status: 'filed',
          dueDate: entityDueDateISO,
          filedDate: formValues.filedDate,
          filedBy: formValues.filedBy,
          notes: formValues.notes,
          updatedBy: currentUserIdentifier()
        };
        filingRecords.set(entityId, record);
        return updateFilingStatus(year, entityId, obligationId, record);
      })
    );

    // Build updated state immutably in one pass
    const updatedFilings = entityIds.reduce((acc, entityId) => ({
      ...acc,
      [entityId]: {
        ...(acc[entityId] || {}),
        [obligationId]: filingRecords.get(entityId)
      }
    }), filingsRef);

    setFilings(updatedFilings);
    filingsRef = updatedFilings;

    // Update the row in-place
    const row = document.querySelector(`tr[data-obligation-id="${CSS.escape(obligationId)}"]`);
    if (row) {
      row.setAttribute('data-row-status', 'filed');
      const statusCell = row.querySelector('.status-cell');
      if (statusCell) {
        statusCell.innerHTML = buildStatusBadge('filed');
      }
      const actionCell = row.querySelector('.action-cell');
      if (actionCell) {
        actionCell.innerHTML = '<span class="text-success"><i class="fas fa-check-circle"></i></span>';
      }
    }

    if (actionBtn) actionBtn.disabled = false;

    Swal.fire({
      title: 'Filed',
      text: `${obligation.name} marked as filed for ${entityIds.length} ${entityIds.length === 1 ? 'entity' : 'entities'}.`,
      icon: 'success',
      timer: 2000,
      showConfirmButton: false
    });
  } catch (error) {
    if (actionBtn) actionBtn.disabled = false;

    Swal.fire({
      title: 'Error',
      text: `Failed to update filing status: ${error.message}`,
      icon: 'error'
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the full Compliance Tracker panel into the given container.
 *
 * @param {string}        containerId    — DOM id of the mount target
 * @param {Array<Object>} activeEntities — Pre-loaded active entity objects
 * @param {Object}        obligations    — Map of obligationId -> obligation definition
 * @param {Object}        filings        — Pre-loaded filings for current year
 * @param {string|number} year           — Filing year
 */
export async function renderComplianceTracker(containerId, activeEntities, obligations, filings, year) {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Compliance tracker mount target "#${containerId}" not found.`);
  }

  const yearNum = parseInt(year, 10);

  // Local state — updated immutably
  let currentFilings = { ...filings };
  let currentYear = yearNum;
  let currentEntityFilter = null; // null = All Entities
  const setFilings = (newFilings) => { currentFilings = newFilings; };

  // Initial render
  container.innerHTML = buildTrackerCard(activeEntities, obligations, currentFilings, currentYear);

  // --- Event delegation: Mark Filed + Set Manual Due Date buttons ---
  const table = container.querySelector('.compliance-table');
  if (table) {
    table.addEventListener('click', (event) => {
      if (event.target.closest('.set-manual-date-btn')) {
        handleSetManualDueDate(event, obligations, currentFilings, currentYear, setFilings);
        return;
      }
      handleMarkFiled(event, obligations, activeEntities, currentYear, currentFilings, setFilings);
    });
  }

  // --- Entity filter change ---
  const entityFilter = container.querySelector('#compliance-entity-filter');
  if (entityFilter) {
    entityFilter.addEventListener('change', () => {
      currentEntityFilter = entityFilter.value || null;
      const tbody = container.querySelector('#compliance-tracker-tbody');
      if (tbody) {
        tbody.innerHTML = buildTableBodyPrioritySorted(
          activeEntities, obligations, currentFilings, currentYear, currentEntityFilter
        );
      }
    });
  }

  // --- Year selector change ---
  const yearSelector = container.querySelector('#compliance-year-selector');
  if (yearSelector) {
    yearSelector.addEventListener('change', async (event) => {
      const newYear = parseInt(event.target.value, 10);
      if (isNaN(newYear) || newYear === currentYear) return;

      currentYear = newYear;

      // Show loading state in tbody
      const tbody = container.querySelector('#compliance-tracker-tbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center py-4">
              <div class="spinner-border spinner-border-sm text-success" role="status"></div>
              <span class="ms-2 text-muted">Loading ${newYear} filings...</span>
            </td>
          </tr>`;
      }

      try {
        currentFilings = await loadFilings(newYear);

        // Re-render tbody only (preserve card shell and event listeners)
        if (tbody) {
          tbody.innerHTML = buildTableBodyPrioritySorted(
            activeEntities, obligations, currentFilings, currentYear, currentEntityFilter
          );
        }
      } catch (error) {
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="9" class="text-center py-4">
                <span class="text-danger">
                  <i class="fas fa-exclamation-triangle me-2"></i>
                  Failed to load filings: ${escapeHtml(error.message)}
                </span>
              </td>
            </tr>`;
        }
      }
    });
  }
}
