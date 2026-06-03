'use strict';

/**
 * Phase 7 ② askRoss Agent — LLM client (slice 1). The swappable wrapper over the raw
 * Anthropic Messages API for the v1 reactive engine. Isolated + mockable: the Anthropic
 * SDK is lazy-required and injectable via __setClientForTests, so this module imports
 * cheap and unit-tests with ZERO live API calls.
 *
 * The agent LOOP is NOT here — slice 3 (`rossChat`) owns the loop, the four pre-flight
 * gates, and the ledger debit. This module does exactly ONE API round-trip per call.
 *
 * Spec: docs/plans/2026-05-31-askross-agent-design.md §10 slice 1, §2.1, §5, §1
 */

// Model IDs (§1). Named so a single swap re-points the agent / judge.
// ⚠ VERIFY against current Anthropic model IDs at slice-3 deploy time.
const MODELS = Object.freeze({
    AGENT: 'claude-sonnet-4-6',            // the agent loop (streaming)
    JUDGE: 'claude-haiku-4-5-20251001',   // the eval-harness judge (§6) + future cheap tasks
});

// --- client seam (lazy + injectable → import-cheap, zero live calls in tests) ------
let _client = null;

/** Build the real Anthropic client from an API key (called by the CF in slice 3). */
function configureClient(apiKey) {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic({ apiKey });
    return _client;
}

function getClient() {
    if (!_client) {
        throw new Error('llm-client: not configured — call configureClient(apiKey) first');
    }
    return _client;
}

/** Test-only: inject a fake Anthropic client ({ messages: { stream, create } }). */
function __setClientForTests(fake) { _client = fake; }

/**
 * Map an Anthropic `usage` object (snake_case) → the ① ledger's `units` (camelCase).
 * Passing the raw usage straight in (`units: usage`) would SILENTLY ZERO-CHARGE — the
 * ledger reads camelCase keys (functions/billing/ledger.js:50-69). #129 §2.1 req 1.
 *
 * @param {object} apiUsage - the message `.usage` block
 * @returns {{inputTokens:number, outputTokens:number, cacheWriteTokens:number, cacheReadTokens:number}}
 */
function toLedgerUnits(apiUsage) {
    const u = apiUsage || {};
    return {
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
    };
}

/**
 * One STREAMING turn. Streams assistant text to `onText` as it arrives; resolves to the
 * final message, which carries any `tool_use` blocks + the complete `usage` for billing.
 * The caller (slice 3) runs the loop: inspect `content` for tool_use, execute, append a
 * tool_result, call streamTurn again.
 *
 * @param {{model:string, system:Array, tools?:Array, messages:Array, maxTokens?:number, onText?:function}} opts
 * @returns {Promise<{content:Array, usage:object, stopReason:string}>}
 */
// maxTokens default 4096: Sonnet reasoning + tool_use blocks can exceed 1024. Slice 3
// always passes an explicit value; the default guards future callers from truncation.
async function streamTurn({ model, system, tools, messages, maxTokens = 4096, onText }) {
    const params = { model, max_tokens: maxTokens, system, messages };
    if (tools && tools.length) params.tools = tools;

    const stream = getClient().messages.stream(params);
    if (typeof onText === 'function') {
        stream.on('text', (delta) => onText(delta));
    }
    const final = await stream.finalMessage();
    return { content: final.content, usage: final.usage, stopReason: final.stop_reason };
}

/**
 * One NON-STREAMING turn (for the Haiku eval judge, §6 — no tools, no loop).
 * @param {{model:string, system?:(Array|string), messages:Array, maxTokens?:number}} opts
 * @returns {Promise<{content:Array, usage:object, stopReason:string}>}
 */
async function createTurn({ model, system, messages, maxTokens = 1024 }) {
    const params = { model, max_tokens: maxTokens, messages };
    if (system) params.system = system;
    const msg = await getClient().messages.create(params);
    return { content: msg.content, usage: msg.usage, stopReason: msg.stop_reason };
}

module.exports = {
    MODELS,
    configureClient,
    getClient,
    toLedgerUnits,
    streamTurn,
    createTurn,
    __setClientForTests,
};
