import { createApp } from 'vue'
import { createPinia } from 'pinia'
import GroupOverviewApp from './components/GroupOverviewApp.vue'

const app = createApp(GroupOverviewApp)
app.use(createPinia())
app.mount('#app')
