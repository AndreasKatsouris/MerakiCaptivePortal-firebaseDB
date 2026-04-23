<script setup>
// Responsive switcher. Renders desktop layout above 900px viewport
// (where the 3-column editorial grid has room), mobile below. Uses
// matchMedia rather than window.innerWidth so it responds to DPR
// changes and orientation flips without re-measuring on resize.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import RossHomeDesktop from './RossHomeDesktop.vue'
import RossHomeMobile from './RossHomeMobile.vue'

const isDesktop = ref(true)
let mql = null

function apply(e) { isDesktop.value = e.matches }

onMounted(() => {
  if (typeof window === 'undefined') return
  mql = window.matchMedia('(min-width: 900px)')
  apply(mql)
  mql.addEventListener('change', apply)
})
onBeforeUnmount(() => {
  if (mql) mql.removeEventListener('change', apply)
})
</script>

<template>
  <RossHomeDesktop v-if="isDesktop" />
  <RossHomeMobile v-else />
</template>
