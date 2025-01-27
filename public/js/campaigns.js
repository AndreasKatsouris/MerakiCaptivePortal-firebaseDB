// Campaign Management Module
//let app = null;

function initializeCampaignManagement() {
    console.log('Starting campaign management initialization');
    
    const app = Vue.createApp(CampaignManager);
    app.use(createPinia()); // Add Pinia here
    
    const mountPoint = document.getElementById('campaignManagementRoot');
    if (!mountPoint) {
        console.error('Campaign management mount point not found');
        return;
    }
    
    return app.mount('#campaignManagementRoot');
}



export { initializeCampaignManagement };