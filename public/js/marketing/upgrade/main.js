// Sparks Hi-Fi upgrade page — Vue 3 entry.
//
// Mounts the UpgradeApp SFC, installs the Hi-Fi component plugin so
// <hf-button>, <hf-card>, <hf-chip>, <hf-icon> etc. resolve globally,
// and installs Pinia for consistency with the marketing landing app.
//
// Phase 6 PR 1C. Destination of the "Upgrade to All-in" CTA on
// locked template cards inside RossPlaybook.vue.

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import HiFi from '/js/design-system/hifi/index.js'
import UpgradeApp from './UpgradeApp.vue'

createApp(UpgradeApp).use(createPinia()).use(HiFi).mount('#app')
