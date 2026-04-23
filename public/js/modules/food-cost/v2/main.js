import { createApp } from 'vue'
import { createPinia } from 'pinia'
import FoodCostApp from './components/FoodCostApp.vue'

const app = createApp(FoodCostApp)
app.use(createPinia())
app.mount('#app')
