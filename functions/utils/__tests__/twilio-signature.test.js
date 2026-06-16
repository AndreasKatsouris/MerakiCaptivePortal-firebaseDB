/**
 * CRIT-07 guard — Twilio webhook signature validation.
 * Tests exercise the REAL `twilio.validateRequest` (HMAC-SHA1) by generating a
 * genuine X-Twilio-Signature with crypto, mirroring Twilio's documented scheme.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

const {
  SIGNATURE_MODES,
  getSignatureMode,
  reconstructUrl,
  verifyTwilioSignature,
  evaluateTwilioRequest,
} = require('../twilio-signature');

const AUTH_TOKEN = 'test_auth_token_0123456789abcdef';

// Replicate Twilio's signing algorithm: base64( HMAC-SHA1( token, url + sorted(k+v) ) )
function signTwilio(authToken, url, params) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

function makeReq({ host = 'us-central1-proj.cloudfunctions.net', path = '/receiveWhatsAppMessage', body = {}, signature, forwardedHost } = {}) {
  const headers = {};
  if (signature !== undefined) headers['x-twilio-signature'] = signature;
  if (forwardedHost) headers['x-forwarded-host'] = forwardedHost;
  if (host) headers.host = host;
  return { headers, originalUrl: path, url: path, body };
}

const VALID_BODY = { From: 'whatsapp:+27820001111', To: 'whatsapp:+27820009999', Body: 'hello', MessageSid: 'SM123' };

describe('getSignatureMode', () => {
  it('maps explicit values case-insensitively', () => {
    expect(getSignatureMode({ TWILIO_SIGNATURE_MODE: 'enforce' })).toBe(SIGNATURE_MODES.ENFORCE);
    expect(getSignatureMode({ TWILIO_SIGNATURE_MODE: 'ENFORCE' })).toBe(SIGNATURE_MODES.ENFORCE);
    expect(getSignatureMode({ TWILIO_SIGNATURE_MODE: 'off' })).toBe(SIGNATURE_MODES.OFF);
    expect(getSignatureMode({ TWILIO_SIGNATURE_MODE: 'monitor' })).toBe(SIGNATURE_MODES.MONITOR);
  });

  it('defaults to MONITOR for unset/blank/unrecognized values (safe rollout)', () => {
    expect(getSignatureMode({})).toBe(SIGNATURE_MODES.MONITOR);
    expect(getSignatureMode({ TWILIO_SIGNATURE_MODE: '' })).toBe(SIGNATURE_MODES.MONITOR);
    expect(getSignatureMode({ TWILIO_SIGNATURE_MODE: 'garbage' })).toBe(SIGNATURE_MODES.MONITOR);
  });
});

describe('reconstructUrl', () => {
  it('builds https URL from host + originalUrl', () => {
    expect(reconstructUrl(makeReq({ host: 'h.example.com', path: '/x' }))).toBe('https://h.example.com/x');
  });
  it('prefers x-forwarded-host (Hosting rewrite / proxy) over host', () => {
    expect(reconstructUrl(makeReq({ host: 'raw.cloudfunctions.net', path: '/x', forwardedHost: 'app.web.app' })))
      .toBe('https://app.web.app/x');
  });
});

describe('verifyTwilioSignature', () => {
  it('accepts a genuine Twilio signature', () => {
    const url = 'https://us-central1-proj.cloudfunctions.net/receiveWhatsAppMessage';
    const signature = signTwilio(AUTH_TOKEN, url, VALID_BODY);
    const req = makeReq({ body: VALID_BODY, signature });
    const out = verifyTwilioSignature(req, { authToken: AUTH_TOKEN });
    expect(out.valid).toBe(true);
    expect(out.hasSignature).toBe(true);
    expect(out.hasToken).toBe(true);
  });

  it('rejects a tampered body param', () => {
    const url = 'https://us-central1-proj.cloudfunctions.net/receiveWhatsAppMessage';
    const signature = signTwilio(AUTH_TOKEN, url, VALID_BODY);
    const req = makeReq({ body: { ...VALID_BODY, Body: 'TAMPERED' }, signature });
    expect(verifyTwilioSignature(req, { authToken: AUTH_TOKEN }).valid).toBe(false);
  });

  it('rejects when the URL (host) differs from what was signed', () => {
    const signedUrl = 'https://attacker.example.com/receiveWhatsAppMessage';
    const signature = signTwilio(AUTH_TOKEN, signedUrl, VALID_BODY);
    const req = makeReq({ body: VALID_BODY, signature }); // real host differs
    expect(verifyTwilioSignature(req, { authToken: AUTH_TOKEN }).valid).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const req = makeReq({ body: VALID_BODY });
    const out = verifyTwilioSignature(req, { authToken: AUTH_TOKEN });
    expect(out.valid).toBe(false);
    expect(out.hasSignature).toBe(false);
  });

  it('rejects when no auth token is configured', () => {
    const url = 'https://us-central1-proj.cloudfunctions.net/receiveWhatsAppMessage';
    const signature = signTwilio(AUTH_TOKEN, url, VALID_BODY);
    const req = makeReq({ body: VALID_BODY, signature });
    const out = verifyTwilioSignature(req, { authToken: '' });
    expect(out.valid).toBe(false);
    expect(out.hasToken).toBe(false);
  });

  it('returns valid:false (never throws) if the validator throws', () => {
    const req = makeReq({ body: VALID_BODY, signature: 'x' });
    const out = verifyTwilioSignature(req, {
      authToken: AUTH_TOKEN,
      validate: () => { throw new Error('boom'); },
    });
    expect(out.valid).toBe(false);
  });
});

describe('evaluateTwilioRequest', () => {
  let warnSpy, logSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const url = 'https://us-central1-proj.cloudfunctions.net/receiveWhatsAppMessage';

  it('ENFORCE + invalid → rejects with 403', () => {
    const req = makeReq({ body: VALID_BODY, signature: 'bad' });
    const out = evaluateTwilioRequest(req, { env: { TWILIO_SIGNATURE_MODE: 'enforce' }, authToken: AUTH_TOKEN });
    expect(out.allow).toBe(false);
    expect(out.rejection.status).toBe(403);
  });

  it('ENFORCE + no signature header → rejects 403 with a non-empty body (the forged-POST shape)', () => {
    const req = makeReq({ body: VALID_BODY }); // no x-twilio-signature at all
    const out = evaluateTwilioRequest(req, { env: { TWILIO_SIGNATURE_MODE: 'enforce' }, authToken: AUTH_TOKEN });
    expect(out.allow).toBe(false);
    expect(out.rejection.status).toBe(403);
    // Lock the contract the handler relies on (res.status(...).send(rejection.body)).
    expect(typeof out.rejection.body).toBe('string');
    expect(out.rejection.body.length).toBeGreaterThan(0);
  });

  it('reconstructUrl tolerates a comma-list x-forwarded-host (chained proxies)', () => {
    expect(reconstructUrl(makeReq({ host: 'raw.net', path: '/x', forwardedHost: 'app.web.app, internal.proxy' })))
      .toBe('https://app.web.app/x');
  });

  it('ENFORCE + valid → allows', () => {
    const signature = signTwilio(AUTH_TOKEN, url, VALID_BODY);
    const req = makeReq({ body: VALID_BODY, signature });
    const out = evaluateTwilioRequest(req, { env: { TWILIO_SIGNATURE_MODE: 'enforce' }, authToken: AUTH_TOKEN });
    expect(out.allow).toBe(true);
    expect(out.valid).toBe(true);
  });

  it('MONITOR + invalid → allows but flags not-enforced', () => {
    const req = makeReq({ body: VALID_BODY, signature: 'bad' });
    const out = evaluateTwilioRequest(req, { env: { TWILIO_SIGNATURE_MODE: 'monitor' }, authToken: AUTH_TOKEN });
    expect(out.allow).toBe(true);
    expect(out.valid).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('OFF → allows without validating', () => {
    const req = makeReq({ body: VALID_BODY, signature: 'bad' });
    const out = evaluateTwilioRequest(req, { env: { TWILIO_SIGNATURE_MODE: 'off' }, authToken: AUTH_TOKEN });
    expect(out.allow).toBe(true);
  });

  it('never logs guest PII (From/Body) in the summary', () => {
    const req = makeReq({ body: VALID_BODY, signature: 'bad' });
    evaluateTwilioRequest(req, { env: { TWILIO_SIGNATURE_MODE: 'monitor' }, authToken: AUTH_TOKEN });
    const allArgs = [...warnSpy.mock.calls, ...logSpy.mock.calls].flat();
    const serialized = JSON.stringify(allArgs);
    expect(serialized).not.toContain('whatsapp:+27820001111');
    expect(serialized).not.toContain('hello');
  });
});
