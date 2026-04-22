import { SEVERITIES, MANUAL_SEVERITY_MAP } from '../../constants/flag-types.js';
import { escapeHtml } from '../../utilities.js';

function resolveSeverity(sevId) {
  return Object.values(SEVERITIES).find((s) => s.id === sevId) || SEVERITIES.INFO;
}

function pill(label, severityId, title) {
  const sev = resolveSeverity(severityId);
  return `<span class="badge ${sev.colorClass} me-1" title="${escapeHtml(title || label)}">${escapeHtml(label)}</span>`;
}

export function renderFlagBadgeCluster(flagEntry) {
  if (!flagEntry) return '';
  const pills = [];

  for (const [type, data] of Object.entries(flagEntry.manualFlags || {})) {
    const label = type === 'CUSTOM' && data?.customLabel
      ? data.customLabel
      : type.replace(/_/g, ' ');
    pills.push(pill(label, MANUAL_SEVERITY_MAP[type], type));
  }

  for (const [rule, data] of Object.entries(flagEntry.autoFlags || {})) {
    pills.push(pill(rule.replace(/_/g, ' '), data?.severity, rule));
  }

  return pills.join('');
}
