// Test Data Setup for Tier Management
// This script creates mock data in Firebase for testing the enhanced tier management features

import { rtdb, ref, set, get, update, auth } from '../../../config/firebase-config.js';

export async function setupTierTestData() {
    console.log('Setting up test data for Tier Management...');
    
    try {
        // 1. Create test users with various subscription states
        const testUsers = {
            'user1': {
                email: 'free-user@test.com',
                displayName: 'Free User',
                createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000 // 90 days ago
            },
            'user2': {
                email: 'basic-user@test.com', 
                displayName: 'Basic User',
                createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000 // 60 days ago
            },
            'user3': {
                email: 'pro-user@test.com',
                displayName: 'Pro User', 
                createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000 // 45 days ago
            },
            'user4': {
                email: 'premium-user@test.com',
                displayName: 'Premium User',
                createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000 // 30 days ago
            },
            'user5': {
                email: 'trial-user@test.com',
                displayName: 'Trial User',
                createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days ago
            }
        };
        
        // 2. Create test subscriptions
        const testSubscriptions = {
            'user1': {
                tier: 'free',
                status: 'none',
                paymentStatus: 'none',
                monthlyPrice: 0,
                features: {
                    wifiBasic: true,
                    analyticsBasic: true
                },
                limits: {
                    locations: 1,
                    devicesPerLocation: 50
                },
                lastUpdated: Date.now()
            },
            'user2': {
                tier: 'basic',
                status: 'active',
                paymentStatus: 'active',
                monthlyPrice: 29,
                expirationDate: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 days from now
                features: {
                    wifiBasic: true,
                    analyticsBasic: true,
                    whatsappBasic: true
                },
                limits: {
                    locations: 2,
                    devicesPerLocation: 100
                },
                lastUpdated: Date.now(),
                history: {
                    [Date.now() - 30 * 24 * 60 * 60 * 1000]: {
                        action: 'subscription_created',
                        tier: 'basic',
                        timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000
                    }
                }
            },
            'user3': {
                tier: 'pro',
                status: 'active',
                paymentStatus: 'active',
                monthlyPrice: 99,
                expirationDate: Date.now() + 45 * 24 * 60 * 60 * 1000, // 45 days from now
                features: {
                    wifiBasic: true,
                    wifiAdvanced: true,
                    analyticsBasic: true,
                    analyticsAdvanced: true,
                    whatsappBasic: true,
                    whatsappAdvanced: true
                },
                limits: {
                    locations: 5,
                    devicesPerLocation: 500
                },
                lastUpdated: Date.now(),
                history: {
                    [Date.now() - 20 * 24 * 60 * 60 * 1000]: {
                        action: 'tier_change',
                        from: 'basic',
                        to: 'pro',
                        timestamp: Date.now() - 20 * 24 * 60 * 60 * 1000,
                        adminUser: 'admin@test.com'
                    }
                }
            },
            'user4': {
                tier: 'premium',
                status: 'active',
                paymentStatus: 'active',
                monthlyPrice: 299,
                expirationDate: Date.now() + 60 * 24 * 60 * 60 * 1000, // 60 days from now
                features: {
                    wifiBasic: true,
                    wifiAdvanced: true,
                    wifiEnterprise: true,
                    analyticsBasic: true,
                    analyticsAdvanced: true,
                    analyticsRealtime: true,
                    whatsappBasic: true,
                    whatsappAdvanced: true,
                    whatsappCampaigns: true
                },
                limits: {
                    locations: Infinity,
                    devicesPerLocation: Infinity
                },
                lastUpdated: Date.now(),
                history: {
                    [Date.now() - 15 * 24 * 60 * 60 * 1000]: {
                        action: 'tier_change',
                        from: 'pro',
                        to: 'premium',
                        timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000,
                        adminUser: 'admin@test.com'
                    }
                }
            },
            'user5': {
                tier: 'pro',
                status: 'trial',
                paymentStatus: 'trial',
                monthlyPrice: 0,
                trialStartDate: Date.now() - 7 * 24 * 60 * 60 * 1000,
                trialEndDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from now
                expirationDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
                features: {
                    wifiBasic: true,
                    wifiAdvanced: true,
                    analyticsBasic: true,
                    analyticsAdvanced: true,
                    whatsappBasic: true,
                    whatsappAdvanced: true
                },
                limits: {
                    locations: 5,
                    devicesPerLocation: 500
                },
                lastUpdated: Date.now()
            }
        };
        
        // 3. Create additional users for bulk testing
        for (let i = 6; i <= 20; i++) {
            const tier = ['free', 'basic', 'pro', 'premium'][Math.floor(Math.random() * 4)];
            const status = ['active', 'trial', 'expired', 'canceled'][Math.floor(Math.random() * 4)];
            
            testUsers[`user${i}`] = {
                email: `test-user-${i}@test.com`,
                displayName: `Test User ${i}`,
                createdAt: Date.now() - Math.floor(Math.random() * 180) * 24 * 60 * 60 * 1000
            };
            
            testSubscriptions[`user${i}`] = {
                tier: tier,
                status: status,
                paymentStatus: status,
                monthlyPrice: tier === 'free' ? 0 : tier === 'basic' ? 29 : tier === 'pro' ? 99 : 299,
                expirationDate: status === 'active' ? Date.now() + Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000 : Date.now() - 10 * 24 * 60 * 60 * 1000,
                lastUpdated: Date.now()
            };
        }
        
        // 4. Create tier migration history
        const migrationHistory = {};
        const migrationTimestamps = [];
        
        // Recent migrations for pattern analysis
        for (let i = 0; i < 10; i++) {
            const timestamp = Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000;
            const fromTier = ['free', 'basic', 'pro'][Math.floor(Math.random() * 3)];
            const toTier = ['basic', 'pro', 'premium'][Math.floor(Math.random() * 3)];
            
            if (fromTier !== toTier) {
                migrationTimestamps.push(timestamp);
                migrationHistory[timestamp] = {
                    action: 'tier_change',
                    from: fromTier,
                    to: toTier,
                    timestamp: timestamp,
                    userId: `user${Math.floor(Math.random() * 20) + 1}`,
                    adminUser: auth.currentUser?.email || 'admin@test.com'
                };
            }
        }
        
        // 5. Write all test data to Firebase
        const updates = {};
        
        // Add users
        Object.entries(testUsers).forEach(([userId, userData]) => {
            updates[`users/${userId}`] = userData;
        });
        
        // Add subscriptions
        Object.entries(testSubscriptions).forEach(([userId, subData]) => {
            updates[`subscriptions/${userId}`] = subData;
        });
        
        // Add migration history to some users
        migrationTimestamps.forEach((timestamp, index) => {
            const userId = `user${(index % 5) + 1}`;
            updates[`subscriptions/${userId}/history/${timestamp}`] = migrationHistory[timestamp];
        });
        
        // 6. Update lifecycle settings
        updates['settings/subscriptionLifecycle'] = {
            trialDuration: 14,
            gracePeriod: 7,
            autoRenewal: true,
            reminderDays: [7, 3, 1],
            reactivationWindow: 30
        };
        
        // Apply all updates
        await update(ref(rtdb, '/'), updates);
        
        console.log('✅ Test data setup complete!');
        console.log('Created:');
        console.log(`- ${Object.keys(testUsers).length} test users`);
        console.log(`- ${Object.keys(testSubscriptions).length} subscriptions`);
        console.log(`- ${migrationTimestamps.length} migration history entries`);
        console.log('- Lifecycle settings');
        
        return {
            users: testUsers,
            subscriptions: testSubscriptions,
            migrations: migrationHistory
        };
        
    } catch (error) {
        console.error('❌ Error setting up test data:', error);
        throw error;
    }
}

// Function to clean up test data
export async function cleanupTestData() {
    console.log('Cleaning up test data...');
    
    try {
        const updates = {};
        
        // Remove test users and their subscriptions
        for (let i = 1; i <= 20; i++) {
            updates[`users/user${i}`] = null;
            updates[`subscriptions/user${i}`] = null;
        }
        
        await update(ref(rtdb, '/'), updates);
        console.log('✅ Test data cleaned up');
        
    } catch (error) {
        console.error('❌ Error cleaning up test data:', error);
        throw error;
    }
}

// Make functions available globally for console testing
if (typeof window !== 'undefined') {
    window.setupTierTestData = setupTierTestData;
    window.cleanupTestData = cleanupTestData;
} 