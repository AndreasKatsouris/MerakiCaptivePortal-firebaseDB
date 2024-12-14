// guardRail.js

const brandCriteria = {
    "Ocean Basket": {
        allowedKeywords: ["Ocean Basket"],
        disallowedKeywords: ["Steers", "McDonald's", "KFC"],
        minAmount: 50, // Minimum receipt amount in currency
    },
    // Add more brands here...
};

async function validateReceipt(receiptData, brandName) {
    const criteria = brandCriteria[brandName];

    if (!criteria) {
        return {
            isValid: false,
            message: `No criteria defined for brand: ${brandName}`,
        };
    }

    // Validate allowed keywords in receipt data
    const containsAllowed = criteria.allowedKeywords.some(keyword =>
        receiptData.includes(keyword)
    );

    if (!containsAllowed) {
        return {
            isValid: false,
            message: `The receipt does not appear to be from ${brandName}.`,
        };
    }

    // Validate disallowed keywords
    const containsDisallowed = criteria.disallowedKeywords.some(keyword =>
        receiptData.includes(keyword)
    );

    if (containsDisallowed) {
        return {
            isValid: false,
            message: "The receipt appears to be from a different retailer.",
        };
    }

    // Add further checks (e.g., minimum amount)
    // This is a placeholder if `receiptData` includes amount information.
    // Assuming `receiptData` is parsed JSON with an "amount" key.
    if (criteria.minAmount && receiptData.amount < criteria.minAmount) {
        return {
            isValid: false,
            message: `The receipt amount is less than the minimum required for ${brandName}.`,
        };
    }

    return { isValid: true, message: "Receipt is valid for this campaign." };
}

module.exports = { validateReceipt };
