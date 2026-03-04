/**
 * Entity Registry Panel Component
 * Corporate Compliance Module
 *
 * Renders Active and Dormant entity tables side-by-side.
 * Receives pre-loaded data — no Firebase reads inside this component.
 * AR / BO compliance badges are clickable and toggle in-place via
 * updateEntityCompliance.
 */

import { updateEntityCompliance } from '../services/firebase-service.js';
import { escapeHtml, escapeAttr } from '../utils/html-escape.js';
import { auth } from '../../../config/firebase-config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentUserIdentifier() {
  const user = auth.currentUser;
  return user ? (user.email || user.uid) : 'unknown';
}

/**
 * Return a Bootstrap-style badge for CIPC status values.
 * @param {string} status — e.g. "IN BUSINESS", "DORMANT"
 * @returns {string} HTML badge markup
 */
function cipcBadge(status) {
  const normalised = (status || '').toUpperCase().trim();
  const isActive = normalised === 'IN BUSINESS';
  const bgClass = isActive ? 'bg-success' : 'bg-secondary';
  return `<span class="badge ${bgClass}">${escapeHtml(status || 'Unknown')}</span>`;
}

/**
 * Return a clickable compliance badge for AR or BO fields.
 * @param {Object} entity   — Entity data object
 * @param {string} field    — "arCompliant" or "boCompliant"
 * @returns {string} HTML badge markup with data attributes
 */
function complianceBadge(entity, field) {
  const isCompliant = entity[field] === true;
  const cssClass = isCompliant ? 'badge-compliant' : 'badge-non-compliant';
  const label = isCompliant ? 'Compliant' : 'Non-Compliant';
  return `<span
    class="badge ${cssClass}"
    role="button"
    tabindex="0"
    data-entity-id="${escapeAttr(entity.registrationNumber)}"
    data-field="${escapeAttr(field)}"
    title="Click to toggle"
    style="cursor:pointer;"
  >${label}</span>`;
}

/**
 * Render oversight cell content.
 * @param {string|null} oversight — Name of the oversight person, or null
 * @returns {string} HTML
 */
function oversightCell(oversight) {
  if (!oversight) return '<span class="text-muted">&mdash;</span>';
  return `<i class="fas fa-user-tie me-1 text-muted"></i>${escapeHtml(oversight)}`;
}

/**
 * Truncate a string to a maximum length, appending an ellipsis when needed.
 * @param {string|null} text
 * @param {number}      max
 * @returns {string}
 */
function truncate(text, max = 60) {
  if (!text) return '<span class="text-muted">&mdash;</span>';
  const safe = escapeHtml(text);
  if (text.length <= max) return safe;
  return `<span title="${escapeAttr(text)}">${safe.slice(0, max)}&hellip;</span>`;
}

// ---------------------------------------------------------------------------
// Active Entities table builder
// ---------------------------------------------------------------------------

/**
 * Build the full HTML for the Active Entities card.
 * @param {Array<Object>} entities
 * @returns {string} HTML
 */
