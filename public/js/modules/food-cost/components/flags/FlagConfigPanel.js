import { rtdb, ref, get, set } from '../../../../config/firebase-config.js';
import { DEFAULT_THRESHOLDS } from '../../services/flag-service.js';
import { escapeHtml } from '../../utilities.js';

const THRESHOLD_LABELS = {
  foodCostPctWarning: 'Food cost % — warning',
  foodCostPctCritical: 'Food cost % — critical',
  unitCostSpikePct: 'Unit cost spike % — warning',
  unitCostSpikeCriticalPct: 'Unit cost spike % — critical',
  usageVarianceStdDev: 'Usage variance (σ) — warning',
  usageVarianceCriticalStdDev: 'Usage variance (σ) — critical',
  deadStockDaysThreshold: 'Dead stock — days threshold',
  missingItemLookbackWeeks: 'Missing item — lookback (weeks)',
  highFcPctCulpritMinScore: 'HIGH_FC_PCT culprit min score'
};

export async function openFlagConfigPanel({ locationId, userUid, isAdmin, isLocationOwner }) {
  if (typeof Swal === 'undefined') {
    console.error('[FlagConfigPanel] Swal not available');
    return;
  }
  if (!locationId) {
    return Swal.fire('No location', 'Select a location first.', 'info');
  }
  if (!isAdmin && !isLocationOwner) {
    return Swal.fire({
      icon: 'warning',
      title: 'Permission denied',
      text: 'Only location owners or admins can edit flag thresholds.'
    });
  }

  let snap;
  try {
    snap = await get(ref(rtdb, `stockFlagConfig/${locationId}/thresholds`));
  } catch (err) {
    console.error('[FlagConfigPanel] failed to load thresholds:', err);
    return Swal.fire('Load failed', 'Could not read existing thresholds.', 'error');
  }

  const current = { ...DEFAULT_THRESHOLDS, ...(snap.exists() ? snap.val() : {}) };

  const fields = Object.entries(current)
    .map(([k, v]) => {
      const label = THRESHOLD_LABELS[k] || k;
      return `
        <div class="mb-2">
          <label class="form-label small mb-1" for="cfg_${escapeHtml(k)}">${escapeHtml(label)}</label>
          <input id="cfg_${escapeHtml(k)}" class="form-control form-control-sm" type="number" step="0.01" value="${escapeHtml(String(v))}">
        </div>
      `;
    })
    .join('');

  const { isConfirmed, value } = await Swal.fire({
    title: 'Flag thresholds',
    width: 560,
    html: `<div class="text-start">${fields}</div>`,
    showCancelButton: true,
    confirmButtonText: 'Save',
    preConfirm: () => {
      const out = {};
      for (const k of Object.keys(current)) {
        const el = document.getElementById(`cfg_${k}`);
        const num = Number(el?.value);
        if (!Number.isFinite(num)) {
          Swal.showValidationMessage(`${THRESHOLD_LABELS[k] || k} must be a number`);
          return false;
        }
        out[k] = num;
      }
      return out;
    }
  });

  if (!isConfirmed || !value) return;

  try {
    await set(ref(rtdb, `stockFlagConfig/${locationId}/thresholds`), {
      ...value,
      updatedBy: userUid || 'unknown',
      updatedAt: Date.now()
    });
    Swal.fire({ icon: 'success', title: 'Saved', timer: 1200, showConfirmButton: false });
  } catch (err) {
    console.error('[FlagConfigPanel] save failed:', err);
    Swal.fire('Save failed', err.message || 'Unknown error', 'error');
  }
}

if (typeof window !== 'undefined') {
  window.FoodCost = window.FoodCost || {};
  window.FoodCost.openFlagConfigPanel = openFlagConfigPanel;
}
