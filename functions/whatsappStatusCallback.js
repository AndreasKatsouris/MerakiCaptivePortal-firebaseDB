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
 * implies; Cloud Logging is where alerting happens anyway. Persistence can be a
 * follow-up with its own rules review.
 *
 * Signature verification reuses the CRIT-07 helper and honours the same
 * TWILIO_SIGNATURE_MODE staging (monitor → enforce). Because gen2 strips the
 * function-name path from `req.originalUrl`, the signed URL cannot be
 * reconstructed — it must be configured. Both the status-callback URL and the
 * inbound webhook URL are offered as candidates (valid-if-any; accepting extra
 * candidates is safe because forging still requires the auth token).
 */

const { evaluateTwilioRequest } = require('./utils/twilio-signature');

/**
 * Twilio's terminal failure states. `undelivered` is where the outside-the-window
 * drop surfaces (commonly with ErrorCode 63016); `failed` covers send-side errors.
 */
const FAILED_STATUSES = new Set(['failed', 'undelivered']);

function maskPhone(v) {
    return `${String(v || '').slice(0, 4)}***`;
}

/** Candidate URLs Twilio may have signed, newline/space separated (valid-if-any). */
function signatureUrls(env = process.env) {
    return [env.TWILIO_STATUS_CALLBACK_URL, env.TWILIO_WEBHOOK_URL]
        .filter(Boolean)
        .join(' ');
}

/**
 * Plain (req, res) handler — exported unwrapped so it is directly unit-testable
 * (2026-06-10 LESSON: v2 onRequest handlers test fine as plain functions).
 */
async function whatsappStatusCallback(req, res) {
    if (!req || req.method !== 'POST') {
        return res.status(405).send('Method not allowed');
    }

    const check = evaluateTwilioRequest(req, { webhookUrl: signatureUrls() });
    if (!check.allow) {
        return res.status(check.rejection.status).send(check.rejection.body);
    }

    const body = req.body || {};
    const status = String(body.MessageStatus || body.SmsStatus || '').toLowerCase();

    // PII-free: sid + status + error code only, recipient masked.
    const summary =
        `sid=${body.MessageSid || 'unknown'} status=${status || 'unknown'} ` +
        `errorCode=${body.ErrorCode || 'none'} to=${maskPhone(body.To)}`;

    if (FAILED_STATUSES.has(status)) {
        console.error(`❌ WHATSAPP_DELIVERY_FAILED ${summary}`);
    } else {
        console.log(`📬 WHATSAPP_DELIVERY ${summary}`);
    }

    // Always 2xx once accepted: Twilio retries non-2xx, and retrying a log-only
    // endpoint buys nothing while multiplying noise.
    return res.status(204).send('');
}

module.exports = { whatsappStatusCallback, FAILED_STATUSES, signatureUrls };
