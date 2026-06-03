'use strict';

/**
 * askRoss slice 4 — owner-callable workflow-op cores extracted from the
 * rossActivateWorkflow / rossCreateWorkflow / rossUpdateWorkflow handlers so BOTH
 * the CF handler and the agent confirm-tier adapters call ONE implementation (DRY).
 *
 * These cores ARE the handler logic post-extraction — and the handlers had NO prior
 * test coverage — so this suite IS the regression net. Gate failures throw an Error
 * with a `.code` (VALIDATION / NOT_FOUND / TIER_DENIED / LOCATION_DENIED /
 * WORKFLOW_LIMIT_REACHED) that the CF wrapper maps to an HTTP status and the agent
 * adapter maps to an is_error tool_result.
 */

const ross = require('../ross');
const { makeFakeRtdb } = require('../agent/__tests__/helpers/fake-rtdb');

// A template seed shaped like ross/templates/{id} (per the seed + rossActivateWorkflow).
function makeTemplate(over = {}) {
    return {
        templateId: 'tmpl1',
        name: 'Weekly Compliance Sweep',
        description: 'desc',
        category: 'compliance',
        recurrence: 'weekly',
        tier: 'free',
        subtasks: [{ title: 'Fridge temp', inputType: 'temperature' }],
        ...over,
    };
}

function seed(over = {}) {
    const base = {
        userLocations: { u1: { loc1: true, loc2: true } },
        users: { u1: { tier: 'all-in' } },
        ross: { templates: { tmpl1: makeTemplate() } },
        subscriptions: { u1: { limits: {} } },
    };
    const db = makeFakeRtdb({ ...base, ...over });
    ross.__setDbForTests(db);
    return db;
}

afterEach(() => ross.__setDbForTests(null));

