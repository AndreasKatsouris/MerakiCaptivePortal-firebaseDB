/**
 * Guard — Twilio account-dormancy monitor (queue card Q9).
 *
 * On 2026-07-23 the Twilio account went dormant and nothing alerted — the
 * per-message delivery-status callback (#194) only fires for messages Twilio
 * accepted, so an account-level outage is invisible to it. These tests pin
 * the ERROR-severity signal on non-active status, on a failed fetch, and the
 * no-op when credentials aren't configured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
    checkAccountStatus, __setClientForTests, ACTIVE_STATUS,
} = require('../whatsappAccountStatusCheck');

function makeClient(fetchImpl) {
    return { api: { v2010: { accounts: () => ({ fetch: fetchImpl }) } } };
}

let errSpy, logSpy, warnSpy;

beforeEach(() => {
    process.env.TWILIO_SID = 'ACtest0000000000000000000000000';
    process.env.TWILIO_TOKEN = 'test_auth_token';
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    __setClientForTests(null);
    delete process.env.TWILIO_SID;
    delete process.env.TWILIO_TOKEN;
});

describe('checkAccountStatus', () => {
    it('active account → plain log, no error', async () => {
        __setClientForTests(makeClient(async () => ({ status: ACTIVE_STATUS })));

        const result = await checkAccountStatus();

        expect(result).toEqual({ checked: true, status: 'active' });
        expect(errSpy).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_ACCOUNT_STATUS status=active'));
    });

    it('suspended account → ERROR log, alertable', async () => {
        __setClientForTests(makeClient(async () => ({ status: 'suspended' })));

        const result = await checkAccountStatus();

        expect(result).toEqual({ checked: true, status: 'suspended' });
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_ACCOUNT_DORMANT status=suspended'));
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('closed account → ERROR log', async () => {
        __setClientForTests(makeClient(async () => ({ status: 'closed' })));

        const result = await checkAccountStatus();

        expect(result.status).toBe('closed');
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_ACCOUNT_DORMANT status=closed'));
    });

    it('fetch throws (account unreachable/unauthenticated) → ERROR log, does not throw', async () => {
        __setClientForTests(makeClient(async () => {
            const err = new Error('boom');
            err.code = 20003;
            throw err;
        }));

        const result = await expect(checkAccountStatus()).resolves.toEqual({
            checked: true, status: null, error: true,
        });

        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_ACCOUNT_DORMANT fetch_failed=20003'));
    });

    it('missing credentials → skips with a warning, never fetches', async () => {
        delete process.env.TWILIO_SID;
        const fetch = vi.fn(async () => ({ status: ACTIVE_STATUS }));
        __setClientForTests(makeClient(fetch)); // override present, but getClient() must bail on the missing SID first

        const result = await checkAccountStatus();

        expect(result).toEqual({ checked: false, status: null });
        expect(fetch).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_ACCOUNT_STATUS_CHECK skipped'));
        expect(errSpy).not.toHaveBeenCalled();
    });
});
