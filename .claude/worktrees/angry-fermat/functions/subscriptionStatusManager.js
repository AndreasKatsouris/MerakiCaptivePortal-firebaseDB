/**
 * Subscription Status Manager
 * Handles automatic status updates for subscriptions based on expiration dates
 */

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');

// Get database reference (will be initialized when admin is ready)
function getDb() {
  return admin.database();
}

/**
 * Check and update subscription status based on expiration
 * This function runs periodically to check all subscriptions
 */
async function checkAndUpdateSubscriptionStatus(userId, subscription) {
  const now = Date.now();
  let needsUpdate = false;
  const updates = {};

  // Check if trial period has expired
  if (subscription.isTrial && subscription.trialEndDate) {
    if (subscription.trialEndDate < now && subscription.status === 'trial') {
      console.log(`Trial expired for user ${userId}`);
      updates.status = 'expired';
      updates.paymentStatus = 'expired';
      updates.lastUpdated = now;
      updates[`history/${now}`] = {
        action: 'trial_expired',
        previousStatus: subscription.status,
        timestamp: now,
        reason: 'Trial period ended'
      };
      needsUpdate = true;
    }
  }

  // Check if paid subscription has expired
  if (subscription.renewalDate && subscription.renewalDate < now) {
    if (subscription.status === 'active') {
      console.log(`Subscription expired for user ${userId}`);
      updates.status = 'expired';
      updates.paymentStatus = 'expired';
      updates.lastUpdated = now;
      updates[`history/${now}`] = {
        action: 'subscription_expired',
        previousStatus: subscription.status,
        timestamp: now,
        reason: 'Subscription period ended'
      };
      needsUpdate = true;
    }
  }

  // Apply updates if needed
  if (needsUpdate) {
    await getDb().ref(`subscriptions/${userId}`).update(updates);
    console.log(`Updated status to expired for user ${userId}`);
    return { userId, updated: true, newStatus: 'expired' };
  }

  return { userId, updated: false };
}

/**
 * Scheduled function to check all subscriptions periodically
 * Runs daily at midnight
 */
exports.checkSubscriptionStatuses = functions.scheduler.onSchedule(
  {
    schedule: 'every day 00:00',
    timeZone: 'Africa/Johannesburg',
    memory: '256MiB',
    region: 'us-central1'
  },
  async (event) => {
    console.log('Starting scheduled subscription status check');

    try {
      const snapshot = await getDb().ref('subscriptions').once('value');
      const subscriptions = snapshot.val() || {};

      const results = [];
      let checkedCount = 0;
      let updatedCount = 0;

      // Check each subscription
      for (const [userId, subscription] of Object.entries(subscriptions)) {
        if (!subscription) continue;

        checkedCount++;
        const result = await checkAndUpdateSubscriptionStatus(userId, subscription);

        if (result.updated) {
          updatedCount++;
          results.push(result);
        }
      }

      console.log(
        `Subscription status check complete: ${checkedCount} checked, ${updatedCount} updated`
      );

      return {
        success: true,
        checkedCount,
        updatedCount,
        results
      };
    } catch (error) {
      console.error('Error in subscription status check:', error);
      throw error;
    }
  }
);

/**
 * HTTPS callable function to manually trigger subscription status check
 * for a specific user or all users
 */
exports.triggerSubscriptionStatusCheck = functions.https.onCall(
  { region: 'us-central1', memory: '256MiB' },
  async (request) => {
    const { userId } = request.data;

    try {
      if (userId) {
        // Check specific user
        const snapshot = await getDb().ref(`subscriptions/${userId}`).once('value');
        const subscription = snapshot.val();

        if (!subscription) {
          return {
            success: false,
            error: 'Subscription not found'
          };
        }

        const result = await checkAndUpdateSubscriptionStatus(userId, subscription);

        return {
          success: true,
          checked: 1,
          updated: result.updated ? 1 : 0,
          result
        };
      } else {
        // Check all subscriptions
        const snapshot = await getDb().ref('subscriptions').once('value');
        const subscriptions = snapshot.val() || {};

        const results = [];
        let checkedCount = 0;
        let updatedCount = 0;

        for (const [uid, subscription] of Object.entries(subscriptions)) {
          if (!subscription) continue;

          checkedCount++;
          const result = await checkAndUpdateSubscriptionStatus(uid, subscription);

          if (result.updated) {
            updatedCount++;
            results.push(result);
          }
        }

        return {
          success: true,
          checked: checkedCount,
          updated: updatedCount,
          results
        };
      }
    } catch (error) {
      console.error('Error triggering status check:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
);

/**
 * Database trigger: Check subscription status when trialEndDate is updated
 */
exports.onTrialEndDateUpdate = functions.database
  .ref('subscriptions/{userId}/trialEndDate')
  .onWrite(async (change, context) => {
    const { userId } = context.params;

    try {
      // Get the full subscription
      const snapshot = await getDb().ref(`subscriptions/${userId}`).once('value');
      const subscription = snapshot.val();

      if (!subscription) {
        console.log(`Subscription not found for user ${userId}`);
        return null;
      }

      // Check if status needs update
      const result = await checkAndUpdateSubscriptionStatus(userId, subscription);

      if (result.updated) {
        console.log(`Auto-updated status to expired for user ${userId} after trialEndDate change`);
      }

      return result;
    } catch (error) {
      console.error('Error in onTrialEndDateUpdate trigger:', error);
      return null;
    }
  });

/**
 * Database trigger: Check subscription status when renewalDate is updated
 */
exports.onRenewalDateUpdate = functions.database
  .ref('subscriptions/{userId}/renewalDate')
  .onWrite(async (change, context) => {
    const { userId } = context.params;

    try {
      // Get the full subscription
      const snapshot = await getDb().ref(`subscriptions/${userId}`).once('value');
      const subscription = snapshot.val();

      if (!subscription) {
        console.log(`Subscription not found for user ${userId}`);
        return null;
      }

      // Check if status needs update
      const result = await checkAndUpdateSubscriptionStatus(userId, subscription);

      if (result.updated) {
        console.log(`Auto-updated status to expired for user ${userId} after renewalDate change`);
      }

      return result;
    } catch (error) {
      console.error('Error in onRenewalDateUpdate trigger:', error);
      return null;
    }
  });

// Export the status check function for testing
exports.checkAndUpdateSubscriptionStatus = checkAndUpdateSubscriptionStatus;
