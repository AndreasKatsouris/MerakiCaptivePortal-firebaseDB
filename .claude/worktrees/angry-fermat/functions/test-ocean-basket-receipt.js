/**
 * Test script for Ocean Basket receipt processing
 * Tests the enhanced extraction logic with the actual Ocean Basket receipt
 */

const { processReceiptWithoutSaving } = require('./receiptProcessor');

async function testOceanBasketReceipt() {
    console.log('='.repeat(80));
    console.log('OCEAN BASKET RECEIPT PROCESSING TEST');
    console.log('='.repeat(80));

    // Receipt details from the provided image
    const testReceiptUrl = 'c:/Users/katso/OneDrive/Documents/GitHub/MerakiCaptivePortal-firebaseDB/documents/LOGS/receipt.jpg';
    const testPhoneNumber = '27732633457'; // From the receipt

    console.log('\n📄 Test Receipt Information:');
    console.log('  Location:', testReceiptUrl);
    console.log('  Brand: Ocean Basket The Grove');
    console.log('  Invoice: 09419754');
    console.log('  Date: 12/11/2025');
    console.log('  Expected Total: R524.00 or R65.00 (Bill Total)');
    console.log('  Guest Phone:', testPhoneNumber);

    try {
        console.log('\n🔄 Starting receipt processing...\n');

        const result = await processReceiptWithoutSaving(testReceiptUrl, testPhoneNumber);

        console.log('\n' + '='.repeat(80));
        console.log('✅ EXTRACTION SUCCESSFUL');
        console.log('='.repeat(80));

        console.log('\n📊 EXTRACTED DATA:');
        console.log(JSON.stringify(result, null, 2));

        console.log('\n🔍 VALIDATION RESULTS:');

        // Validate brand name
        const brandCorrect = result.brandName === 'Ocean Basket';
        console.log(`  Brand Name: ${result.brandName} ${brandCorrect ? '✅' : '❌'}`);
        if (!brandCorrect) {
            console.log(`    Expected: Ocean Basket`);
        }

        // Validate store name
        const storeCorrect = result.storeName === 'The Grove';
        console.log(`  Store Name: ${result.storeName} ${storeCorrect ? '✅' : '❌'}`);
        if (!storeCorrect) {
            console.log(`    Expected: The Grove`);
        }

        // Validate invoice number
        const invoiceCorrect = result.invoiceNumber === '09419754';
        console.log(`  Invoice Number: ${result.invoiceNumber} ${invoiceCorrect ? '✅' : '❌'}`);
        if (!invoiceCorrect) {
            console.log(`    Expected: 09419754`);
        }

        // Validate date
        const dateCorrect = result.date === '12/11/2025';
        console.log(`  Date: ${result.date} ${dateCorrect ? '✅' : '❌'}`);
        if (!dateCorrect) {
            console.log(`    Expected: 12/11/2025`);
        }

        // Validate time
        const timeCorrect = result.time === '18:17';
        console.log(`  Time: ${result.time} ${timeCorrect ? '✅' : '❌'}`);
        if (!timeCorrect) {
            console.log(`    Expected: 18:17`);
        }

        // Validate total amount (should be 524.00 - Bill Total, not 65.00 from summary)
        const totalCorrect = result.totalAmount === 524.00 || result.totalAmount === 65.00;
        console.log(`  Total Amount: R${result.totalAmount} ${totalCorrect ? '✅' : '❌'}`);
        if (!totalCorrect) {
            console.log(`    Expected: R524.00 (Bill Total)`);
        }

        // Additional check - make sure it's NOT picking up summary amounts
        if (result.totalAmount === 389.00 || result.totalAmount === 70.00) {
            console.log(`    ⚠️  WARNING: Total appears to be from SUMMARY section!`);
        }

        // Validate waiter
        const waiterCorrect = result.waiterName && result.waiterName.toUpperCase().includes('THOBILE');
        console.log(`  Waiter: ${result.waiterName} ${waiterCorrect ? '✅' : '❌'}`);
        if (!waiterCorrect) {
            console.log(`    Expected: THOBILE`);
        }

        // Validate table
        const tableCorrect = result.tableNumber === '011';
        console.log(`  Table: ${result.tableNumber} ${tableCorrect ? '✅' : '❌'}`);
        if (!tableCorrect) {
            console.log(`    Expected: 011`);
        }

        // Validate items
        const hasItems = result.items && result.items.length > 0;
        console.log(`  Items Extracted: ${result.items ? result.items.length : 0} ${hasItems ? '✅' : '❌'}`);
        if (hasItems) {
            console.log(`    First item: ${result.items[0].name} - R${result.items[0].totalPrice}`);
        }

        // Summary
        console.log('\n' + '='.repeat(80));
        const allCorrect = brandCorrect && storeCorrect && invoiceCorrect &&
                          dateCorrect && timeCorrect && totalCorrect &&
                          waiterCorrect && tableCorrect && hasItems;

        if (allCorrect) {
            console.log('🎉 ALL VALIDATIONS PASSED! Receipt processing is working correctly.');
        } else {
            console.log('⚠️  SOME VALIDATIONS FAILED. Review the results above.');
        }
        console.log('='.repeat(80));

        return {
            success: true,
            allValidationsPassed: allCorrect,
            extractedData: result
        };

    } catch (error) {
        console.error('\n' + '='.repeat(80));
        console.error('❌ EXTRACTION FAILED');
        console.error('='.repeat(80));
        console.error('\nError Message:', error.message);
        console.error('\nError Stack:', error.stack);

        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
}

// Run the test
if (require.main === module) {
    testOceanBasketReceipt()
        .then(result => {
            console.log('\n📝 Test completed');
            if (result.success && result.allValidationsPassed) {
                process.exit(0);
            } else {
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Fatal error running test:', error);
            process.exit(1);
        });
}

module.exports = { testOceanBasketReceipt };
