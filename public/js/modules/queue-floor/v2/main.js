import { createApp } from 'vue'
import { createPinia } from 'pinia'
import QueueFloorApp from './components/QueueFloorApp.vue'

const app = createApp(QueueFloorApp)
app.use(createPinia())
app.mount('#app')
