'use strict';

const {
    REGISTRY, AdapterPendingError, enabledToolNames, autoAllowlist, catalogForPrompt,
    toAnthropicTools, toSdkMcpServer, __setDbForTests, __setSdkForTests,
} = require('../tools');
const { TIER, STATUS, isAgentSubmittable } = require('../constants');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

const AUTO_READY = ['getWorkflowDigest', 'getStaff', 'getRunHistory', 'snoozeCard'];
const CONFIRM_READY = ['activateTemplate', 'createWorkflow', 'editWorkflow', 'pauseWorkflow'];
const READY = [...AUTO_READY, ...CONFIRM_READY]; // slice 4 promoted the 4 confirm tools

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

    it('exposes the 8 ready tools (4 auto + 4 confirm) to the engine', () => {
        expect(enabledToolNames().sort()).toEqual([...READY].sort());
    });

    it('autoAllowlist (proactive) = only the ready AUTO tools (confirm tools excluded)', () => {
        // the 4 confirm-tier tools are READY but NOT auto → never in the proactive allowlist
        expect(autoAllowlist().sort()).toEqual([...AUTO_READY].sort());
        // an owner who tightens snoozeCard to confirm drops it from the proactive set too
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
        await expect(REGISTRY.getWorkflows.run({ uid: 'u' }, {})).rejects.toBeInstanceOf(AdapterPendingError);
        await expect(REGISTRY.startRun.run({ uid: 'u' }, {})).rejects.toThrow(/startRun/);
    });
});

describe('promoted confirm-tier adapters (slice 4)', () => {
    const ross = require('../../ross');
    function seed(over = {}) {
        const db = makeFakeRtdb({
            userLocations: { u1: { loc1: true } },
            users: { u1: { tier: 'all-in' } },
            ross: { templates: { t1: { templateId: 't1', name: 'Sweep', category: 'compliance', recurrence: 'weekly', tier: 'free', subtasks: [] } } },
            subscriptions: { u1: { limits: {} } },
            ...over,
        });
        __setDbForTests(db);   // tools' own seam (unused by these adapters, set for safety)
        ross.__setDbForTests(db); // the cores read/write through ross's seam
        return db;
    }
    afterEach(() => { __setDbForTests(null); ross.__setDbForTests(null); });

    const ctx = { uid: 'u1', isSuperAdmin: false, email: 'u1@x.co', now: 1_700_000_000_000 };

    it('activateTemplate runs the core → writes a workflow (nextDueDate defaulted)', async () => {
        const db = seed();
        const out = await REGISTRY.activateTemplate.run(ctx, { templateId: 't1', locationIds: ['loc1'] });
        expect(out.success).toBe(true);
        expect(db._dump().ross.workflows.u1[out.workflowId]).toBeDefined();
    });

    it('createWorkflow runs the core → writes a workflow', async () => {
        const db = seed();
        const out = await REGISTRY.createWorkflow.run(ctx, { name: 'Daily', category: 'operations', recurrence: 'daily', locationIds: ['loc1'] });
        expect(out.success).toBe(true);
        expect(db._dump().ross.workflows.u1[out.workflowId].name).toBe('Daily');
    });

    it('pauseWorkflow runs the core → sets status:paused', async () => {
        const db = seed({ ross: { workflows: { u1: { wf1: { name: 'X', status: 'active' } } } } });
        await REGISTRY.pauseWorkflow.run(ctx, { workflowId: 'wf1' });
        expect(db._dump().ross.workflows.u1.wf1.status).toBe('paused');
    });

    it('editWorkflow runs the core → updates allowed fields', async () => {
        const db = seed({ ross: { workflows: { u1: { wf1: { name: 'Old', status: 'active' } } } } });
        await REGISTRY.editWorkflow.run(ctx, { workflowId: 'wf1', updates: { name: 'New' } });
        expect(db._dump().ross.workflows.u1.wf1.name).toBe('New');
    });

    it('surfaces a gate failure as a coded Error (tier-denied) + threads email into the denial audit (M-2)', async () => {
        const db = seed({ users: { u1: { tier: 'free' } }, ross: { templates: { t1: { templateId: 't1', name: 'Sweep', tier: 'all-in', subtasks: [] } } } });
        await expect(REGISTRY.activateTemplate.run(ctx, { templateId: 't1', locationIds: ['loc1'] }))
            .rejects.toMatchObject({ code: 'TIER_DENIED' });
        const denial = Object.values(db._dump().ross.auditLog.templateActivationDenials)[0];
        expect(denial).toMatchObject({ uid: 'u1', email: 'u1@x.co' }); // email carried through the adapter
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

    // The Anthropic Messages API requires tool input_schema to be valid JSON Schema
    // draft 2020-12. The OpenAPI-3.0 / draft-4 dialect (boolean `exclusiveMinimum`,
    // `nullable`) is REJECTED at runtime with a 400 — and it never surfaces in tests
    // that mock the LLM client. Guard the generated dialect here.
    it('emits draft-2020-12-valid numeric exclusiveMinimum (not the boolean draft-4 form)', () => {
        const limit = toAnthropicTools(['getRunHistory'])[0].input_schema.properties.limit;
        expect(limit.type).toBe('integer');
        expect(typeof limit.exclusiveMinimum).toBe('number'); // draft-2020-12: a number, not `true`
        expect(limit.exclusiveMinimum).toBe(0);

        const hours = toAnthropicTools(['snoozeCard'])[0].input_schema.properties.hours;
        expect(typeof hours.exclusiveMinimum).toBe('number');
    });

    it('produces NO draft-4-only constructs (boolean exclusive bounds / nullable) on any enabled tool', () => {
        const offenders = [];
        const scan = (node, path) => {
            if (node && typeof node === 'object') {
                for (const [k, v] of Object.entries(node)) {
                    if ((k === 'exclusiveMinimum' || k === 'exclusiveMaximum') && typeof v === 'boolean') {
                        offenders.push(`${path}.${k}=boolean`);
                    }
                    if (k === 'nullable') offenders.push(`${path}.nullable`);
                    scan(v, `${path}.${k}`);
                }
            }
        };
        toAnthropicTools().forEach((t) => scan(t.input_schema, t.name));
        expect(offenders).toEqual([]);
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
