import { createApp } from 'vue'
import { createPinia } from 'pinia'
import CampaignsComposeApp from './components/CampaignsComposeApp.vue'

const app = createApp(CampaignsComposeApp)
app.use(createPinia())
app.mount('#app')
