'use strict';

const {
    MODELS, toLedgerUnits, streamTurn, createTurn, getClient, __setClientForTests,
} = require('../llm-client');

// Fake Anthropic stream: registers handlers, then on finalMessage() fires the text
// deltas (simulating streaming) and resolves to the final message. Mirrors the SDK's
// client.messages.stream(...).on('text', cb) + await stream.finalMessage() surface.
function makeFakeStream({ deltas = [], final }) {
    const handlers = {};
    return {
        on(event, cb) { handlers[event] = cb; return this; },
        async finalMessage() {
            for (const d of deltas) if (handlers.text) handlers.text(d);
            return final;
        },
    };
}

afterEach(() => __setClientForTests(null));

describe('toLedgerUnits (#129 §2.1 — snake→camel, the zero-charge trap)', () => {
    // verbatim Anthropic usage block with prompt caching (per the server-shape-mock lesson)
    const usage = {
        input_tokens: 10,
        output_tokens: 50,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 1000,
    };

    it('maps all four token classes to the ledger camelCase shape', () => {
        expect(toLedgerUnits(usage)).toEqual({
            inputTokens: 10, outputTokens: 50, cacheWriteTokens: 200, cacheReadTokens: 1000,
        });
    });

    it('defaults missing fields to 0', () => {
        expect(toLedgerUnits({ input_tokens: 5 })).toEqual({
            inputTokens: 5, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0,
        });
        expect(toLedgerUnits(undefined)).toEqual({
            inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0,
        });
    });

    it('proves the anti-pattern: the raw usage has NO camelCase keys (units: usage → all 0)', () => {
        expect(usage.inputTokens).toBeUndefined();
        expect(usage.cacheReadTokens).toBeUndefined();
    });
});

describe('streamTurn', () => {
    it('streams text deltas to onText and returns the final message', async () => {
        const deltas = ['Hello', ' world'];
        const final = {
            content: [
                { type: 'text', text: 'Hello world' },
                { type: 'tool_use', id: 't1', name: 'getStaff', input: {} },
            ],
            usage: { input_tokens: 1, output_tokens: 2 },
            stop_reason: 'tool_use',
        };
        let params;
        __setClientForTests({ messages: { stream: (p) => { params = p; return makeFakeStream({ deltas, final }); } } });

        const got = [];
        const res = await streamTurn({
            model: 'm',
            system: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }],
            tools: [{ name: 'getStaff', description: 'd', input_schema: { type: 'object' } }],
            messages: [{ role: 'user', content: 'hi' }],
            maxTokens: 512,
            onText: (d) => got.push(d),
        });

        expect(got).toEqual(['Hello', ' world']);
        expect(res.content).toEqual(final.content);
        expect(res.usage).toEqual(final.usage);
        expect(res.stopReason).toBe('tool_use');
        // cache_control passes through untouched (§5 breakpoints) + maxTokens mapped
        expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' });
        expect(params.max_tokens).toBe(512);
        expect(params.tools).toHaveLength(1);
    });

    it('omits tools from params when none are given', async () => {
        let params;
        __setClientForTests({ messages: { stream: (p) => { params = p; return makeFakeStream({ final: { content: [], usage: {}, stop_reason: 'end_turn' } }); } } });
        await streamTurn({ model: 'm', system: [], messages: [] });
        expect(params).not.toHaveProperty('tools');
    });

    it('works without an onText callback (no throw)', async () => {
        __setClientForTests({ messages: { stream: () => makeFakeStream({ deltas: ['x'], final: { content: [], usage: {}, stop_reason: 'end_turn' } }) } });
        await expect(streamTurn({ model: 'm', system: [], messages: [] })).resolves.toMatchObject({ stopReason: 'end_turn' });
    });
});

describe('createTurn (non-streaming, eval judge)', () => {
    it('calls messages.create and returns the normalised shape', async () => {
        let params;
        __setClientForTests({ messages: { create: async (p) => { params = p; return { content: [{ type: 'text', text: 'verdict' }], usage: { input_tokens: 3 }, stop_reason: 'end_turn' }; } } });
        const r = await createTurn({ model: MODELS.JUDGE, system: 'judge', messages: [{ role: 'user', content: 'x' }] });
        expect(r.content[0].text).toBe('verdict');
        expect(r.stopReason).toBe('end_turn');
        expect(params.system).toBe('judge');
        expect(params.max_tokens).toBe(1024);
    });
});

describe('client seam + MODELS', () => {
    it('getClient throws a clear error when not configured', () => {
        __setClientForTests(null);
        expect(() => getClient()).toThrow(/not configured/);
    });

    it('MODELS is frozen and names the agent + judge models', () => {
        expect(MODELS.AGENT).toBe('claude-sonnet-4-6');
        expect(MODELS.JUDGE).toBe('claude-haiku-4-5-20251001');
        expect(Object.isFrozen(MODELS)).toBe(true);
    });
});
