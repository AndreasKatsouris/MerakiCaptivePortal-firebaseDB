/**
 * Guard — template→freeform degradation on BUSINESS-INITIATED WhatsApp sends.
 *
 * WhatsApp delivers a freeform message only inside the 24-hour window a guest
 * opens by messaging us. Outside it, Twilio accepts the call and returns a sid,
 * then Meta silently drops the message. So when a template is unconfigured or
 * disabled, the old code's silent fallback produced an INVISIBLE outage — logs
 * said success, guests got nothing. Live example (2026-07-26): every
 * `booking_confirmation` took this path because the template had no ContentSid.
 *
 * These tests pin: the ERROR-severity signal, the default-strict classification,
 * the staged monitor→enforce rollout, and — most importantly — that an
 * enforce-mode refusal is NOT rescued by `options.fallbackMessage`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const wa = require('../whatsappClient');
const { TEMPLATE_TYPES } = require('../whatsappTemplates');

const PHONE = '+27821234567';
const VARS = { 1: 'Alice', 2: '2026-07-26', 3: '19:00', 4: 'Test Venue', 5: '2' };

let sent, errSpy, logSpy, warnSpy;

beforeEach(() => {
    sent = [];
    wa.__setClientForTests({
        messages: { create: async (params) => { sent.push(params); return { sid: 'SMfake' }; } },
    });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.WHATSAPP_TEMPLATE_FALLBACK_MODE;
    delete process.env.TWILIO_STATUS_CALLBACK_URL;
});

afterEach(() => {
    wa.__setClientForTests(null);
    vi.restoreAllMocks();
    delete process.env.WHATSAPP_TEMPLATE_FALLBACK_MODE;
    delete process.env.TWILIO_STATUS_CALLBACK_URL;
});

describe('business-initiated classification', () => {
    it('treats receipt confirmation as session-initiated (a reply inside the guest window)', () => {
        expect(wa.isBusinessInitiated(TEMPLATE_TYPES.RECEIPT_CONFIRMATION)).toBe(false);
    });

    it('treats the booking templates as business-initiated', () => {
        expect(wa.isBusinessInitiated(TEMPLATE_TYPES.BOOKING_CONFIRMATION)).toBe(true);
        expect(wa.isBusinessInitiated(TEMPLATE_TYPES.BOOKING_REMINDER)).toBe(true);
        expect(wa.isBusinessInitiated(TEMPLATE_TYPES.BOOKING_STATUS_UPDATE)).toBe(true);
    });

    it('defaults an UNKNOWN/newly-added template to business-initiated (default-strict)', () => {
        expect(wa.isBusinessInitiated('some_template_added_next_year')).toBe(true);
    });
});

describe('fallback mode', () => {
    it('defaults to monitor so an unset env can never dark-out a live channel', () => {
        expect(wa.getFallbackMode({})).toBe(wa.FALLBACK_MODES.MONITOR);
        expect(wa.getFallbackMode({ WHATSAPP_TEMPLATE_FALLBACK_MODE: 'nonsense' })).toBe(wa.FALLBACK_MODES.MONITOR);
    });

    it('honours enforce, case- and whitespace-insensitively', () => {
        expect(wa.getFallbackMode({ WHATSAPP_TEMPLATE_FALLBACK_MODE: '  ENFORCE ' })).toBe(wa.FALLBACK_MODES.ENFORCE);
    });
});

describe('status callback wiring', () => {
    it('omits statusCallback when no URL is configured', () => {
        expect(wa.statusCallbackParams({})).toEqual({});
    });

    it('attaches statusCallback when configured', () => {
        expect(wa.statusCallbackParams({ TWILIO_STATUS_CALLBACK_URL: 'https://x/cb' }))
            .toEqual({ statusCallback: 'https://x/cb' });
    });

    it('includes the callback on an actually-sent message', async () => {
        process.env.TWILIO_STATUS_CALLBACK_URL = 'https://x/cb';
        await wa.sendWhatsAppTemplate(PHONE, TEMPLATE_TYPES.BOOKING_CONFIRMATION, VARS);
        expect(sent).toHaveLength(1);
        expect(sent[0].statusCallback).toBe('https://x/cb');
    });
});

describe('degradation behaviour (template unavailable in test env)', () => {
    it('monitor: still sends, but logs the degradation at ERROR', async () => {
        await wa.sendWhatsAppTemplate(PHONE, TEMPLATE_TYPES.BOOKING_CONFIRMATION, VARS);

        expect(sent).toHaveLength(1);
        const line = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(line).toContain('WHATSAPP_TEMPLATE_DEGRADED');
        expect(line).toContain('businessInitiated=true');
    });

    it('enforce: refuses rather than sending an undeliverable freeform message', async () => {
        process.env.WHATSAPP_TEMPLATE_FALLBACK_MODE = 'enforce';

        await expect(
            wa.sendWhatsAppTemplate(PHONE, TEMPLATE_TYPES.BOOKING_CONFIRMATION, VARS)
        ).rejects.toBeInstanceOf(wa.UndeliverableTemplateError);
        expect(sent).toHaveLength(0);
    });

    it('enforce: the refusal is NOT rescued by options.fallbackMessage', async () => {
        // The outer catch used to send options.fallbackMessage on any error — which
        // would have re-sent exactly the freeform message just refused as undeliverable.
        process.env.WHATSAPP_TEMPLATE_FALLBACK_MODE = 'enforce';

        await expect(
            wa.sendWhatsAppTemplate(PHONE, TEMPLATE_TYPES.BOOKING_CONFIRMATION, VARS, {
                fallbackMessage: 'Booking confirmed!',
            })
        ).rejects.toBeInstanceOf(wa.UndeliverableTemplateError);
        expect(sent).toHaveLength(0);
    });

    it('enforce: a session-initiated template still sends (freeform is legal in-window)', async () => {
        process.env.WHATSAPP_TEMPLATE_FALLBACK_MODE = 'enforce';

        await wa.sendWhatsAppTemplate(PHONE, TEMPLATE_TYPES.RECEIPT_CONFIRMATION, VARS);
        expect(sent).toHaveLength(1);
    });

    it('never logs the full recipient number while degrading', async () => {
        await wa.sendWhatsAppTemplate(PHONE, TEMPLATE_TYPES.BOOKING_CONFIRMATION, VARS);

        const all = [...errSpy.mock.calls, ...logSpy.mock.calls, ...warnSpy.mock.calls]
            .map((c) => c.map(String).join(' ')).join('\n');
        expect(all).not.toContain(PHONE);
        expect(all).not.toContain('821234567');
    });
});
