/**
 * Corporate Compliance Module — Entry Point
 * Initialises entity registry, compliance tracker panels
 */

import { loadEntities, loadObligations, loadFilings, loadTemplates, createTemplate, updateTemplate, deleteTemplate } from './services/firebase-service.js';
import { renderEntityRegistry } from './components/entity-registry.js';
import { renderComplianceTracker } from './components/compliance-tracker.js';
import { renderObligationsManager } from './components/obligations-manager.js';
import { auth } from '../../config/firebase-config.js';

/**
 * @param {string} mountId - ID of the DOM element to mount into
 */
export async function initializeComplianceModule(mountId) {
    const mountEl = document.getElementById(mountId);
    const year = new Date().getFullYear().toString();

    // Check if current user is admin
    let isAdmin = false;
    try {
        const idTokenResult = await auth.currentUser?.getIdTokenResult();
        isAdmin = !!idTokenResult?.claims?.admin;
    } catch { /* not admin */ }

    // Scaffold panel layout
    mountEl.innerHTML = `
        <div id="panel-entity-registry" class="mb-4"></div>
        <div id="panel-compliance-tracker" class="mb-4"></div>
        <div id="panel-obligations-manager" class="mb-4"></div>
        ${isAdmin ? '<div id="panel-obligation-templates" class="mb-4"></div>' : ''}
    `;

    // Load all data in parallel
    const dataLoads = [loadEntities(), loadObligations(), loadFilings(year)];
    if (isAdmin) dataLoads.push(loadTemplates());
    const [entities, obligations, filings, templates] = await Promise.all(dataLoads);

    const activeEntities = Object.values(entities).filter(e => e.status === 'active');
    const dormantEntities = Object.values(entities).filter(e => e.status === 'dormant');

    // Update summary badges in header
    updateSummaryBadges(activeEntities, dormantEntities, filings);

    // Publish-as-template callback — only wired for admins
    const onPublishAsTemplate = isAdmin ? async (obl) => {
        const { id, ...data } = obl;
        await createTemplate(id, data);
    } : null;

    // Render panels
    await renderEntityRegistry('panel-entity-registry', activeEntities, dormantEntities);
    await renderComplianceTracker('panel-compliance-tracker', activeEntities, obligations, filings, year);
    await renderObligationsManager('panel-obligations-manager', obligations, activeEntities, { onPublishAsTemplate });

    if (isAdmin) {
        const templateWriteService = { create: createTemplate, update: updateTemplate, delete: deleteTemplate };
        await renderObligationsManager('panel-obligation-templates', templates || {}, [], { writeService: templateWriteService, panelTitle: 'Obligation Templates Library' });
    }
}

function updateSummaryBadges(active, dormant, filings) {
    const badgeContainer = document.getElementById('compliance-summary-badges');
    if (!badgeContainer) return;

    badgeContainer.innerHTML = `
        <span class="badge bg-success me-2 fs-6">${active.length} Active</span>
        <span class="badge bg-secondary me-2 fs-6">${dormant.length} Dormant</span>
    `;
}
