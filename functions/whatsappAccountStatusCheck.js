'use strict';

/**
 * Twilio account-dormancy monitor.
 *
 * Why this exists: on 2026-07-23 the Twilio account went dormant and nothing
 * alerted anywhere. That failure mode is invisible to both existing signals —
 * the per-message delivery-status callback (#194, `whatsappStatusCallback.js`)
 * only fires for messages Twilio actually accepted, and a dormant/suspended
 * account can still make outbound calls fail in ways that read as ordinary
 * send errors in the CF logs. This closes the gap directly: a daily check of
 * the ACCOUNT resource's own `status` field, independent of whether any
 * message was sent that day at all.
 *
 * Log-only by design, same rationale as whatsappStatusCallback.js — no RTDB
 * write, no new security-rules surface; Cloud Logging is where alerting
 * happens. Does not touch Twilio credentials beyond the existing
 * TWILIO_SID/TWILIO_TOKEN env vars already used by twilioClient.js.
 *
 * Bug-triage queue card Q9 (2026-07-23 dormancy incident, "Groomer: card this").
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const twilio = require('twilio');

/** Twilio's documented account statuses (AccountStatus: "active" | "suspended" | "closed"). */
const ACTIVE_STATUS = 'active';

// Client seam mirrors utils/whatsappClient.js's getClient()/__setClientForTests —
// built fresh (not imported) so this module never drags in the messaging-template
// machinery it has no use for.
let _clientOverride = null;
function getClient() {
    if (_clientOverride) return _clientOverride;
    const accountSid = process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_TOKEN;
    if (!accountSid || !authToken) return null;
    return twilio(accountSid, authToken);
}
/** Test-only: inject a fake Twilio client (null restores the real one). */
function __setClientForTests(fake) {
    _clientOverride = fake;
}

/**
 * Fetch the account resource and log at ERROR severity when it isn't active
 * (including when the fetch itself fails — an unreachable/unauthenticated
 * account is exactly the kind of dormancy this exists to catch). Exported
 * unwrapped from the scheduled trigger so it is directly unit-testable
 * (2026-06-10 LESSON: v2 onRequest/onSchedule handlers test fine as plain
 * functions).
 */
async function checkAccountStatus() {
    const client = getClient();
    const accountSid = process.env.TWILIO_SID;
    if (!client || !accountSid) {
        console.warn('⚠️ WHATSAPP_ACCOUNT_STATUS_CHECK skipped — Twilio credentials not configured');
        return { checked: false, status: null };
    }

    let status;
    try {
        const account = await client.api.v2010.accounts(accountSid).fetch();
        status = account && account.status;
    } catch (error) {
        console.error(`❌ WHATSAPP_ACCOUNT_DORMANT fetch_failed=${(error && error.code) || 'unknown'}`);
        return { checked: true, status: null, error: true };
    }

    if (status !== ACTIVE_STATUS) {
        console.error(`❌ WHATSAPP_ACCOUNT_DORMANT status=${status || 'unknown'}`);
    } else {
        console.log(`✅ WHATSAPP_ACCOUNT_STATUS status=${status}`);
    }

    return { checked: true, status };
}

// Daily at 04:00 UTC (06:00 SAST) — off-peak, staggered from rossAgentPrune (03:30 UTC)
// and rossRecurrenceAdvance (03:00 SAST / 01:00 UTC).
const whatsappAccountStatusCheck = onSchedule('0 4 * * *', async () => {
    await checkAccountStatus();
});

module.exports = {
    whatsappAccountStatusCheck,
    checkAccountStatus,
    __setClientForTests,
    ACTIVE_STATUS,
};
