'use strict';

const { formatNudge } = require('../sweep/nudge-formatter');

const sel = (findings, extra = {}) => ({
    findings, overflow: 0, total: findings.length,
    locationCount: new Set(findings.map((f) => f.locationId)).size,
    ...extra,
});
const f = (over) => ({
    workflowId: 'wf1', locationId: 'loc1', name: 'Health & Safety Audit',
    locationName: 'Sea Point', kind: 'overdue', daysLate: 11, ...over,
});

describe('formatNudge', () => {
    it('single-location: no per-item location, no "across N locations"', () => {
        const p = formatNudge({ firstName: 'Andreas', selection: sel([f(), f({ workflowId: 'wf2', name: 'Opening Checklist', kind: 'today', daysLate: 0 })]) });
        expect(p.countPhrase).toBe('2 workflows need attention');
        expect(p.findingsLine).toBe('Health & Safety Audit (11 days overdue) · Opening Checklist (due today)');
    });

    it('multi-location: per-item "at X" + "across N locations"', () => {
        const p = formatNudge({ firstName: 'Andreas', selection: sel([f(), f({ workflowId: 'wf2', locationId: 'loc2', locationName: 'The Grove', name: 'Stock Count', kind: 'today', daysLate: 0 })]) });
        expect(p.countPhrase).toBe('2 workflows need attention across 2 locations');
        expect(p.findingsLine).toBe('Health & Safety Audit at Sea Point (11 days overdue) · Stock Count at The Grove (due today)');
    });

    it('singular phrasing and 1-day overdue', () => {
        const p = formatNudge({ firstName: 'Andreas', selection: sel([f({ daysLate: 1 })]) });
        expect(p.countPhrase).toBe('1 workflow needs attention');
        expect(p.findingsLine).toBe('Health & Safety Audit (1 day overdue)');
    });

    it('overflow suffix', () => {
        const p = formatNudge({ firstName: 'A', selection: sel([f()], { overflow: 4, total: 5 }) });
        expect(p.findingsLine).toMatch(/…and 4 more$/);
        expect(p.countPhrase).toMatch(/^5 workflows/);
    });

    it('deep-link query targets the WORST (first) finding, URL-encoded', () => {
        const p = formatNudge({ firstName: 'A', selection: sel([f({ workflowId: 'wf 1&x', locationId: 'l/1' })]) });
        expect(p.linkQuery).toBe(`tab=run&workflowId=${encodeURIComponent('wf 1&x')}&locationId=${encodeURIComponent('l/1')}`);
    });

    it('sanitizes user-supplied names: newlines/multi-spaces collapsed (template vars reject them)', () => {
        const p = formatNudge({
            firstName: ' Andreas\n',
            selection: sel([f({ name: 'Audit\nwith  \t breaks', locationName: 'Sea\nPoint', locationId: 'loc1' }),
                            f({ workflowId: 'wf2', locationId: 'loc2', locationName: 'B', kind: 'today', daysLate: 0 })]),
        });
        expect(p.name).toBe('Andreas');
        expect(p.findingsLine).not.toMatch(/[\n\t]/);
        expect(p.findingsLine).not.toMatch(/ {2,}/);
    });

    it('falls back to "there" when no name', () => {
        expect(formatNudge({ firstName: '', selection: sel([f()]) }).name).toBe('there');
    });
});
