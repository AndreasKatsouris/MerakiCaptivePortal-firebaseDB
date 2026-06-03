'use strict';

const { clampToCeiling, effectivePolicy, stricter } = require('../policy');

describe('clampToCeiling', () => {
    it('keeps a tier stricter than the ceiling', () => {
        expect(clampToCeiling('off', 'auto')).toBe('off');
        expect(clampToCeiling('confirm', 'auto')).toBe('confirm');
    });
    it('raises a tier looser than the ceiling up to the ceiling', () => {
        expect(clampToCeiling('auto', 'confirm')).toBe('confirm');
        expect(clampToCeiling('auto', 'off')).toBe('off');
        expect(clampToCeiling('confirm', 'off')).toBe('off');
    });
    it('returns the ceiling for an invalid desired tier', () => {
        expect(clampToCeiling('bogus', 'confirm')).toBe('confirm');
        expect(clampToCeiling(undefined, 'auto')).toBe('auto');
    });
});

describe('stricter', () => {
    it('returns the higher-rank (stricter) tier', () => {
        expect(stricter('auto', 'confirm')).toBe('confirm');
        expect(stricter('off', 'confirm')).toBe('off');
        expect(stricter('auto', 'auto')).toBe('auto');
    });
});

describe('effectivePolicy', () => {
    const autoTool = { tier: 'auto', ceiling: 'auto' };
    const confirmTool = { tier: 'confirm', ceiling: 'confirm' };

    it('returns the default tier with no owner override', () => {
        expect(effectivePolicy('getStaff', autoTool, undefined)).toBe('auto');
        expect(effectivePolicy('activateTemplate', confirmTool, {})).toBe('confirm');
    });

    it('lets an owner TIGHTEN a tool (auto → confirm → off)', () => {
        const cfg = { policy: { getStaff: 'confirm' } };
        expect(effectivePolicy('getStaff', autoTool, cfg)).toBe('confirm');
        const cfg2 = { policy: { getStaff: 'off' } };
        expect(effectivePolicy('getStaff', autoTool, cfg2)).toBe('off');
    });

    it('IGNORES an owner override that tries to LOOSEN past the default', () => {
        // confirm tool, owner asks for auto → must stay confirm (loosening blocked)
        const cfg = { policy: { activateTemplate: 'auto' } };
        expect(effectivePolicy('activateTemplate', confirmTool, cfg)).toBe('confirm');
    });

    it('never returns looser than the ceiling even if default were looser', () => {
        const weird = { tier: 'auto', ceiling: 'confirm' };
        expect(effectivePolicy('x', weird, undefined)).toBe('confirm');
    });

    it('ignores an invalid override tier and falls back to default', () => {
        const cfg = { policy: { getStaff: 'frobnicate' } };
        expect(effectivePolicy('getStaff', autoTool, cfg)).toBe('auto');
    });
});
