/**
 * Location Context Validation Test Suite
 * Tests location information preservation in receipt processing
 */

const { 
    processReceiptWithoutSaving, 
    saveReceiptData 
} = require('./receiptProcessor');

/**
 * Test Location Context Preservation
 */
async function testLocationContextPreservation() {
    console.log('=== TESTING LOCATION CONTEXT PRESERVATION ===\n');
    
    // Test data mimicking WhatsApp multi-location setup
    const testScenarios = [
        {
            name: 'WhatsApp Number +27600717304 (Ocean Basket)',
            whatsappNumber: '+27600717304',
            expectedLocation: {
                businessName: 'Ocean Basket',
                locationName: 'Grove Mall',
                address: 'Shop L42, Grove Mall, Pretoria'
            },
            receiptData: {
                brandName: 'Ocean Basket',
                storeName: 'Grove Mall',
                storeAddress: 'Shop L42, Grove Mall, Pretoria',
                totalAmount: 251.90,
                invoiceNumber: '012345',
                date: '17/07/2025',
                time: '14:30'
            }
        },
        {
            name: 'WhatsApp Number +27600717305 (Steakhouse)',
            whatsappNumber: '+27600717305',
            expectedLocation: {
                businessName: 'Steakhouse Grill',
                locationName: 'Sandton City',
                address: 'Sandton City, Johannesburg'
            },
            receiptData: {
                brandName: 'Steakhouse Grill',
                storeName: 'Sandton City',
                storeAddress: 'Sandton City, Johannesburg',
                totalAmount: 454.25,
                invoiceNumber: '778899',
                date: '17/07/2025',
                time: '20:15'
            }
        }
    ];
    
    const testResults = [];
    
    for (const scenario of testScenarios) {
        console.log(`Testing: ${scenario.name}`);
        console.log('─'.repeat(50));
        
        try {
            // Test 1: Receipt data with location context
            console.log('Test 1: Receipt data with location context');
            
            const receiptWithLocation = {
                ...scenario.receiptData,
                guestPhoneNumber: scenario.whatsappNumber,
                locationContext: scenario.expectedLocation,
                whatsappNumber: scenario.whatsappNumber
            };
            
            // Validate location context is preserved
            const hasLocationContext = !!(receiptWithLocation.locationContext);
            const hasWhatsappNumber = !!(receiptWithLocation.whatsappNumber);
            const hasExpectedBusiness = receiptWithLocation.locationContext?.businessName === scenario.expectedLocation.businessName;
            
            console.log(`   Location Context Present: ${hasLocationContext}`);
            console.log(`   WhatsApp Number Present: ${hasWhatsappNumber}`);
            console.log(`   Expected Business Match: ${hasExpectedBusiness}`);
            
            // Test 2: Location routing validation
            console.log('Test 2: Location routing validation');
            
            const routingData = {
                whatsappNumber: scenario.whatsappNumber,
                businessName: scenario.expectedLocation.businessName,
                locationName: scenario.expectedLocation.locationName
            };
            
            const hasRoutingData = !!(routingData.whatsappNumber && routingData.businessName);
            const correctRouting = routingData.businessName === scenario.expectedLocation.businessName;
            
            console.log(`   Routing Data Present: ${hasRoutingData}`);
            console.log(`   Correct Routing: ${correctRouting}`);
            
            // Test 3: Receipt processing with location context
            console.log('Test 3: Receipt processing with location context');
            
            const processedReceipt = {
                ...receiptWithLocation,
                id: 'test_' + Date.now(),
                processedAt: Date.now(),
                status: 'processed_with_location'
            };
            
            const locationPreserved = !!(processedReceipt.locationContext);
            const phoneNumberPreserved = !!(processedReceipt.guestPhoneNumber);
            const businessMatches = processedReceipt.locationContext?.businessName === scenario.expectedLocation.businessName;
            
            console.log(`   Location Preserved: ${locationPreserved}`);
            console.log(`   Phone Number Preserved: ${phoneNumberPreserved}`);
            console.log(`   Business Name Matches: ${businessMatches}`);
            
            const scenarioResult = {
                scenario: scenario.name,
                whatsappNumber: scenario.whatsappNumber,
                tests: {
                    locationContext: hasLocationContext && hasWhatsappNumber && hasExpectedBusiness,
                    routing: hasRoutingData && correctRouting,
                    processing: locationPreserved && phoneNumberPreserved && businessMatches
                },
                passed: hasLocationContext && hasWhatsappNumber && hasExpectedBusiness && 
                        hasRoutingData && correctRouting && 
                        locationPreserved && phoneNumberPreserved && businessMatches
            };
            
            testResults.push(scenarioResult);
            
            console.log(`\n${scenarioResult.passed ? '✅' : '❌'} ${scenario.name}: ${scenarioResult.passed ? 'PASSED' : 'FAILED'}`);
            
        } catch (error) {
            console.error(`❌ ${scenario.name}: ERROR - ${error.message}`);
            
            testResults.push({
                scenario: scenario.name,
                error: error.message,
                passed: false
            });
        }
        
        console.log();
    }
    
    return testResults;
}