function buildActiveCard(entities) {
  const rows = entities.map(entity => `
    <tr>
      <td><strong>${escapeHtml(entity.name)}</strong></td>
      <td><code>${escapeHtml(entity.registrationNumber)}</code></td>
      <td>${escapeHtml(entity.purpose || '')}</td>
      <td>${cipcBadge(entity.cipcStatus)}</td>
      <td>${complianceBadge(entity, 'arCompliant')}</td>
      <td>${complianceBadge(entity, 'boCompliant')}</td>
      <td>${oversightCell(entity.oversight)}</td>
    </tr>
  `).join('');

  return `
    <div class="card entity-card h-100">
      <div class="card-header d-flex align-items-center justify-content-between">
        <span>
          <i class="fas fa-check-circle text-success me-2"></i>
          <strong>Active Entities</strong>
        </span>
        <span class="badge bg-success">${entities.length}</span>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover table-sm mb-0" id="active-entities-table" style="font-size:0.85rem;">
            <thead class="table-light">
              <tr>
                <th>Entity Name</th>
                <th>Reg #</th>
                <th>Purpose</th>
                <th>CIPC Status</th>
                <th>AR</th>
                <th>BO</th>
                <th>Oversight</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="7" class="text-center text-muted py-3">No active entities</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Dormant Entities table builder
// ---------------------------------------------------------------------------

/**
 * Build the full HTML for the Dormant Entities card.
 * @param {Array<Object>} entities
 * @returns {string} HTML
 */
function buildDormantCard(entities) {
  const rows = entities.map(entity => `
    <tr>
      <td>${escapeHtml(entity.name)}</td>
      <td><code>${escapeHtml(entity.registrationNumber)}</code></td>
      <td>${cipcBadge(entity.cipcStatus)}</td>
      <td>${truncate(entity.notes)}</td>
    </tr>
  `).join('');

  return `
    <div class="card entity-card h-100">
      <div class="card-header d-flex align-items-center justify-content-between">
        <span>
          <i class="fas fa-pause-circle text-secondary me-2"></i>
          <strong>Dormant Entities</strong>
        </span>
        <span class="badge bg-secondary">${entities.length}</span>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover table-sm mb-0" style="font-size:0.85rem;">
            <thead class="table-light">
              <tr>
                <th>Entity Name</th>
                <th>Reg #</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="4" class="text-center text-muted py-3">No dormant entities</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Badge toggle (in-place update, no full re-render)
// ---------------------------------------------------------------------------

/**
 * Toggle a compliance badge element in the DOM after a successful write.
 * @param {HTMLElement} badgeEl     — The badge <span> element
 * @param {boolean}     newValue    — New compliance value
 */
function toggleBadgeInPlace(badgeEl, newValue) {
  if (newValue) {
    badgeEl.classList.remove('badge-non-compliant');
    badgeEl.classList.add('badge-compliant');
    badgeEl.textContent = 'Compliant';
  } else {
    badgeEl.classList.remove('badge-compliant');
    badgeEl.classList.add('badge-non-compliant');
    badgeEl.textContent = 'Non-Compliant';
  }
}

// Whitelist of fields that can be toggled via badge clicks (module-level constant — never changes)
const ALLOWED_COMPLIANCE_FIELDS = new Set(['arCompliant', 'boCompliant']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the full Entity Registry panel into the given container.
 *
 * @param {string}        containerId      — DOM id of the mount target
 * @param {Array<Object>} activeEntities   — Pre-loaded active entity objects
 * @param {Array<Object>} dormantEntities  — Pre-loaded dormant entity objects
 */
export async function renderEntityRegistry(containerId, activeEntities, dormantEntities) {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Entity registry mount target "#${containerId}" not found.`);
  }

  // Fresh compliance state per render — prevents stale entries leaking across
  // SPA re-renders when renderEntityRegistry is called more than once.
  const complianceState = new Map();

  // Tracks entity IDs that have an in-flight Firebase write, preventing
  // concurrent writes from rapid badge toggle clicks.
  const pendingBadgeUpdates = new Set();

  // ---------------------------------------------------------------------------
  // Nested helpers that close over the local complianceState
  // ---------------------------------------------------------------------------

  function initComplianceState(entities) {
    for (const entity of entities) {
      complianceState.set(entity.registrationNumber, {
        arCompliant: entity.arCompliant === true,
        boCompliant: entity.boCompliant === true
      });
    }
  }

  /**
   * Handle click events on compliance badges within the active entities table.
   * Uses SweetAlert2 for confirmation, then calls updateEntityCompliance and
   * toggles the badge in-place on success.
   *
   * @param {MouseEvent}    event
   * @param {Array<Object>} entities — Reference to the active entities array
   */
  async function handleBadgeClick(event, entities) {
    const badge = event.target.closest('[data-entity-id][data-field]');
    if (!badge) return;

    const entityId = badge.getAttribute('data-entity-id');
    const field = badge.getAttribute('data-field');

    // In-flight guard — drop duplicate clicks while a write is pending
    if (pendingBadgeUpdates.has(entityId)) return;
    pendingBadgeUpdates.add(entityId);

    // Validate field against whitelist
    if (!ALLOWED_COMPLIANCE_FIELDS.has(field)) {
      pendingBadgeUpdates.delete(entityId);
      return;
    }

    const entity = entities.find(e => e.registrationNumber === entityId);
    if (!entity) {
      pendingBadgeUpdates.delete(entityId);
      return;
    }

    const state = complianceState.get(entityId);
    if (!state) {
      pendingBadgeUpdates.delete(entityId);
      return;
    }

    const currentValue = state[field] === true;
    const fieldLabel = field === 'arCompliant' ? 'Annual Return' : 'Beneficial Ownership';

    try {
      const result = await Swal.fire({
        title: `Update ${fieldLabel} Status`,
        text: `Mark ${entity.name} as ${currentValue ? 'Non-Compliant' : 'Compliant'}?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: currentValue ? '#dc3545' : '#198754',
        confirmButtonText: currentValue ? 'Mark Non-Compliant' : 'Mark Compliant'
      });

      if (!result.isConfirmed) {
        pendingBadgeUpdates.delete(entityId);
        return;
      }

      const newValue = !currentValue;

      await updateEntityCompliance(entityId, {
        [field]: newValue,
        updatedBy: currentUserIdentifier()
      });

      pendingBadgeUpdates.delete(entityId);

      // Update local state immutably
      complianceState.set(entityId, { ...state, [field]: newValue });

      toggleBadgeInPlace(badge, newValue);

      Swal.fire({
        title: 'Updated',
        text: `${entity.name} ${fieldLabel} marked as ${newValue ? 'Compliant' : 'Non-Compliant'}.`,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error) {
      pendingBadgeUpdates.delete(entityId);

      Swal.fire({
        title: 'Error',
        text: `Failed to update compliance status: ${error.message}`,
        icon: 'error'
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Initialise local compliance state from entity data
  initComplianceState(activeEntities);

  container.innerHTML = `
    <div class="row g-3">
      <div class="col-lg-8">
        ${buildActiveCard(activeEntities)}
      </div>
      <div class="col-lg-4">
        ${buildDormantCard(dormantEntities)}
      </div>
    </div>
  `;

  // Attach event delegation for clickable AR / BO badges
  const activeTable = container.querySelector('#active-entities-table');
  if (activeTable) {
    activeTable.addEventListener('click', (event) => {
      handleBadgeClick(event, activeEntities);
    });

    // Support keyboard activation (Enter / Space) for accessibility
    activeTable.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        const badge = event.target.closest('[data-entity-id][data-field]');
        if (badge) {
          event.preventDefault();
          handleBadgeClick(event, activeEntities);
        }
      }
    });
  }
}
