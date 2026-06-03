# Plan — Slice 1: askRoss `llm-client.js`

**Date:** 2026-06-03
**Branch:** `feat/askross-llm-client`
**Spec:** `docs/plans/2026-05-31-askross-agent-design.md` §10 slice 1, §2.1, §5, §1

## Goal
The swappable wrapper over the **raw Anthropic Messages API** for the v1 reactive
engine. Isolated + mockable (Anthropic SDK lazy-required + injectable seam → import
cheap, zero live API calls in tests). One API round-trip per call — the agent *loop*
is slice 3.

## Doc-verified surface (context7 /anthropics/anthropic-sdk-typescript)
- `system` accepts `Array<TextBlockParam>` with `cache_control:{type:'ephemeral'}` —
  `prompt.js` `systemBlocks()` already matches; passes straight through.
- `client.messages.stream(params).on('text', cb)` + `await stream.finalMessage()` →
  final `.content` (incl. `tool_use`), `.usage`, `.stop_reason`.
- `client.messages.create(params)` for non-streaming (eval judge).
- We deliberately do NOT use `beta.messages.toolRunner` (it owns the loop; reactive
  v1 owns its own loop for the confirm-pause + per-turn billing).

## Files
- `functions/agent/llm-client.js` — `MODELS` (AGENT/JUDGE); client seam
  (`configureClient(apiKey)` / `getClient()` / `__setClientForTests`); `streamTurn(...)`
  → `{content, usage, stopReason}` (pipes deltas to `onText`); `createTurn(...)`
  non-streaming; **`toLedgerUnits(apiUsage)`** snake→camel mapper (#129 §2.1 req 1).
- `functions/agent/__tests__/llm-client.test.js` — toLedgerUnits (verbatim usage block
  + missing→0 + anti-pattern proof); streamTurn (deltas + final + cache/tools
  pass-through); createTurn; unconfigured throw; MODELS frozen.
- `functions/package.json` — add `@anthropic-ai/sdk` (NOT the Agent SDK; that stays
  lazy/uninstalled until v2).

## Out of scope (slice 3+)
The agent loop, the 4 pre-flight gates, `defineSecret('ANTHROPIC_API_KEY')`, the
`recordUsageAndDebit` call, SSE transport, CORS.

## Risk
Model IDs `claude-sonnet-4-6` / `claude-haiku-4-5` are named constants — verify
against current Anthropic IDs at slice-3 deploy (flagged in code).
