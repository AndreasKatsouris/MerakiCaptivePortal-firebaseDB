import { getFlagsForLocation } from '../../services/flag-service.js';
import { renderFlagBadgeCluster } from './FlagBadge.js';
import { computeRowSeverity } from '../../flag-display-merger.js';
import { SEVERITIES } from '../../constants/flag-types.js';
import { escapeHtml } from '../../utilities.js';

function rankOf(sev) {
  const match = Object.values(SEVERITIES).find((s) => s.id === sev);
  return match ? match.rank : 0;
}

export class FlagsDashboard {
  constructor(containerId, { locationId, userUid, onChange, onViewDetail, onRerun, onOpenConfig } = {}) {
    this.container = typeof containerId === 'string'
      ? document.getElementById(containerId)
      : containerId;
    this.locationId = locationId;
    this.userUid = userUid;
    this.onChange = onChange;
    this.onViewDetail = onViewDetail;
    this.onRerun = onRerun;
    this.onOpenConfig = onOpenConfig;
    this.flags = {};
    this.filters = { severity: 'all', source: 'all', text: '' };
  }

  setLocation(locationId) {
    this.locationId = locationId;
  }

  async load() {
    if (!this.container) return;
    if (!this.locationId) {
      this.flags = {};
      this.renderEmpty('Select a location to view flags.');
      return;
    }
    try {
      this.flags = (await getFlagsForLocation(this.locationId)) || {};
    } catch (err) {
      console.error('[FlagsDashboard] load failed:', err);
      this.flags = {};
    }
    this.render();
  }

  renderEmpty(message) {
    this.container.innerHTML = `<p class="text-muted">${escapeHtml(message)}</p>`;
  }

  matchesFilter(entry) {
    const sev = computeRowSeverity(entry);
    if (this.filters.severity === 'critical' && sev !== 'critical') return false;
    if (this.filters.severity === 'warning' && !['critical', 'warning'].includes(sev)) return false;
    if (this.filters.source === 'manual' && !Object.keys(entry.manualFlags || {}).length) return false;
    if (this.filters.source === 'auto' && !Object.keys(entry.autoFlags || {}).length) return false;
    if (this.filters.text) {
      const hay = `${entry.description || ''} ${entry.itemCode || ''}`.toLowerCase();
      if (!hay.includes(this.filters.text.toLowerCase())) return false;
    }
    return true;
  }

  render() {
    if (!this.container) return;

    const rows = Object.entries(this.flags)
      .filter(([, entry]) => this.matchesFilter(entry))
      .map(([itemKey, entry]) => ({ itemKey, entry, severity: computeRowSeverity(entry) }))
      .filter((r) => r.severity)
      .sort((a, b) => rankOf(b.severity) - rankOf(a.severity));

    const critCount = rows.filter((r) => r.severity === 'critical').length;
    const warnCount = rows.filter((r) => r.severity === 'warning').length;
    const infoCount = rows.filter((r) => r.severity === 'info').length;

    const rowHtml = rows
      .map((r) => {
        const last = r.entry.lastSeenAt
          ? new Date(r.entry.lastSeenAt).toLocaleDateString('en-ZA')
          : '—';
        return `
          <tr>
            <td>
              ${escapeHtml(r.entry.description || r.itemKey)}
              <br><small class="text-muted">${escapeHtml(r.entry.category || '')}</small>
            </td>
            <td>${renderFlagBadgeCluster(r.entry)}</td>
            <td>${escapeHtml(last)}</td>
            <td>
              <button class="btn btn-sm btn-outline-primary js-view-detail" data-item-key="${escapeHtml(r.itemKey)}">View</button>
            </td>
          </tr>`;
      })
      .join('');

    this.container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <span class="badge bg-danger me-2">${critCount} Critical</span>
          <span class="badge bg-warning text-dark me-2">${warnCount} Warning</span>
          <span class="badge bg-info text-dark">${infoCount} Info</span>
        </div>
        <div>
          <button class="btn btn-sm btn-primary js-rerun-detection">Re-run detection</button>
          <button class="btn btn-sm btn-outline-secondary js-open-config">Settings</button>
        </div>
      </div>
      <div class="mb-3 d-flex gap-2 flex-wrap">
        <select class="form-select form-select-sm js-filter-severity" style="width:auto">
          <option value="all">All severities</option>
          <option value="critical">Critical only</option>
          <option value="warning">Warning+</option>
        </select>
        <select class="form-select form-select-sm js-filter-source" style="width:auto">
          <option value="all">All sources</option>
          <option value="manual">Manual only</option>
          <option value="auto">Auto only</option>
        </select>
        <input class="form-control form-control-sm js-filter-text" placeholder="Search items…" style="max-width:240px">
      </div>
      <table class="table table-sm table-hover">
        <thead>
          <tr><th>Item</th><th>Flags</th><th>Last Seen</th><th></th></tr>
        </thead>
        <tbody>
          ${rowHtml || '<tr><td colspan="4" class="text-muted text-center">No flags match current filters.</td></tr>'}
        </tbody>
      </table>
    `;

    this.restoreFilterState();
    this.bindEvents();
  }

  restoreFilterState() {
    const sev = this.container.querySelector('.js-filter-severity');
    const src = this.container.querySelector('.js-filter-source');
    const txt = this.container.querySelector('.js-filter-text');
    if (sev) sev.value = this.filters.severity;
    if (src) src.value = this.filters.source;
    if (txt) txt.value = this.filters.text;
  }

  bindEvents() {
    const bindChange = (selector, key, rerender = true) => {
      const el = this.container.querySelector(selector);
      if (!el) return;
      el.addEventListener('change', (e) => {
        this.filters[key] = e.target.value;
        if (rerender) this.render();
      });
    };
    bindChange('.js-filter-severity', 'severity');
    bindChange('.js-filter-source', 'source');
    const txt = this.container.querySelector('.js-filter-text');
    if (txt) {
      txt.addEventListener('input', (e) => {
        this.filters.text = e.target.value;
        this.render();
      });
    }

    const rerunBtn = this.container.querySelector('.js-rerun-detection');
    if (rerunBtn) {
      rerunBtn.addEventListener('click', async () => {
        try {
          if (typeof this.onRerun === 'function') {
            await this.onRerun();
          }
          await this.load();
          if (typeof this.onChange === 'function') this.onChange();
        } catch (err) {
          console.error('[FlagsDashboard] re-run failed:', err);
        }
      });
    }

    const cfgBtn = this.container.querySelector('.js-open-config');
    if (cfgBtn) {
      cfgBtn.addEventListener('click', async () => {
        if (typeof this.onOpenConfig === 'function') {
          await this.onOpenConfig();
        }
      });
    }

    this.container.querySelectorAll('.js-view-detail').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const itemKey = btn.dataset.itemKey;
        const entry = this.flags[itemKey];
        if (!entry) return;
        if (typeof this.onViewDetail === 'function') {
          await this.onViewDetail({ itemKey, entry });
        }
      });
    });
  }
}
