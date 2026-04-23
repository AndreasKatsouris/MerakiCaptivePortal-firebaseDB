import { createApp } from 'vue'
import { createPinia } from 'pinia'
import WeeklyBriefApp from './components/WeeklyBriefApp.vue'

const app = createApp(WeeklyBriefApp)
app.use(createPinia())
app.mount('#app')
