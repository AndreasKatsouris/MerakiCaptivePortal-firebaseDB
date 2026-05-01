<script setup>
// Responsive + tab switcher.
//
// Tab routing (?tab= URL param) — concierge-first IA. The home
// (default) is the front door; ?tab=playbook|activity|people opens a
// deeper governance destination. URL changes don't trigger a full
// reload; we listen to popstate to keep state in sync with browser
// back/forward.
//
// Viewport routing — desktop layout ≥900px (3-column editorial grid),
// mobile below. matchMedia so it responds to DPR / orientation flips
// without re-measuring on resize.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import RossHomeDesktop from './RossHomeDesktop.vue'
import RossHomeMobile from './RossHomeMobile.vue'
import RossPlaybook from './RossPlaybook.vue'
import RossActivity from './RossActivity.vue'
import RossPeople from './RossPeople.vue'

const isDesktop = ref(true)
let mql = null

const VALID_TABS = new Set(['home', 'playbook', 'activity', 'people'])
const tab = ref('home')

function readTab() {
  if (typeof window === 'undefined') return 'home'
  const t = new URLSearchParams(window.location.search).get('tab')
  return t && VALID_TABS.has(t) ? t : 'home'
}

function apply(e) { isDesktop.value = e.matches }
function syncTab() { tab.value = readTab() }

const view = computed(() => {
  switch (tab.value) {
    case 'playbook': return 'playbook'
    case 'activity': return 'activity'
    case 'people':   return 'people'
    default:         return isDesktop.value ? 'home-desktop' : 'home-mobile'
  }
})

onMounted(() => {
  if (typeof window === 'undefined') return
  mql = window.matchMedia('(min-width: 900px)')
  apply(mql)
  mql.addEventListener('change', apply)
  syncTab()
  window.addEventListener('popstate', syncTab)
})
onBeforeUnmount(() => {
  if (mql) mql.removeEventListener('change', apply)
  if (typeof window !== 'undefined') window.removeEventListener('popstate', syncTab)
})
</script>

<template>
  <RossHomeDesktop v-if="view === 'home-desktop'" />
  <RossHomeMobile v-else-if="view === 'home-mobile'" />
  <RossPlaybook v-else-if="view === 'playbook'" />
  <RossActivity v-else-if="view === 'activity'" />
  <RossPeople v-else-if="view === 'people'" />
</template>

