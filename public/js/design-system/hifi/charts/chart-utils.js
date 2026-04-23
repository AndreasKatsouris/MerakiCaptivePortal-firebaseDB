// Shared chart helpers — pure functions, no Vue coupling.

export function normalize(data) {
  // Accept [number, ...] or [{x, y, label?, lower?, upper?}, ...] and
  // return normalized objects. Preserves original x (incl. Date) so
  // formatters can access it; stringifies for the default label.
  if (!Array.isArray(data) || data.length === 0) return []
  if (typeof data[0] === 'number') {
    return data.map((y, i) => ({ x: i, y, label: String(i) }))
  }
  return data.map((d, i) => {
    const x = d.x ?? i
    const label = d.label ?? (x instanceof Date ? x.toISOString().slice(0, 10) : String(x))
    return {
      x,
      y: +d.y,
      label,
      lower: d.lower != null ? +d.lower : null,
      upper: d.upper != null ? +d.upper : null,
    }
  })
}

// Format an x-axis label. If x is a Date (or an ISO date string), use an
// SA-style DD/MM; otherwise use the passed label string. Caller can pass
// a custom formatter to override.
export function formatDateTick(x, { locale = 'en-ZA', opts = { day: '2-digit', month: '2-digit' } } = {}) {
  const d = x instanceof Date ? x : (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) ? new Date(x) : null)
  if (!d || Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(locale, opts).format(d)
}

export function extent(arr, accessor = v => v) {
  let min = Infinity, max = -Infinity
  for (const v of arr) {
    const n = accessor(v)
    if (n < min) min = n
    if (n > max) max = n
  }
  if (min === Infinity) return [0, 1]
  if (min === max) return [min - 1, max + 1]
  return [min, max]
}

// Catmull-Rom → cubic Bézier path. Ported from kit.jsx LineChart.
export function smoothPath(points) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`
  return points.reduce((acc, p, i, a) => {
    if (i === 0) return `M ${p[0]} ${p[1]}`
    const prev = a[i - 1], next = a[i + 1] || p, prev2 = a[i - 2] || prev
    const c1x = prev[0] + (p[0] - prev2[0]) / 6
    const c1y = prev[1] + (p[1] - prev2[1]) / 6
    const c2x = p[0] - (next[0] - prev[0]) / 6
    const c2y = p[1] - (next[1] - prev[1]) / 6
    return acc + ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p[0].toFixed(2)} ${p[1].toFixed(2)}`
  }, '')
}

// "Nice" tick values for an axis — 4-6 ticks, rounded to 1/2/5 × 10^n.
export function niceTicks(min, max, targetCount = 5) {
  const range = max - min
  const roughStep = range / targetCount
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const normalized = roughStep / magnitude
  const step = (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) * magnitude
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks = []
  for (let v = niceMin; v <= niceMax + 1e-9; v += step) ticks.push(Number(v.toFixed(10)))
  return { ticks, niceMin, niceMax }
}

export function formatNumber(n, { compact = false } = {}) {
  if (n == null || Number.isNaN(n)) return '—'
  if (compact) {
    const abs = Math.abs(n)
    if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
    if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
    if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
  }
  return new Intl.NumberFormat('en-ZA').format(n)
}

// Install once, reused by all chart components.
export function useResponsiveWidth(elRef, onResize) {
  let ro
  const attach = () => {
    if (!elRef.value || typeof ResizeObserver === 'undefined') return
    ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      if (w > 0) onResize(w)
    })
    ro.observe(elRef.value)
  }
  const detach = () => ro && ro.disconnect()
  return { attach, detach }
}
