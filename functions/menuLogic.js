const admin = require('firebase-admin');
const { processReward } = require('./rewardsProcessor');
const { deleteUserData } = require('./dataManagement');

// Command definitions with their variations
const COMMANDS = {
    DELETE_DATA: {
        patterns: [
            'delete my data',
            'delete my information',
            'delete my personal info',
            'delete my details',
            'remove my data',
            'remove my information',
            'remove my personal info',
            'remove my details',
            'erase my data',
            'forget my details'
        ],
        handler: async (phoneNumber) => {
            return await deleteUserData(phoneNumber);
        },
    },
    CHECK_POINTS: {
        patterns: [
            'check points',
            'how many points',
            'point balance',
            'show points',
            'view points',
            'my points'
        ],
        handler: async (phoneNumber) => {
            const points = await getGuestPoints(phoneNumber);
            return {
                success: true,
                message: `You currently have ${points} points.`
            };
        },
    },
    CHECK_REWARDS: {
        patterns: [
            'check rewards',
            'my rewards',
            'show rewards',
            'view rewards',
            'available rewards'
        ],
        handler: async (phoneNumber) => {
            const rewards = await getGuestRewards(phoneNumber);
            return formatRewardsMessage(rewards);
        },
    },
    HELP: {
        patterns: [
            'help',
            'menu',
            'what can you do',
            'commands',
            'options'
        ],
        handler: async () => {
            return {
                success: true,
                message: getHelpMessage()
            };
        },
    }
};

/**
 * Process incoming message and route to appropriate handler
 * @param {string} message - The incoming message text
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<Object>} Processing result
 */
async function processMessage(message, phoneNumber) {
    console.log(`Processing message: "${message}" from ${phoneNumber}`);
    
    const normalizedMessage = message.toLowerCase().trim();

    // Check each command for matching patterns
    for (const [commandType, command] of Object.entries(COMMANDS)) {
        if (command.patterns.some(pattern => normalizedMessage.includes(pattern))) {
            console.log(`Matched command: ${commandType}`);
            try {
                return await command.handler(phoneNumber);
            } catch (error) {
                console.error(`Error executing ${commandType}:`, error);
                return {
                    success: false,
                    message: `Sorry, there was an error processing your request. Please try again later.`
                };
            }
        }
    }

    // If no command matched, return help message
    return {
        success: false,
        message: `I couldn't understand your request. Here's what you can do:\n\n${getHelpMessage()}`
    };
}

/**
 * Get guest's current point balance
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<number>} Point balance
 */
async function getGuestPoints(phoneNumber) {
    try {
        const snapshot = await admin.database().ref(`guests/${phoneNumber}/points`).once('value');
        return snapshot.val() || 0;
    } catch (error) {
        console.error('Error fetching points:', error);
        throw new Error('Failed to fetch points');
    }
}

/**
 * Get guest's current rewards
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<Array>} List of rewards
 */
async function getGuestRewards(phoneNumber) {
    try {
        const snapshot = await admin.database().ref(`guest-rewards/${phoneNumber}`).once('value');
        const rewards = snapshot.val() || {};
        
        // Fetch full reward details
        const rewardDetails = await Promise.all(
            Object.keys(rewards).map(async (rewardId) => {
                const rewardSnapshot = await admin.database().ref(`rewards/${rewardId}`).once('value');
                return rewardSnapshot.val();
            })
        );

        return rewardDetails.filter(Boolean);
    } catch (error) {
        console.error('Error fetching rewards:', error);
        throw new Error('Failed to fetch rewards');
    }
}

/**
 * Format rewards list into readable message
 * @param {Array} rewards - List of reward objects
 * @returns {Object} Formatted message result
 */
function formatRewardsMessage(rewards) {
    if (!rewards.length) {
        return {
            success: true,
            message: "You don't have any rewards yet. Send us a receipt from your next eligible purchase to earn rewards!"
        };
    }

    const rewardsList = rewards
        .map(reward => `- ${reward.campaignName}: ${formatRewardStatus(reward)}`)
        .join('\n');

    return {
        success: true,
        message: `Here are your rewards:\n\n${rewardsList}`
    };
}

/**
 * Format individual reward status
 * @param {Object} reward - Reward object
 * @returns {string} Formatted status
 */
function formatRewardStatus(reward) {
    switch (reward.status) {
        case 'pending':
            return 'Processing';
        case 'approved':
            return 'Ready to use';
        case 'completed':
            return 'Used';
        case 'expired':
            return 'Expired';
        default:
            return reward.status;
    }
}

/**
 * Get help message listing available commands
 * @returns {string} Formatted help message
 */
function getHelpMessage() {
    return `Here's what you can do:
• Send a photo of your receipt to earn rewards
• "Check my points" to see your point balance
• "View my rewards" to see your available rewards
• "Delete my data" to remove your information
• "Help" to see this menu again`;
}

module.exports = {
    processMessage,
    COMMANDS
};