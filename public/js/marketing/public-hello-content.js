// Synthetic findings for the public homepage hello preview.
//
// Q4 lock (Phase 5 spec §3.3): same RossOnboardingHello.vue component,
// two data feeds. The post-signup mount loads real findings from RTDB.
// The marketing mount passes this constant as the `findings` prop and
// every card carries `source: 'illustrative'` — which the component
// renders as a "preview" tag plus reduced opacity, signalling clearly
// to the visitor that none of this is real customer data.
//
// Tone: single-venue Cape Town café narrative ("Tannie's Kitchen"),
// findings tuned to common SA-restaurant pain. Operator can re-tune
// copy without touching the component.

export const PUBLIC_HELLO_FINDINGS = {
  intro: {
    eyebrow:  "ROSS · A SAMPLE FIRST LOOK",
    headline: "Imagine a Tuesday morning at",
    subline:  "Tannie's Kitchen, Cape Town.",
    lead:     "This is what Ross might tell a small café owner on day one — three things worth attending to, drawn from public weather, calendar, and demographic signals. None of this is real customer data; it's a flavour of how the agent thinks.",
  },
  findings: [
    {
      id: 'sample-1',
      headline: "Tuesday lunch margin is your quiet bleed",
      detail:   "Tuesday covers run 22% below your weekly average but staff load is identical. The five Tuesdays in this quarter together cost roughly the rent on a second walk-in fridge.",
      source:   'illustrative',
      accent:   true,
    },
    {
      id: 'sample-2',
      headline: "Three of your VIPs walked past last week",
      detail:   "Returning guests who spent over R1,200 on previous visits dropped in but didn't book — likely because the queue spilt onto Long Street. A held table or a polite SMS would have closed the loop.",
      source:   'illustrative',
    },
    {
      id: 'sample-3',
      headline: "Thursday's southeaster will move your covers indoors",
      detail:   "Forecast is 38 km/h gusts from 14:00. Last time wind crossed 35 km/h, indoor turn-time dropped 18% and your terrace covers vanished. Pre-set the heaters and shorten the indoor menu.",
      source:   'illustrative',
    },
  ],
}
