import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ref, set, push } from '../../../config/firebase-config.js';
import { createLocation } from '../services/location-service.js';

/**
 * Guard for the 2026-07-21 location-creation bug.
 *
 * `database.rules.json` `locations/$locationId` validates:
 *   "auth.token.admin === true || newData.child('ownerId').val() === auth.uid"
 *
 * A client create that omits `ownerId` is REJECTED for every non-admin caller.
 * That shipped in PR #100 (2026-05-31) and went unnoticed for ~7 weeks because
 * onboarding-wizard.js DOES write ownerId, admins bypass via the token clause,
 * and the only user-visible signal was a generic "Error saving location" toast.
 *
 * These tests pin the payload contract so the field can't silently drop again.
 */
describe('createLocation — RTDB .validate contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ref).mockImplementation((_db, path) => path);
    vi.mocked(push).mockReturnValue({ key: 'LOC_NEW' });
    vi.mocked(set).mockResolvedValue(undefined);
  });

  test('writes ownerId matching the caller uid (required by database.rules.json:49)', async () => {
    await createLocation('uid-123', { name: 'Tannie\'s Kitchen' });

    const locationWrite = vi.mocked(set).mock.calls.find(([target]) => target?.key === 'LOC_NEW');
    expect(locationWrite, 'expected a set() on the pushed location ref').toBeDefined();

    const payload = locationWrite[1];
    expect(payload.ownerId).toBe('uid-123');
  });

  test('keeps userId/createdBy alongside ownerId (existing readers depend on them)', async () => {
    await createLocation('uid-123', { name: 'Tannie\'s Kitchen' });

    const payload = vi.mocked(set).mock.calls.find(([t]) => t?.key === 'LOC_NEW')[1];
    expect(payload.userId).toBe('uid-123');
    expect(payload.createdBy).toBe('uid-123');
    expect(payload.status).toBe('active');
  });

  test('caller-supplied ownerId cannot override the authenticated uid', async () => {
    await createLocation('uid-123', { name: 'Evil', ownerId: 'victim-uid' });

    const payload = vi.mocked(set).mock.calls.find(([t]) => t?.key === 'LOC_NEW')[1];
    expect(payload.ownerId).toBe('uid-123');
  });

  test('registers the location in userLocations for the caller', async () => {
    await createLocation('uid-123', { name: 'Tannie\'s Kitchen' });

    const indexWrite = vi.mocked(set).mock.calls.find(([t]) => t === 'userLocations/uid-123/LOC_NEW');
    expect(indexWrite, 'expected the userLocations index write').toBeDefined();
    expect(indexWrite[1]).toBe(true);
  });

  test('returns the created location including its id and ownerId', async () => {
    const result = await createLocation('uid-123', { name: 'Tannie\'s Kitchen' });

    expect(result.id).toBe('LOC_NEW');
    expect(result.ownerId).toBe('uid-123');
    expect(result.name).toBe('Tannie\'s Kitchen');
  });
});
