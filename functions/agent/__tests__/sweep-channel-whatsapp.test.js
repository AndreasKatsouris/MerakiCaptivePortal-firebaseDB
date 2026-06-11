'use strict';

const { deliver, __setSenderForTests, ROSS_DAILY_DIGEST } = require('../sweep/channels/whatsapp');

describe('whatsapp channel adapter', () => {
    afterEach(() => __setSenderForTests(null));

    it('maps payload to contentVariables 1..4 and returns the message sid', async () => {
        const calls = [];
        __setSenderForTests(async (to, type, vars) => { calls.push({ to, type, vars }); return { sid: 'SM123' }; });
        const res = await deliver(
            { uid: 'u1', phone: '+27821234567' },
            { name: 'Andreas', countPhrase: '2 workflows need attention', findingsLine: 'A (due today) · B (1 day overdue)', linkQuery: 'tab=run&workflowId=w&locationId=l' },
        );
        expect(calls).toHaveLength(1);
        expect(calls[0].to).toBe('+27821234567');
        expect(calls[0].type).toBe(ROSS_DAILY_DIGEST);
        expect(calls[0].vars).toEqual({
            1: 'Andreas',
            2: '2 workflows need attention',
            3: 'A (due today) · B (1 day overdue)',
            4: 'tab=run&workflowId=w&locationId=l',
        });
        expect(res).toEqual({ ok: true, messageSid: 'SM123' });
    });

    it('propagates sender errors (orchestrator owns the catch)', async () => {
        __setSenderForTests(async () => { throw new Error('twilio down'); });
        await expect(deliver({ uid: 'u1', phone: 'x' }, { name: 'a', countPhrase: 'b', findingsLine: 'c', linkQuery: 'd' }))
            .rejects.toThrow('twilio down');
    });
});
