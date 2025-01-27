// campaigns.js
// Make sure CampaignManager is available globally
(function() {
    // Define the initialization function
    window.initializeCampaignManagement = function() {
        console.log('Starting campaign management initialization');
        try {
            // Create Vue app with CampaignManager
            const app = Vue.createApp(window.CampaignManager);
            
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
    };
})();