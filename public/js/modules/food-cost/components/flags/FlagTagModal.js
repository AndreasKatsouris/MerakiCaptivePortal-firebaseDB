/**
 * FlagTagModal — SweetAlert2-based modal for applying/removing manual flags
 * on a stock item. Compares current vs. desired selection and writes diffs
 * via flag-service. Assumes Swal2 is globally available (project convention).
 */

import { MANUAL_FLAG_TYPES, MANUAL_SEVERITY_MAP, SEVERITIES } from '../../constants/flag-types.js';
import { applyManualFlag, removeManualFlag } from '../../services/flag-service.js';
import { escapeHtml } from '../../utilities.js';

function sevColorClass(type) {
  const sev = Object.values(SEVERITIES).find((s) => s.id === MANUAL_SEVERITY_MAP[type]);
  return sev ? sev.colorClass : 'bg-secondary';
}

function renderCheckboxes(active) {
  return Object.keys(MANUAL_FLAG_TYPES)
    .map((type) => {
      const checked = active.has(type) ? 'checked' : '';
      const label = type.replace(/_/g, ' ');
      return `
        <label class="d-flex align-items-center mb-2">
          <input type="checkbox" class="form-check-input me-2 js-flag-type" value="${type}" ${checked}>
          <span class="badge ${sevColorClass(type)} me-2">${escapeHtml(label)}</span>
        </label>`;
    })
    .join('');
}

export async function openFlagTagModal({ locationId, item, currentEntry, userUid, onChange }) {
  if (typeof Swal === 'undefined') {
    console.error('[FlagTagModal] Swal (SweetAlert2) not available');
    return;
  }
  if (!locationId || !item?.itemKey) {
    console.warn('[FlagTagModal] locationId and item.itemKey are required');
    return;
  }

  const active = new Set(Object.keys(currentEntry?.manualFlags || {}));
  const existingCustomLabel =
    currentEntry?.manualFlags?.CUSTOM?.customLabel || '';
  const titleText = item.description || item.itemCode || item.itemKey;

  const { isConfirmed, value } = await Swal.fire({
    title: `Flags — ${escapeHtml(titleText)}`,
    html: `
      <div class="text-start">
        ${renderCheckboxes(active)}
        <hr>
        <label class="form-label mb-1">Note (optional)</label>
        <textarea id="flagNote" class="form-control" rows="2"></textarea>
        <label class="form-label mt-2 mb-1">Custom label (required if CUSTOM checked)</label>
        <input id="flagCustomLabel" class="form-control" maxlength="40" value="${escapeHtml(existingCustomLabel)}">
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Save',
    focusConfirm: false,
    preConfirm: () => {
      const selected = Array.from(document.querySelectorAll('.js-flag-type:checked')).map(
        (i) => i.value
      );
      const note = (document.getElementById('flagNote')?.value || '').trim() || null;
      const customLabel = (document.getElementById('flagCustomLabel')?.value || '').trim() || null;
      if (selected.includes('CUSTOM') && !customLabel) {
        Swal.showValidationMessage('CUSTOM flag requires a label');
        return false;
      }
      if (customLabel && customLabel.length > 40) {
        Swal.showValidationMessage('Custom label must be 40 characters or less');
        return false;
      }
      return { selected, note, customLabel };
    }
  });

  if (!isConfirmed || !value) return;

  const target = new Set(value.selected);

  for (const type of target) {
    if (active.has(type)) continue;
    await applyManualFlag(locationId, item.itemKey, type, {
      appliedBy: userUid,
      note: value.note,
      ...(type === 'CUSTOM' ? { customLabel: value.customLabel } : {})
    });
  }

  for (const type of active) {
    if (target.has(type)) continue;
    await removeManualFlag(locationId, item.itemKey, type);
  }

  if (typeof onChange === 'function') {
    try {
      await onChange();
    } catch (err) {
      console.error('[FlagTagModal] onChange handler failed:', err);
    }
  }
}

if (typeof window !== 'undefined') {
  window.FoodCost = window.FoodCost || {};
  window.FoodCost.openFlagTagModal = openFlagTagModal;
}
