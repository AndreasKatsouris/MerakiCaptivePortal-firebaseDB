// Campaign Management Module
import { createPinia } from 'pinia';
import { CampaignManager } from './components/CampaignManager.js';

function initializeCampaignManagement() {
    console.log('Starting campaign management initialization');
    try {
        const app = Vue.createApp(CampaignManager);
        const pinia = createPinia();
        app.use(pinia);
        
        const mountPoint = document.getElementById('campaignManagementRoot');
        if (!mountPoint) {
            throw new Error('Campaign management mount point not found');
        }
        
        return app.mount('#campaignManagementRoot');
    } catch (error) {
        console.error('Error initializing campaign management:', error);
        throw error;
    }
}

export { initializeCampaignManagement };