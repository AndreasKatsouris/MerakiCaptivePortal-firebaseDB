// Scripted Ross content — Phase C placeholder.
//
// Structured so each exported function returns the shape a real LLM-backed
// service would eventually yield. When we wire Anthropic later, only the
// ross-service.js implementations change — call sites stay identical.
//
// All numbers are illustrative, not derived from live data. Keep venue-
// realistic so product reviews with operators feel credible.

export const FINDINGS_FIRST_RUN = [
  {
    id: '01',
    headline: 'Tuesday dinner is quietly your best-margin service.',
    detail:
      "Not Saturday brunch, not Friday dinner — Tuesday evening. Lower staffing, " +
      "consistent 70% covers, and the wine list over-indexes here. You've probably " +
      "never promoted it.",
    accent: true,
  },
  {
    id: '02',
    headline: '28 of your guests visit weekly but have never been recognized.',
    detail:
      "They show up, they tip well, and nobody on the team greets them by name. " +
      "I pulled their names — worth a small gesture next visit.",
    accent: false,
  },
  {
    id: '03',
    headline: 'Your patio revenue has tripled in 18 months — nobody mentioned it.',
    detail:
      "Rooftop 21 opened April 2024. Patio share of revenue jumped from 12% to 34%. " +
      "Worth weighing whether to extend the season.",
    accent: false,
  },
]

export const HOME_HEADLINE = {
  greeting: 'Good morning, Maya.',
  subtitle: 'Three things worth your attention.',
  lead:
    "Ross watched 14,200 signals across your four venues overnight. " +
    "Here's what changed while you slept.",
}

export const HOME_FEED = [
  {
    id: 'food-cost-alert',
    tone: 'warn',
    eyebrow: 'Ocean Club · 3 days running',
    chip: { tone: 'warn', label: 'Needs attention' },
    headline: 'Food cost climbed to 34.1%, 6 points above target.',
    detail:
      'The protein line is the culprit — specifically ribeye and duck. Your supplier ' +
      'raised prices on Apr 18; the menu hasn\'t adjusted. Est. margin loss: ' +
      '$2,840/week.',
    actions: [
      { id: 'open-brief', label: 'Open food-cost brief', variant: 'solid', trailing: 'arrow' },
      { id: 'ask-why',    label: 'Ask Ross why',        variant: 'ghost' },
    ],
    footnote: '2 suggested actions',
    sidecar: {
      kind: 'kpi-spark',
      eyebrow: '7-day COGS',
      value: '34.1',
      unit: '%',
      target: 'target 28.0%',
      trend: [28.1, 29.4, 30.2, 31.0, 32.6, 33.4, 34.1],
      color: 'var(--hf-warn)',
    },
  },
  {
    id: 'vip-slip',
    tone: 'default',
    eyebrow: '42 guests · $2,180 avg LTV',
    chip: { tone: 'default', label: 'Guest intelligence', icon: 'users' },
    headline: 'Your most valuable guests are slipping away.',
    detail:
      "42 VIPs haven't returned in 90+ days. Ross drafted a personalized win-back " +
      "— a wine tasting at Ocean Club. Projected response: 38%.",
    actions: [
      { id: 'review-draft', label: 'Review draft campaign', variant: 'solid' },
      { id: 'see-guests',   label: 'See all 42 guests',    variant: 'ghost' },
    ],
    sidecar: {
      kind: 'donut',
      value: 0.28,
      label: '28%',
      sub: 'return rate',
      color: 'var(--hf-accent)',
    },
  },
  {
    id: 'patio-win',
    tone: 'good',
    eyebrow: 'Weekend · +$6,240 vs. LW',
    chip: { tone: 'good', label: 'Trending up', icon: 'check' },
    headline: 'The patio promotion is working — extend it?',
    detail:
      'Saturday beat forecast by 18%. Weather plus the promo compounded. ' +
      'Ross suggests extending two weeks and expanding to The Vault.',
    actions: [
      { id: 'extend', label: 'Extend promotion', variant: 'solid' },
      { id: 'breakdown', label: 'See breakdown', variant: 'ghost' },
    ],
    sidecar: {
      kind: 'kpi-bars',
      eyebrow: 'Sat revenue',
      value: '$16,240',
      delta: { label: '↑ $2,480 vs. LW', tone: 'good' },
      bars: [10, 11, 9, 12, 11, 13, 10, 14, 12, 13, 15, 18],
      accentIndex: 11,
    },
  },
]

export const QUICK_JUMPS = [
  "Tonight's bookings",
  'Menu performance',
  'Staff schedule',
  'Receipts queue',
  'Compliance',
]

export const ASK_ROSS_SAMPLE = {
  prompt: '"How did my Saturday brunch compare to last month?"',
  recent: [
    '↑ 22% covers vs. last Sat',
    'Avg check held at $48',
    'Waitlist peaked at 43 min',
  ],
}

export const LIVE_VENUES = [
  { name: 'Ocean Club',  status: 'open',        primary: '64 covers',    secondary: '18m wait',   tone: 'good',   seed: 7 },
  { name: 'The Vault',   status: 'open',        primary: '38 covers',    secondary: '6m wait',    tone: 'good',   seed: 9 },
  { name: 'Corner Café', status: 'setting up',  primary: 'opens 11:00',  secondary: '—',          tone: 'accent', seed: 0 },
  { name: 'Rooftop 21',  status: 'closed',      primary: 'Thu 5:00 PM',  secondary: '—',          tone: 'muted',  seed: 0 },
]

export const ROSS_SUGGESTIONS = [
  { id: 'birthdays', text: '87 guests celebrate birthdays this week', action: 'Draft outreach' },
  { id: 'olive-oil', text: 'Olive oil runs out in 2 days',            action: 'Reorder now' },
  { id: 'shift-gap', text: 'Sat 6–8pm schedule gap at Ocean Club',    action: 'Fill shift' },
]

// Tiny deterministic PRNG so the "live" sparkline seeds stay stable
// across renders without pulling in the handoff's seed-based random.
export function seededLine(seed, n = 12) {
  let s = (seed * 9301 + 49297) % 233280
  const out = []
  let y = 0.5
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280
    y += (s / 233280 - 0.48) * 0.18
    y = Math.max(0.08, Math.min(0.92, y))
    out.push({ x: i, y })
  }
  return out
}

// Date surface used by the home header. Computed once at render, not at
// module load, so the page stays accurate if the user leaves the tab open.
export function currentDateLine() {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-ZA', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
  const time = new Intl.DateTimeFormat('en-ZA', { hour: 'numeric', minute: '2-digit' }).format(now)
  return `${fmt.format(now)} · ${time}`
}
