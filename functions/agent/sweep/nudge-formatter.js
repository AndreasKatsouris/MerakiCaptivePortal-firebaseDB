'use strict';

/**
 * W2 proactive nudge — pure payload formatter.
 * Channel-NEUTRAL output: { name, countPhrase, findingsLine, linkQuery } —
 * structured data, not a finished string, so each channel adapter renders
 * its own native shape (WhatsApp template vars now; Telegram/SMS later).
 *
 * Single-line discipline: WhatsApp template variables reject newlines and
 * >4 consecutive spaces (verified vs live Meta/Twilio docs 2026-06-11), and
 * workflow/location names are USER-SUPPLIED — sanitize every string.
 *
 * Spec: docs/plans/2026-06-10-w2-proactive-whatsapp-nudge-design.md §5
 */

/** Collapse all whitespace runs (incl. newlines/tabs) to single spaces. */
function sanitizeInline(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

function describeFinding(finding, multiLocation) {
    const name = sanitizeInline(finding.name);
    const at = multiLocation && finding.locationName
        ? ` at ${sanitizeInline(finding.locationName)}` : '';
    const status = finding.kind === 'overdue'
        ? `${finding.daysLate} day${finding.daysLate === 1 ? '' : 's'} overdue`
        : 'due today';
    return `${name}${at} (${status})`;
}

/**
 * @param {{firstName:string, selection:{findings:Array, overflow:number, total:number, locationCount:number}}} args
 * @returns {{name:string, countPhrase:string, findingsLine:string, linkQuery:string}}
 */
function formatNudge({ firstName, selection }) {
    const { findings, overflow, total, locationCount } = selection;
    const multiLocation = locationCount > 1;
    const plural = total !== 1;
    const countPhrase = `${total} workflow${plural ? 's' : ''} need${plural ? '' : 's'} attention`
        + (multiLocation ? ` across ${locationCount} locations` : '');
    let findingsLine = findings.map((f) => describeFinding(f, multiLocation)).join(' · ');
    if (overflow > 0) findingsLine += ` …and ${overflow} more`;
    const top = findings[0];
    const linkQuery = `tab=run&workflowId=${encodeURIComponent(top.workflowId)}`
        + `&locationId=${encodeURIComponent(top.locationId)}`;
    return { name: sanitizeInline(firstName) || 'there', countPhrase, findingsLine, linkQuery };
}

module.exports = { formatNudge, sanitizeInline };
