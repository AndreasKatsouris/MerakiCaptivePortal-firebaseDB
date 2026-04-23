// Scripted Queue & Floor content — Phase A4.
// Shape matches eventual RTDB paths: queueIndex/byLocation/{loc},
// tablesByLocation/{loc}, and the service-metrics aggregation.

export const VENUE = {
  id: 'ocean-club',
  name: 'Ocean Club',
  counts: { tables: 28, seated: 18, open: 6, turning: 4 },
  zones: [
    { id: 'main',  label: 'Main',  active: true  },
    { id: 'patio', label: 'Patio', active: false },
    { id: 'bar',   label: 'Bar',   active: false },
  ],
}

export const WAITLIST = [
  { id: 'w1', name: 'Rivera', size: 4, waitMin: 18, quote: '20m',         note: 'Anniversary', vip: true,  next: true  },
  { id: 'w2', name: 'Chen',   size: 2, waitMin: 12, quote: '15m',         note: null,          vip: false, next: false },
  { id: 'w3', name: 'Patel',  size: 6, waitMin:  8, quote: '10m',         note: 'High chair',  vip: false, next: false },
  { id: 'w4', name: 'Kim',    size: 2, waitMin:  6, quote: '8m',          note: 'Bar OK',      vip: false, next: false },
  { id: 'w5', name: 'Nguyen', size: 3, waitMin:  4, quote: '5m',          note: null,          vip: false, next: false },
  { id: 'w6', name: 'Gomez',  size: 2, waitMin:  2, quote: 'Seated next', note: null,          vip: false, next: false },
]

// Coordinates in % of floor-plan SVG viewport (0..100 x, 0..70 y).
// `flagged: true` draws a warn halo around the tile (guest waiting too long).
export const FLOOR_TABLES = [
  { id: 'T1', x: 14, y: 18, status: 'seated',  occupancy: '2/2', seatedFor: '42min' },
  { id: 'T2', x: 28, y: 18, status: 'open'  },
  { id: 'T3', x: 44, y: 18, status: 'seated',  occupancy: '4/4', seatedFor: '18min' },
  { id: 'T4', x: 58, y: 18, status: 'turning' },
  { id: 'T5', x: 72, y: 18, status: 'seated',  occupancy: '2/2', seatedFor: '8min'  },
  { id: 'T6', x: 14, y: 42, status: 'seated',  occupancy: '4/4', seatedFor: '52min' },
  { id: 'T7', x: 28, y: 42, status: 'open'  },
  { id: 'T8', x: 44, y: 42, status: 'seated',  occupancy: '6/6', seatedFor: '28min' },
  { id: 'T9', x: 58, y: 42, status: 'seated',  occupancy: '2/2', seatedFor: '64min', flagged: true },
  { id: 'B1', x: 72, y: 64, status: 'bar',     occupancy: '3/4' },
  { id: 'B2', x: 84, y: 64, status: 'open'  },
]

// Ross suggestion anchored on the floor plan. Service will surface its
// own equivalent later; shape includes positions so the UI can render it
// near a specific table without re-layout.
export const FLOOR_ROSS = {
  id: 'ross-seat-suggestion',
  anchor: 'bottom-right',
  eyebrow: 'Ross',
  // Rich content rendered with known safe partials; no raw HTML injection.
  parts: [
    { type: 'text',   value: 'Seat ' },
    { type: 'strong', value: 'Chen' },
    { type: 'text',   value: ' at ' },
    { type: 'strong', value: 'T2' },
    { type: 'text',   value: ' — party of 2, quote drops from 12m to 4m.' },
  ],
  actions: [
    { id: 'seat',    label: 'Seat now', variant: 'accent' },
    { id: 'dismiss', label: 'Dismiss',  variant: 'ghost'  },
  ],
}

export const SERVICE_METRICS = [
  { key: 'avgWait',    label: 'Avg wait',     value: '14m',   delta: '-3m vs. LW',  good: true,
    trend: [17, 16, 16, 15, 14, 14, 14] },
  { key: 'turnTime',   label: 'Turn time',    value: '62m',   delta: '-4m vs. LW',  good: true,
    trend: [67, 66, 65, 64, 63, 62, 62] },
  { key: 'noShow',     label: 'No-show rate', value: '4.2%',  delta: '+0.8pp',      good: false,
    trend: [3.1, 3.3, 3.5, 3.7, 3.9, 4.0, 4.2] },
  { key: 'coverRate',  label: 'Cover rate',   value: '92%',   delta: '+2pp',        good: true,
    trend: [88, 89, 90, 90, 91, 91, 92] },
]

export const TONIGHT = {
  window: 'Tonight · 6:00–11:00',
  summary: '38 bookings · 142 covers expected',
  peak: 'Peak: 8:15 PM · 92% utilization',
  bookingsByHour: [
    { x: '18:00', y:  6 }, { x: '18:30', y:  9 }, { x: '19:00', y: 12 },
    { x: '19:30', y: 14 }, { x: '20:00', y: 18 }, { x: '20:30', y: 22 },
    { x: '21:00', y: 18 }, { x: '21:30', y: 12 }, { x: '22:00', y:  7 },
    { x: '22:30', y:  3 },
  ],
}
