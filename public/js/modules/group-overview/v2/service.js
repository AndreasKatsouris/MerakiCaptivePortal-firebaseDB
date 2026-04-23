// Group Overview service. Current implementation returns scripted data
// from ./content.js; A1.1 will replace bodies with RTDB queries against
// salesDataIndex/byLocation/{locationId}, queueIndex, foodCostIndex, and
// the menu items aggregation. Call sites stay identical.

import {
  KPI_TILES, REVENUE_30D, BY_VENUE_TODAY,
  FLOOR_TODAY, MENU_TOP, ROSS_TODAY_TILE, currentDateLine,
} from './content.js'

const FAKE_LATENCY_MS = 60
const wait = () => new Promise(r => setTimeout(r, FAKE_LATENCY_MS))

export async function getGroupOverview({ range = 'M' } = {}) {
  await wait()
  return {
    dateLine: currentDateLine(),
    range,
    kpis: KPI_TILES,
    revenue30d: REVENUE_30D,
    byVenue: BY_VENUE_TODAY,
    floor: FLOOR_TODAY,
    menuTop: MENU_TOP,
    rossTile: ROSS_TODAY_TILE,
  }
}
