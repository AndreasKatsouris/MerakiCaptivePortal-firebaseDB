/**
 * Guard — `rossDeleteWorkflow` owner resolution.
 *
 * The bug (found in prod 2026-07-26): `rossGetWorkflows` lists workflows by
 * resolving (workflowId -> ownerUid) from `ross/workflowsByLocation` across all
 * locations the caller can see, so a super admin sees every owner's workflows.
 * Delete looked ONLY under `ross/workflows/{callerUid}/…`, so anything visible
 * but not owned returned 404 "Workflow not found" — 6 of 7 workflows in prod
 * were undeletable "ghosts". The read path was owner-aware; delete was not.
 *
 * The fix must not swing too far the other way: resolving an owner from the
 * global index with no caller check is the #144 IDOR class. So resolution is
 * scoped to what the caller can see, and cross-owner delete stays super-admin
 * only — a co-located non-admin can already SEE a peer's workflow, but granting
 * DELETE would widen a destructive capability.
 */
import { describe, it, expect, afterEach } from 'vitest';

const ross = require('../ross');
const { makeFakeRtdb } = require('../agent/__tests__/helpers/fake-rtdb');

const OWNER = 'ownerUid123';
const ADMIN = 'adminUid456';
const PEER = 'peerUid789';
const WF = 'wfGhost';
const LOC = 'locShared';

function seed() {
    return {
        ross: {
            workflows: {
                [OWNER]: {
                    [WF]: {
                        name: 'Daily Opening Checklist',
                        recurrence: 'daily',
                        locations: { [LOC]: { locationName: 'Test PR67', status: 'active' } },
                    },
                },
            },
            workflowsByLocation: { [LOC]: { [WF]: OWNER } },
            ownerIndex: { [OWNER]: true },
        },
        userLocations: { [PEER]: { [LOC]: true } },
    };
}

function withDb(over = {}) {
    const db = makeFakeRtdb({ ...seed(), ...over });
    ross.__setDbForTests(db);
    return db;
}

afterEach(() => ross.__setDbForTests(null));

describe('resolveWorkflowOwnerForCaller', () => {
    it('returns the caller when the caller owns the workflow (unchanged fast path)', async () => {
        withDb();
        const owner = await ross.resolveWorkflowOwnerForCaller({
            uid: OWNER, isSuperAdmin: false, workflowId: WF,
        });
        expect(owner).toBe(OWNER);
    });

    it('resolves the real owner for a super admin — this is the ghost fix', async () => {
        withDb();
        const owner = await ross.resolveWorkflowOwnerForCaller({
            uid: ADMIN, isSuperAdmin: true, workflowId: WF,
        });
        // Before the fix this path did not exist and delete 404'd.
        expect(owner).toBe(OWNER);
        expect(owner).not.toBe(ADMIN);
    });

    it('resolves via an explicit locationId for a super admin', async () => {
        withDb();
        const owner = await ross.resolveWorkflowOwnerForCaller({
            uid: ADMIN, isSuperAdmin: true, workflowId: WF, locationId: LOC,
        });
        expect(owner).toBe(OWNER);
    });

    it('REFUSES a non-admin peer who merely shares the location', async () => {
        // The peer can SEE this workflow via rossGetWorkflows. Delete must not
        // inherit that — no widening of a destructive capability.
        withDb();
        const owner = await ross.resolveWorkflowOwnerForCaller({
            uid: PEER, isSuperAdmin: false, workflowId: WF,
        });
        expect(owner).toBeNull();
    });

    it('returns null for an unknown workflow even for a super admin', async () => {
        withDb();
        const owner = await ross.resolveWorkflowOwnerForCaller({
            uid: ADMIN, isSuperAdmin: true, workflowId: 'doesNotExist',
        });
        expect(owner).toBeNull();
    });

    it('returns null when the index is empty (nothing to resolve through)', async () => {
        withDb({ ross: { ...seed().ross, workflowsByLocation: {} } });
        const owner = await ross.resolveWorkflowOwnerForCaller({
            uid: ADMIN, isSuperAdmin: true, workflowId: WF,
        });
        expect(owner).toBeNull();
    });

    it('never returns the caller uid as a fallback when resolution fails', async () => {
        // The precise shape of the original bug was "assume caller == owner".
        withDb({ ross: { ...seed().ross, workflowsByLocation: {} } });
        const owner = await ross.resolveWorkflowOwnerForCaller({
            uid: ADMIN, isSuperAdmin: true, workflowId: WF,
        });
        expect(owner).not.toBe(ADMIN);
    });

    it('does not trust an ownerUid supplied by the caller', async () => {
        withDb();
        const owner = await ross.resolveWorkflowOwnerForCaller({
            uid: PEER, isSuperAdmin: false, workflowId: WF,
            // A malicious extra field must be ignored entirely.
            ownerUid: OWNER,
        });
        expect(owner).toBeNull();
    });
});
