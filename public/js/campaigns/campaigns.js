// campaigns.js
function initializeCampaignManagement() {
    console.log('Starting campaign management initialization');
    try {
        // Create Vue app with CampaignManager
        const app = Vue.createApp(CampaignManager);
        
        // Mount the app
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