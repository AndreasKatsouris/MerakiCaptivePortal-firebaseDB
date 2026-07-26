'use strict';

/**
 * ROSS recurrence advance — scheduled shell.
 *
 * 03:00 SAST = 01:00 UTC, four hours before the 07:00-SAST proactive sweep
 * (agent/sweep/sweep.js:179-181), so the sweep always reads freshly-advanced
 * data. No collision with rossAgentPrune (03:30 UTC, agent/prune.js:101).
 *
 * Object form of onSchedule is required for timeZone to take effect — the
 * two-arg string form silently runs in UTC.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { advanceAllWorkflows } = require('./walk');

const rossRecurrenceAdvance = onSchedule(
    { schedule: '0 3 * * *', timeZone: 'Africa/Johannesburg' },
    async () => {
        const summary = await advanceAllWorkflows(Date.now());
        console.log(`[rossRecurrenceAdvance] done: ${JSON.stringify(summary)}`);
    },
);

module.exports = { rossRecurrenceAdvance };
