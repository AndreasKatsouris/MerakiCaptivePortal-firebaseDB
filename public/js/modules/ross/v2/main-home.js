// Vue app entry — Ross home. Wires Pinia, mounts RossHome which
// internally picks desktop vs mobile layout by viewport.
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import RossHome from './components/RossHome.vue'

const app = createApp(RossHome)
app.use(createPinia())
app.mount('#app')
