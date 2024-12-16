const { getCampaignDetails } = require('./campaigns');

/**
 * Validate receipt against campaign criteria
 * @param {object} receiptData - Parsed receipt data
 * @param {string} campaignName - Campaign name for validation
 * @returns {boolean} - Whether the receipt is valid
 */
async function validateReceipt(receiptData, campaignName) {
    const campaign = await getCampaignDetails(campaignName);
    if (!campaign) {
        console.error(`Campaign "${campaignName}" not found.`);
        return false;
    }

    if (!receiptData.storeName.toLowerCase().includes(campaign.brandName.toLowerCase())) {
        console.error(`Invalid receipt: Store "${receiptData.storeName}" does not match campaign brand "${campaign.brandName}".`);
        return false;
    }

    console.log(`Receipt validated successfully for campaign: ${campaignName}`);
    return true;
}

module.exports = { validateReceipt };
