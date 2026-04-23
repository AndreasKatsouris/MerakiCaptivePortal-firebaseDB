import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ReceiptsInboxApp from './components/ReceiptsInboxApp.vue'

const app = createApp(ReceiptsInboxApp)
app.use(createPinia())
app.mount('#app')
