# askRoss eval harness

A live, judgment-graded evaluation harness for the askRoss agent. It drives the real
agent loop against a fixed set of cases (`cases.js`) and scores each one with a mix of
deterministic assertions (`assertions.js`) and an LLM-as-judge grader (`judge.js`).

This is **not** a unit-test suite — it spends real tokens. CI never runs it. It is an
operator-run tool for confirming end-to-end agent behaviour before a release.

## What's in here

| File | Role |
|------|------|
| `cases.js` | The eval cases (prompts + expectations + seed/preflight state) |
| `driver.js` | Runs one case through the real agent loop into a `Transcript` (no debit, no RTDB persistence) |
| `assertions.js` | Deterministic checks (terminal reason, tools called, no auto-confirm, refusal, no foreign data) |
| `judge.js` | Haiku-based LLM-as-judge grader (rubric in `RUBRIC`) |
| `scorecard.js` | Pure `summarize()` + `formatLine()` for reporting (unit-tested) |
| `run.js` | The live CLI entry point |
| `fixtures.js` | Baseline RTDB tree the driver seeds per case |

## Running it

You need an Anthropic API key. The runner exits `2` immediately if it is missing
(before any spend).

**macOS / Linux:**
```bash
ANTHROPIC_API_KEY=sk-... npm run eval
```

**Windows PowerShell:**
```powershell
$env:ANTHROPIC_API_KEY="sk-..."; npm run eval
```

### Cost

Roughly **a few cents per full run**: ~15 short Sonnet agent turns plus ~15 tiny
Haiku judge calls. Pre-flight cases (cases 15–17 — kill-switch, not-enabled,
not-entitled, low-balance) are **free**: they are gated before the LLM is ever
called, so they never spend tokens.

## Reading the scorecard

Each case prints one line:

```
[PASS] case-id — ✓ tools, ✓ judge(grounded/helpful) score=4
[FAIL] other-id — ✗ refused
      - refused: tools ran
```

`[PASS]`/`[FAIL]` is the per-case verdict (all checks must pass). Failing checks are
listed underneath with their detail. The run ends with a summary line:

```
14/17 passed, 3 failed.
```

The process exits **non-zero (1)** if any case failed, **0** if all passed, and **2**
if no API key was provided.

## CI

CI runs only the deterministic machinery tests:

```bash
npx vitest run functions/agent/evals/__tests__/
```

It **never** runs the live harness (`run.js` / `npm run eval`) — no key, no spend in CI.
