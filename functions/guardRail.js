const { getCampaignDetails } = require('./campaigns');

/**
 * Validate receipt against predefined campaign criteria
 * @param {object} receiptData - Parsed receipt data
 * @param {string} campaignName - Campaign name for validation
 * @returns {Promise<boolean>} - Whether the receipt is valid
 */
async function validateReceipt(receiptData, campaignName) {
    const campaign = await getCampaignDetails(campaignName);
    if (!campaign) {
        throw new Error(`Campaign "${campaignName}" not found.`);
    }

    if (!receiptData.storeName.toLowerCase().includes(campaign.brandName.toLowerCase())) {
        console.error('Receipt validation failed: Incorrect store.');
        return false;
    }

    console.log('Receipt validation passed.');
    return true;
}

module.exports = { validateReceipt };
