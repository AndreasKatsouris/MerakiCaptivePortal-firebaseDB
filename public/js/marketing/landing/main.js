// Sparks Hi-Fi marketing landing — Vue 3 entry.
// Mounts the LandingApp SFC and installs the Hi-Fi component plugin
// so <hf-button>, <hf-card>, <hf-chip>, <hf-icon> etc. resolve globally.

import { createApp } from 'vue'
import HiFi from '/js/design-system/hifi/index.js'
import LandingApp from './LandingApp.vue'

createApp(LandingApp).use(HiFi).mount('#app')
