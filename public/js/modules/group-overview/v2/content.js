// Scripted Group Overview content — Phase A1 placeholder data.
//
// Shapes match what the eventual RTDB-backed service will return so that
// swapping in real queries (via salesDataIndex/byLocation, queue index
// nodes, foodCostIndex, etc.) requires no UI edits. Numbers are venue-
// realistic for SA operators (currency rendering uses en-ZA locale).

export const KPI_TILES = [
  { key: 'revenue',     label: 'Revenue',    value: 12480,  format: 'currency',    delta: 8.2,   deltaUnit: '%',  good: true,
    trend: [11200, 11600, 11250, 11800, 12100, 11900, 12480] },
  { key: 'covers',      label: 'Covers',     value: 316,    format: 'int',         delta: 12,    deltaUnit: '',   good: true,
    trend: [280, 292, 301, 295, 304, 298, 316] },
  { key: 'avgCheck',    label: 'Avg check',  value: 39.50,  format: 'currency-2',  delta: -1.20, deltaUnit: '',   good: false,
    trend: [42.10, 41.80, 41.20, 40.60, 40.90, 40.70, 39.50] },
  { key: 'foodCost',    label: 'Food cost',  value: 31.4,   format: 'pct',         delta: 3.4,   deltaUnit: 'pp', good: false,
    trend: [28.0, 28.6, 29.3, 30.1, 30.8, 31.0, 31.4] },
]

// 30 days revenue — current vs. previous period, shaped for HfCompareChart.
// Historical-looking walk; in production this will come from salesDataIndex.
function buildRevenueWalk(seed, base, n = 30) {
  let s = seed
  const out = []
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280
    const noise = (s / 233280 - 0.5) * 0.35
    const weekly = Math.sin((i / 30) * Math.PI * 4) * 0.12  // weekend peaks
    const value = Math.round(base * (1 + noise + weekly))
    out.push(value)
  }
  return out
}

const today = new Date()
function dayLabels(n) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    out.push(d)
  }
  return out
}

const days30 = dayLabels(30)
export const REVENUE_30D = {
  current:  days30.map((x, i) => ({ x, y: buildRevenueWalk(3,  11400)[i] })),
  previous: days30.map((x, i) => ({ x, y: buildRevenueWalk(7,  10500)[i] })),
  currentTotal:  342480,
  previousTotal: 316140,
}

export const BY_VENUE_TODAY = [
  { name: 'Ocean Club',  revenue: 4820, share: 0.92 },
  { name: 'The Vault',   revenue: 3240, share: 0.62 },
  { name: 'Corner Café', revenue: 2140, share: 0.41 },
  { name: 'Rooftop 21',  revenue: 1480, share: 0.28 },
]

export const FLOOR_TODAY = {
  venue: 'Ocean Club',
  seatedOf: { seated: 18, tables: 28 },
  rows: [
    { label: 'Waitlist',   value: '12 parties', tone: 'warn' },
    { label: 'Avg wait',   value: '18 min',     tone: 'default' },
    { label: 'Turn time',  value: '62 min',     tone: 'default' },
    { label: 'Cover rate', value: '92%',        tone: 'good' },
  ],
}

export const MENU_TOP = [
  { name: 'Duck confit',  count: 34 },
  { name: 'House burger', count: 28 },
  { name: 'Caesar',       count: 24 },
  { name: 'Ribeye',       count: 19 },
  { name: 'Oysters',      count: 16 },
]

export const ROSS_TODAY_TILE = {
  eyebrow: 'Ross · today',
  headline: 'Reorder 4 SKUs',
  subline: 'to save ~$840/wk.',
  actionLabel: 'Review list',
}

// en-ZA locale formatters shared across KPI tiles.
export function formatKpi(tile) {
  const v = tile.value
  switch (tile.format) {
    case 'currency':   return 'R' + new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(v)
    case 'currency-2': return 'R' + new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
    case 'pct':        return v.toFixed(1) + '%'
    case 'int':
    default:           return new Intl.NumberFormat('en-ZA').format(v)
  }
}

export function formatDelta(tile) {
  const arrow = tile.good ? '↑' : '↓'
  const abs = Math.abs(tile.delta)
  if (tile.deltaUnit === '%')  return `${arrow} ${abs.toFixed(1)}% vs. yesterday`
  if (tile.deltaUnit === 'pp') return `${arrow} ${abs.toFixed(1)}pp vs. yesterday`
  if (tile.format === 'currency-2') {
    const fmt = new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs)
    return `${arrow} R${fmt} vs. yesterday`
  }
  return `${arrow} ${new Intl.NumberFormat('en-ZA').format(abs)} vs. yesterday`
}

export function currentDateLine() {
  const fmt = new Intl.DateTimeFormat('en-ZA', { weekday: 'long', month: 'long', day: 'numeric' })
  return fmt.format(new Date())
}
