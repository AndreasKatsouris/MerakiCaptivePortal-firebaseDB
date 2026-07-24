'use strict';

/**
 * Forward guard for the `cleanupOldQueuesScheduled` export clobber (queue card Q3).
 *
 * `queueAnalytics.js` assigned `exports.cleanupOldQueuesScheduled = onSchedule(...)`
 * and then reassigned `module.exports = {...}` without including it — the later
 * reassignment REPLACES the whole exports object (CommonJS), silently dropping the
 * scheduled function. `functions/index.js:2268` re-exports it via
 * `require('./queueAnalytics').cleanupOldQueuesScheduled`, so the daily queue-cleanup
 * cron has never actually been deployable.
 */

const { cleanupOldQueuesScheduled } = require('../queueAnalytics');

describe('queueAnalytics module.exports', () => {
    it('exports cleanupOldQueuesScheduled (not clobbered by the later module.exports reassignment)', () => {
        expect(cleanupOldQueuesScheduled).toBeDefined();
    });
});
