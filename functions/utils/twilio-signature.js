'use strict';

/**
 * CRIT-07 — Twilio webhook request authenticity.
 *
 * The WhatsApp webhook (`receiveWhatsAppMessageEnhanced`) previously only checked
 * that From/To were present, so any party who knew the URL could POST a forged
 * guest message and trigger voucher redemption, queue ops, or data deletion.
 *
 * Twilio signs every webhook request with the account auth token: HMAC-SHA1 over
 * (full URL + the POST params sorted by key and concatenated), base64-encoded,
 * delivered in the `X-Twilio-Signature` header. We verify it via the official
 * `twilio.validateRequest` (constant-time compare lives inside the SDK).
 *
 * Rollout is staged via TWILIO_SIGNATURE_MODE so we don't risk a live-bot outage
 * if URL reconstruction doesn't match the URL configured in the Twilio console:
 *   - `monitor` (DEFAULT): validate + log match/mismatch, but still process the
 *     request. Lets us confirm in logs that real traffic validates before we bite.
 *   - `enforce`: reject (403) on invalid/missing signature. The target end-state.
 *   - `off`: skip entirely (escape hatch if the check itself misbehaves).
 * Default is `monitor` so an unset env can never hard-break the live channel; the
 * not-enforced path logs a loud warning so the gap can't be silently forgotten.
 */
const twilio = require('twilio');

const SIGNATURE_MODES = Object.freeze({
  ENFORCE: 'enforce',
  MONITOR: 'monitor',
  OFF: 'off',
});

/**
 * Resolve the enforcement mode from the environment. Unset / blank / unrecognized
 * all fall back to MONITOR (safe rollout default).
 * @param {object} [env=process.env]
 * @returns {string} one of SIGNATURE_MODES
 */
function getSignatureMode(env = process.env) {
  const raw = String((env && env.TWILIO_SIGNATURE_MODE) || '').trim().toLowerCase();
  if (raw === SIGNATURE_MODES.ENFORCE) return SIGNATURE_MODES.ENFORCE;
  if (raw === SIGNATURE_MODES.OFF) return SIGNATURE_MODES.OFF;
  return SIGNATURE_MODES.MONITOR;
}

/**
 * Reconstruct the absolute https URL Twilio signed. Honours `x-forwarded-host`
 * (set by Firebase Hosting rewrites / proxies) so the reconstructed URL matches
 * the public URL Twilio actually called.
 * @param {object} req
 * @returns {string}
 */
function reconstructUrl(req) {
  const headers = (req && req.headers) || {};
  // x-forwarded-host can be a comma-list under chained proxies — take the first.
  const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
  const path = (req && (req.originalUrl || req.url)) || '';
  return `https://${host}${path}`;
}

/**
 * Verify the X-Twilio-Signature header against the request. Never throws.
 * @param {object} req
 * @param {object} [opts]
 * @param {string} [opts.authToken=process.env.TWILIO_TOKEN]
 * @param {function} [opts.validate=twilio.validateRequest] seam for testing
 * @returns {{valid:boolean, hasSignature:boolean, hasToken:boolean, url:string}}
 */
function verifyTwilioSignature(req, opts = {}) {
  const authToken = opts.authToken !== undefined ? opts.authToken : process.env.TWILIO_TOKEN;
  const validate = opts.validate || twilio.validateRequest;

  const signature = req && req.headers && req.headers['x-twilio-signature'];
  const url = reconstructUrl(req);
  const hasSignature = typeof signature === 'string' && signature.length > 0;
  const hasToken = typeof authToken === 'string' && authToken.length > 0;

  if (!hasSignature || !hasToken) {
    return { valid: false, hasSignature, hasToken, url };
  }

  let valid = false;
  try {
    valid = validate(authToken, signature, url, (req && req.body) || {}) === true;
  } catch (err) {
    // POPIA: log only an error code/name, never the payload.
    console.error('Twilio signature validation error:', (err && (err.code || err.name)) || 'error');
    valid = false;
  }
  return { valid, hasSignature, hasToken, url };
}

/**
 * Gate a webhook request per the configured mode. Logs a PII-free summary so the
 * monitor-mode soak is observable.
 * @param {object} req
 * @param {object} [opts] forwarded to verifyTwilioSignature; opts.env for the mode
 * @returns {{allow:boolean, mode:string, valid:(boolean|null), rejection?:{status:number, body:string}}}
 */
function evaluateTwilioRequest(req, opts = {}) {
  const mode = getSignatureMode(opts.env || process.env);

  if (mode === SIGNATURE_MODES.OFF) {
    console.warn('🔐 Twilio signature check OFF (TWILIO_SIGNATURE_MODE=off) — request allowed unverified.');
    return { allow: true, mode, valid: null };
  }

  const { valid, hasSignature, hasToken, url } = verifyTwilioSignature(req, opts);

  // PII-free observability signal (no From/Body/MediaUrl).
  const summary = { mode, valid, hasSignature, hasToken, url, messageSid: req && req.body && req.body.MessageSid };
  if (valid) {
    console.log('🔐 Twilio signature OK', summary);
  } else {
    console.warn('🔐 Twilio signature INVALID', summary);
  }

  if (mode === SIGNATURE_MODES.ENFORCE && !valid) {
    return { allow: false, mode, valid, rejection: { status: 403, body: 'Invalid Twilio signature.' } };
  }

  if (!valid) {
    console.warn(
      `⚠️ Twilio signature NOT ENFORCED (mode=${mode}) — request processed despite invalid/missing signature. ` +
      'Set TWILIO_SIGNATURE_MODE=enforce once the soak confirms real traffic validates.'
    );
  }
  return { allow: true, mode, valid };
}

module.exports = {
  SIGNATURE_MODES,
  getSignatureMode,
  reconstructUrl,
  verifyTwilioSignature,
  evaluateTwilioRequest,
};
