import { createApp } from 'vue'
import { createPinia } from 'pinia'
import CampaignManager from './components/CampaignManager.vue'

window.initializeCampaignManagement = function() {
    console.log('Starting campaign management initialization')
    try {
        const app = createApp(CampaignManager)
        
        // Initialize Pinia
        const pinia = createPinia()
        app.use(pinia)
        
        // Mount the app
        const mountPoint = document.getElementById('campaignManagementRoot')
        if (!mountPoint) {
            throw new Error('Campaign management mount point not found')
        }
        
        return app.mount('#campaignManagementRoot')
    } catch (error) {
        console.error('Error initializing campaign management:', error)
        throw error
    }
}