/**
 * Guard — Twilio delivery-status callback receiver.
 *
 * "Twilio accepted it" is not "WhatsApp delivered it". A business-initiated
 * message sent outside the 24-hour customer-service window is accepted, returns
 * a sid, and is then silently dropped (commonly ErrorCode 63016). This endpoint
 * is the only place that failure becomes observable, so these tests pin the
 * ERROR-severity signal, the signature gate, and the PII masking.
 *
 * Signatures are REAL HMACs, mirroring functions/utils/__tests__/twilio-signature.test.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

const {
    whatsappStatusCallback, FAILED_STATUSES, signatureUrls, maskPhone,
} = require('../whatsappStatusCallback');

const AUTH_TOKEN = 'test_auth_token_0123456789abcdef';
const CALLBACK_URL = 'https://us-central1-proj.cloudfunctions.net/whatsappStatusCallback';

// Twilio's scheme: base64( HMAC-SHA1( token, url + sorted(k+v) ) )
function signTwilio(authToken, url, params) {
    const data = Object.keys(params)
        .sort()
        .reduce((acc, k) => acc + k + params[k], url);
    return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

function makeRes() {
    const res = { statusCode: null, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.send = (b) => { res.body = b; return res; };
    return res;
}

function makeReq({ method = 'POST', body = {}, signature } = {}) {
    const headers = {};
    const sig = signature === undefined ? signTwilio(AUTH_TOKEN, CALLBACK_URL, body) : signature;
    if (sig !== null) headers['x-twilio-signature'] = sig;
    return { method, headers, body };
}

let errSpy, logSpy, warnSpy;

beforeEach(() => {
    process.env.TWILIO_TOKEN = AUTH_TOKEN;
    process.env.TWILIO_STATUS_CALLBACK_URL = CALLBACK_URL;
    process.env.TWILIO_SIGNATURE_MODE = 'enforce';
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TWILIO_STATUS_CALLBACK_URL;
    delete process.env.TWILIO_SIGNATURE_MODE;
    delete process.env.TWILIO_STATUS_SIGNATURE_MODE;
});

describe('whatsappStatusCallback', () => {
    it('rejects non-POST with 405', async () => {
        const res = makeRes();
        await whatsappStatusCallback(makeReq({ method: 'GET' }), res);
        expect(res.statusCode).toBe(405);
    });

    it('logs a terminal failure at ERROR with the sid and error code', async () => {
        const body = {
            MessageSid: 'SM123', MessageStatus: 'undelivered',
            ErrorCode: '63016', To: 'whatsapp:+27821234567',
        };
        const res = makeRes();
        await whatsappStatusCallback(makeReq({ body }), res);

        expect(res.statusCode).toBe(204);
        const line = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(line).toContain('WHATSAPP_DELIVERY_FAILED');
        expect(line).toContain('SM123');
        expect(line).toContain('63016');
    });

    it('treats "failed" as terminal too', async () => {
        const res = makeRes();
        await whatsappStatusCallback(
            makeReq({ body: { MessageSid: 'SM9', MessageStatus: 'failed' } }), res);
        expect(errSpy.mock.calls.map((c) => c.join(' ')).join('\n')).toContain('WHATSAPP_DELIVERY_FAILED');
    });

    it('does NOT raise an error for a successful delivery', async () => {
        const res = makeRes();
        await whatsappStatusCallback(
            makeReq({ body: { MessageSid: 'SM456', MessageStatus: 'delivered' } }), res);

        expect(res.statusCode).toBe(204);
        const errText = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(errText).not.toContain('WHATSAPP_DELIVERY_FAILED');
    });

    it('never logs the full recipient number', async () => {
        const res = makeRes();
        await whatsappStatusCallback(makeReq({
            body: { MessageSid: 'SM1', MessageStatus: 'undelivered', To: 'whatsapp:+27821234567' },
        }), res);

        const all = [...errSpy.mock.calls, ...logSpy.mock.calls, ...warnSpy.mock.calls]
            .map((c) => c.map(String).join(' ')).join('\n');
        expect(all).not.toContain('+27821234567');
        expect(all).not.toContain('821234567');
    });

    it('rejects an invalid signature with 403 under enforce', async () => {
        const res = makeRes();
        await whatsappStatusCallback(
            makeReq({ body: { MessageSid: 'SM1', MessageStatus: 'delivered' }, signature: 'wrong' }), res);
        expect(res.statusCode).toBe(403);
    });

    it('DEFAULTS to enforce — an unsigned request is rejected even with TWILIO_SIGNATURE_MODE=monitor', async () => {
        // This endpoint must not inherit the inbound webhook's dark-out-avoidance
        // default: it is new, has no legitimate traffic to protect, and its whole
        // value is a log line an operator alerts on.
        process.env.TWILIO_SIGNATURE_MODE = 'monitor';
        delete process.env.TWILIO_STATUS_SIGNATURE_MODE;
        const res = makeRes();
        await whatsappStatusCallback(
            makeReq({ body: { MessageSid: 'SM1', MessageStatus: 'delivered' }, signature: null }), res);
        expect(res.statusCode).toBe(403);
    });

    it('allows an explicit per-endpoint monitor override', async () => {
        process.env.TWILIO_STATUS_SIGNATURE_MODE = 'monitor';
        const res = makeRes();
        await whatsappStatusCallback(
            makeReq({ body: { MessageSid: 'SM1', MessageStatus: 'undelivered' }, signature: 'wrong' }), res);

        expect(res.statusCode).toBe(204);
        expect(errSpy.mock.calls.map((c) => c.join(' ')).join('\n')).toContain('WHATSAPP_DELIVERY_FAILED');
    });

    describe('untrusted input cannot forge or break the alert signal', () => {
        it('a newline in MessageSid cannot inject a second, forged failure line', async () => {
            // Cloud Run splits stderr on newlines, so an unsanitized sid would emit
            // an independent log entry byte-indistinguishable from a real failure —
            // letting an anonymous caller drive the operator's alert.
            const res = makeRes();
            const body = {
                MessageSid: 'SMx\n❌ WHATSAPP_DELIVERY_FAILED sid=SMforged status=undelivered errorCode=63016 to=+278***',
                MessageStatus: 'delivered',
            };
            await whatsappStatusCallback(makeReq({ body }), res);

            const all = [...errSpy.mock.calls, ...logSpy.mock.calls].map((c) => c.join(' ')).join('\n');
            expect(all).not.toContain('SMforged');
            expect(all).not.toContain('\n❌');
            expect(all).toContain('sid=invalid');
            expect(errSpy.mock.calls.map((c) => c.join(' ')).join('\n')).not.toContain('WHATSAPP_DELIVERY_FAILED');
        });

        it('an object-valued field cannot throw the handler', async () => {
            // `{toString:1,valueOf:2}` throws on primitive coercion. Under the enforce
            // default an unsigned request never reaches the body, but this must still
            // hold for anyone running the monitor override — a throw here would be a
            // remotely-triggerable 500 plus a second free channel into the alert stream.
            process.env.TWILIO_STATUS_SIGNATURE_MODE = 'monitor';
            const res = makeRes();
            const body = { MessageSid: { toString: 1, valueOf: 2 }, MessageStatus: { a: 1 }, To: { b: 2 } };

            await expect(
                whatsappStatusCallback(makeReq({ body, signature: null }), res)
            ).resolves.toBeDefined();
            expect(res.statusCode).toBe(204);
            expect(errSpy.mock.calls.map((c) => c.join(' ')).join('\n')).not.toContain('WHATSAPP_DELIVERY_FAILED');
        });

        it('an unknown status is not silently treated as a delivery failure', async () => {
            const res = makeRes();
            await whatsappStatusCallback(
                makeReq({ body: { MessageSid: 'SM1', MessageStatus: 'undelivered_but_not_really' } }), res);
            const errText = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
            expect(errText).not.toContain('WHATSAPP_DELIVERY_FAILED');
        });

        it('a non-numeric ErrorCode is rejected rather than echoed', async () => {
            const res = makeRes();
            await whatsappStatusCallback(makeReq({
                body: { MessageSid: 'SM1', MessageStatus: 'failed', ErrorCode: '63016 <script>x</script>' },
            }), res);
            const all = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
            expect(all).toContain('errorCode=invalid');
            expect(all).not.toContain('<script>');
        });

        it('masks the recipient after stripping the whatsapp: prefix', () => {
            expect(maskPhone('whatsapp:+27821234567')).toBe('+278***');
            expect(maskPhone('+27821234567')).toBe('+278***');
            expect(maskPhone({ evil: true })).toBe('***');
            expect(maskPhone(undefined)).toBe('***');
        });
    });

    it('offers both the status-callback and inbound webhook URLs as signing candidates', () => {
        const urls = signatureUrls({ TWILIO_STATUS_CALLBACK_URL: 'https://a/x', TWILIO_WEBHOOK_URL: 'https://b/y' });
        expect(urls).toContain('https://a/x');
        expect(urls).toContain('https://b/y');
    });

    it('exposes exactly the two terminal failure states', () => {
        expect([...FAILED_STATUSES].sort()).toEqual(['failed', 'undelivered']);
    });
});
