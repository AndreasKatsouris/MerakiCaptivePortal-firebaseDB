const admin = require('firebase-admin');

// Ensure Firebase is initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

/**
 * Fetch all active campaigns from Firebase
 * @returns {Promise<object[]>} - List of active campaigns
 */
async function fetchCampaigns() {
    try {
        const snapshot = await admin.database().ref('campaigns').once('value');
        const campaigns = snapshot.val();
        return campaigns ? Object.values(campaigns) : [];
    } catch (error) {
        console.error('Error fetching campaigns:', error);
        throw new Error('Failed to fetch campaigns.');
    }
}

/**
 * Get details of a specific campaign by name
 * @param {string} campaignName - The name of the campaign
 * @returns {Promise<object>} - Campaign details
 */
async function getCampaignDetails(campaignName) {
    const campaigns = await fetchCampaigns();
    return campaigns.find(campaign => campaign.name.toLowerCase() === campaignName.toLowerCase());
}

module.exports = {
    fetchCampaigns,
    getCampaignDetails,
};
