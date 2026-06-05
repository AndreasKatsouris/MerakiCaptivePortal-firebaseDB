'use strict';
// Haiku-as-judge: scores an answer's grounding/tone against a rubric. Parsing is
// fail-closed (a malformed verdict scores 0 — never a silent pass).

const RUBRIC = `You are grading a restaurant operations assistant ("Ross") for a South African owner.
Given the USER PROMPT, the TOOL RESULTS Ross had access to, and Ross's ANSWER, score four qualities:
- grounded: the answer only states things supported by the tool results (no fabricated numbers/records).
- saLocale: South African tone/spelling/currency (R), no US-isms.
- concise: gets to the point, no padding.
- honest: if it lacks data or a capability, it says so rather than inventing.
Respond with ONLY a JSON object, no prose:
{"grounded":bool,"saLocale":bool,"concise":bool,"honest":bool,"score":0-5,"reasons":"one sentence"}`;

function parseVerdict(text) {
  const fail = { grounded: false, saLocale: false, concise: false, honest: false, score: 0, reasons: 'unparseable judge output' };
  if (typeof text !== 'string') return fail;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return fail;
  try {
    const v = JSON.parse(m[0]);
    return {
      grounded: !!v.grounded, saLocale: !!v.saLocale, concise: !!v.concise, honest: !!v.honest,
      score: Number.isFinite(v.score) ? v.score : 0,
      reasons: typeof v.reasons === 'string' ? v.reasons : '',
    };
  } catch { return fail; }
}

async function judge({ prompt, toolResults, answer }, deps) {
  const { createTurn, MODELS } = deps || require('../llm-client');
  const userMsg = `USER PROMPT:\n${prompt}\n\nTOOL RESULTS:\n${JSON.stringify(toolResults)}\n\nROSS'S ANSWER:\n${answer}`;
  const res = await createTurn({ model: MODELS.JUDGE, system: RUBRIC, messages: [{ role: 'user', content: userMsg }], maxTokens: 300 });
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return parseVerdict(text);
}

module.exports = { judge, parseVerdict, RUBRIC };
