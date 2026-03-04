/**
 * Admin Tier Configuration Test
 * 
 * This script tests the admin tier configuration interface functionality
 * to verify proper tier management and validation.
 */

// Test configuration for admin interface
const ADMIN_TEST_CONFIG = {
    testTiers: {
        customTier: {
            name: 'Custom Test Tier',
            description: 'Test tier for validation',
            monthlyPrice: 29.99,
            annualPrice: 299.99,
            features: {
                qmsBasic: true,
                qmsAdvanced: true,
                qmsWhatsAppIntegration: true,
                qmsAnalytics: false,
                qmsAutomation: false
            },
            limits: {
                queueEntries: 200,
                queueLocations: 3,
                queueHistoryDays: 60
            }
        }
    },
    featureDependencies: {
        qmsAdvanced: ['qmsBasic'],
        qmsWhatsAppIntegration: ['qmsBasic'],
        qmsAnalytics: ['qmsAdvanced'],
        qmsAutomation: ['qmsAdvanced', 'qmsWhatsAppIntegration']
    }
};

// Mock admin tier management service
class MockAdminTierService {
    constructor() {
        this.tiers = {
            free: {
                name: 'Free',
                description: 'Free tier with basic features',
                monthlyPrice: 0,
                annualPrice: 0,
                features: { qmsBasic: true },
                limits: { queueEntries: 25, queueLocations: 1, queueHistoryDays: 7 }
            },
            starter: {
                name: 'Starter',
                description: 'Starter tier with WhatsApp integration',
                monthlyPrice: 19.99,
                annualPrice: 199.99,
                features: { qmsBasic: true, qmsAdvanced: true, qmsWhatsAppIntegration: true },
                limits: { queueEntries: 100, queueLocations: 2, queueHistoryDays: 30 }
            }
        };
    }

    async getTiers() {
        return this.tiers;
    }

