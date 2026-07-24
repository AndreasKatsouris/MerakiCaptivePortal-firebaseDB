'use strict';

const {
    REGISTRY, AdapterPendingError, enabledToolNames, autoAllowlist, catalogForPrompt,
    toAnthropicTools, toSdkMcpServer, __setDbForTests, __setSdkForTests,
} = require('../tools');
const { TIER, STATUS, isAgentSubmittable } = require('../constants');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

const AUTO_READY = ['getWorkflowDigest', 'getStaff', 'getRunHistory', 'getFoodCostSummary', 'getSuggestedOrder'];
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

    it('exposes the 9 ready tools (5 auto + 4 confirm) to the engine', () => {
        expect(enabledToolNames().sort()).toEqual([...READY].sort());
    });

    it('autoAllowlist (proactive) = only the ready AUTO tools (confirm tools excluded)', () => {
        // the 4 confirm-tier tools are READY but NOT auto → never in the proactive allowlist
        expect(autoAllowlist().sort()).toEqual([...AUTO_READY].sort());
        // an owner who tightens getStaff to confirm drops it from the proactive set too
        expect(autoAllowlist({ policy: { getStaff: 'confirm' } }).sort())
            .toEqual(['getFoodCostSummary', 'getRunHistory', 'getSuggestedOrder', 'getWorkflowDigest']);
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
            // owner1 owns loc1; mgr1 is a delegated manager WITH access; attacker1 has none.
            userLocations: { owner1: { loc1: true }, mgr1: { loc1: true } },
        });
        __setDbForTests(db);
    });

    it('getStaff returns staff sorted by name', async () => {
        const out = await REGISTRY.getStaff.run({ uid: 'owner1' }, { locationId: 'loc1' });
        expect(out.staff.map((s) => s.name)).toEqual(['Abe', 'Zara']);
    });


    it('getRunHistory returns only completed runs, newest first', async () => {
        const out = await REGISTRY.getRunHistory.run({ uid: 'owner1' }, { workflowId: 'wf1', locationId: 'loc1' });
        expect(out.runs.map((r) => r.id)).toEqual(['r3', 'r1']); // r2 (incomplete) excluded
    });

    it('getRunHistory returns empty when the workflow owner cannot be resolved', async () => {
        const out = await REGISTRY.getRunHistory.run({ uid: 'owner1' }, { workflowId: 'ghost', locationId: 'loc1' });
        expect(out.runs).toEqual([]);
    });

    // SECURITY (cross-tenant isolation): a caller who does NOT own/have-access-to the
    // location must NOT read another tenant's run history, even with valid victim IDs.
    // The global workflowsByLocation index resolves the OWNER; without a caller-access
    // check the adapter would leak owner1's runs to attacker1 (cross-tenant IDOR).
    it('getRunHistory refuses cross-tenant: caller without location access gets nothing', async () => {
        const out = await REGISTRY.getRunHistory.run(
            { uid: 'attacker1' },
            { workflowId: 'wf1', locationId: 'loc1' }, // victim owner1's IDs
        );
        expect(out.runs).toEqual([]); // MUST NOT leak owner1's r3/r1
    });

    it('getRunHistory still serves a delegated manager who HAS location access', async () => {
        const out = await REGISTRY.getRunHistory.run(
            { uid: 'mgr1' }, // not the owner, but loc1 is in userLocations/mgr1
            { workflowId: 'wf1', locationId: 'loc1' },
        );
        expect(out.runs.map((r) => r.id)).toEqual(['r3', 'r1']);
    });

    // --- getFoodCostSummary (Deliverable 1) -----------------------------------
    // Seed location-scoped stock data + access map. owner1 owns loc1 (userLocations);
    // mgr1 is delegated; attacker1 has no access.
    function seedFoodCost() {
      return makeFakeRtdb({
        userLocations: { owner1: { loc1: true }, mgr1: { loc1: true } },
        locations: { loc1: { ownerId: 'owner1', stockUsage: {
          k1: { timestamp: 1000, costPercentage: 28, salesAmount: 9000, stockItems: [] },
          k2: { timestamp: 2000, costPercentage: 33, salesAmount: 9500, stockItems: [
            { itemCode: 'A', description: 'beef', closingQty: 0, usagePerDay: 2 },
            { itemCode: 'C', description: 'oil', closingQty: 70, usagePerDay: 2 },
          ] } },
        } },
      });
    }

    it('getFoodCostSummary returns the latest summary for an owner', async () => {
      __setDbForTests(seedFoodCost());
      const out = await REGISTRY.getFoodCostSummary.run({ uid: 'owner1', now: 2000 + 86400000 }, { locationId: 'loc1' });
      expect(out.hasData).toBe(true);
      expect(out.foodCostPct).toBe(33);
      expect(out.previousFoodCostPct).toBe(28);
      expect(out.trend).toBe('up');
      expect(out.lowStockItems.map((i) => i.itemCode)).toEqual(['A']);
    });

    it('getFoodCostSummary serves a delegated manager with location access', async () => {
      __setDbForTests(seedFoodCost());
      const out = await REGISTRY.getFoodCostSummary.run({ uid: 'mgr1', now: 2000 }, { locationId: 'loc1' });
      expect(out.hasData).toBe(true);
    });

    // SECURITY (cross-tenant isolation, C-1): a caller without access to the location
    // must NOT read its food cost, even with a valid victim locationId. The agent runs
    // via Admin SDK (rules bypassed) so this code check is the only tenant boundary.
    it('getFoodCostSummary refuses cross-tenant: caller without location access gets hasData:false', async () => {
      __setDbForTests(seedFoodCost());
      const out = await REGISTRY.getFoodCostSummary.run({ uid: 'attacker1', now: 2000 }, { locationId: 'loc1' });
      expect(out).toEqual({ hasData: false }); // MUST NOT leak owner1's 33% / beef
    });

    it('getFoodCostSummary returns hasData:false when a location has never uploaded', async () => {
      __setDbForTests(makeFakeRtdb({ userLocations: { owner1: { loc1: true } }, locations: { loc1: { ownerId: 'owner1' } } }));
      const out = await REGISTRY.getFoodCostSummary.run({ uid: 'owner1', now: 2000 }, { locationId: 'loc1' });
      expect(out).toEqual({ hasData: false });
    });
});

