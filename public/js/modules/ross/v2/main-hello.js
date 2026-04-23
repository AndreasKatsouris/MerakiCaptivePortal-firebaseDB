// Vue app entry — Ross first-run hello.
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import RossOnboardingHello from './components/RossOnboardingHello.vue'

const app = createApp(RossOnboardingHello)
app.use(createPinia())
app.mount('#app')
