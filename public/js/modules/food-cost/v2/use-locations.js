// Location source for the food-cost v2 surface (D3 T5).
//
// CHOICE, documented per the T5 brief: no shared location-picker service
// exists in the v2 codebase — the established pattern is a per-store fetch of
// userLocations/{uid} enriched with locations/{id}/name (mirrored from
// public/js/modules/ross/v2/playbook-store.js:31-45 fetchUserLocations, which
// itself mirrors people-store.js). Replicated here as a composable rather than
// cross-importing the ross module (disjoint module scopes), and kept OUT of
// the components so they stay free of direct firebase imports (T5 ground rule:
// all component I/O goes through stores/composables).
//
// Best-effort semantics match the source pattern: a name read failing leaves
// the id as the label; the whole load failing surfaces locationsError.

import { ref } from 'vue'
import { auth, rtdb, ref as dbRef, get } from '../../../config/firebase-config.js'

export function useLocations() {
  const locations = ref([])          // [{ id, name }] sorted by name
  const locationsLoading = ref(false)
  const locationsError = ref(null)
  const locationsLoaded = ref(false)

  async function loadLocations() {
    if (locationsLoading.value || locationsLoaded.value) return
    locationsLoading.value = true
    locationsError.value = null
    try {
      const user = auth.currentUser
      if (!user) {
        locations.value = []
        locationsLoaded.value = true
        return
      }
      const snap = await get(dbRef(rtdb, `userLocations/${user.uid}`))
      const ids = snap.exists() ? Object.keys(snap.val() || {}) : []
      const enriched = await Promise.all(ids.map(async (id) => {
        let name = id
        try {
          const ns = await get(dbRef(rtdb, `locations/${id}/name`))
          if (ns.exists() && typeof ns.val() === 'string') name = ns.val()
        } catch (_) { /* keep id as the fallback label */ }
        return { id, name }
      }))
      enriched.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
      locations.value = enriched
      locationsLoaded.value = true
    } catch (e) {
      locationsError.value = e.message || String(e)
    } finally {
      locationsLoading.value = false
    }
  }

  return { locations, locationsLoading, locationsError, loadLocations }
}
