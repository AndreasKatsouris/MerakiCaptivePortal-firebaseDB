/**
 * Obligations Manager Panel Component
 * Corporate Compliance Module
 *
 * Renders the Obligations Manager card with a sortable table.
 * Provides Add / Edit / Delete operations via SweetAlert2 dialogs.
 * Receives pre-loaded data — no Firebase reads inside this component.
 */

import {
  createObligation,
  updateObligation,
  deleteObligation,
  loadTemplates
} from '../services/firebase-service.js';

const DEFAULT_WRITE_SERVICE = { create: createObligation, update: updateObligation, delete: deleteObligation };
import { escapeHtml, escapeAttr } from '../utils/html-escape.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEADLINE_RULE_OPTIONS = [
  { value: 'fixed_date',                                  label: 'Fixed calendar date (MM-DD)' },
  { value: 'day_7_following_month',                       label: '7th of following month' },
  { value: 'first_week_following_month',                  label: 'First week of following month' },
  { value: 'last_business_day_of_month_following_period', label: 'Last business day after period end (VAT)' },
  { value: '30_business_days_after_anniversary',          label: '30 business days after CIPC anniversary' },
  { value: 'filed_with_cipc_annual_return',               label: 'Filed with CIPC Annual Return' },
  { value: '6_months_after_tax_year_start',               label: '6 months after tax year start' },
  { value: 'last_day_of_financial_year',                  label: 'Last day of financial year' },
  { value: '6_months_after_financial_year_end',           label: '6 months after financial year-end' },
  { value: '12_months_after_financial_year_end',          label: '12 months after financial year-end' },
  { value: 'aligned_to_financial_year_end',               label: 'Aligned to financial year-end' },
  { value: 'sars_announced_sep_oct_window',               label: 'SARS announced Sep\u2013Oct window' },
  { value: 'april_1_to_may_31_window',                    label: 'April 1 to May 31 window' },
  { value: 'per_entity_licence_expiry',                   label: 'Per entity licence expiry (manual)' },
  { value: 'per_entity_inspection_anniversary',           label: 'Per entity inspection anniversary (manual)' },
  { value: 'manual',                                      label: 'Manual / custom date' }
];

const YEAR_END_RELATIVE_RULES = new Set([
  '6_months_after_tax_year_start',
  'last_day_of_financial_year',
  '6_months_after_financial_year_end',
  '12_months_after_financial_year_end',
  'aligned_to_financial_year_end'
]);

const CATEGORY_OPTIONS = [
  { value: 'monthly',  label: 'Monthly' },
  { value: 'biannual', label: 'Bi-Annual' },
  { value: 'annual',   label: 'Annual' },
  { value: 'once_off', label: 'Once-Off' }
];

