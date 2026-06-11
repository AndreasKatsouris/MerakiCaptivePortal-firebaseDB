'use strict';

const { dateKeySAST, resolveOwnerPhone, resolveFirstName, __setNormalizeForTests } = require('../sweep/sweep');

describe('dateKeySAST', () => {
    it('uses SAST (UTC+2, no DST): 23:30 UTC is already tomorrow in SA', () => {
        // 2026-06-10T23:30:00Z = 2026-06-11 01:30 SAST
        expect(dateKeySAST(Date.UTC(2026, 5, 10, 23, 30))).toBe('2026-06-11');
        expect(dateKeySAST(Date.UTC(2026, 5, 10, 12, 0))).toBe('2026-06-10');
    });
});

describe('resolveOwnerPhone', () => {
    afterEach(() => __setNormalizeForTests(null));
    it('falls through phoneNumber → phone → businessPhone (menuLogic.js:79 chain), normalized', () => {
        __setNormalizeForTests((p) => `N:${p}`);
        expect(resolveOwnerPhone({ phoneNumber: '0821', phone: 'x' })).toBe('N:0821');
        expect(resolveOwnerPhone({ phone: '0832' })).toBe('N:0832');
        expect(resolveOwnerPhone({ businessPhone: '0843' })).toBe('N:0843');
    });
    it('returns null when no phone field', () => {
        expect(resolveOwnerPhone({})).toBeNull();
        expect(resolveOwnerPhone(null)).toBeNull();
    });
});

describe('resolveFirstName', () => {
    it('prefers firstName, then name/displayName first word, then email local-part', () => {
        expect(resolveFirstName({ firstName: 'Andreas' })).toBe('Andreas');
        expect(resolveFirstName({ name: 'Andreas Katsouris' })).toBe('Andreas');
        expect(resolveFirstName({ displayName: 'Andreas K' })).toBe('Andreas');
        expect(resolveFirstName({ email: 'andreas@askgroupholdings.com' })).toBe('andreas');
        expect(resolveFirstName({})).toBe('');
        expect(resolveFirstName(null)).toBe('');
    });
});
