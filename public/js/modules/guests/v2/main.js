import { createApp } from 'vue'
import { createPinia } from 'pinia'
import GuestsApp from './components/GuestsApp.vue'

const app = createApp(GuestsApp)
app.use(createPinia())
app.mount('#app')
