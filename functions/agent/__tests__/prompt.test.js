'use strict';

const { systemBlocks, renderToolCatalog } = require('../prompt');

describe('renderToolCatalog', () => {
    it('renders name, tier and description per tool', () => {
        const out = renderToolCatalog([
            { name: 'getStaff', tier: 'auto', description: 'List staff.' },
        ]);
        expect(out).toContain('getStaff');
        expect(out).toContain('[auto]');
        expect(out).toContain('List staff.');
    });
    it('handles an empty catalog', () => {
        expect(renderToolCatalog([])).toBe('(no tools available)');
    });
});

describe('systemBlocks', () => {
    const tools = [{ name: 'getStaff', tier: 'auto', description: 'List staff.' }];

    it('returns exactly two blocks, both ephemeral-cached', () => {
        const blocks = systemBlocks({ tools, ownerContext: 'ctx' });
        expect(blocks).toHaveLength(2);
        blocks.forEach((b) => {
            expect(b.type).toBe('text');
            expect(b.cache_control).toEqual({ type: 'ephemeral' });
        });
    });

    it('puts the owner context ONLY in block 2 (cache breakpoint 2)', () => {
        const blocks = systemBlocks({ tools, ownerContext: 'SECRET-DIGEST-XYZ' });
        expect(blocks[0].text).not.toContain('SECRET-DIGEST-XYZ');
        expect(blocks[1].text).toContain('SECRET-DIGEST-XYZ');
    });

    it('renders the tool catalog into block 1', () => {
        const blocks = systemBlocks({ tools, ownerContext: '' });
        expect(blocks[0].text).toContain('getStaff');
    });

    it('uses the reactive (chat) identity by default', () => {
        const blocks = systemBlocks({ tools });
        expect(blocks[0].text).toContain('PROPOSE');
    });

    it('uses the proactive (scheduled) identity in scheduled mode', () => {
        const blocks = systemBlocks({ mode: 'scheduled', tools });
        expect(blocks[0].text).toContain('Never guess a measurement');
        expect(blocks[0].text).not.toContain('The owner is here and asking');
    });

    it('falls back to a placeholder when owner context is empty', () => {
        const blocks = systemBlocks({ tools });
        expect(blocks[1].text).toBe('(no owner context provided)');
    });
});
