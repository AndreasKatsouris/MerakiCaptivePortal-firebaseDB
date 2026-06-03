'use strict';

const {
    REGISTRY, AdapterPendingError, enabledToolNames, autoAllowlist, catalogForPrompt,
    toAnthropicTools, toSdkMcpServer, __setDbForTests, __setSdkForTests,
} = require('../tools');
const { TIER, STATUS, isAgentSubmittable } = require('../constants');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

const READY = ['getWorkflowDigest', 'getStaff', 'getRunHistory', 'snoozeCard'];

describe('registry integrity', () => {
    it('every tool has description, args, valid tier+ceiling, status, run', () => {
        for (const [name, def] of Object.entries(REGISTRY)) {
            expect(typeof def.description, name).toBe('string');
            expect(def.args, name).toBeTruthy();
            expect(typeof def.args.shape, name).toBe('object'); // zod object
            expect(Object.values(TIER), name).toContain(def.tier);
            expect(Object.values(TIER), name).toContain(def.ceiling);
            expect(Object.values(STATUS), name).toContain(def.status);
            expect(typeof def.run, name).toBe('function');
        }
    });

    it('exposes exactly the 4 ready tools to the engine', () => {
        expect(enabledToolNames().sort()).toEqual([...READY].sort());
    });

    it('autoAllowlist (proactive) = the ready tools that resolve to auto', () => {
        // all 4 ready tools are auto-tier with no owner override
        expect(autoAllowlist().sort()).toEqual([...READY].sort());
        // an owner who tightens snoozeCard to confirm drops it from the proactive set
        expect(autoAllowlist({ policy: { snoozeCard: 'confirm' } }).sort())
            .toEqual(['getRunHistory', 'getStaff', 'getWorkflowDigest']);
    });

    it('marks every playbook-authoring tool confirm-tier', () => {
        ['activateTemplate', 'createWorkflow', 'editWorkflow', 'pauseWorkflow'].forEach((n) => {
            expect(REGISTRY[n].tier).toBe(TIER.CONFIRM);
            expect(REGISTRY[n].ceiling).toBe(TIER.CONFIRM);
        });
    });
});

describe('pending tools', () => {
    it('throw AdapterPendingError when run', async () => {
        await expect(REGISTRY.activateTemplate.run({ uid: 'u' }, {})).rejects.toBeInstanceOf(AdapterPendingError);
        await expect(REGISTRY.getWorkflows.run({ uid: 'u' }, {})).rejects.toThrow(/getWorkflows/);
    });
});

describe('toAnthropicTools projection', () => {
    it('projects only enabled tools into JSON-schema object schemas', () => {
        const tools = toAnthropicTools();
        expect(tools.map((t) => t.name).sort()).toEqual([...READY].sort());
        tools.forEach((t) => {
            expect(t.input_schema.type).toBe('object');
            expect(t.input_schema).not.toHaveProperty('$schema');
            expect(typeof t.description).toBe('string');
        });
    });

    it('derives the right required fields from Zod', () => {
        const hist = toAnthropicTools(['getRunHistory'])[0];
        expect(hist.input_schema.required).toEqual(expect.arrayContaining(['workflowId', 'locationId']));
        expect(hist.input_schema.required).not.toContain('limit'); // optional
    });
});

describe('toSdkMcpServer projection', () => {
    it('builds an MCP server from enabled tools via the injected SDK seam', () => {
        const calls = [];
        __setSdkForTests({
            tool: (name, description, shape, handler) => ({ name, description, shape, handler }),
            createSdkMcpServer: (cfg) => { calls.push(cfg); return cfg; },
        });
        const server = toSdkMcpServer({ uid: 'u', turnSource: 'scheduled' });
        expect(server.name).toBe('ross-tools');
        expect(server.tools.map((t) => t.name).sort()).toEqual([...READY].sort());
        server.tools.forEach((t) => expect(typeof t.handler).toBe('function'));
        __setSdkForTests(null);
    });
});

describe('§3.1 measurement gate (isAgentSubmittable)', () => {
    it('allows non-measurement types', () => {
        expect(isAgentSubmittable('text', {})).toBe(true);
        expect(isAgentSubmittable('checkbox', {})).toBe(true);
        expect(isAgentSubmittable('signature', {})).toBe(true);
    });
    it('refuses every measurement / attestation type', () => {
        ['temperature', 'number', 'rating', 'yes_no', 'photo'].forEach((t) => {
            expect(isAgentSubmittable(t, {})).toBe(false);
        });
    });
    it('refuses any task that requires a note, even a text type', () => {
        expect(isAgentSubmittable('text', { requiredNote: true })).toBe(false);
    });
});

describe('ready adapters (via fake RTDB)', () => {
    let db;
    beforeEach(() => {
        db = makeFakeRtdb({
            ross: {
                staff: { owner1: { loc1: {
                    s2: { name: 'Zara', role: 'Chef' },
                    s1: { name: 'Abe', role: 'Waiter' },
                } } },
                v2Snoozes: {},
                workflowsByLocation: { loc1: { wf1: 'owner1' } },
                runs: { owner1: { wf1: { loc1: {
                    r1: { id: 'r1', completedAt: 100, startedAt: 10 },
                    r2: { id: 'r2', completedAt: null, startedAt: 20 },
                    r3: { id: 'r3', completedAt: 300, startedAt: 30 },
                } } } },
            },
        });
        __setDbForTests(db);
    });

    it('getStaff returns staff sorted by name', async () => {
        const out = await REGISTRY.getStaff.run({ uid: 'owner1' }, { locationId: 'loc1' });
        expect(out.staff.map((s) => s.name)).toEqual(['Abe', 'Zara']);
    });

    it('snoozeCard sanitises cardId and writes an expiry', async () => {
        const now = 1_000_000;
        const out = await REGISTRY.snoozeCard.run({ uid: 'owner1', now }, { cardId: 'food/../cost!', hours: 2 });
        expect(out.cardId).toBe('foodcost'); // slashes, dots and bang all stripped (path-injection safe)
        expect(out.expiresAt).toBe(now + 2 * 3600000);
        expect(db._dump().ross.v2Snoozes.owner1.foodcost.expiresAt).toBe(out.expiresAt);
    });

    it('snoozeCard rejects out-of-range hours', async () => {
        await expect(REGISTRY.snoozeCard.run({ uid: 'owner1', now: 1 }, { cardId: 'x', hours: 1000 }))
            .rejects.toThrow(/720/);
    });

    it('getRunHistory returns only completed runs, newest first', async () => {
        const out = await REGISTRY.getRunHistory.run({ uid: 'owner1' }, { workflowId: 'wf1', locationId: 'loc1' });
        expect(out.runs.map((r) => r.id)).toEqual(['r3', 'r1']); // r2 (incomplete) excluded
    });

    it('getRunHistory returns empty when the workflow owner cannot be resolved', async () => {
        const out = await REGISTRY.getRunHistory.run({ uid: 'owner1' }, { workflowId: 'ghost', locationId: 'loc1' });
        expect(out.runs).toEqual([]);
    });
});
