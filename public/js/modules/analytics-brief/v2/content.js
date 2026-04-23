// Scripted Analytics (weekly brief) content — Phase A5.
// Shape matches what the eventual aggregator will return (compose from
// salesDataIndex/byLocation, foodCostIndex/byLocation, guestSentiment
// polls, sales-forecasting engine output). Rand (R) throughout — ZA locale.

export const MASTHEAD = {
  ribbon: 'WEEKLY BRIEF · WEEK 17 · APR 14–20',
  actions: [
    { id: 'print', label: 'Print', variant: 'ghost' },
    { id: 'share', label: 'Share with team', variant: 'solid' },
  ],
}

export const SUMMARY = {
  eyebrow: 'Ross · executive summary',
  headlineLead: 'A strong week, with',
  headlineAccent: 'one warning.',
  // Structured parts so bolds and numbers render without v-html.
  leadParts: [
    { type: 'text',   value: 'Revenue climbed ' },
    { type: 'strong', value: '8.2%' },
    { type: 'text',   value: ' across the group — Ocean Club and The Vault carried the week. Food cost slipped ' },
    { type: 'strong', value: '3.4 points' },
    { type: 'text',   value: " at Ocean Club; the other three venues held steady. Here's what Ross noticed, and what we suggest next." },
  ],
}

// Group revenue — current week (7d) + previous week.
// Values in rand so the hero KPI = R1,555,560 for the week (convert
// scripted USD → ZAR at ~18:1 for venue-realistic SA operator numbers).
export const REVENUE_HERO = {
  value: 'R1,555,560',
  delta: '↑ 8.2% · +R118,080 vs. W16',
  good: true,
  venues: [
    { name: 'Ocean',   color: 'var(--hf-ink)'    },
    { name: 'Vault',   color: 'var(--hf-accent)' },
    { name: 'Café',    color: 'var(--hf-good)'   },
    { name: 'Rooftop', color: 'var(--hf-gold)'   },
  ],
  series: [
    {
      name: 'Ocean Club',
      color: 'var(--hf-ink)',
      data: [104000, 102400, 98800, 132000, 176000, 194400, 162800],
    },
    {
      name: 'The Vault',
      color: 'var(--hf-accent)',
      data: [76800, 74600, 72400, 92400, 118400, 148000, 118400],
    },
    {
      name: 'Corner Café',
      color: 'var(--hf-good)',
      data: [44800, 42000, 41200, 48600, 58800, 62400, 49600],
    },
    {
      name: 'Rooftop 21',
      color: 'var(--hf-gold)',
      data: [28400, 27200, 26400, 32800, 46000, 52400, 39200],
    },
  ],
  // Day labels used as x-axis
  days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
}

export const HERO_KPIS = [
  { key: 'covers',   label: 'Covers',    value: '2,184',  delta: '+4.1%',  good: true  },
  { key: 'avgCheck', label: 'Avg check', value: 'R712',   delta: '+R32',   good: true  },
  { key: 'foodCost', label: 'Food cost', value: '29.8%',  delta: '+1.1pp', good: false },
  { key: 'nps',      label: 'NPS',       value: '74',     delta: '+3',     good: true  },
]

export const STORIES_META = { count: 3, subInsights: 12 }

export const STORIES = [
  {
    n: '01',
    title: 'Patio drove R112k on Saturday.',
    detail:
      'Weather (23°C, sunny) plus the spring promo compounded. If you ' +
      'extend, Ross projects +R86k next Saturday.',
    metric: { value: '+R112,000', caption: 'Saturday' },
    tone: 'good',
    linkLabel: 'Open brief',
  },
  {
    n: '02',
    title: 'Wine attach rose 14% group-wide.',
    detail:
      'The new sommelier pairings are landing. Pairing attach at Ocean ' +
      'Club hit 38%, up from 24%.',
    metric: { value: '+14%', caption: 'Wine attach' },
    tone: 'ink',
    linkLabel: 'Open brief',
  },
  {
    n: '03',
    title: 'Ocean Club protein cost drifted.',
    detail:
      "Ribeye and duck cost rose 4pp for 5 days straight. Supplier " +
      "raised Apr 18 — menu hasn't adjusted.",
    metric: { value: '+3.4pp', caption: 'COGS' },
    tone: 'warn',
    linkLabel: 'Open brief',
  },
]

// Forecast — 7 days. Each day carries `predicted`, `confidenceLower`,
// `confidenceUpper` to feed HfLineChart's `confidenceBand` mode (G3).
// Also accepts `dashFromIndex` behaviour — none here since it's purely
// forward-looking.
export const FORECAST_7D = {
  confidence: '80% CONFIDENCE',
  updated: 'UPDATED 9:10 AM',
  totalLabel: 'Week projected: R1,589,400 · +2.2% vs. this week',
  // One x point per day
  series: [
    { x: 'Wed', y: 201600, lower: 181000, upper: 222200, displayValue: 'R201.6k' },
    { x: 'Thu', y: 223200, lower: 201500, upper: 245000, displayValue: 'R223.2k' },
    { x: 'Fri', y: 253800, lower: 229000, upper: 278600, displayValue: 'R253.8k' },
    { x: 'Sat', y: 291600, lower: 261800, upper: 321400, displayValue: 'R291.6k' },
    { x: 'Sun', y: 244800, lower: 221200, upper: 268400, displayValue: 'R244.8k' },
    { x: 'Mon', y: 176400, lower: 158700, upper: 194100, displayValue: 'R176.4k' },
    { x: 'Tue', y: 198000, lower: 178200, upper: 217800, displayValue: 'R198.0k' },
  ],
}

export const FOOTER = {
  left: 'Sparks Hospitality · Ross v4.2 · Generated Tue 9:14 AM',
  right: 'Next brief: Mon Apr 28',
}
