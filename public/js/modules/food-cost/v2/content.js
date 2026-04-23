// Scripted Food Cost content — Phase A2 placeholder data.
// Shapes match what the eventual RTDB-backed service will return from
// foodCostIndex/byLocation/{loc}, inventoryByLocation, wasteLog, and the
// menu-item margin aggregation. SA-locale currency rendering.

export const HEADER = {
  venue: 'Ocean Club',
  rangeLabel: 'last 30 days',
  headlineLead: 'Margin is leaking.',
  headlineAccent: 'R51,200/week.',   // weekly margin loss
}

export const KPI_TILES = [
  {
    key: 'cogs',   label: 'COGS',         value: '34.1%',
    delta: '+6.1pp', meta: '28.0% target', warn: true,
    trend: [28.2, 29.0, 29.8, 30.6, 31.8, 32.9, 33.6, 34.1],
  },
  {
    key: 'spend',  label: 'Food spend',   value: 'R411,200',
    delta: '+R74,200', meta: 'vs. prev 30d', warn: true,
    trend: [92, 94, 96, 101, 104, 108, 112, 118],
  },
  {
    key: 'waste',  label: 'Waste',        value: '4.8%',
    delta: '+0.9pp', meta: '<3% target', warn: true,
    trend: [3.1, 3.4, 3.6, 3.9, 4.2, 4.5, 4.6, 4.8],
  },
  {
    key: 'margin', label: 'Menu margin',  value: '52.4%',
    delta: '-3.2pp', meta: 'avg across menu', warn: true,
    trend: [56.0, 55.4, 54.8, 54.2, 53.6, 53.1, 52.8, 52.4],
  },
]

// Ross diagnosis — dark hero card.
export const ROSS_DIAGNOSIS = {
  eyebrow: 'Ross · diagnosis',
  headline: 'Your protein supplier raised prices Apr 18.',
  detail:
    "Ribeye +12%, duck breast +8%, short rib +6%. Three menu items absorb " +
    "<b>78%</b> of the impact. Adjusting prices by R35–R70 recovers " +
    "R37,800/week without hurting volume (Ross' elasticity model).",
  actions: [
    { id: 'menu-pricing', label: 'Open menu pricing', variant: 'accent' },
    { id: 'suppliers',    label: 'See supplier options', variant: 'ghost' },
  ],
  chart: {
    title: 'Margin impact · weekly',
    caption: 'Solid = actual · dashed = if unchanged (projected −R198k by May)',
    // Series with dashFromIndex split (actual through day 12, projected after)
    series: [
      { x: 1,  y: 42000 }, { x: 2,  y: 41200 }, { x: 3,  y: 40400 }, { x: 4,  y: 39800 },
      { x: 5,  y: 39000 }, { x: 6,  y: 38100 }, { x: 7,  y: 37400 }, { x: 8,  y: 36600 },
      { x: 9,  y: 35800 }, { x: 10, y: 35100 }, { x: 11, y: 34600 }, { x: 12, y: 34000 },
      { x: 13, y: 33100 }, { x: 14, y: 32200 }, { x: 15, y: 31300 }, { x: 16, y: 30400 },
      { x: 17, y: 29500 }, { x: 18, y: 28700 }, { x: 19, y: 27900 }, { x: 20, y: 27200 },
    ],
    dashFromIndex: 11,
  },
}

// Menu table — "cost drift" — rebased to ZAR (local currency).
export const MENU_DRIFT = [
  { item: 'Ribeye 12oz',  category: 'Mains',    plateCost: 331, price: 864, margin: 61.7, drift: -4.2, volume: 318, rossAction: 'Reprice +R54' },
  { item: 'Duck confit',  category: 'Mains',    plateCost: 202, price: 612, margin: 67.1, drift: -2.8, volume: 412, rossAction: 'Reprice +R36' },
  { item: 'Short rib',    category: 'Mains',    plateCost: 266, price: 756, margin: 64.8, drift: -2.1, volume: 142, rossAction: 'Swap cut' },
  { item: 'Caesar',       category: 'Starters', plateCost:  61, price: 252, margin: 75.7, drift:  0.2, volume: 251, rossAction: null },
  { item: 'Oysters (6)',  category: 'Raw',      plateCost: 173, price: 396, margin: 56.4, drift: -0.4, volume: 202, rossAction: null },
  { item: 'House burger', category: 'Mains',    plateCost: 122, price: 378, margin: 67.6, drift: -0.6, volume: 289, rossAction: null },
]

export const MENU_FILTERS = [
  { id: 'drifting', label: 'Drifting', active: true },
  { id: 'stable',   label: 'Stable',   active: false },
  { id: 'all',      label: 'All 48',   active: false },
]

export const STOCK_RUNWAY = [
  { item: 'Olive oil · 5L',    daysLeft: 2,  tone: 'warn' },
  { item: 'Duck breast',       daysLeft: 4,  tone: 'warn' },
  { item: 'Ribeye',            daysLeft: 6,  tone: 'accent' },
  { item: 'Romaine',           daysLeft: 9,  tone: 'default' },
  { item: 'House wine · red',  daysLeft: 14, tone: 'default' },
]
// Any runway above this caps the bar visually.
export const STOCK_MAX_DAYS = 14

// Waste log — 7 days of cost by day-of-week (R cost).
export const WASTE_LOG_7D = [
  { x: 'Wed', y:  480 },
  { x: 'Thu', y:  620 },
  { x: 'Fri', y: 1180, accent: true },
  { x: 'Sat', y:  840 },
  { x: 'Sun', y:  520 },
  { x: 'Mon', y:  360 },
  { x: 'Tue', y:  720 },
]

export function currentDateLine() {
  const fmt = new Intl.DateTimeFormat('en-ZA', { weekday: 'long', month: 'long', day: 'numeric' })
  return fmt.format(new Date())
}

export function zar(n) {
  return 'R' + new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(n)
}
