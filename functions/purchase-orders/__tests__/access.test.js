// Convention: import test globals from vitest (ESM), require the module under
// test (CJS) — matching functions/payments/__tests__/bundles.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const tools = require('../../agent/tools');
const { assertLocationAccess } = require('../access');

function fakeDb(store) {
  return {
    ref: (path) => ({
      once: async () => {
        const val = path.split('/').reduce((n, k) => (n == null ? undefined : n[k]), store);
        return { exists: () => val !== undefined && val !== null, val: () => val };
      },
    }),
  };
}

describe('assertLocationAccess', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('denies when the caller has no access to the location', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(false);
    const db = fakeDb({ subscriptions: { u1: { features: { purchaseOrders: true } } } });
    await expect(assertLocationAccess(db, 'loc1', 'u1')).resolves.toBe(false);
  });

  it('denies an entitled-but-unauthorised caller — access is checked FIRST', async () => {
    const spy = vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(false);
    const db = fakeDb({ subscriptions: { u1: { features: { purchaseOrders: true } } } });
    await assertLocationAccess(db, 'loc1', 'u1');
    expect(spy).toHaveBeenCalledWith('loc1', 'u1');
  });

  it('denies when the caller lacks the purchaseOrders feature', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(true);
    const db = fakeDb({ subscriptions: { u1: { features: { foodCost: true } } } });
    await expect(assertLocationAccess(db, 'loc1', 'u1')).resolves.toBe(false);
  });

  it('denies when the caller has no features node at all', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(true);
    await expect(assertLocationAccess(fakeDb({}), 'loc1', 'u1')).resolves.toBe(false);
  });

  it('allows an entitled caller with access', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(true);
    const db = fakeDb({ subscriptions: { u1: { features: { purchaseOrders: true } } } });
    await expect(assertLocationAccess(db, 'loc1', 'u1')).resolves.toBe(true);
  });

  it('bypasses the entitlement check for an admin, but NOT the access check', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(true);
    const db = fakeDb({ admins: { a1: true } });
    await expect(assertLocationAccess(db, 'loc1', 'a1')).resolves.toBe(true);

    tools.callerHasLocationAccess.mockResolvedValue(false);
    await expect(assertLocationAccess(db, 'loc1', 'a1')).resolves.toBe(false);
  });

  // `purchaseOrders: true` is the ONLY passing value. RTDB happily stores the
  // string "false", and a truthiness check would read that as entitled.
  it('requires the feature to be boolean true, not merely truthy', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(true);
    for (const v of ['true', 'false', 1, {}, 'yes']) {
      const db = fakeDb({ subscriptions: { u1: { features: { purchaseOrders: v } } } });
      await expect(assertLocationAccess(db, 'loc1', 'u1')).resolves.toBe(false);
    }
  });

  // The gate is the security boundary for every poCatalog action. A read that
  // throws must deny, never fall through to an allow.
  it('denies when the entitlement read throws', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(true);
    const db = {
      ref: () => ({ once: async () => { throw new Error('rtdb unavailable'); } }),
    };
    await expect(assertLocationAccess(db, 'loc1', 'u1')).resolves.toBe(false);
  });

  it('denies when the access check itself throws', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockRejectedValue(new Error('boom'));
    const db = fakeDb({ subscriptions: { u1: { features: { purchaseOrders: true } } } });
    await expect(assertLocationAccess(db, 'loc1', 'u1')).resolves.toBe(false);
  });
});
