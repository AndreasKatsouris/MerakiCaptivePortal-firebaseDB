// Sparks Hi-Fi marketing landing — Vue 3 entry.
//
// Mounts the LandingApp SFC, installs the Hi-Fi component plugin so
// <hf-button>, <hf-card>, <hf-chip>, <hf-icon> etc. resolve globally,
// and installs Pinia even though the marketing app doesn't read from
// any stores — the embedded RossOnboardingHello component imports
// useRossStore() at module scope, so Pinia must be available even
// though the prop-driven public mount bypasses any real store reads.

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import HiFi from '/js/design-system/hifi/index.js'
import LandingApp from './LandingApp.vue'

createApp(LandingApp).use(createPinia()).use(HiFi).mount('#app')
