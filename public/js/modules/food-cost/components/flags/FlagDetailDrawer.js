import { resolveFlag } from '../../services/flag-service.js';
import { escapeHtml } from '../../utilities.js';

/**
 * Open a SweetAlert2-driven detail view for an item's flag bundle. Confirming
 * resolves every currently-active manual + auto flag on the item with an
 * optional shared reason.
 */
export async function openFlagDetail({ locationId, itemKey, entry, userUid, onChange }) {
  if (typeof Swal === 'undefined') {
    console.error('[FlagDetailDrawer] Swal not available');
    return;
  }
  if (!locationId || !itemKey || !entry) {
    console.warn('[FlagDetailDrawer] locationId, itemKey, entry are required');
    return;
  }

  const manualItems = Object.keys(entry.manualFlags || {});
  const autoItems = Object.entries(entry.autoFlags || {});
  const resolvedItems = Object.values(entry.resolvedFlags || {}).sort(
    (a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0)
  );

  const manualHtml = manualItems.length
    ? manualItems.map((t) => `<li>${escapeHtml(t.replace(/_/g, ' '))} <span class="text-muted small">(manual)</span></li>`).join('')
    : '<li class="text-muted">none</li>';

  const autoHtml = autoItems.length
    ? autoItems
        .map(
          ([rule, data]) =>
            `<li>${escapeHtml(rule.replace(/_/g, ' '))} — ${escapeHtml(data?.severity || 'info')} <span class="text-muted small">(auto)</span></li>`
        )
        .join('')
    : '<li class="text-muted">none</li>';

  const resolvedHtml = resolvedItems.length
    ? resolvedItems
        .map(
          (r) =>
            `<li>${escapeHtml(r.flagType || '—')} — ${escapeHtml(
              new Date(r.resolvedAt || 0).toLocaleDateString('en-ZA')
            )}${r.reason ? ` • ${escapeHtml(r.reason)}` : ''}</li>`
        )
        .join('')
    : '<li class="text-muted">none</li>';

  const titleText = entry.description || entry.itemCode || itemKey;
  const hasActive = manualItems.length + autoItems.length > 0;

  const { isConfirmed, value: reason } = await Swal.fire({
    title: escapeHtml(titleText),
    html: `
      <div class="text-start">
        <h6 class="mt-0">Active flags</h6>
        <ul>${manualHtml}${autoHtml}</ul>
        <h6>Resolved history</h6>
        <ul>${resolvedHtml}</ul>
        <label class="form-label mt-2 mb-1">Resolve reason (optional)</label>
        <textarea id="flagResolveReason" class="form-control" rows="2"></textarea>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: hasActive ? 'Resolve all active' : 'Close',
    showConfirmButton: hasActive,
    preConfirm: () => document.getElementById('flagResolveReason')?.value?.trim() || null
  });

  if (!isConfirmed || !hasActive) return;

  const types = [...manualItems, ...autoItems.map(([rule]) => rule)];
  for (const flagType of types) {
    try {
      await resolveFlag(locationId, itemKey, flagType, { resolvedBy: userUid, reason });
    } catch (err) {
      console.error(`[FlagDetailDrawer] failed to resolve ${flagType}:`, err);
    }
  }

  if (typeof onChange === 'function') {
    try {
      await onChange();
    } catch (err) {
      console.error('[FlagDetailDrawer] onChange failed:', err);
    }
  }
}

if (typeof window !== 'undefined') {
  window.FoodCost = window.FoodCost || {};
  window.FoodCost.openFlagDetail = openFlagDetail;
}
