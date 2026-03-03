/**
 * Corporate Compliance Module — Entry Point
 * Initialises entity registry, compliance tracker panels
 */

import { loadEntities, loadObligations, loadFilings } from './services/firebase-service.js';
import { renderEntityRegistry } from './components/entity-registry.js';
import { renderComplianceTracker } from './components/compliance-tracker.js';

/**
 * @param {string} mountId - ID of the DOM element to mount into
 */
export async function initializeComplianceModule(mountId) {
    const mountEl = document.getElementById(mountId);
    const year = new Date().getFullYear().toString();

    // Scaffold panel layout
    mountEl.innerHTML = `
        <div id="panel-entity-registry" class="mb-4"></div>
        <div id="panel-compliance-tracker" class="mb-4"></div>
    `;

    // Load all data in parallel
    const [entities, obligations, filings] = await Promise.all([
        loadEntities(),
        loadObligations(),
        loadFilings(year)
    ]);

    const activeEntities = Object.values(entities).filter(e => e.status === 'active');
    const dormantEntities = Object.values(entities).filter(e => e.status === 'dormant');

    // Update summary badges in header
    updateSummaryBadges(activeEntities, dormantEntities, filings);

    // Render panels
    await renderEntityRegistry('panel-entity-registry', activeEntities, dormantEntities);
    await renderComplianceTracker('panel-compliance-tracker', activeEntities, obligations, filings, year);
}

function updateSummaryBadges(active, dormant, filings) {
    const badgeContainer = document.getElementById('compliance-summary-badges');
    if (!badgeContainer) return;

    badgeContainer.innerHTML = `
        <span class="badge bg-success me-2 fs-6">${active.length} Active</span>
        <span class="badge bg-secondary me-2 fs-6">${dormant.length} Dormant</span>
    `;
}
