'use strict';

/**
 * Phase 7 ② askRoss Agent — engine-agnostic core constants.
 *
 * Shared by both engines (§1.1): v1 reactive (raw Messages API) and v2 proactive
 * (Claude Agent SDK). Pure data + small pure predicates; zero I/O, zero engine deps.
 *
 * Spec: docs/plans/2026-05-31-askross-agent-design.md §1.1, §3.1, §4
 */

// Risk tiers (§4).
const TIER = Object.freeze({ OFF: 'off', CONFIRM: 'confirm', AUTO: 'auto' });

// Strictness rank — HIGHER = STRICTER. An owner may only tighten a tool
// (auto → confirm → off), never loosen it past its ceiling.
const TIER_RANK = Object.freeze({ auto: 0, confirm: 1, off: 2 });

// Engine mode (§1.1). 'chat' = reactive (owner present); 'scheduled' = proactive
// (unattended sweep). Only the system-prompt identity differs by mode (§5).
const MODE = Object.freeze({ CHAT: 'chat', SCHEDULED: 'scheduled' });

// Adapter readiness (§10 scope). 'ready' tools are exposed to the model; 'pending'
// tools are defined for catalog completeness but never handed to an engine until
// their underlying CF logic lands in a later slice (a tool that can't be seen can't
// be called).
const STATUS = Object.freeze({ READY: 'ready', PENDING: 'pending' });

// §3.1 — measurement / attestation input types the agent must NEVER auto-submit a
// value for. Ross has no sensors; auto-submitting one of these would fabricate a
// regulatory-compliance record. The agent may only auto-submit non-measurement types
// it can legitimately satisfy from the conversation (text / checkbox / signature).
const MEASUREMENT_INPUT_TYPES = Object.freeze([
    'temperature', 'number', 'rating', 'yes_no', 'photo',
]);

// Tools whose effect has no native undo — execute.js captures a `prev` snapshot into
// the audit row so an admin can restore the prior value (§4, review #9). editWorkflow /
// pauseWorkflow mutate existing workflow fields in place (slice 4); create/activate make
// new records (reversible by delete) so they are NOT here. Keep this in lockstep with the
// snapshotPrev dispatch in execute.js.
const NO_UNDO_TOOLS = Object.freeze(['advanceDueDate', 'editWorkflow', 'pauseWorkflow']);

// Pending confirm-action TTL (slice 4, spec §2 / §11 Q3). A pending action older than
// this is rejected on resume (RTDB has no native TTL — enforced in code).
const PENDING_TTL_MS = 10 * 60 * 1000;

// RTDB path helpers for the agent's own nodes (server-only writes; §9).
const agentConfigPath = (uid) => `ross/agentConfig/${uid}`;
const agentEnabledPath = (uid) => `ross/agentConfig/${uid}/enabled`;
const agentPolicyPath = (uid, tool) => `ross/agentConfig/${uid}/policy/${tool}`;
const agentAuditPath = (uid, turnId) => `ross/agentAudit/${uid}/${turnId}`;
const agentPendingPath = (uid, turnId) => `ross/agentPending/${uid}/${turnId}`;
const agentChatsPath = (uid, threadId) => `ross/agentChats/${uid}/${threadId}`;
const agentKillSwitchPath = () => 'ross/config/agentKillSwitch';

/**
 * §3.1 gate predicate (pure). True only when the agent may auto-submit a value for a
 * task. Refuses every measurement/attestation type and any task requiring a note.
 * Also codified as a hard eval assertion (§6) and wired into the `submitResponse`
 * adapter server-side in slice 3 — defence that doesn't depend on the model behaving.
 *
 * @param {string} inputType
 * @param {object} [inputConfig]
 * @returns {boolean}
 */
function isAgentSubmittable(inputType, inputConfig) {
    if (inputConfig && inputConfig.requiredNote === true) return false;
    return !MEASUREMENT_INPUT_TYPES.includes(inputType);
}

module.exports = {
    TIER,
    TIER_RANK,
    MODE,
    STATUS,
    MEASUREMENT_INPUT_TYPES,
    NO_UNDO_TOOLS,
    PENDING_TTL_MS,
    agentConfigPath,
    agentEnabledPath,
    agentPolicyPath,
    agentAuditPath,
    agentPendingPath,
    agentChatsPath,
    agentKillSwitchPath,
    isAgentSubmittable,
};
