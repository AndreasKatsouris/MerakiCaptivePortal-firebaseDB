/**
 * Compliance Tracker Panel Component
 * Corporate Compliance Module
 *
 * Renders the full obligation tracker table grouped by category,
 * with deadline calculation, status badges, and "Mark Filed" actions.
 * Receives pre-loaded data — re-fetches filings only on year change.
 */

import { updateFilingStatus, loadFilings } from '../services/firebase-service.js';
import { calculateNextDueDate, formatDueDate, getFilingStatus } from '../utils/deadline-calculator.js';
import { escapeHtml, escapeAttr } from '../utils/html-escape.js';

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
 * @param {Date|null}     dueDate        — Calculated due date
 * @returns {string} Worst status string
 */
function getWorstStatus(obligation, activeEntities, filings, dueDate) {
  const entityIds = getApplicableEntityIds(obligation, activeEntities);

  if (entityIds.length === 0) {
    return getFilingStatus(dueDate, null);
  }

  let worstIndex = -1;

  for (const entityId of entityIds) {
    const entityFilings = filings[entityId] || {};
    const filing = entityFilings[obligation.id] || null;
    const status = getFilingStatus(dueDate, filing);
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
 * @param {string} obligationId
 * @param {string} status
 * @param {string} entityIdsJson — JSON string of applicable entity IDs
 * @returns {string} Button HTML
 */
function buildActionButton(obligationId, status, entityIdsJson) {
  if (status === 'filed') {
    return '<span class="text-success"><i class="fas fa-check-circle"></i></span>';
  }
  if (status === 'not_applicable') {
    return '<span class="text-muted">&mdash;</span>';
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
      const status = getWorstStatus(obligation, activeEntities, filings, dueDate);
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
        <td>${capitalise(obligation.frequency)}</td>
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
 * Build the full card HTML for the compliance tracker panel.
 * @param {Array<Object>} activeEntities
 * @param {Object}        obligations
 * @param {Object}        filings
 * @param {number}        year
 * @returns {string} Complete card HTML
 */
function buildTrackerCard(activeEntities, obligations, filings, year) {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  return `
    <div class="card entity-card">
      <div class="card-header d-flex align-items-center justify-content-between">
        <span>
          <i class="fas fa-tasks text-success me-2"></i>
          <strong>Compliance Tracker</strong>
        </span>
        <select class="form-select form-select-sm" id="compliance-year-selector" style="width: auto;">
          <option value="${currentYear}" ${year === currentYear ? 'selected' : ''}>${currentYear}</option>
          <option value="${nextYear}" ${year === nextYear ? 'selected' : ''}>${nextYear}</option>
        </select>
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
              ${buildTableBody(activeEntities, obligations, filings, year)}
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
          <input type="text" id="swal-filed-by" class="form-control" placeholder="e.g., Lourens Kruger">
        </div>
        <div class="mb-3">
          <label class="form-label">Notes (optional)</label>
          <textarea id="swal-notes" class="form-control" rows="2"></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#198754',
      confirmButtonText: 'Mark as Filed',
      preConfirm: () => {
        const filedDate = document.getElementById('swal-filed-date').value;
        const filedBy = document.getElementById('swal-filed-by').value;

        if (!filedDate) {
          Swal.showValidationMessage('Please enter a filed date.');
          return false;
        }
        if (!filedBy || !filedBy.trim()) {
          Swal.showValidationMessage('Please enter who filed this.');
          return false;
        }

        return {
          filedDate,
          filedBy: filedBy.trim(),
          notes: document.getElementById('swal-notes').value.trim()
        };
      }
    });

    if (!result.isConfirmed || !result.value) return;

    const formValues = result.value;

    // Write to Firebase for each applicable entity
    for (const entityId of entityIds) {
      await updateFilingStatus(year, entityId, obligationId, {
        status: 'filed',
        dueDate: dueDateISO,
        filedDate: formValues.filedDate,
        filedBy: formValues.filedBy,
        notes: formValues.notes,
        updatedBy: 'director'
      });

      // Build updated filings immutably
      const filingRecord = {
        status: 'filed',
        dueDate: dueDateISO,
        filedDate: formValues.filedDate,
        filedBy: formValues.filedBy,
        notes: formValues.notes,
        updatedBy: 'director'
      };
      const updatedFilings = {
        ...filingsRef,
        [entityId]: {
          ...(filingsRef[entityId] || {}),
          [obligationId]: filingRecord
        }
      };
      filingsRef = updatedFilings;
      setFilings(updatedFilings);
    }

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

    Swal.fire({
      title: 'Filed',
      text: `${obligation.name} marked as filed for ${entityIds.length} ${entityIds.length === 1 ? 'entity' : 'entities'}.`,
      icon: 'success',
      timer: 2000,
      showConfirmButton: false
    });
  } catch (error) {
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

  // Local filings state — updated immutably via setter
  let currentFilings = { ...filings };
  let currentYear = yearNum;
  const setFilings = (newFilings) => { currentFilings = newFilings; };

  // Initial render
  container.innerHTML = buildTrackerCard(activeEntities, obligations, currentFilings, currentYear);

  // --- Event delegation: Mark Filed buttons ---
  const table = container.querySelector('.compliance-table');
  if (table) {
    table.addEventListener('click', (event) => {
      handleMarkFiled(event, obligations, activeEntities, currentYear, currentFilings, setFilings);
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
          tbody.innerHTML = buildTableBody(activeEntities, obligations, currentFilings, currentYear);
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
