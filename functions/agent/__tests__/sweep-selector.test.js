'use strict';

const { selectFindings, MAX_FINDINGS } = require('../sweep/nudge-selector');

// Digest item shapes copied from buildHomeWorkflowDigest (functions/ross.js):
// overdue: { workflowId, locationId, name, locationName, nextDueDate, daysLate, requiredTaskCount }
// today:   { workflowId, locationId, name, locationName, nextDueDate, subState, requiredTaskCount }
const ov = (id, daysLate, loc = 'loc1', locName = 'The Grove') => ({
    workflowId: id, locationId: loc, name: `WF ${id}`, locationName: locName,
    nextDueDate: '2026-06-01', daysLate, requiredTaskCount: 3,
});
const td = (id, loc = 'loc1', locName = 'The Grove') => ({
    workflowId: id, locationId: loc, name: `WF ${id}`, locationName: locName,
    nextDueDate: '2026-06-11', subState: 'pending', requiredTaskCount: 2,
});

describe('selectFindings', () => {
    it('returns null for an empty/quiet digest (silent day)', () => {
        expect(selectFindings({ overdue: [], today: [], recentCompletions: [] })).toBeNull();
        expect(selectFindings(null)).toBeNull();
        expect(selectFindings({})).toBeNull();
    });

    it('orders overdue worst-first (daysLate desc), then due-today', () => {
        const sel = selectFindings({ overdue: [ov('a', 2), ov('b', 11)], today: [td('c')] });
        expect(sel.findings.map((f) => f.workflowId)).toEqual(['b', 'a', 'c']);
        expect(sel.findings[0]).toMatchObject({ kind: 'overdue', daysLate: 11 });
        expect(sel.findings[2]).toMatchObject({ kind: 'today' });
    });

    it('caps at MAX_FINDINGS with overflow count, total preserved', () => {
        const sel = selectFindings({
            overdue: [ov('a', 5), ov('b', 4), ov('c', 3)],
            today: [td('d'), td('e')],
        });
        expect(MAX_FINDINGS).toBe(3);
        expect(sel.findings).toHaveLength(3);
        expect(sel.overflow).toBe(2);
        expect(sel.total).toBe(5);
    });

    it('counts distinct locations across ALL findings (pre-cap)', () => {
        const sel = selectFindings({
            overdue: [ov('a', 5, 'loc1'), ov('b', 4, 'loc2', 'Sea Point')],
            today: [td('c', 'loc3', 'Obs'), td('d', 'loc1')],
        });
        expect(sel.locationCount).toBe(3);
    });

    it('drops malformed items (missing workflowId/locationId/name) instead of crashing', () => {
        const sel = selectFindings({ overdue: [ov('a', 5), { daysLate: 9 }], today: [{}] });
        expect(sel.findings.map((f) => f.workflowId)).toEqual(['a']);
        expect(sel.total).toBe(1);
    });
});