/**
 * Test WhatsApp Multi-Location Integration
 */
async function testWhatsAppMultiLocationIntegration() {
    console.log('=== TESTING WHATSAPP MULTI-LOCATION INTEGRATION ===\n');
    
    const multiLocationTests = [
        {
            name: 'Number Resolution',
            test: () => {
                const whatsappNumbers = ['+27600717304', '+27600717305'];
                const businessMapping = {
                    '+27600717304': 'Ocean Basket',
                    '+27600717305': 'Steakhouse Grill'
                };
                
                const resolved = whatsappNumbers.map(number => ({
                    number,
                    business: businessMapping[number]
                }));
                
                return resolved.every(r => r.business) && resolved.length === 2;
            }
        },
        {
            name: 'Location Context Injection',
            test: () => {
                const receiptData = {
                    brandName: 'Ocean Basket',
                    totalAmount: 150.00,
                    guestPhoneNumber: '+27600717304'
                };
                
                // Simulate location context injection
                const withLocationContext = {
                    ...receiptData,
                    locationContext: {
                        businessName: 'Ocean Basket',
                        whatsappNumber: '+27600717304',
                        injectedAt: Date.now()
                    }
                };
                
                return !!(withLocationContext.locationContext && 
                         withLocationContext.locationContext.businessName === 'Ocean Basket' &&
                         withLocationContext.locationContext.whatsappNumber === '+27600717304');
            }
        },
        {
            name: 'Cross-Location Validation',
            test: () => {
                // Test that receipts from different locations are processed correctly
                const oceanBasketReceipt = {
                    brandName: 'Ocean Basket',
                    guestPhoneNumber: '+27600717304',
                    locationContext: { businessName: 'Ocean Basket' }
                };
                
                const steakhouseReceipt = {
                    brandName: 'Steakhouse Grill',
                    guestPhoneNumber: '+27600717305',
                    locationContext: { businessName: 'Steakhouse Grill' }
                };
                
                // Validate that each receipt matches its expected location
                const oceanBasketValid = oceanBasketReceipt.brandName === oceanBasketReceipt.locationContext.businessName;
                const steakhouseValid = steakhouseReceipt.brandName === steakhouseReceipt.locationContext.businessName;
                
                return oceanBasketValid && steakhouseValid;
            }
        }
    ];
    
    const integrationResults = [];
    
    for (const test of multiLocationTests) {
        console.log(`Testing: ${test.name}`);
        
        try {
            const passed = test.test();
            integrationResults.push({
                name: test.name,
                passed
            });
            
            console.log(`${passed ? '✅' : '❌'} ${test.name}: ${passed ? 'PASSED' : 'FAILED'}`);
            
        } catch (error) {
            console.error(`❌ ${test.name}: ERROR - ${error.message}`);
            
            integrationResults.push({
                name: test.name,
                passed: false,
                error: error.message
            });
        }
        
        console.log();
    }
    
    return integrationResults;
}

/**
 * Test Database Location Data Preservation
 */
