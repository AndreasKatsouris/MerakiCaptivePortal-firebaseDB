import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// Smoke tests for the UNAUTHENTICATED webhook handler — the internet-facing surface.
// The secret must be in the env BEFORE the module (and its defineSecret) is loaded.
const SECRET = 'sk_test_example';
process.env.PAYSTACK_SECRET_KEY = SECRET;

const { makeFakeRtdb } = require('./helpers/fake-rtdb');
const cf = require('../cloud-functions');
const ledger = require('../../billing/ledger');

const TREE = () => ({ billing: { creditBundles: {
    usd20: { usdGrantCents: 2000, zarChargeCents: 36000, label: '$20 credit', active: true },
} } });

function sign(raw) {
    return crypto.createHmac('sha512', SECRET).update(raw).digest('hex');
}

function makeReq({ method = 'POST', event, sig } = {}) {
    const raw = JSON.stringify(event || {});
    return {
        method,
        rawBody: Buffer.from(raw),
        body: event,
        get: (h) => (h.toLowerCase() === 'x-paystack-signature' ? (sig !== undefined ? sig : sign(raw)) : undefined),
    };
}

function makeRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

describe('paystackWebhook handler', () => {
    let db;
    beforeEach(() => {
        db = makeFakeRtdb(TREE());
        cf.__setDbForTests(db);
        ledger.__setDbForTests(db);
    });

    it('rejects non-POST with 405', async () => {
        const res = makeRes();
        await cf.paystackWebhook(makeReq({ method: 'GET', event: {} }), res);
        expect(res.statusCode).toBe(405);
    });

    it('rejects a bad signature with 401 and writes nothing', async () => {
        const event = { event: 'charge.success', data: { reference: 'ref_w1', amount: 36000, currency: 'ZAR', status: 'success', metadata: { uid: 'u1', bundleId: 'usd20' } } };
        const res = makeRes();
        await cf.paystackWebhook(makeReq({ event, sig: 'deadbeef' }), res);
        expect(res.statusCode).toBe(401);
        expect((await db.ref('billing/paymentEvents/ref_w1').once('value')).exists()).toBe(false);
    });

    it('grants on a correctly signed charge.success and returns 200', async () => {
        const event = { event: 'charge.success', data: { reference: 'ref_w2', amount: 36000, currency: 'ZAR', status: 'success', metadata: { uid: 'u1', bundleId: 'usd20' } } };
        const res = makeRes();
        await cf.paystackWebhook(makeReq({ event }), res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ received: true });
        const rec = (await db.ref('billing/paymentEvents/ref_w2').once('value')).val();
        expect(rec).toMatchObject({ uid: 'u1', bundleId: 'usd20', status: 'granted', usdGrantCents: 2000 });
        const bal = (await db.ref('billing/credits/u1/balanceCents').once('value')).val();
        expect(bal).toBe(2000);
    });

    it('acks a verified non-charge.success event with 200 and writes nothing', async () => {
        const event = { event: 'charge.dispute.create', data: { reference: 'ref_w3' } };
        const res = makeRes();
        await cf.paystackWebhook(makeReq({ event }), res);
        expect(res.statusCode).toBe(200);
        expect((await db.ref('billing/paymentEvents/ref_w3').once('value')).exists()).toBe(false);
    });
});
