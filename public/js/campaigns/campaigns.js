const { createApp } = Vue
const { createPinia } = Pinia
import CampaignManager from './components/CampaignManager.vue'

// Export for external use
export function initializeCampaignManagement() {
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

// Also expose to window for existing code
window.initializeCampaignManagement = initializeCampaignManagement