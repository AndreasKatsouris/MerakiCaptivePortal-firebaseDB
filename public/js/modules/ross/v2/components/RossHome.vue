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
    case 'people':   return 'people-coming'    // 4c
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

  <!-- Phase 4c placeholder. Keeps the route switcher complete so deep
       links don't 404 during the transition. -->
  <div v-else class="ross-tab-coming">
    <div class="ross-tab-coming__inner">
      <a href="/ross.html" class="ross-tab-coming__back">← Back to Ross</a>
      <h1 class="ross-tab-coming__title">Coming next</h1>
      <p class="ross-tab-coming__lead">
        This tab is part of the Phase 4 admin redesign and ships in a
        follow-up PR. Workflows + templates have already moved to
        <a href="/ross.html?tab=playbook">Playbook</a>.
      </p>
    </div>
  </div>
</template>

<style scoped>
.ross-tab-coming {
  min-height: 100vh;
  background: var(--hf-bg);
  display: grid; place-items: center;
}
.ross-tab-coming__inner {
  max-width: 520px;
  padding: 32px;
  text-align: center;
}
.ross-tab-coming__back {
  color: var(--hf-ink-2);
  font-family: var(--hf-font-body);
  font-size: 12px;
  text-decoration: none;
}
.ross-tab-coming__back:hover { color: var(--hf-ink); }
.ross-tab-coming__title {
  font-family: var(--hf-font-display);
  font-size: 36px; font-weight: 400;
  letter-spacing: -0.015em;
  margin: 16px 0 8px;
}
.ross-tab-coming__lead {
  color: var(--hf-ink-2);
  font-size: 15px; line-height: 1.6;
}
.ross-tab-coming__lead a { color: var(--hf-accent); }
</style>
