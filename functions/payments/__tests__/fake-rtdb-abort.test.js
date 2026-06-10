import { describe, it, expect } from 'vitest';
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

// Guard for the payments fake-rtdb's transaction ABORT semantics. The claim-if-absent
// idempotency in process-charge.js / trial.js depends on fn→undefined meaning
// "abort: no write, committed:false, snapshot = existing value" (real RTDB behaviour).
// The billing copy of this helper lacks abort — if someone "re-syncs" this copy from
// billing, these tests fail loudly instead of the idempotency tests silently lying.
describe('fake-rtdb transaction abort semantics', () => {
    it('commits a create-if-absent when the node is empty', async () => {
        const db = makeFakeRtdb({});
        const out = await db.ref('a/b').transaction((cur) => (cur === null ? { v: 1 } : undefined));
        expect(out.committed).toBe(true);
        expect(out.snapshot.val()).toEqual({ v: 1 });
        expect((await db.ref('a/b').once('value')).val()).toEqual({ v: 1 });
    });

    it('aborts (no write, committed:false, existing snapshot) when fn returns undefined', async () => {
        const db = makeFakeRtdb({ a: { b: { v: 1 } } });
        const out = await db.ref('a/b').transaction((cur) => (cur === null ? { v: 2 } : undefined));
        expect(out.committed).toBe(false);
        expect(out.snapshot.val()).toEqual({ v: 1 }); // the PRIOR value, not the abort sentinel
        expect((await db.ref('a/b').once('value')).val()).toEqual({ v: 1 }); // unchanged
    });
});