    async createTier(tierId, tierData) {
        // Validate required fields
        if (!tierData.name || !tierData.description) {
            throw new Error('Name and description are required');
        }

        // Validate feature dependencies
        const validationResult = this.validateFeatureDependencies(tierData.features);
        if (!validationResult.valid) {
            throw new Error(`Feature dependency validation failed: ${validationResult.errors.join(', ')}`);
        }

        // Validate pricing
        if (tierData.monthlyPrice < 0 || tierData.annualPrice < 0) {
            throw new Error('Pricing cannot be negative');
        }

        // Validate limits
        if (tierData.limits.queueEntries < 0 || tierData.limits.queueLocations < 0) {
            throw new Error('Limits cannot be negative');
        }

        this.tiers[tierId] = {
            ...tierData,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        return { success: true, tierId };
    }

    async updateTier(tierId, tierData) {
        if (!this.tiers[tierId]) {
            throw new Error('Tier not found');
        }

        // Same validation as create
        const validationResult = this.validateFeatureDependencies(tierData.features);
        if (!validationResult.valid) {
            throw new Error(`Feature dependency validation failed: ${validationResult.errors.join(', ')}`);
        }

        this.tiers[tierId] = {
            ...this.tiers[tierId],
            ...tierData,
            updatedAt: Date.now()
        };

        return { success: true, tierId };
    }

    async deleteTier(tierId) {
        if (!this.tiers[tierId]) {
            throw new Error('Tier not found');
        }

        delete this.tiers[tierId];
        return { success: true };
    }

    validateFeatureDependencies(features) {
        const errors = [];
        
        Object.entries(features).forEach(([featureId, enabled]) => {
            if (enabled && ADMIN_TEST_CONFIG.featureDependencies[featureId]) {
                const deps = ADMIN_TEST_CONFIG.featureDependencies[featureId];
                deps.forEach(depId => {
                    if (!features[depId]) {
                        errors.push(`Feature ${featureId} requires ${depId} to be enabled`);
                    }
                });
            }
        });

        return { valid: errors.length === 0, errors };
    }

    validateTierHierarchy(tiers) {
        // Check that tier limits are logically ordered
        const tiersList = Object.values(tiers);
        const priceOrder = tiersList.sort((a, b) => a.monthlyPrice - b.monthlyPrice);
        
        const errors = [];
        for (let i = 1; i < priceOrder.length; i++) {
            const current = priceOrder[i];
            const previous = priceOrder[i - 1];
            
            if (current.limits.queueEntries < previous.limits.queueEntries) {
                errors.push(`Higher priced tier ${current.name} has lower queue entry limit than ${previous.name}`);
            }
        }

        return { valid: errors.length === 0, errors };
    }
}

// Test runner for admin tier configuration
class AdminTierTestRunner {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            blocked: 0,
            totalTests: 0,
            details: []
        };
    }

    async runTest(testName, testDescription, testFn) {
        this.results.totalTests++;
        const startTime = Date.now();
        
        console.log(`\n🧪 Testing: ${testName}`);
        console.log(`📋 Description: ${testDescription}`);
        
        try {
            await testFn();
            const duration = Date.now() - startTime;
            this.results.passed++;
            this.results.details.push({
                testName,
                status: 'passed',
                duration,
                timestamp: new Date().toISOString()
            });
            console.log(`✅ PASSED: ${testName} (${duration}ms)`);
        } catch (error) {
            const duration = Date.now() - startTime;
            this.results.failed++;
            this.results.details.push({
                testName,
                status: 'failed',
                duration,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            console.log(`❌ FAILED: ${testName} (${duration}ms)`);
            console.log(`   Error: ${error.message}`);
        }
    }

    getResults() {
        return this.results;
    }
}

// Test execution functions
async function runAdminTierConfigurationTests() {
    console.log('🏗️  ADMIN TIER CONFIGURATION TESTS');
    console.log('==================================');
    
    const testRunner = new AdminTierTestRunner();
    const adminService = new MockAdminTierService();

    // Test 1: Create new tier
    await testRunner.runTest(
        'CREATE_NEW_TIER',
        'Test creating a new subscription tier',
        async () => {
            const result = await adminService.createTier('custom', ADMIN_TEST_CONFIG.testTiers.customTier);
            if (!result.success) {
                throw new Error('Failed to create tier');
            }
            
            const tiers = await adminService.getTiers();
            if (!tiers.custom) {
                throw new Error('Tier was not created');
            }
        }
    );

    // Test 2: Update existing tier
    await testRunner.runTest(
        'UPDATE_EXISTING_TIER',
        'Test updating an existing subscription tier',
        async () => {
            const updatedData = {
                ...ADMIN_TEST_CONFIG.testTiers.customTier,
                monthlyPrice: 39.99,
                limits: {
                    queueEntries: 300,
                    queueLocations: 4,
                    queueHistoryDays: 90
                }
            };
            
            const result = await adminService.updateTier('custom', updatedData);
            if (!result.success) {
                throw new Error('Failed to update tier');
            }
            
            const tiers = await adminService.getTiers();
            if (tiers.custom.monthlyPrice !== 39.99) {
                throw new Error('Tier was not updated correctly');
            }
        }
    );

    // Test 3: Feature dependency validation
    await testRunner.runTest(
        'FEATURE_DEPENDENCY_VALIDATION',
        'Test that feature dependencies are properly validated',
        async () => {
            const invalidTier = {
                ...ADMIN_TEST_CONFIG.testTiers.customTier,
                features: {
                    qmsAnalytics: true,  // Requires qmsAdvanced
                    qmsAdvanced: false   // But this is disabled
                }
            };
            
            try {
                await adminService.createTier('invalid', invalidTier);
                throw new Error('Should have failed due to invalid dependencies');
            } catch (error) {
                if (!error.message.includes('dependency')) {
                    throw new Error('Wrong error type, expected dependency error');
                }
            }
        }
    );

    // Test 4: Tier validation
    await testRunner.runTest(
        'TIER_VALIDATION',
        'Test tier data validation (required fields, pricing, limits)',
        async () => {
            // Test missing required fields
            try {
                await adminService.createTier('invalid1', { monthlyPrice: 10 });
                throw new Error('Should have failed due to missing required fields');
            } catch (error) {
                if (!error.message.includes('required')) {
                    throw new Error('Wrong error type, expected required field error');
                }
            }

            // Test negative pricing
            try {
                await adminService.createTier('invalid2', {
                    ...ADMIN_TEST_CONFIG.testTiers.customTier,
                    monthlyPrice: -10
                });
                throw new Error('Should have failed due to negative pricing');
            } catch (error) {
                if (!error.message.includes('negative')) {
                    throw new Error('Wrong error type, expected negative pricing error');
                }
            }
        }
    );

    // Test 5: Delete tier
    await testRunner.runTest(
        'DELETE_TIER',
        'Test deleting a subscription tier',
        async () => {
            const result = await adminService.deleteTier('custom');
            if (!result.success) {
                throw new Error('Failed to delete tier');
            }
            
            const tiers = await adminService.getTiers();
            if (tiers.custom) {
                throw new Error('Tier was not deleted');
            }
        }
    );

    // Test 6: Tier hierarchy validation
    await testRunner.runTest(
        'TIER_HIERARCHY_VALIDATION',
        'Test that tier limits follow logical hierarchy',
        async () => {
            const tiers = await adminService.getTiers();
            const validationResult = adminService.validateTierHierarchy(tiers);
            
            if (!validationResult.valid) {
                throw new Error(`Tier hierarchy validation failed: ${validationResult.errors.join(', ')}`);
            }
        }
    );

    return testRunner.getResults();
}

// Execute tests
export async function runAdminTierTests() {
    const results = await runAdminTierConfigurationTests();
    
    console.log('\n📊 === ADMIN TIER CONFIGURATION TEST SUMMARY ===');
    console.log(`✅ Tests Passed: ${results.passed}`);
    console.log(`❌ Tests Failed: ${results.failed}`);
    console.log(`⚠️ Tests Blocked: ${results.blocked}`);
    console.log(`📈 Total Tests: ${results.totalTests}`);
    console.log(`🎯 Success Rate: ${((results.passed / results.totalTests) * 100).toFixed(1)}%`);
    
    if (results.failed > 0) {
        console.log('\n❌ Failed Tests:');
        results.details.filter(r => r.status === 'failed').forEach(result => {
            console.log(`  - ${result.testName}: ${result.error}`);
        });
    }
    
    return results;
}

// Browser execution
if (typeof window !== 'undefined') {
    window.AdminTierTests = { runAdminTierTests };
}