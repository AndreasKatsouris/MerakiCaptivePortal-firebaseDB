/**
 * Entity Registry Panel Component
 * Corporate Compliance Module
 *
 * Renders Active and Dormant entity tables side-by-side.
 * Receives pre-loaded data — no Firebase reads inside this component.
 * AR / BO compliance badges are clickable and toggle in-place via
 * updateEntityCompliance.
 */

import { updateEntityCompliance, loadLocations, createEntity, updateEntity, deleteEntity } from '../services/firebase-service.js';
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
  if (text.length <= max) return escapeHtml(text);
  return `<span title="${escapeAttr(text)}">${escapeHtml(text.slice(0, max))}&hellip;</span>`;
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
      <td class="text-nowrap">
        <button class="btn btn-xs btn-outline-secondary btn-edit-entity me-1"
                data-reg="${escapeAttr(entity.registrationNumber)}"
                title="Edit entity">
          <i class="fas fa-pencil-alt"></i>
        </button>
        <button class="btn btn-xs btn-outline-danger btn-delete-entity"
                data-reg="${escapeAttr(entity.registrationNumber)}"
                data-name="${escapeAttr(entity.name)}"
                title="Delete entity">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="8" class="text-center text-muted py-3">No active entities</td></tr>'}
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
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h5 class="mb-0">
        <i class="fas fa-building me-2 text-primary"></i>Entity Registry
      </h5>
      <button id="btn-add-entity" class="btn btn-sm btn-success">
        <i class="fas fa-plus me-1"></i>Add Entity
      </button>
    </div>
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

  // ---------------------------------------------------------------------------
  // Add Entity — mutable local references updated on each successful add
  // ---------------------------------------------------------------------------

  let localActiveEntities = activeEntities;
  let localDormantEntities = dormantEntities;

  /**
   * Open a SweetAlert2 form dialog to collect new entity data, call createEntity,
   * then update the panel in-place without a full page reload.
   */
  async function handleAddEntity() {
    const formHtml = `
      <div class="mb-3">
        <label class="form-label fw-semibold">CIPC Registration Number *</label>
        <input id="swal-reg-number" class="form-control" type="text"
               placeholder="e.g. K2019183304" maxlength="20">
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Entity Name *</label>
        <input id="swal-name" class="form-control" type="text"
               placeholder="Legal entity name" maxlength="200">
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Entity Type *</label>
        <select id="swal-type" class="form-select">
          <option value="">Select type...</option>
          <option value="PRIVATE COMPANY">Private Company (Pty) Ltd</option>
          <option value="CLOSE CORPORATION">Close Corporation (CC)</option>
          <option value="TRUST">Trust</option>
          <option value="PARTNERSHIP">Partnership</option>
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Status *</label>
        <select id="swal-status" class="form-select">
          <option value="active">Active</option>
          <option value="dormant">Dormant</option>
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Purpose / Description *</label>
        <input id="swal-purpose" class="form-control" type="text"
               placeholder="e.g. OB The Grove — Trading Entity" maxlength="300">
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">CIPC Status</label>
        <select id="swal-cipc-status" class="form-select">
          <option value="IN BUSINESS">In Business</option>
          <option value="DORMANT">Dormant</option>
          <option value="DEREGISTERED">Deregistered</option>
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Financial Year-End</label>
        <input id="swal-fye" class="form-control" type="text"
               placeholder="MM-DD (e.g. 02-28 for Feb)" maxlength="5">
        <div class="form-text">Leave blank if unknown</div>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Incorporation Date</label>
        <input id="swal-incorporation-date" class="form-control" type="date">
        <div class="form-text">Registration/incorporation date from CIPC certificate</div>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Oversight Contact</label>
        <input id="swal-oversight" class="form-control" type="text"
               placeholder="Director / manager name" maxlength="200">
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Oversight Phone</label>
        <input id="swal-oversight-phone" class="form-control" type="tel"
               placeholder="+27 ..." maxlength="20">
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Linked Locations</label>
        <div id="swal-locations-list" class="border rounded p-2"
             style="max-height: 150px; overflow-y: auto;">
          <div class="text-muted small">Loading locations...</div>
        </div>
        <div class="form-text">Select all locations this entity operates or owns</div>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Notes</label>
        <textarea id="swal-notes" class="form-control" rows="2"
                  maxlength="500" placeholder="Optional notes"></textarea>
      </div>
    `;

    const result = await Swal.fire({
      title: 'Add Entity',
      html: formHtml,
      showCancelButton: true,
      confirmButtonColor: '#198754',
      confirmButtonText: 'Add Entity',
      width: '600px',
      didOpen: async () => {
        const locContainer = document.getElementById('swal-locations-list');
        try {
          const locations = await loadLocations();
          if (locations.length === 0) {
            locContainer.innerHTML = '<div class="text-muted small">No locations found</div>';
          } else {
            locContainer.innerHTML = locations.map(loc => `
              <div class="form-check">
                <input class="form-check-input location-checkbox"
                       type="checkbox"
                       value="${escapeAttr(loc.id)}"
                       id="loc-${escapeAttr(loc.id)}">
                <label class="form-check-label small" for="loc-${escapeAttr(loc.id)}">
                  ${escapeHtml(loc.name)}${loc.city ? ' \u2014 ' + escapeHtml(loc.city) : ''}
                </label>
              </div>
            `).join('');
          }
        } catch (err) {
          locContainer.innerHTML = '<div class="text-danger small">Could not load locations</div>';
        }
      },
      preConfirm: async () => {
        const regNumber = document.getElementById('swal-reg-number').value.trim();
        const name = document.getElementById('swal-name').value.trim();
        const type = document.getElementById('swal-type').value;
        const status = document.getElementById('swal-status').value;
        const purpose = document.getElementById('swal-purpose').value.trim();
        const cipcStatus = document.getElementById('swal-cipc-status').value;
        const fye = document.getElementById('swal-fye').value.trim();
        const incorporationDate = document.getElementById('swal-incorporation-date').value || null;
        const oversight = document.getElementById('swal-oversight').value.trim();
        const oversightPhone = document.getElementById('swal-oversight-phone').value.trim();
        const notes = document.getElementById('swal-notes').value.trim();
        const linkedLocationIds = [...document.querySelectorAll('.location-checkbox:checked')]
          .map(cb => cb.value);

        if (!regNumber) {
          Swal.showValidationMessage('Registration number is required');
          return false;
        }
        if (!name) {
          Swal.showValidationMessage('Entity name is required');
          return false;
        }
        if (!type) {
          Swal.showValidationMessage('Entity type is required');
          return false;
        }
        if (!purpose) {
          Swal.showValidationMessage('Purpose is required');
          return false;
        }
        if (fye && !/^\d{2}-\d{2}$/.test(fye)) {
          Swal.showValidationMessage('Financial year-end must be MM-DD format (e.g. 02-28)');
          return false;
        }

        try {
          return await createEntity({
            registrationNumber: regNumber,
            name,
            type,
            status,
            purpose,
            cipcStatus,
            incorporationDate: incorporationDate || null,
            financialYearEnd: fye || null,
            oversight: oversight || null,
            oversightPhone: oversightPhone || null,
            notes: notes || null,
            linkedLocationIds
          });
        } catch (err) {
          Swal.showValidationMessage(err.message || 'Failed to create entity');
          return false;
        }
      }
    });

    if (!result.isConfirmed || !result.value) return;

    const newEntity = result.value;

    // Update local arrays immutably based on the new entity's status
    if (newEntity.status === 'active') {
      localActiveEntities = [...localActiveEntities, newEntity];
      initComplianceState([newEntity]);
    } else {
      localDormantEntities = [...localDormantEntities, newEntity];
    }

    // Re-render both table cards and re-attach listeners
    rerenderTables();

    Swal.fire({
      toast: true,
      icon: 'success',
      title: 'Entity added',
      position: 'top-end',
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true
    });
  }

  // ---------------------------------------------------------------------------
  // Edit Entity — open pre-filled SweetAlert2 form, write updates, re-render
  // ---------------------------------------------------------------------------

  /**
   * Open a SweetAlert2 form pre-filled with the entity's current values.
   * On confirm, call updateEntity, update local state immutably, re-render.
   *
   * @param {string} registrationNumber
   */
  async function handleEditEntity(registrationNumber) {
    const entity = localActiveEntities.find(e => e.registrationNumber === registrationNumber)
      || localDormantEntities.find(e => e.registrationNumber === registrationNumber);

    if (!entity) return;

    const formHtml = `
      <div class="mb-3">
        <label class="form-label fw-semibold">CIPC Registration Number</label>
        <input id="swal-reg-number" class="form-control" type="text"
               value="${escapeAttr(entity.registrationNumber)}" readonly
               style="background:#f8f9fa;">
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Entity Name *</label>
        <input id="swal-name" class="form-control" type="text"
               value="${escapeAttr(entity.name)}" maxlength="200">
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Entity Type *</label>
        <select id="swal-type" class="form-select">
          <option value="">Select type...</option>
          <option value="PRIVATE COMPANY" ${entity.type === 'PRIVATE COMPANY' ? 'selected' : ''}>Private Company (Pty) Ltd</option>
          <option value="CLOSE CORPORATION" ${entity.type === 'CLOSE CORPORATION' ? 'selected' : ''}>Close Corporation (CC)</option>
          <option value="TRUST" ${entity.type === 'TRUST' ? 'selected' : ''}>Trust</option>
          <option value="PARTNERSHIP" ${entity.type === 'PARTNERSHIP' ? 'selected' : ''}>Partnership</option>
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Status *</label>
        <select id="swal-status" class="form-select">
          <option value="active" ${entity.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="dormant" ${entity.status === 'dormant' ? 'selected' : ''}>Dormant</option>
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Purpose / Description *</label>
        <input id="swal-purpose" class="form-control" type="text"
               value="${escapeAttr(entity.purpose || '')}" maxlength="300">
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">CIPC Status</label>
        <select id="swal-cipc-status" class="form-select">
          <option value="IN BUSINESS" ${entity.cipcStatus === 'IN BUSINESS' ? 'selected' : ''}>In Business</option>
          <option value="DORMANT" ${entity.cipcStatus === 'DORMANT' ? 'selected' : ''}>Dormant</option>
          <option value="DEREGISTERED" ${entity.cipcStatus === 'DEREGISTERED' ? 'selected' : ''}>Deregistered</option>
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Financial Year-End</label>
        <input id="swal-fye" class="form-control" type="text"
               value="${escapeAttr(entity.financialYearEnd || '')}"
               placeholder="MM-DD (e.g. 02-28 for Feb)" maxlength="5">
        <div class="form-text">Leave blank if unknown</div>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Incorporation Date</label>
        <input id="swal-incorporation-date" class="form-control" type="date"
               value="${escapeAttr(entity.incorporationDate || '')}">
        <div class="form-text">Registration/incorporation date from CIPC certificate</div>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Oversight Contact</label>
        <input id="swal-oversight" class="form-control" type="text"
               value="${escapeAttr(entity.oversight || '')}" maxlength="200">
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Oversight Phone</label>
        <input id="swal-oversight-phone" class="form-control" type="tel"
               value="${escapeAttr(entity.oversightPhone || '')}" maxlength="20">
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Linked Locations</label>
        <div id="swal-locations-list" class="border rounded p-2"
             style="max-height: 150px; overflow-y: auto;">
          <div class="text-muted small">Loading locations...</div>
        </div>
        <div class="form-text">Select all locations this entity operates or owns</div>
      </div>
      <div class="mb-3">
        <label class="form-label fw-semibold">Notes</label>
        <textarea id="swal-notes" class="form-control" rows="2"
                  maxlength="500">${escapeHtml(entity.notes || '')}</textarea>
      </div>
    `;

    const linkedIds = Array.isArray(entity.linkedLocationIds) ? entity.linkedLocationIds : [];

    const result = await Swal.fire({
      title: 'Edit Entity',
      html: formHtml,
      showCancelButton: true,
      confirmButtonColor: '#0d6efd',
      confirmButtonText: 'Save Changes',
      width: '600px',
      didOpen: async () => {
        const locContainer = document.getElementById('swal-locations-list');
        try {
          const locations = await loadLocations();
          if (locations.length === 0) {
            locContainer.innerHTML = '<div class="text-muted small">No locations found</div>';
          } else {
            locContainer.innerHTML = locations.map(loc => `
              <div class="form-check">
                <input class="form-check-input location-checkbox"
                       type="checkbox"
                       value="${escapeAttr(loc.id)}"
                       id="loc-${escapeAttr(loc.id)}"
                       ${linkedIds.includes(loc.id) ? 'checked' : ''}>
                <label class="form-check-label small" for="loc-${escapeAttr(loc.id)}">
                  ${escapeHtml(loc.name)}${loc.city ? ' \u2014 ' + escapeHtml(loc.city) : ''}
                </label>
              </div>
            `).join('');
          }
        } catch (err) {
          locContainer.innerHTML = '<div class="text-danger small">Could not load locations</div>';
        }
      },
      preConfirm: async () => {
        const name = document.getElementById('swal-name').value.trim();
        const type = document.getElementById('swal-type').value;
        const status = document.getElementById('swal-status').value;
        const purpose = document.getElementById('swal-purpose').value.trim();
        const cipcStatus = document.getElementById('swal-cipc-status').value;
        const fye = document.getElementById('swal-fye').value.trim();
        const incorporationDate = document.getElementById('swal-incorporation-date').value || null;
        const oversight = document.getElementById('swal-oversight').value.trim();
        const oversightPhone = document.getElementById('swal-oversight-phone').value.trim();
        const notes = document.getElementById('swal-notes').value.trim();
        const newLinkedLocationIds = [...document.querySelectorAll('.location-checkbox:checked')]
          .map(cb => cb.value);

        if (!name) {
          Swal.showValidationMessage('Entity name is required');
          return false;
        }
        if (!type) {
          Swal.showValidationMessage('Entity type is required');
          return false;
        }
        if (!purpose) {
          Swal.showValidationMessage('Purpose is required');
          return false;
        }
        if (fye && !/^\d{2}-\d{2}$/.test(fye)) {
          Swal.showValidationMessage('Financial year-end must be MM-DD format (e.g. 02-28)');
          return false;
        }

        const updates = {
          name,
          type,
          status,
          purpose,
          cipcStatus,
          incorporationDate: incorporationDate || null,
          financialYearEnd: fye || null,
          oversight: oversight || null,
          oversightPhone: oversightPhone || null,
          linkedLocationIds: newLinkedLocationIds,
          notes: notes || null,
          updatedBy: auth.currentUser?.email || auth.currentUser?.uid || 'unknown'
        };

        try {
          await updateEntity(registrationNumber, updates);
          return updates;
        } catch (err) {
          Swal.showValidationMessage(err.message || 'Failed to update entity');
          return false;
        }
      }
    });

    if (!result.isConfirmed || !result.value) return;

    const updates = result.value;
    const updatedEntity = { ...entity, ...updates };
    const prevStatus = entity.status;
    const newStatus = updates.status;

    // Remove from whichever list the entity was in
    localActiveEntities = localActiveEntities.filter(e => e.registrationNumber !== registrationNumber);
    localDormantEntities = localDormantEntities.filter(e => e.registrationNumber !== registrationNumber);

    // Add to the correct list based on the (possibly changed) status
    if (newStatus === 'active') {
      localActiveEntities = [...localActiveEntities, updatedEntity];
      // Sync compliance state entry — preserve existing toggles or initialise
      if (!complianceState.has(registrationNumber)) {
        initComplianceState([updatedEntity]);
      }
    } else {
      localDormantEntities = [...localDormantEntities, updatedEntity];
      complianceState.delete(registrationNumber);
    }

    // Re-render both table cards
    rerenderTables();

    Swal.fire({
      toast: true,
      icon: 'success',
      title: 'Entity updated',
      position: 'top-end',
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true
    });
  }

  // ---------------------------------------------------------------------------
  // Delete Entity — confirmation dialog, delete from Firebase, update local state
  // ---------------------------------------------------------------------------

  /**
   * Prompt for confirmation, delete the entity from Firebase, and remove it
   * from local state and the rendered tables.
   *
   * @param {string} registrationNumber
   * @param {string} name
   */
  async function handleDeleteEntity(registrationNumber, name) {
    const result = await Swal.fire({
      title: 'Delete Entity?',
      html: `This will permanently delete <strong>${escapeHtml(name)}</strong> and all its filing records. This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      confirmButtonText: 'Delete permanently',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      await deleteEntity(registrationNumber);

      localActiveEntities = localActiveEntities.filter(e => e.registrationNumber !== registrationNumber);
      localDormantEntities = localDormantEntities.filter(e => e.registrationNumber !== registrationNumber);
      complianceState.delete(registrationNumber);

      rerenderTables();

      Swal.fire({
        toast: true,
        icon: 'success',
        title: 'Entity deleted',
        position: 'top-end',
        showConfirmButton: false,
        timer: 2500,
        timerProgressBar: true
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Delete failed', text: err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Shared re-render helper — rebuilds both table cards and re-attaches listeners
  // ---------------------------------------------------------------------------

  /**
   * Re-render both table card columns and re-attach event delegation to the
   * freshly injected active-entities table.
   */
  function rerenderTables() {
    const activeCol = container.querySelector('.col-lg-8');
    const dormantCol = container.querySelector('.col-lg-4');
    if (activeCol) activeCol.innerHTML = buildActiveCard(localActiveEntities);
    if (dormantCol) dormantCol.innerHTML = buildDormantCard(localDormantEntities);

    const refreshedActiveTable = container.querySelector('#active-entities-table');
    if (refreshedActiveTable) {
      refreshedActiveTable.addEventListener('click', (event) => {
        handleBadgeClick(event, localActiveEntities);
      });
      refreshedActiveTable.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          const badge = event.target.closest('[data-entity-id][data-field]');
          if (badge) {
            event.preventDefault();
            handleBadgeClick(event, localActiveEntities);
          }
        }
      });
    }
  }

  // Attach click handler for the Add Entity button via event delegation on the container
  container.addEventListener('click', (event) => {
    if (event.target.closest('#btn-add-entity')) {
      handleAddEntity();
      return;
    }

    const editBtn = event.target.closest('.btn-edit-entity');
    if (editBtn) {
      const reg = editBtn.getAttribute('data-reg');
      if (reg) handleEditEntity(reg);
      return;
    }

    const deleteBtn = event.target.closest('.btn-delete-entity');
    if (deleteBtn) {
      const reg = deleteBtn.getAttribute('data-reg');
      const name = deleteBtn.getAttribute('data-name');
      if (reg) handleDeleteEntity(reg, name || reg);
    }
  });
}
