// Food Cost v2 formatting helpers (SA locale).
//
// D3 T5: the Phase-A2 scripted data blocks (HEADER, KPI_TILES, ROSS_DIAGNOSIS,
// MENU_DRIFT, MENU_FILTERS, STOCK_RUNWAY, WASTE_LOG_7D) are GONE — the page
// now renders the real §5 payload from the foodCostOverview CF via store.js.
// Only the locale formatters survive; nothing else imported them (grep-verified
// at removal time: FoodCostApp.vue was the sole consumer).

export function currentDateLine() {
  const fmt = new Intl.DateTimeFormat('en-ZA', { weekday: 'long', month: 'long', day: 'numeric' })
  return fmt.format(new Date())
}

export function zar(n) {
  return 'R' + new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(n)
}