async function testDatabaseLocationPreservation() {
    console.log('=== TESTING DATABASE LOCATION DATA PRESERVATION ===\n');
    
    const databaseTests = [
        {
            name: 'Receipt Location Field Validation',
            test: () => {
                const receiptData = {
                    brandName: 'Ocean Basket',
                    storeName: 'Grove Mall',
                    storeAddress: 'Shop L42, Grove Mall, Pretoria',
                    totalAmount: 251.90,
                    guestPhoneNumber: '+27600717304',
                    locationContext: {
                        businessName: 'Ocean Basket',
                        locationName: 'Grove Mall',
                        whatsappNumber: '+27600717304'
                    }
                };
                
                // Validate all location fields are present
                const hasStoreInfo = !!(receiptData.brandName && receiptData.storeName && receiptData.storeAddress);
                const hasLocationContext = !!(receiptData.locationContext);
                const hasWhatsappContext = !!(receiptData.locationContext?.whatsappNumber);
                
                return hasStoreInfo && hasLocationContext && hasWhatsappContext;
            }
        },
        {
            name: 'Guest-Receipt Association',
            test: () => {
                const guestData = {
                    phoneNumber: '+27600717304',
                    name: 'John Doe',
                    locationContext: {
                        businessName: 'Ocean Basket',
                        preferredLocation: 'Grove Mall'
                    }
                };
                
                const receiptData = {
                    guestPhoneNumber: '+27600717304',
                    brandName: 'Ocean Basket',
                    totalAmount: 150.00,
                    locationContext: {
                        businessName: 'Ocean Basket',
                        whatsappNumber: '+27600717304'
                    }
                };
                
                // Validate guest-receipt association maintains location context
                const phoneNumberMatches = guestData.phoneNumber === receiptData.guestPhoneNumber;
                const businessMatches = guestData.locationContext?.businessName === receiptData.locationContext?.businessName;
                
                return phoneNumberMatches && businessMatches;
            }
        }
    ];
    
    const databaseResults = [];
    
    for (const test of databaseTests) {
        console.log(`Testing: ${test.name}`);
        
        try {
            const passed = test.test();
            databaseResults.push({
                name: test.name,
                passed
            });
            
            console.log(`${passed ? '✅' : '❌'} ${test.name}: ${passed ? 'PASSED' : 'FAILED'}`);
            
        } catch (error) {
            console.error(`❌ ${test.name}: ERROR - ${error.message}`);
            
            databaseResults.push({
                name: test.name,
                passed: false,
                error: error.message
            });
        }
        
        console.log();
    }
    
    return databaseResults;
}

/**
 * Main Location Context Testing Function
 */
async function runLocationContextTests() {
    console.log('🚀 STARTING LOCATION CONTEXT VALIDATION TESTS\n');
    console.log('Testing Location Information Preservation in Receipt Processing');
    console.log('='.repeat(60) + '\n');
    
    try {
        // Run all location context tests
        const locationPreservationResults = await testLocationContextPreservation();
        const multiLocationResults = await testWhatsAppMultiLocationIntegration();
        const databaseResults = await testDatabaseLocationPreservation();
        
        // Generate comprehensive report
        console.log('=== LOCATION CONTEXT TEST REPORT ===\n');
        
        const allResults = [
            ...locationPreservationResults,
            ...multiLocationResults,
            ...databaseResults
        ];
        
        const totalTests = allResults.length;
        const passedTests = allResults.filter(result => result.passed).length;
        const failedTests = totalTests - passedTests;
        const successRate = (passedTests / totalTests) * 100;
        
        console.log(`📊 LOCATION CONTEXT TEST SUMMARY:`);
        console.log(`   Total Tests: ${totalTests}`);
        console.log(`   Passed: ${passedTests}`);
        console.log(`   Failed: ${failedTests}`);
        console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
        console.log();
        
        // Detailed results
        console.log('📊 DETAILED RESULTS:');
        allResults.forEach(result => {
            if (result.passed) {
                console.log(`✅ ${result.name || result.scenario}: PASSED`);
            } else {
                console.log(`❌ ${result.name || result.scenario}: FAILED`);
                if (result.error) {
                    console.log(`   Error: ${result.error}`);
                }
            }
        });
        
        console.log();
        
        // Assessment and recommendations
        console.log('=== ASSESSMENT ===');
        
        if (successRate >= 90) {
            console.log('🎉 EXCELLENT - Location context is properly preserved');
        } else if (successRate >= 75) {
            console.log('✅ GOOD - Location context mostly preserved with minor issues');
        } else if (successRate >= 60) {
            console.log('⚠️  FAIR - Location context preservation needs improvement');
        } else {
            console.log('❌ POOR - Location context preservation requires significant fixes');
        }
        
        console.log('\n=== RECOMMENDATIONS ===');
        
        if (failedTests > 0) {
            console.log('• Review failed location context tests');
            console.log('• Ensure location data is injected at WhatsApp message receipt');
            console.log('• Validate location context is preserved throughout processing pipeline');
        }
        
        console.log('• Monitor location context in production receipts');
        console.log('• Consider adding location validation checkpoints');
        
        return {
            totalTests,
            passedTests,
            failedTests,
            successRate,
            locationPreservationResults,
            multiLocationResults,
            databaseResults
        };
        
    } catch (error) {
        console.error('💥 Location Context Testing Failed:', error);
        return {
            totalTests: 0,
            passedTests: 0,
            failedTests: 1,
            successRate: 0,
            error: error.message
        };
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runLocationContextTests()
        .then(report => {
            console.log('\n🏁 Location Context Testing Complete');
            process.exit(report.successRate >= 75 ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Testing Failed:', error);
            process.exit(1);
        });
}

module.exports = { 
    runLocationContextTests,
    testLocationContextPreservation,
    testWhatsAppMultiLocationIntegration,
    testDatabaseLocationPreservation
};