// --- getSuggestedOrder adapter (Deliverable 2, design §5.1/§8) -------------------
// Same C-1 posture as getFoodCostSummary: the agent runs via the Admin SDK (RTDB
// rules bypassed), so this adapter is the ONLY tenant boundary for the read it
// gates. locationId is model-supplied → treated as attacker-controlled.
describe('getSuggestedOrder adapter', () => {
    const { suggestOrder } = require('../food-cost/suggest');
    const DAY = 86400000;
    const NOW = 2000 + 3 * DAY;

    // Two clearly-orderable records: item A is stocked out with steady usage, so
    // the suggestion loop always yields at least one orderable item.
    function usageRecords() {
        return {
            k1: { timestamp: 1000, stockItems: [
                { itemCode: 'A', description: 'beef', supplierName: 'Meat Co', closingQty: 10, usagePerDay: 5, unitCost: 10 },
            ] },
            k2: { timestamp: 2000, stockItems: [
                { itemCode: 'A', description: 'beef', supplierName: 'Meat Co', closingQty: 0, usagePerDay: 5, unitCost: 10 },
            ] },
        };
    }

    // owner1 owns loc1 (locations/{loc}/ownerId fallback path); mgr1 is a delegated
    // manager via userLocations; attacker1 has neither. loc2 is accessible to owner1
    // but has never uploaded (the anti-enumeration twin).
    function seedSuggest() {
        return makeFakeRtdb({
            userLocations: { mgr1: { loc1: true }, owner1: { loc2: true } },
            locations: {
                loc1: { ownerId: 'owner1', stockUsage: usageRecords() },
                loc2: { ownerId: 'owner1' },
            },
        });
    }
    afterEach(() => __setDbForTests(null));

    // ---- C-1 trio ---------------------------------------------------------------
    it('refuses cross-tenant: caller without location access gets bare hasData:false', async () => {
        __setDbForTests(seedSuggest());
        const out = await REGISTRY.getSuggestedOrder.run({ uid: 'attacker1', now: NOW }, { locationId: 'loc1' });
        expect(out).toEqual({ hasData: false }); // MUST NOT leak owner1's stock/order data
    });

    it('serves the owner (locations/{loc}/ownerId match)', async () => {
        __setDbForTests(seedSuggest());
        const out = await REGISTRY.getSuggestedOrder.run({ uid: 'owner1', now: NOW }, { locationId: 'loc1' });
        expect(out.hasData).toBe(true);
        expect(out.items.length).toBeGreaterThan(0);
        expect(out.items[0].itemCode).toBe('A');
    });

    it('serves a delegated manager (userLocations entry, not the owner)', async () => {
        __setDbForTests(seedSuggest());
        const out = await REGISTRY.getSuggestedOrder.run({ uid: 'mgr1', now: NOW }, { locationId: 'loc1' });
        expect(out.hasData).toBe(true);
    });

    // ---- anti-enumeration (design §7.3) -----------------------------------------
    // The no-access return must be DEEP-EQUAL to the accessible-but-empty return —
    // any extra field (e.g. a `reason`) would rebuild the locationId oracle.
    it('no-access and accessible-but-empty returns are byte-identical', async () => {
        __setDbForTests(seedSuggest());
        const noAccess = await REGISTRY.getSuggestedOrder.run({ uid: 'attacker1', now: NOW }, { locationId: 'loc1' });
        const noData = await REGISTRY.getSuggestedOrder.run({ uid: 'owner1', now: NOW }, { locationId: 'loc2' });
        expect(noData).toEqual({ hasData: false });
        expect(noAccess).toEqual(noData);
    });

    // ---- Zod arg boundary --------------------------------------------------------
    // execute.js does not safeParse — args are validated at the engine boundary
    // (Anthropic API validates input_schema; the SDK validates the Zod shape), so
    // the guarantee under test IS the schema itself.
    it('rejects out-of-bounds daysToNextDelivery at the Zod boundary', () => {
        const schema = REGISTRY.getSuggestedOrder.args;
        for (const bad of [0, 31, -1, 1.5, '5', NaN]) {
            const res = schema.safeParse({ locationId: 'loc1', daysToNextDelivery: bad });
            expect(res.success, `daysToNextDelivery=${String(bad)}`).toBe(false);
        }
        expect(schema.safeParse({ locationId: 'loc1', daysToNextDelivery: 1 }).success).toBe(true);
        expect(schema.safeParse({ locationId: 'loc1', daysToNextDelivery: 30 }).success).toBe(true);
    });

    it('rejects a >100-char supplierFilter at the Zod boundary (F2 CPU/audit bound)', () => {
        const schema = REGISTRY.getSuggestedOrder.args;
        expect(schema.safeParse({ locationId: 'loc1', supplierFilter: 'x'.repeat(101) }).success).toBe(false);
        expect(schema.safeParse({ locationId: 'loc1', supplierFilter: 'x'.repeat(100) }).success).toBe(true);
    });

    // ---- two-location bleed (F1, the #144 vuln class) ----------------------------
    // A and B share itemCode '10127' with wildly different usage; the caller has
    // access to BOTH. The result for A must deep-equal a direct suggestOrder() run
    // over A's records ONLY — B's records must never influence A's numbers.
    it('two locations sharing an itemCode never bleed into each other', async () => {
        const recsA = {
            k1: { timestamp: 1000, stockItems: [{ itemCode: '10127', description: 'flour', closingQty: 4, usagePerDay: 2, unitCost: 5 }] },
            k2: { timestamp: 2000, stockItems: [{ itemCode: '10127', description: 'flour', closingQty: 0, usagePerDay: 2, unitCost: 5 }] },
        };
        const recsB = {
            k1: { timestamp: 1000, stockItems: [{ itemCode: '10127', description: 'flour', closingQty: 900, usagePerDay: 400, unitCost: 99 }] },
            k2: { timestamp: 2000, stockItems: [{ itemCode: '10127', description: 'flour', closingQty: 0, usagePerDay: 400, unitCost: 99 }] },
        };
        __setDbForTests(makeFakeRtdb({
            userLocations: { u1: { locA: true, locB: true } },
            locations: {
                locA: { ownerId: 'u1', stockUsage: recsA },
                locB: { ownerId: 'u1', stockUsage: recsB },
            },
        }));
        const out = await REGISTRY.getSuggestedOrder.run({ uid: 'u1', now: NOW }, { locationId: 'locA' });
        const expected = suggestOrder(Object.values(recsA), { now: NOW });
        expect(out).toEqual(expected); // full deep-compare: numbers computed from A only
        expect(out.items[0].unitCost).toBe(5); // and definitely not B's 99
    });

    // ---- oversized record (F7 / P5) ----------------------------------------------
    it('caps an oversized record and emits the items-truncated-for-size caveat', async () => {
        const bigItems = Array.from({ length: 2001 }, (_, i) => (
            { itemCode: `I${i}`, description: 'bulk', closingQty: 0, usagePerDay: 1, unitCost: 1 }
        ));
        __setDbForTests(makeFakeRtdb({
            userLocations: { u1: { loc1: true } },
            locations: { loc1: { ownerId: 'u1', stockUsage: { k1: { timestamp: 2000, stockItems: bigItems } } } },
        }));
        const out = await REGISTRY.getSuggestedOrder.run({ uid: 'u1', now: NOW }, { locationId: 'loc1' });
        expect(out.hasData).toBe(true);
        expect(out.caveats).toContain('items-truncated-for-size');
        expect(out.items.length).toBeLessThanOrEqual(30); // output cap holds too
    });

    // ---- bounded read ------------------------------------------------------------
    // BEHAVIOURAL assertion style: the fake RTDB honours limitToLast (applyQuery
    // sorts keys and slices the last N), so seeding 35 chronologically-keyed records
    // and observing historyDepth.records === 30 proves the adapter passed
    // orderByKey().limitToLast(30) — without it the count would be 35.
    it('reads at most the newest 30 records (orderByKey().limitToLast(30))', async () => {
        const stockUsage = {};
        for (let i = 1; i <= 35; i++) {
            stockUsage[`r${String(i).padStart(2, '0')}`] = {
                timestamp: i * 1000,
                stockItems: [{ itemCode: 'X', description: 'x', closingQty: 0, usagePerDay: 1, unitCost: 2 }],
            };
        }
        __setDbForTests(makeFakeRtdb({
            userLocations: { u1: { loc1: true } },
            locations: { loc1: { ownerId: 'u1', stockUsage } },
        }));
        const out = await REGISTRY.getSuggestedOrder.run({ uid: 'u1', now: 35000 + DAY }, { locationId: 'loc1' });
        expect(out.hasData).toBe(true);
        expect(out.historyDepth.records).toBe(30); // not 35 — oldest 5 never fetched
        expect(out.asOf).toBe(35000); // and the NEWEST records were kept
    });

    // ---- ctx.now threading -------------------------------------------------------
    it('threads ctx.now into asOf/dataAgeDays', async () => {
        __setDbForTests(seedSuggest());
        const out = await REGISTRY.getSuggestedOrder.run({ uid: 'owner1', now: NOW }, { locationId: 'loc1' });
        expect(out.asOf).toBe(2000); // latest record's timestamp
        expect(out.dataAgeDays).toBe(3); // floor((NOW - 2000) / DAY)
    });
});
