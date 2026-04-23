// Food Cost service — Phase A2 scripted placeholder. A2.1 will swap the
// body for real RTDB queries: foodCostIndex/byLocation/{locId}, the menu
// items margin aggregation, inventoryByLocation stock levels, and the
// weekly waste log. Call sites unchanged.

import {
  HEADER, KPI_TILES, ROSS_DIAGNOSIS,
  MENU_DRIFT, MENU_FILTERS, STOCK_RUNWAY, STOCK_MAX_DAYS, WASTE_LOG_7D,
  currentDateLine,
} from './content.js'

const FAKE_LATENCY_MS = 60
const wait = () => new Promise(r => setTimeout(r, FAKE_LATENCY_MS))

export async function getFoodCostOverview({ locationId = 'ocean-club', range = '30d' } = {}) {
  await wait()
  return {
    locationId,
    range,
    dateLine: currentDateLine(),
    header: HEADER,
    kpis: KPI_TILES,
    diagnosis: ROSS_DIAGNOSIS,
    menu: { rows: MENU_DRIFT, filters: MENU_FILTERS, total: 48 },
    stock: { rows: STOCK_RUNWAY, maxDays: STOCK_MAX_DAYS },
    waste: WASTE_LOG_7D,
  }
}
