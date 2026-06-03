'use strict';

/**
 * Phase 7 ② askRoss Agent — system prompt builder (§5). Pure: takes a pre-fetched
 * owner context string and the enabled tool catalog, returns Anthropic `system`
 * blocks with TWO cache breakpoints.
 *
 *   block 1 (cached, stable for ALL owners/turns): identity + mode policy + tool
 *           catalog + refusal rules + tone.
 *   block 2 (cached per session): the owner's context (digest, tier, locations, date).
 *
 * Only the identity addendum differs by mode (§1.1): reactive confirms before
 * changing the playbook; proactive defers to the digest and never guesses a
 * measurement. The two-breakpoint structure is what makes a multi-tool loop
 * economical (cache reads ≈ 10% of input price).
 *
 * Spec: docs/plans/2026-05-31-askross-agent-design.md §5, §1.1, §3.1
 */

const { MODE } = require('./constants');

const IDENTITY = [
    'You are Ross, an operations concierge for a South African restaurant business.',
    'Your north star: you run the paperwork, not the restaurant. You absorb administrative',
    'drudgery — reading state and handling workflow/run operations — so the owner can run',
    'their venue. You amplify the owner; you never replace their judgement.',
].join(' ');

const CHAT_ADDENDUM = [
    'The owner is here and asking. Answer grounded strictly in tool results — never',
    'fabricate. Routine reads and run execution you handle directly; anything that',
    'authors or changes the playbook itself (create / edit / activate / pause) you',
    'PROPOSE for the owner to confirm — it is their policy, not yours.',
].join(' ');

const SCHEDULED_ADDENDUM = [
    'This is the unattended sweep — the owner is not present. Do the routine paperwork,',
    'then compile a findings digest. Defer anything that needs the owner (any confirm-tier',
    'action, any measurement you cannot legitimately take) to the digest for them to action',
    'later. Never guess a measurement and never invent a record.',
].join(' ');

const REFUSAL_RULES = [
    'Out of scope in v1: messaging guests, moving money, and destructive or config changes.',
    'If asked, say plainly that those stay with the owner — do not attempt them.',
].join(' ');

const TONE = [
    'Tone: concise, plain, honest. South African locale and date format (DD/MM/YYYY).',
    'If you do not know something or a tool returned nothing, say so.',
].join(' ');

/**
 * Render the enabled tool catalog as a compact list for the system prompt.
 * @param {Array<{name:string, description:string, tier:string}>} tools
 * @returns {string}
 */
function renderToolCatalog(tools) {
    if (!Array.isArray(tools) || tools.length === 0) return '(no tools available)';
    return tools.map((t) => `- ${t.name} [${t.tier}]: ${t.description}`).join('\n');
}

/**
 * Build the two-breakpoint Anthropic `system` blocks.
 * @param {{mode?:string, tools?:Array, ownerContext?:string}} opts
 * @returns {Array<{type:'text', text:string, cache_control:{type:'ephemeral'}}>}
 */
function systemBlocks({ mode = MODE.CHAT, tools = [], ownerContext = '' } = {}) {
    const addendum = mode === MODE.SCHEDULED ? SCHEDULED_ADDENDUM : CHAT_ADDENDUM;
    const prefix = [
        IDENTITY,
        addendum,
        'Available tools:',
        renderToolCatalog(tools),
        REFUSAL_RULES,
        TONE,
    ].join('\n\n');

    return [
        { type: 'text', text: prefix, cache_control: { type: 'ephemeral' } },
        {
            type: 'text',
            text: ownerContext || '(no owner context provided)',
            cache_control: { type: 'ephemeral' },
        },
    ];
}

module.exports = {
    systemBlocks,
    renderToolCatalog,
    IDENTITY,
    CHAT_ADDENDUM,
    SCHEDULED_ADDENDUM,
};
