'use strict';

/**
 * Twilio delivery-status callback receiver.
 *
 * Why this exists: a successful `client.messages.create(...)` means Twilio
 * ACCEPTED the message, not that WhatsApp DELIVERED it. The two diverge exactly
 * where it hurts most — a business-initiated message sent outside the 24-hour
 * customer-service window is accepted, returns a sid, and is then silently
 * dropped. Without a status callback that failure leaves no trace anywhere:
 * the send log says success and the guest gets nothing.
 *
 * This endpoint closes that loop. Twilio POSTs each status transition here and
 * terminal failures are logged at ERROR severity so they are alertable.
 *
 * Log-only by design — no RTDB write. Persisting delivery status would mean a
 * new node holding guest phone numbers plus the security-rules change that
 * implies; Cloud Logging is where alerting happens anyway.
 *
 * SECURITY — every field below is attacker-controlled until proven otherwise.
 * The endpoint is publicly reachable and its whole product value is a log line
 * an operator will alert on, which makes that log line a target: an unsanitized
 * newline inside `MessageSid` splits the entry on Cloud Run and lets an
 * anonymous caller emit a byte-perfect forged `WHATSAPP_DELIVERY_FAILED`
 * record, or bury real ones under volume. So each field is charset- and
 * length-restricted before it is interpolated, and the signature check here
 * defaults to ENFORCE rather than inheriting the inbound webhook's monitor
 * default — failing closed is nearly free on a brand-new log-only endpoint
 * with no legitimate traffic to protect.
 */

const { evaluateTwilioRequest } = require('./utils/twilio-signature');
// safeToken lives in utils/log-safe.js so receiptImageAccess.js (and any future
// log-emitting surface) shares this implementation instead of copying it.
// Still re-exported below — this module's public surface is unchanged.
const { safeToken } = require('./utils/log-safe');

/**
 * Twilio's terminal failure states. `undelivered` is where the outside-the-window
 * drop surfaces (commonly with ErrorCode 63016); `failed` covers send-side errors.
 */
const FAILED_STATUSES = new Set(['failed', 'undelivered']);

/** Every status Twilio documents for a message resource. Anything else is rejected. */
const KNOWN_STATUSES = new Set([
    'accepted', 'queued', 'sending', 'sent', 'receiving', 'received',
    'delivered', 'read', 'undelivered', 'failed', 'canceled', 'scheduled',
]);

const SID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ERROR_CODE_RE = /^[0-9]{1,10}$/;

/** Mask a recipient for logs, tolerating the `whatsapp:` prefix Twilio sends. */
function maskPhone(v) {
    if (v === null || v === undefined || typeof v === 'object') return '***';
    const bare = String(v).replace(/^whatsapp:/i, '');
    if (!/^\+?[0-9]{4,20}$/.test(bare)) return '***';
    return `${bare.slice(0, 4)}***`;
}

/** Candidate URLs Twilio may have signed, space separated (valid-if-any). */
function signatureUrls(env = process.env) {
    return [env.TWILIO_STATUS_CALLBACK_URL, env.TWILIO_WEBHOOK_URL]
        .filter(Boolean)
        .join(' ');
}

/**
 * Signature mode for THIS endpoint. Defaults to `enforce` — unlike the inbound
 * webhook, there is no pre-existing live traffic that a strict check could
 * dark-out. `TWILIO_STATUS_SIGNATURE_MODE` overrides (monitor/off) if a rollout
 * ever needs it; it deliberately does NOT inherit `TWILIO_SIGNATURE_MODE`,
 * so enforcing here never forces enforcing on the inbound webhook.
 */
function statusSignatureEnv(env = process.env) {
    const override = String(env.TWILIO_STATUS_SIGNATURE_MODE || '').trim().toLowerCase();
    return { ...env, TWILIO_SIGNATURE_MODE: override || 'enforce' };
}

/**
 * Plain (req, res) handler — exported unwrapped so it is directly unit-testable
 * (2026-06-10 LESSON: v2 onRequest handlers test fine as plain functions).
 */
async function whatsappStatusCallback(req, res) {
    if (!req || req.method !== 'POST') {
        return res.status(405).send('Method not allowed');
    }

    const check = evaluateTwilioRequest(req, {
        webhookUrl: signatureUrls(),
        env: statusSignatureEnv(),
    });
    if (!check.allow) {
        return res.status(check.rejection.status).send(check.rejection.body);
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};

    const rawStatus = (typeof body.MessageStatus === 'object' || typeof body.SmsStatus === 'object')
        ? ''
        : String(body.MessageStatus || body.SmsStatus || '').toLowerCase();
    const status = KNOWN_STATUSES.has(rawStatus) ? rawStatus : 'invalid';

    // PII-free and injection-free: whitelisted tokens only, recipient masked.
    const summary =
        `sid=${safeToken(body.MessageSid, SID_RE)} status=${status} ` +
        `errorCode=${safeToken(body.ErrorCode, ERROR_CODE_RE, 'none')} to=${maskPhone(body.To)}`;

    if (FAILED_STATUSES.has(status)) {
        console.error(`❌ WHATSAPP_DELIVERY_FAILED ${summary}`);
    } else {
        console.log(`📬 WHATSAPP_DELIVERY ${summary}`);
    }

    // Always 2xx once accepted: Twilio retries non-2xx, and retrying a log-only
    // endpoint buys nothing while multiplying noise.
    return res.status(204).send('');
}

module.exports = {
    whatsappStatusCallback,
    FAILED_STATUSES,
    KNOWN_STATUSES,
    signatureUrls,
    statusSignatureEnv,
    safeToken,
    maskPhone,
};
