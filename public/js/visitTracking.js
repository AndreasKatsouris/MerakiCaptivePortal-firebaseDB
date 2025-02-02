const admin = require('firebase-admin');
const visitTracking = require('./visitTracking');

// Main visit tracking class
class VisitTracking {
    constructor() {
        this.db = admin.database();
    }

    // Record a new visit from receipt data
    async recordVisit(receiptData, guestPhone) {
        try {
            console.log('Recording visit for guest:', guestPhone);
            
            const visitData = {
                date: receiptData.date,
                store: receiptData.storeName,
                amount: receiptData.totalAmount,
                items: receiptData.items,
                receiptId: receiptData.receiptId,
                timestamp: Date.now()
            };

            // Create visit record
            const visitRef = this.db.ref(`guests/${guestPhone}/visits`).push();
            await visitRef.set(visitData);

            // Update guest metrics
            await this.updateGuestMetrics(guestPhone);

            return {
                success: true,
                visitId: visitRef.key,
                message: 'Visit recorded successfully'
            };
        } catch (error) {
            console.error('Error recording visit:', error);
            throw new Error('Failed to record visit');
        }
    }

    // Get visit history for a guest
    async getVisitHistory(guestPhone, options = {}) {
        try {
            const { limit = 10, startDate, endDate } = options;
            let query = this.db.ref(`guests/${guestPhone}/visits`).orderByChild('timestamp');

            if (startDate) {
                query = query.startAt(startDate);
            }
            if (endDate) {
                query = query.endAt(endDate);
            }
            if (limit) {
                query = query.limitToLast(limit);
            }

            const snapshot = await query.once('value');
            return snapshot.val() || {};
        } catch (error) {
            console.error('Error fetching visit history:', error);
            throw new Error('Failed to fetch visit history');
        }
    }

    // Calculate visit metrics for a guest
    async calculateVisitMetrics(guestPhone) {
        try {
            const snapshot = await this.db.ref(`guests/${guestPhone}/visits`).once('value');
            const visits = snapshot.val() || {};
            const visitArray = Object.values(visits);

            // Calculate basic metrics
            const metrics = {
                totalVisits: visitArray.length,
                totalSpent: visitArray.reduce((sum, visit) => sum + (visit.amount || 0), 0),
                averageSpend: 0,
                firstVisit: null,
                lastVisit: null,
                visitFrequency: 0,
                storeFrequency: {},
                preferredStore: null
            };

            if (visitArray.length > 0) {
                // Calculate averages and dates
                metrics.averageSpend = metrics.totalSpent / metrics.totalVisits;
                metrics.firstVisit = Math.min(...visitArray.map(v => v.timestamp));
                metrics.lastVisit = Math.max(...visitArray.map(v => v.timestamp));

                // Calculate visit frequency (visits per month)
                const monthsDiff = (metrics.lastVisit - metrics.firstVisit) / (1000 * 60 * 60 * 24 * 30);
                metrics.visitFrequency = metrics.totalVisits / (monthsDiff || 1);

                // Calculate store frequency
                visitArray.forEach(visit => {
                    if (visit.store) {
                        metrics.storeFrequency[visit.store] = (metrics.storeFrequency[visit.store] || 0) + 1;
                    }
                });

                // Find preferred store
                metrics.preferredStore = Object.entries(metrics.storeFrequency)
                    .sort(([,a], [,b]) => b - a)[0]?.[0] || null;
            }

            return metrics;
        } catch (error) {
            console.error('Error calculating visit metrics:', error);
            throw new Error('Failed to calculate visit metrics');
        }
    }

    // Update guest metrics in database
    async updateGuestMetrics(guestPhone) {
        try {
            const metrics = await this.calculateVisitMetrics(guestPhone);
            await this.db.ref(`guests/${guestPhone}/metrics`).update(metrics);
            return metrics;
        } catch (error) {
            console.error('Error updating guest metrics:', error);
            throw new Error('Failed to update guest metrics');
        }
    }

    // Get store-specific visit data
    async getStoreVisits(storeId, options = {}) {
        try {
            const { limit = 100, startDate, endDate } = options;
            
            // Query all guests' visits
            const snapshot = await this.db.ref('guests').once('value');
            const guests = snapshot.val() || {};

            const storeVisits = [];
            
            // Process each guest's visits
            Object.entries(guests).forEach(([phone, data]) => {
                if (data.visits) {
                    Object.entries(data.visits)
                        .filter(([, visit]) => {
                            const matchesStore = visit.store === storeId;
                            const matchesDateRange = (!startDate || visit.timestamp >= startDate) &&
                                                   (!endDate || visit.timestamp <= endDate);
                            return matchesStore && matchesDateRange;
                        })
                        .forEach(([visitId, visit]) => {
                            storeVisits.push({
                                visitId,
                                guestPhone: phone,
                                ...visit
                            });
                        });
                }
            });

            // Sort by timestamp and apply limit
            return storeVisits
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, limit);
        } catch (error) {
            console.error('Error fetching store visits:', error);
            throw new Error('Failed to fetch store visits');
        }
    }
}

// Export the class
module.exports = new VisitTracking();