// --------------------------------------------------------------------------
describe('createWorkflowAsOwner', () => {
    const baseArgs = {
        uid: 'u1', isSuperAdmin: false, email: 'u1@x.co',
        name: 'Daily Opening', category: 'operations', recurrence: 'daily',
        locationIds: ['loc1'], locationNames: ['Tannie'], nextDueDate: '2026-06-10',
        subtasks: [{ title: 'Unlock', inputType: 'checkbox' }],
    };

    it('creates a workflow + location index, returns {success, workflowId, workflow}', async () => {
        const db = seed();
        const res = await ross.createWorkflowAsOwner(baseArgs);
        expect(res.success).toBe(true);
        expect(res.workflowId).toBeTruthy();
        const dump = db._dump();
        expect(dump.ross.workflows.u1[res.workflowId]).toBeDefined();
        expect(dump.ross.workflowsByLocation.loc1[res.workflowId]).toBe('u1');
        expect(res.workflow.name).toBe('Daily Opening');
    });

    it('throws VALIDATION on missing name / bad category / bad recurrence / no locations / no date', async () => {
        seed();
        await expect(ross.createWorkflowAsOwner({ ...baseArgs, name: '' })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(ross.createWorkflowAsOwner({ ...baseArgs, category: 'nope' })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(ross.createWorkflowAsOwner({ ...baseArgs, recurrence: 'nope' })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(ross.createWorkflowAsOwner({ ...baseArgs, locationIds: [] })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(ross.createWorkflowAsOwner({ ...baseArgs, nextDueDate: null })).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('throws VALIDATION on an invalid subtask inputType', async () => {
        seed();
        await expect(ross.createWorkflowAsOwner({ ...baseArgs, subtasks: [{ title: 'x', inputType: 'frobnicate' }] }))
            .rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('throws LOCATION_DENIED when a non-super owner lacks the location', async () => {
        seed({ userLocations: { u1: { loc1: true } } });
        await expect(ross.createWorkflowAsOwner({ ...baseArgs, locationIds: ['loc1', 'locX'] }))
            .rejects.toMatchObject({ code: 'LOCATION_DENIED' });
    });

    it('throws WORKFLOW_LIMIT_REACHED at cap (+ logs the denial)', async () => {
        const db = seed({
            subscriptions: { u1: { limits: { maxWorkflows: 1 } } },
            ross: {
                templates: { tmpl1: makeTemplate() },
                workflows: { u1: { existing: { status: 'active', locations: { loc1: { status: 'active' } } } } },
            },
        });
        const err = await ross.createWorkflowAsOwner(baseArgs).catch((e) => e);
        expect(err.code).toBe('WORKFLOW_LIMIT_REACHED');
        expect(err.limit).toBe(1);
        expect(db._dump().ross.auditLog.workflowCapDenials).toBeDefined();
    });

    it('super-admin bypasses the cap', async () => {
        seed({
            subscriptions: { u1: { limits: { maxWorkflows: 1 } } },
            ross: {
                templates: { tmpl1: makeTemplate() },
                workflows: { u1: { existing: { status: 'active', locations: { loc1: { status: 'active' } } } } },
            },
        });
        const res = await ross.createWorkflowAsOwner({ ...baseArgs, isSuperAdmin: true });
        expect(res.success).toBe(true);
    });
});

// --------------------------------------------------------------------------
describe('activateWorkflowAsOwner', () => {
    const baseArgs = {
        uid: 'u1', isSuperAdmin: false, email: 'u1@x.co',
        templateId: 'tmpl1', locationIds: ['loc1'], locationNames: ['Tannie'],
        nextDueDate: '2026-06-10',
    };

    it('activates a template into a workflow + index', async () => {
        const db = seed();
        const res = await ross.activateWorkflowAsOwner(baseArgs);
        expect(res.success).toBe(true);
        expect(db._dump().ross.workflows.u1[res.workflowId]).toBeDefined();
        expect(db._dump().ross.workflowsByLocation.loc1[res.workflowId]).toBe('u1');
    });

    it('throws VALIDATION (missing templateId / locations / date) and NOT_FOUND (unknown template)', async () => {
        seed();
        await expect(ross.activateWorkflowAsOwner({ ...baseArgs, templateId: null })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(ross.activateWorkflowAsOwner({ ...baseArgs, locationIds: [] })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(ross.activateWorkflowAsOwner({ ...baseArgs, nextDueDate: null })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(ross.activateWorkflowAsOwner({ ...baseArgs, templateId: 'ghost' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws TIER_DENIED when a free user activates an all-in template (+ logs the denial)', async () => {
        const db = seed({
            users: { u1: { tier: 'free' } },
            ross: { templates: { tmpl1: makeTemplate({ tier: 'all-in' }) } },
        });
        const err = await ross.activateWorkflowAsOwner(baseArgs).catch((e) => e);
        expect(err.code).toBe('TIER_DENIED');
        expect(db._dump().ross.auditLog.templateActivationDenials).toBeDefined();
    });

    it('super-admin bypasses tier + cap gates', async () => {
        seed({
            users: { u1: { tier: 'free' } },
            subscriptions: { u1: { limits: { maxWorkflows: 0 } } },
            ross: {
                templates: { tmpl1: makeTemplate({ tier: 'all-in' }) },
                workflows: { u1: { e: { status: 'active', locations: { loc1: { status: 'active' } } } } },
            },
        });
        const res = await ross.activateWorkflowAsOwner({ ...baseArgs, isSuperAdmin: true });
        expect(res.success).toBe(true);
    });
});

// --------------------------------------------------------------------------
describe('updateWorkflowAsOwner', () => {
    function seedWorkflow() {
        return seed({
            ross: {
                templates: { tmpl1: makeTemplate() },
                workflows: { u1: { wf1: { name: 'Old', status: 'active', updatedAt: 1 } } },
            },
        });
    }

    it('updates only allowed fields + returns {success, workflowId}', async () => {
        const db = seedWorkflow();
        const res = await ross.updateWorkflowAsOwner({ uid: 'u1', workflowId: 'wf1', updates: { name: 'New', bogus: 'x' } });
        expect(res).toMatchObject({ success: true, workflowId: 'wf1' });
        const wf = db._dump().ross.workflows.u1.wf1;
        expect(wf.name).toBe('New');
        expect(wf.bogus).toBeUndefined(); // non-allowed field dropped
    });

    it('pauses a workflow (status:paused)', async () => {
        const db = seedWorkflow();
        await ross.updateWorkflowAsOwner({ uid: 'u1', workflowId: 'wf1', updates: { status: 'paused' } });
        expect(db._dump().ross.workflows.u1.wf1.status).toBe('paused');
    });

    it('throws VALIDATION on bad status / non-array daysBeforeAlert, NOT_FOUND on missing workflow', async () => {
        seedWorkflow();
        await expect(ross.updateWorkflowAsOwner({ uid: 'u1', workflowId: 'wf1', updates: { status: 'banana' } })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(ross.updateWorkflowAsOwner({ uid: 'u1', workflowId: 'wf1', updates: { daysBeforeAlert: 'no' } })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(ross.updateWorkflowAsOwner({ uid: 'u1', workflowId: 'ghost', updates: { name: 'x' } })).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(ross.updateWorkflowAsOwner({ uid: 'u1', workflowId: 'wf1', updates: null })).rejects.toMatchObject({ code: 'VALIDATION' });
    });
});
