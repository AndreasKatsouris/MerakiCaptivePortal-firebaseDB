import { rtdb, ref, get } from '../../../../config/firebase-config.js'

/**
 * Best-effort location-name enrichment. Older workflows were created
 * with locationName === locationId (functions/ross.js fallback when the
 * create call didn't pass locationNames). Read locations/{id}/name
 * directly to recover the human-readable name. Returns a Map keyed by
 * locationId. Always resolves — failures yield an empty entry, never
 * throw, so callers don't fail just because some locations aren't
 * readable.
 *
 * Extracted from activity-store / playbook-store / people-store. Add
 * this import wherever a v2 surface needs to display location names
 * sourced from a CF response that may carry the legacy id-as-name
 * value.
 */
export async function fetchLocationNames(locationIds) {
  const out = new Map()
  await Promise.all(locationIds.map(async (locId) => {
    try {
      const snap = await get(ref(rtdb, `locations/${locId}/name`))
      if (snap.exists() && typeof snap.val() === 'string') {
        out.set(locId, snap.val())
      }
    } catch (_) { /* leave empty */ }
  }))
  return out
}
