/**
 * Test Queue Management Location Integration
 * This test verifies that queue management now uses location context automatically
 */

const { processMessage } = require('./functions/menuLogic');

// Mock location context similar to what the enhanced WhatsApp handler provides
const mockLocationContext = {
    locationId: 'ocean_basket_grove',
    mapping: {
        locationName: 'Ocean Basket The Grove',
        phoneNumber: '+27123456789',
        isActive: true
    }
};

// Test phone number
const testPhoneNumber = '+27987654321';

async function testQueueLocationIntegration() {
    console.log('🧪 Testing Queue Management Location Integration...\n');

    try {
        // Test 1: Queue command with location context
        console.log('📋 Test 1: Queue command with location context');
        const result1 = await processMessage('add me to queue', testPhoneNumber, mockLocationContext);
        console.log('✅ Result:', result1);
        
        if (result1.success && result1.message.includes('Ocean Basket The Grove')) {
            console.log('✅ PASS: Location context was used correctly');
        } else {
            console.log('❌ FAIL: Location context was not used');
        }
        
        console.log('\n' + '='.repeat(50) + '\n');

        // Test 2: Queue command without location context (fallback)
        console.log('📋 Test 2: Queue command without location context');
        const result2 = await processMessage('add me to queue', testPhoneNumber, null);
        console.log('✅ Result:', result2);
        
        if (result2.success && result2.message.includes('Which location would you like to join?')) {
            console.log('✅ PASS: Fallback to location selection works');
        } else {
            console.log('❌ FAIL: Fallback to location selection failed');
        }
        
        console.log('\n' + '='.repeat(50) + '\n');

        // Test 3: Non-queue command with location context
        console.log('📋 Test 3: Non-queue command with location context');
        const result3 = await processMessage('help', testPhoneNumber, mockLocationContext);
        console.log('✅ Result:', result3);
        
        if (result3.success && result3.message.includes('rewards bot assistant')) {
            console.log('✅ PASS: Non-queue commands still work with location context');
        } else {
            console.log('❌ FAIL: Non-queue commands broken with location context');
        }

        console.log('\n🎉 Testing completed!');
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
    }
}

// Run the test
testQueueLocationIntegration();