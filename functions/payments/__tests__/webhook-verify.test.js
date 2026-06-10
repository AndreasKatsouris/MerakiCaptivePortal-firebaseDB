import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
const { verifyPaystackSignature } = require('../webhook-verify');

const SECRET = 'sk_test_example';
const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_1' } });
const validSig = crypto.createHmac('sha512', SECRET).update(rawBody).digest('hex');

describe('verifyPaystackSignature', () => {
    it('accepts a correctly signed body', () => {
        expect(verifyPaystackSignature(rawBody, validSig, SECRET)).toBe(true);
    });
    it('rejects a tampered body', () => {
        expect(verifyPaystackSignature(rawBody + 'x', validSig, SECRET)).toBe(false);
    });
    it('rejects a wrong secret', () => {
        expect(verifyPaystackSignature(rawBody, validSig, 'sk_test_wrong')).toBe(false);
    });
    it('rejects a missing/empty signature', () => {
        expect(verifyPaystackSignature(rawBody, '', SECRET)).toBe(false);
        expect(verifyPaystackSignature(rawBody, undefined, SECRET)).toBe(false);
    });
});