const CATEGORY_ORDER = { monthly: 0, biannual: 1, annual: 2, once_off: 3 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an obligation name to a safe Firebase key slug.
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * Build a short "Applies To" summary string for the table column.
 * @param {Object}        obl            — Obligation object
 * @param {Array<Object>} activeEntities — Array of active entity objects
 * @returns {string} HTML
 */
function buildAppliesToSummary(obl, activeEntities) {
  if (obl.appliesToAll) {
    return '<span class="text-success"><i class="fas fa-globe me-1"></i>All Entities</span>';
  }

  const ids = Array.isArray(obl.appliesToEntityIds) ? obl.appliesToEntityIds : [];
  if (ids.length === 0) {
    return '<span class="text-muted">&mdash;</span>';
  }

  const names = ids.map(id => {
    const entity = activeEntities.find(e => e.registrationNumber === id);
    return entity ? entity.name : id;
  });

  if (names.length <= 2) {
    return escapeHtml(names.join(', '));
  }

  const visible = names.slice(0, 2).map(n => escapeHtml(n)).join(', ');
  const remainder = names.length - 2;
  return `${visible} <span class="text-muted">+${remainder} more</span>`;
}

/**
 * Sort obligations: monthly → biannual → annual → once_off, then by name within each group.
 * @param {Object} obligationsMap — Map of id -> obligation
 * @returns {Array<Object>} Sorted obligation objects with id attached
 */
function sortedObligations(obligationsMap) {
  return Object.entries(obligationsMap)
    .map(([id, obl]) => ({ ...obl, id }))
    .sort((a, b) => {
      const catA = CATEGORY_ORDER[a.category] ?? 99;
      const catB = CATEGORY_ORDER[b.category] ?? 99;
      if (catA !== catB) return catA - catB;
      return (a.name || '').localeCompare(b.name || '');
    });
}

// ---------------------------------------------------------------------------
// HTML builders
// ---------------------------------------------------------------------------

/**
 * Build a single obligation table row.
 * @param {Object}        obl            — Obligation object (with id)
 * @param {number}        rowNum
 * @param {Array<Object>} activeEntities
 * @returns {string} HTML
 */
function buildObligationRow(obl, rowNum, activeEntities) {
  const customBadge = obl.custom
    ? '<span class="badge bg-info ms-1" style="font-size:0.7rem;">custom</span>'
    : '';

  return `
    <tr>
      <td class="text-muted">${rowNum}</td>
      <td>
        <strong>${escapeHtml(obl.name)}</strong>
        ${customBadge}
      </td>
      <td>${escapeHtml(obl.category || '')}</td>
      <td>${escapeHtml(obl.authority || '')}</td>
      <td><code style="font-size:0.75rem;">${escapeHtml(obl.deadlineRule || '')}</code></td>
      <td>${buildAppliesToSummary(obl, activeEntities)}</td>
      <td>${escapeHtml(obl.defaultOwner || '')}</td>
      <td class="text-nowrap">
        <button class="btn btn-xs btn-outline-secondary btn-edit-obligation me-1"
                data-id="${escapeAttr(obl.id)}" title="Edit obligation">
          <i class="fas fa-pencil-alt"></i>
        </button>
        <button class="btn btn-xs btn-outline-danger btn-delete-obligation"
                data-id="${escapeAttr(obl.id)}"
                data-name="${escapeAttr(obl.name)}" title="Delete obligation">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    </tr>
  `;
}

/**
 * Build the complete Obligations Manager card HTML.
 * @param {Object}        obligations    — Map of id -> obligation
 * @param {Array<Object>} activeEntities
 * @returns {string} HTML
 */
function buildObligationsTable(obligations, activeEntities, entityFilterId = null) {
  let sorted = sortedObligations(obligations);

  // Filter to obligations applicable to the selected entity
  if (entityFilterId) {
    sorted = sorted.filter(obl => {
      if (obl.appliesToAll) return true;
      return Array.isArray(obl.appliesToEntityIds) && obl.appliesToEntityIds.includes(entityFilterId);
    });
  }

  const emptyMsg = entityFilterId
    ? 'No obligations apply to this entity.'
    : 'No obligations defined';

  const rows = sorted.length > 0
    ? sorted.map((obl, i) => buildObligationRow(obl, i + 1, activeEntities)).join('')
    : `<tr><td colspan="8" class="text-center text-muted py-3">${emptyMsg}</td></tr>`;

  const entityOptions = activeEntities
    .map(e => `<option value="${escapeAttr(e.registrationNumber)}" ${entityFilterId === e.registrationNumber ? 'selected' : ''}>${escapeHtml(e.name)}</option>`)
    .join('');

  return `
    <div class="card entity-card">
      <div class="card-header d-flex align-items-center justify-content-between flex-wrap gap-2">
        <span>
          <i class="fas fa-list-check text-primary me-2"></i>
          <strong>Obligations Manager</strong>
        </span>
        <div class="d-flex gap-2 align-items-center">
          <select class="form-select form-select-sm" id="obl-entity-filter" style="width: auto; min-width: 160px;">
            <option value="" ${!entityFilterId ? 'selected' : ''}>All Entities</option>
            ${entityOptions}
          </select>
          <button id="btn-add-obligation" class="btn btn-sm btn-success">
            <i class="fas fa-plus me-1"></i>Add Obligation
          </button>
        </div>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover table-sm mb-0" id="obligations-table" style="font-size:0.85rem;">
            <thead class="table-light">
              <tr>
                <th>#</th>
                <th>Obligation</th>
                <th>Category</th>
                <th>Authority</th>
                <th>Deadline Rule</th>
                <th>Applies To</th>
                <th>Owner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Dialog form builder
// ---------------------------------------------------------------------------

/**
 * Build the <select> options HTML for DEADLINE_RULE_OPTIONS.
 * @param {string} selectedValue
 * @returns {string}
 */
function buildDeadlineRuleOptions(selectedValue) {
  return DEADLINE_RULE_OPTIONS.map(opt => `
    <option value="${escapeAttr(opt.value)}" ${opt.value === selectedValue ? 'selected' : ''}>
      ${escapeHtml(opt.label)}
    </option>
  `).join('');
}

/**
 * Build the <select> options HTML for CATEGORY_OPTIONS.
 * @param {string} selectedValue
 * @returns {string}
 */
function buildCategoryOptions(selectedValue) {
  return CATEGORY_OPTIONS.map(opt => `
    <option value="${escapeAttr(opt.value)}" ${opt.value === selectedValue ? 'selected' : ''}>
      ${escapeHtml(opt.label)}
    </option>
  `).join('');
}

/**
 * Build entity checkboxes for the "Specific Entities" section.
 * @param {Array<Object>} activeEntities
 * @param {Array<string>} checkedIds     — registrationNumbers that should be pre-checked
 * @returns {string} HTML
 */
function buildEntityCheckboxes(activeEntities, checkedIds) {
  if (activeEntities.length === 0) {
    return '<div class="text-muted small">No active entities found</div>';
  }

  return activeEntities.map(entity => {
    const checked = checkedIds.includes(entity.registrationNumber) ? 'checked' : '';
    return `
      <div class="form-check">
        <input class="form-check-input obl-entity-checkbox"
               type="checkbox"
               value="${escapeAttr(entity.registrationNumber)}"
               id="obl-entity-${escapeAttr(entity.registrationNumber)}"
               ${checked}>
        <label class="form-check-label small" for="obl-entity-${escapeAttr(entity.registrationNumber)}">
          ${escapeHtml(entity.name)}
        </label>
      </div>
    `;
  }).join('');
}

/**
 * Build the SweetAlert2 HTML for the template picker step.
 * @param {Array<Object>} templates — Array of template objects with id attached, sorted by category
 * @returns {string} HTML
 */
function buildTemplatePicker(templates) {
  const grouped = { monthly: [], biannual: [], annual: [], once_off: [] };
  templates.forEach(t => {
    if (grouped[t.category]) grouped[t.category].push(t);
    else grouped.annual.push(t);
  });

  const LABELS = { monthly: 'Monthly', biannual: 'Bi-Annual', annual: 'Annual', once_off: 'Once-Off' };

  let rows = '';
  Object.entries(grouped).forEach(([cat, items]) => {
    if (items.length === 0) return;
    rows += `<div class="text-muted small fw-semibold mt-2 mb-1">${LABELS[cat] || cat}</div>`;
    items.forEach(t => {
      rows += `
        <div class="form-check border rounded px-3 py-2 mb-1">
          <input class="form-check-input" type="radio" name="template-picker-radio"
                 id="tpl-${escapeAttr(t.id)}" value="${escapeAttr(t.id)}">
          <label class="form-check-label w-100" for="tpl-${escapeAttr(t.id)}">
            <strong>${escapeHtml(t.name)}</strong>
            ${t.authority ? `<span class="text-muted ms-2 small">${escapeHtml(t.authority)}</span>` : ''}
          </label>
        </div>
      `;
    });
  });

  return `
    <div style="max-height: 320px; overflow-y: auto;">
      ${rows}
      <div class="form-check border rounded px-3 py-2 mb-1 mt-2">
        <input class="form-check-input" type="radio" name="template-picker-radio"
               id="tpl-scratch" value="" checked>
        <label class="form-check-label" for="tpl-scratch">
          <strong>Start from scratch</strong>
          <span class="text-muted ms-2 small">Blank form</span>
        </label>
      </div>
    </div>
  `;
}

/**
 * Build the SweetAlert2 HTML body for the Add/Edit obligation dialog.
 * @param {Object|null}   obligation     — Existing obligation for pre-fill (null on add)
 * @param {Array<Object>} activeEntities
 * @param {boolean}       isEdit
 * @returns {string} HTML
 */
function buildDialogForm(obligation, activeEntities, isEdit) {
  const obl = obligation || {};
  const checkedEntityIds = Array.isArray(obl.appliesToEntityIds) ? obl.appliesToEntityIds : [];
  const appliesToAll = obl.appliesToAll !== false || !isEdit;
  const deadlineRule = obl.deadlineRule || '';

  const idFieldHtml = isEdit
    ? `
      <div class="mb-3">
        <label class="form-label fw-semibold">Obligation ID</label>
        <input id="swal-obl-id" class="form-control" type="text"
               value="${escapeAttr(obl.id || '')}" readonly
               style="background:#f8f9fa; font-family:monospace;">
        <div class="form-text">ID cannot be changed after creation</div>
      </div>
    `
    : `
      <div class="mb-3">
        <label class="form-label fw-semibold">Obligation ID *</label>
        <input id="swal-obl-id" class="form-control" type="text"
               placeholder="auto-filled from name" maxlength="60"
               style="font-family:monospace;">
        <div class="form-text">Only <code>[a-z0-9_]</code> characters. Auto-filled from name.</div>
      </div>
    `;

  return `
    ${idFieldHtml}
    <div class="mb-3">
      <label class="form-label fw-semibold">Name *</label>
      <input id="swal-obl-name" class="form-control" type="text"
             value="${escapeAttr(obl.name || '')}" maxlength="200"
             placeholder="e.g. VAT201 Monthly Return">
    </div>
    <div class="mb-3">
      <label class="form-label fw-semibold">Category *</label>
      <select id="swal-obl-category" class="form-select">
        <option value="">Select category...</option>
        ${buildCategoryOptions(obl.category || '')}
      </select>
    </div>
    <div class="mb-3">
      <label class="form-label fw-semibold">Frequency</label>
      <input id="swal-obl-frequency" class="form-control" type="text"
             value="${escapeAttr(obl.frequency || '')}" maxlength="50"
             placeholder="e.g. Monthly, Bi-Annual">
      <div class="form-text">Auto-filled from category if left blank</div>
    </div>
    <div class="mb-3">
      <label class="form-label fw-semibold">Authority</label>
      <input id="swal-obl-authority" class="form-control" type="text"
             value="${escapeAttr(obl.authority || '')}" maxlength="100"
             placeholder="e.g. CIPC, SARS, Municipality">
    </div>
    <div class="mb-3">
      <label class="form-label fw-semibold">Deadline Rule *</label>
      <select id="swal-obl-deadline-rule" class="form-select">
        <option value="">Select deadline rule...</option>
        ${buildDeadlineRuleOptions(deadlineRule)}
      </select>
    </div>
    <div id="swal-fixed-deadline-group" class="mb-3" style="display:none;">
      <label class="form-label fw-semibold">Fixed Deadline *</label>
      <input id="swal-obl-fixed-deadline" class="form-control" type="text"
             value="${escapeAttr(obl.fixedDeadline || '')}"
             placeholder="MM-DD (e.g. 07-31)" maxlength="5">
      <div class="form-text">Month-Day in MM-DD format</div>
    </div>
    <div class="mb-3">
      <label class="form-label fw-semibold">Applies To *</label>
      <div class="d-flex gap-3 mb-2">
        <div class="form-check">
          <input class="form-check-input" type="radio" name="swal-obl-applies-to"
                 id="swal-applies-all" value="all" ${appliesToAll ? 'checked' : ''}>
          <label class="form-check-label" for="swal-applies-all">All Entities</label>
        </div>
        <div class="form-check">
          <input class="form-check-input" type="radio" name="swal-obl-applies-to"
                 id="swal-applies-specific" value="specific" ${!appliesToAll ? 'checked' : ''}>
          <label class="form-check-label" for="swal-applies-specific">Specific Entities</label>
        </div>
      </div>
      <div id="swal-entity-checkboxes"
           class="border rounded p-2"
           style="max-height:150px; overflow-y:auto; display:none;">
        ${buildEntityCheckboxes(activeEntities, checkedEntityIds)}
      </div>
    </div>
    <div class="mb-3">
      <label class="form-label fw-semibold">Default Owner</label>
      <input id="swal-obl-owner" class="form-control" type="text"
             value="${escapeAttr(obl.defaultOwner || '')}" maxlength="200"
             placeholder="e.g. Finance Manager">
    </div>
  `;
}

// ---------------------------------------------------------------------------
// didOpen wiring
// ---------------------------------------------------------------------------

/**
 * Attach live listeners inside the SweetAlert2 dialog after it opens.
 * @param {boolean} isEdit
 * @param {string}  currentDeadlineRule
 * @param {boolean} currentAppliesToAll
 */
function wireDialogListeners(isEdit, currentDeadlineRule, currentAppliesToAll) {
  const nameInput         = document.getElementById('swal-obl-name');
  const idInput           = document.getElementById('swal-obl-id');
  const deadlineRuleSelect = document.getElementById('swal-obl-deadline-rule');
  const fixedGroup        = document.getElementById('swal-fixed-deadline-group');
  const entityCheckboxes  = document.getElementById('swal-entity-checkboxes');
  const radioAll          = document.getElementById('swal-applies-all');
  const radioSpecific     = document.getElementById('swal-applies-specific');

  function syncFixedDeadlineVisibility(ruleValue) {
    if (fixedGroup) {
      fixedGroup.style.display = ruleValue === 'fixed_date' ? '' : 'none';
    }
  }

  function syncEntityCheckboxVisibility(isSpecific) {
    if (entityCheckboxes) {
      entityCheckboxes.style.display = isSpecific ? '' : 'none';
    }
  }

  // Set initial visibility based on current values
  syncFixedDeadlineVisibility(currentDeadlineRule);
  syncEntityCheckboxVisibility(!currentAppliesToAll);

  // Auto-slugify name -> id (add mode only)
  if (!isEdit && nameInput && idInput) {
    nameInput.addEventListener('input', () => {
      idInput.value = slugify(nameInput.value);
    });
  }

  // Deadline rule visibility
  if (deadlineRuleSelect) {
    deadlineRuleSelect.addEventListener('change', () => {
      syncFixedDeadlineVisibility(deadlineRuleSelect.value);
    });
  }

  // Applies To radio toggle
  if (radioAll) {
    radioAll.addEventListener('change', () => {
      if (radioAll.checked) syncEntityCheckboxVisibility(false);
    });
  }
  if (radioSpecific) {
    radioSpecific.addEventListener('change', () => {
      if (radioSpecific.checked) syncEntityCheckboxVisibility(true);
    });
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate and collect form values from the Add/Edit dialog.
 * Returns collected data object on success, or calls Swal.showValidationMessage
 * and returns false on failure.
 *
 * @param {boolean} isEdit
 * @returns {Object|false}
 */
function collectAndValidateFormValues(isEdit) {
  const obligationId     = isEdit
    ? document.getElementById('swal-obl-id').value.trim()
    : document.getElementById('swal-obl-id').value.trim();
  const name             = document.getElementById('swal-obl-name').value.trim();
  const category         = document.getElementById('swal-obl-category').value;
  const frequencyRaw     = document.getElementById('swal-obl-frequency').value.trim();
  const authority        = document.getElementById('swal-obl-authority').value.trim();
  const deadlineRule     = document.getElementById('swal-obl-deadline-rule').value;
  const fixedDeadlineRaw = document.getElementById('swal-obl-fixed-deadline')
    ? document.getElementById('swal-obl-fixed-deadline').value.trim()
    : '';
  const radioSpecific    = document.getElementById('swal-applies-specific');
  const appliesToAll     = !(radioSpecific && radioSpecific.checked);
  const defaultOwner     = document.getElementById('swal-obl-owner').value.trim();

  // Collect selected entity IDs
  const appliesToEntityIds = appliesToAll
    ? []
    : [...document.querySelectorAll('.obl-entity-checkbox:checked')].map(cb => cb.value);

  // Validations
  if (!isEdit) {
    if (!obligationId) {
      Swal.showValidationMessage('Obligation ID is required');
      return false;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(obligationId)) {
      Swal.showValidationMessage('Obligation ID may only contain letters, digits, underscores, and hyphens');
      return false;
    }
    if (obligationId.length > 60) {
      Swal.showValidationMessage('Obligation ID must be 60 characters or fewer');
      return false;
    }
  }

  if (!name) {
    Swal.showValidationMessage('Obligation name is required');
    return false;
  }
  if (!category) {
    Swal.showValidationMessage('Category is required');
    return false;
  }
  if (!deadlineRule) {
    Swal.showValidationMessage('Deadline rule is required');
    return false;
  }
  if (deadlineRule === 'fixed_date') {
    if (!fixedDeadlineRaw) {
      Swal.showValidationMessage('Fixed deadline is required for "Fixed calendar date" rule');
      return false;
    }
    if (!/^\d{2}-\d{2}$/.test(fixedDeadlineRaw)) {
      Swal.showValidationMessage('Fixed deadline must be in MM-DD format (e.g. 07-31)');
      return false;
    }
  }
  if (!appliesToAll && appliesToEntityIds.length === 0) {
    Swal.showValidationMessage('Select at least one entity, or choose "All Entities"');
    return false;
  }

  // Auto-fill frequency from category when blank
  const categoryLabel = CATEGORY_OPTIONS.find(o => o.value === category)?.label || '';
  const frequency = frequencyRaw || categoryLabel;

  return {
    obligationId,
    name,
    category,
    frequency,
    authority: authority || null,
    deadlineRule,
    fixedDeadline: deadlineRule === 'fixed_date' ? fixedDeadlineRaw : null,
    yearEndRelative: YEAR_END_RELATIVE_RULES.has(deadlineRule),
    appliesToAll,
    appliesToEntityIds: appliesToAll ? [] : appliesToEntityIds,
    defaultOwner: defaultOwner || null
  };
}

// ---------------------------------------------------------------------------
// Success toast helper
// ---------------------------------------------------------------------------

/**
 * Show a brief success toast notification.
 * @param {string} title
 */
function showSuccessToast(title) {
  Swal.fire({
    toast: true,
    icon: 'success',
    title,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the Obligations Manager panel into the given container.
 * Manages its own local copy of obligations so the caller's data is never mutated.
 *
 * @param {string}        containerId    — DOM id of the mount target
 * @param {Object}        obligations    — Map of obligationId -> obligation object
 * @param {Array<Object>} activeEntities — Pre-loaded active entity objects
 */
export async function renderObligationsManager(containerId, obligations, activeEntities, writeService = DEFAULT_WRITE_SERVICE) {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Obligations manager mount target "#${containerId}" not found.`);
  }

  // Local state — never mutate the caller's references
  let localObligations = { ...obligations };
  const localActiveEntities = activeEntities;
  let currentEntityFilter = null; // null = All Entities

  // ---------------------------------------------------------------------------
  // Re-render helper
  // ---------------------------------------------------------------------------

  /**
   * Rebuild the card HTML inside the container and re-attach event delegation.
   * Preserves the current entity filter selection across re-renders.
   */
  function rerenderTable() {
    // Remove click delegation before injecting new HTML so we don't stack listeners
    container.removeEventListener('click', handleContainerClick);
    container.innerHTML = buildObligationsTable(localObligations, localActiveEntities, currentEntityFilter);
    wireEntityFilter();
    attachDelegation();
  }

  /**
   * Wire the entity filter <select> after every render.
   * The select element is replaced with the card HTML on each re-render,
   * so this must be called after every innerHTML assignment.
   */
  function wireEntityFilter() {
    const entityFilterEl = container.querySelector('#obl-entity-filter');
    if (entityFilterEl) {
      entityFilterEl.addEventListener('change', () => {
        currentEntityFilter = entityFilterEl.value || null;
        rerenderTable();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD handlers
  // ---------------------------------------------------------------------------

  /**
   * Open the Add Obligation dialog and write the new record to Firebase.
   * If templates exist, shows a picker first then pre-fills the form.
   */
  async function handleAddObligation() {
    // Step 1: load templates and show picker (skip if none exist)
    let prefill = null;

    try {
      const templatesMap = await loadTemplates();
      const templateList = Object.entries(templatesMap)
        .map(([id, t]) => ({ ...t, id }))
        .sort((a, b) => {
          const order = { monthly: 0, biannual: 1, annual: 2, once_off: 3 };
          const catA = order[a.category] ?? 99;
          const catB = order[b.category] ?? 99;
          return catA !== catB ? catA - catB : (a.name || '').localeCompare(b.name || '');
        });

      if (templateList.length > 0) {
        const pickerResult = await Swal.fire({
          title: 'Add Obligation',
          html: buildTemplatePicker(templateList),
          showCancelButton: true,
          confirmButtonColor: '#198754',
          confirmButtonText: 'Continue →',
          width: '560px',
          preConfirm: () => {
            const selected = document.querySelector('input[name="template-picker-radio"]:checked');
            return selected ? selected.value : '';
          }
        });

        if (!pickerResult.isConfirmed) return;

        const selectedId = pickerResult.value;
        if (selectedId) {
          prefill = templateList.find(t => t.id === selectedId) || null;
        }
      }
    } catch {
      // If templates fail to load, fall through to blank form
    }

    // Step 2: show add form (pre-filled from template or blank)
    const appliesToAll = prefill ? (prefill.appliesToAll !== false) : true;
    const deadlineRule = prefill?.deadlineRule || '';

    const result = await Swal.fire({
      title: 'Add Obligation',
      html: buildDialogForm(prefill, localActiveEntities, false),
      showCancelButton: true,
      confirmButtonColor: '#198754',
      confirmButtonText: 'Add Obligation',
      width: '600px',
      didOpen: () => wireDialogListeners(false, deadlineRule, appliesToAll),
      preConfirm: () => collectAndValidateFormValues(false)
    });

    if (!result.isConfirmed || !result.value) return;

    const formData = result.value;
    const { obligationId, ...data } = formData;

    try {
      const record = await writeService.create(obligationId, data);
      localObligations = { ...localObligations, [obligationId]: record };
      rerenderTable();
      showSuccessToast('Obligation added');
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Failed to add obligation', text: err.message });
    }
  }


  /**
   * Open the Edit Obligation dialog pre-filled with existing data.
   * @param {string} obligationId
   */
  async function handleEditObligation(obligationId) {
    const obl = localObligations[obligationId];
    if (!obl) return;

    const currentDeadlineRule = obl.deadlineRule || '';
    const currentAppliesToAll = obl.appliesToAll !== false;

    const result = await Swal.fire({
      title: 'Edit Obligation',
      html: buildDialogForm(obl, localActiveEntities, true),
      showCancelButton: true,
      confirmButtonColor: '#0d6efd',
      confirmButtonText: 'Save Changes',
      width: '600px',
      didOpen: () => wireDialogListeners(true, currentDeadlineRule, currentAppliesToAll),
      preConfirm: () => collectAndValidateFormValues(true)
    });

    if (!result.isConfirmed || !result.value) return;

    // eslint-disable-next-line no-unused-vars
    const { obligationId: _id, ...updates } = result.value;

    try {
      await writeService.update(obligationId, updates);
      const updatedRecord = { ...obl, ...updates, id: obligationId };
      localObligations = { ...localObligations, [obligationId]: updatedRecord };
      rerenderTable();
      showSuccessToast('Obligation updated');
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Failed to update obligation', text: err.message });
    }
  }

  /**
   * Prompt for confirmation then permanently delete an obligation.
   * @param {string} obligationId
   * @param {string} name
   */
  async function handleDeleteObligation(obligationId, name) {
    const result = await Swal.fire({
      title: 'Delete Obligation?',
      html: `This will permanently delete <strong>${escapeHtml(name)}</strong> and all its filing records. This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      confirmButtonText: 'Delete permanently',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      await writeService.delete(obligationId);

      const { [obligationId]: _removed, ...remaining } = localObligations;
      localObligations = remaining;
      rerenderTable();
      showSuccessToast('Obligation deleted');
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Delete failed', text: err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Event delegation
  // ---------------------------------------------------------------------------

  // Guard flag: prevent concurrent handler invocations from rapid clicks
  let handlerInProgress = false;

  /**
   * Attach click event delegation to the container.
   * Called after every re-render so handlers always reference current local state.
   */
  function attachDelegation() {
    container.addEventListener('click', handleContainerClick);
  }

  /**
   * Route click events to the appropriate handler.
   * Uses a handlerInProgress flag to prevent concurrent invocations without
   * ever removing the listener, so cancelling a dialog leaves the UI functional.
   * @param {MouseEvent} event
   */
  function handleContainerClick(event) {
    if (handlerInProgress) return;

    if (event.target.closest('#btn-add-obligation')) {
      handlerInProgress = true;
      handleAddObligation().finally(() => { handlerInProgress = false; });
      return;
    }

    const editBtn = event.target.closest('.btn-edit-obligation');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      if (id) {
        handlerInProgress = true;
        handleEditObligation(id).finally(() => { handlerInProgress = false; });
      }
      return;
    }

    const deleteBtn = event.target.closest('.btn-delete-obligation');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-id');
      const name = deleteBtn.getAttribute('data-name');
      if (id) {
        handlerInProgress = true;
        handleDeleteObligation(id, name || id).finally(() => { handlerInProgress = false; });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Initial render
  // ---------------------------------------------------------------------------

  container.innerHTML = buildObligationsTable(localObligations, localActiveEntities, currentEntityFilter);
  wireEntityFilter();
  attachDelegation();
}
