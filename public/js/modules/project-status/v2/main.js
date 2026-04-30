import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ProjectStatusApp from './components/ProjectStatusApp.vue'

const app = createApp(ProjectStatusApp)
app.use(createPinia())
app.mount('#app')
