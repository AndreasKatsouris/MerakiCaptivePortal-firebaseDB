'use strict';

/**
 * W2 proactive nudge — WhatsApp channel adapter.
 * Owns everything WhatsApp-specific: the template type and the payload→
 * contentVariables mapping. utils/whatsappClient is heavy at load (Twilio
 * client from env) → lazy-required behind a test seam.
 *
 * Template `ross_daily_digest` (4 vars; body carries the fixed URL prefix
 * and the "— Ross" sign-off — a template body may not END with a variable):
 *   Morning {{1}} — {{2}}: {{3}}. Tap to sort the most urgent:
 *   https://merakicaptiveportal-firebasedb.web.app/ross.html?{{4}} — Ross
 */

const ROSS_DAILY_DIGEST = 'ross_daily_digest';

let _sender = null;
function getSender() {
    if (!_sender) {
        ({ sendWhatsAppTemplate: _sender } = require('../../../utils/whatsappClient'));
    }
    return _sender;
}
/** Test-only: inject a fake sendWhatsAppTemplate (null restores lazy real one). */
function __setSenderForTests(fn) { _sender = fn; }

/**
 * @param {{uid:string, phone:string}} owner
 * @param {{name:string, countPhrase:string, findingsLine:string, linkQuery:string}} payload
 * @returns {Promise<{ok:true, messageSid:string|null}>}
 */
async function deliver(owner, payload) {
    const vars = {
        1: payload.name,
        2: payload.countPhrase,
        3: payload.findingsLine,
        4: payload.linkQuery,
    };
    const message = await getSender()(owner.phone, ROSS_DAILY_DIGEST, vars);
    return { ok: true, messageSid: (message && message.sid) || null };
}

module.exports = { deliver, __setSenderForTests, ROSS_DAILY_DIGEST };
