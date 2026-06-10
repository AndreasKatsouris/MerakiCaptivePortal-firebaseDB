import { describe, it, expect, vi, afterEach } from 'vitest';
const client = require('../paystack-client');

afterEach(() => client.__setFetchForTests(null));

describe('paystack-client seam', () => {
    it('initializeTransaction posts amount+metadata and returns the auth url', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: true, data: { authorization_url: 'https://paystack/x', reference: 'ref_1' } }),
        });
        client.__setFetchForTests(fetchSpy);
        const out = await client.initializeTransaction({
            secret: 'sk_test', email: 'a@b.c', amountZarCents: 36000, metadata: { uid: 'u1', bundleId: 'usd20' },
        });
        expect(out).toEqual({ authorizationUrl: 'https://paystack/x', reference: 'ref_1' });
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://api.paystack.co/transaction/initialize');
        const body = JSON.parse(opts.body);
        expect(body).toMatchObject({ email: 'a@b.c', amount: 36000, currency: 'ZAR', metadata: { uid: 'u1', bundleId: 'usd20' } });
        expect(opts.headers.Authorization).toBe('Bearer sk_test');
    });

    it('throws when Paystack returns status:false', async () => {
        client.__setFetchForTests(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: false, message: 'bad' }) }));
        await expect(client.initializeTransaction({ secret: 's', email: 'a@b.c', amountZarCents: 1, metadata: {} }))
            .rejects.toThrow('Paystack initialize failed');
    });

    it('verifyTransaction GETs by reference and returns the data envelope', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: true, data: { status: 'success', amount: 36000, currency: 'ZAR', reference: 'ref_1' } }),
        });
        client.__setFetchForTests(fetchSpy);
        const data = await client.verifyTransaction({ secret: 'sk_test', reference: 'ref_1' });
        expect(data).toMatchObject({ status: 'success', amount: 36000 });
        const [url, opts] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://api.paystack.co/transaction/verify/ref_1');
        expect(opts.headers.Authorization).toBe('Bearer sk_test');
    });
});
