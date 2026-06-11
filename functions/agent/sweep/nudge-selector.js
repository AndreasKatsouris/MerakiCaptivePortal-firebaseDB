'use strict';

/**
 * W2 proactive nudge — pure finding selection (deterministic MVP "brain").
 * Digest → ordered actionable findings, or null for a silent day.
 * The future rossSweep LLM engine replaces THIS module only; orchestrator,
 * formatter and channel adapters stay (spec §1).
 *
 * Spec: docs/plans/2026-06-10-w2-proactive-whatsapp-nudge-design.md §3, §5
 */

const MAX_FINDINGS = 3;

/** Map a digest bucket item to a finding; null if malformed. */
function toFinding(item, kind) {
    if (!item || !item.workflowId || !item.locationId || !item.name) return null;
    return {
        workflowId: item.workflowId,
        locationId: item.locationId,
        name: item.name,
        locationName: item.locationName || '',
        kind, // 'overdue' | 'today'
        daysLate: kind === 'overdue' ? (item.daysLate || 0) : 0,
    };
}

/**
 * @param {object|null} digest - buildHomeWorkflowDigest output
 * @returns {{findings:Array, overflow:number, total:number, locationCount:number}|null}
 */
function selectFindings(digest) {
    if (!digest || typeof digest !== 'object') return null;
    const overdue = (Array.isArray(digest.overdue) ? digest.overdue : [])
        .map((i) => toFinding(i, 'overdue'))
        .filter(Boolean)
        .sort((a, b) => b.daysLate - a.daysLate);
    const today = (Array.isArray(digest.today) ? digest.today : [])
        .map((i) => toFinding(i, 'today'))
        .filter(Boolean);
    const all = [...overdue, ...today];
    if (!all.length) return null;
    return {
        findings: all.slice(0, MAX_FINDINGS),
        overflow: Math.max(0, all.length - MAX_FINDINGS),
        total: all.length,
        locationCount: new Set(all.map((f) => f.locationId)).size,
    };
}

module.exports = { selectFindings, MAX_FINDINGS };
