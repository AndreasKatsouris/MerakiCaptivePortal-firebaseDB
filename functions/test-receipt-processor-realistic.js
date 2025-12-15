/**
 * Realistic Test Suite for Enhanced Receipt Processing System
 * Uses actual receipt format patterns with proper invoice numbers
 */

const { testTotalAmountDetection } = require('./receiptProcessor');

// Realistic Receipt Text Samples with Invoice Numbers
const realisticReceiptTexts = {
    // Ocean Basket Standard Format
    oceanBasketStandard: `
OCEAN BASKET
GROVE MALL
SHOP L42, GROVE MALL
PRETORIA, SOUTH AFRICA

INVOICE: 012345
DATE: 17/07/2025
TIME: 14:30
WAITER: JOHN (15)
TABLE: 12

FOOD ITEMS:
Mediterranean Platter    1   89.90   89.90
Seafood Pasta           1   125.00  125.00
Soft Drink              2   18.50   37.00

Bill Total 251.90
VAT 15% (already included) 32.86
THANK YOU FOR DINING WITH US
`,

    // Ocean Basket Multi-line Total Format
    oceanBasketMultiLine: `
OCEAN BASKET
WATERFRONT BRANCH
V&A WATERFRONT, CAPE TOWN

RECEIPT # 987654
DATE: 17/07/2025
TIME: 19:15
WAITER: SARAH (42)
TABLE: 8

ITEMS:
Prawn Curry             1   149.00  149.00
Kingklip Fillet         1   169.00  169.00
Side Salad              1   42.00   42.00

Bill Total
VAT 15% (already included) 53.57
360.00
`,

    // Ocean Basket Complex Format
    oceanBasketComplex: `
OCEAN BASKET
MENLYN PARK
SHOP 145, MENLYN PARK
PRETORIA

TXN 445566
DATE: 17/07/2025
TIME: 12:45
WAITER: MIKE (28)
TABLE: 5

SIGNATURE
QTY  PRICE  VALUE
Seafood Platter    1   189.00  189.00
Calamari Rings     1   79.90   79.90
Prawns Special     1   159.00  159.00

Bill Total
VAT 15% (already included)
427.90
`,

    // Different Restaurant Format
    genericRestaurant: `
STEAKHOUSE GRILL
SANDTON CITY
JOHANNESBURG

BILL # 778899
17/07/2025 20:15
SERVER: MIKE
TABLE: 14

Ribeye Steak           1   295.00  295.00
Potato Wedges          1   45.00   45.00
House Salad            1   55.00   55.00

SUBTOTAL              395.00
VAT (15%)              59.25
TOTAL                 454.25
`,

    // Pilot POS Format
    pilotPOS: `
OCEAN BASKET
CANAL WALK
CAPE TOWN

INVOICE: 334455
TIME 17/07/2025 18:20 TO 19:45
WAITER: LISA (33)
TABLE: 14

STARTERS:
Soup of the Day         1   45.00   45.00
Garlic Bread           1   35.00   35.00

MAINS:
Grilled Salmon         1   175.00  175.00
Fish and Chips         1   125.00  125.00

DESSERTS:
Chocolate Mousse       1   55.00   55.00

Bill Total
VAT 15% (already included) 56.52
435.00
`,

    // Minimal Receipt Format
    minimalReceipt: `
OCEAN BASKET
EASTGATE

# 112233
DATE: 17/07/2025
TABLE: 7

Fish Curry            1   125.00  125.00
Rice                  1   25.00   25.00

Bill Total 150.00
`
};

/**
 * Enhanced Test Results with Detailed Analysis
 */
async function runRealisticTests() {
    console.log('🚀 STARTING REALISTIC RECEIPT PROCESSING TESTS\n');
    console.log('Testing Enhanced OCR Patterns with Realistic Data');
    console.log('='.repeat(60) + '\n');
    
    const results = {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        testDetails: []
    };
    
    // Test each realistic receipt format
    for (const [testName, receiptText] of Object.entries(realisticReceiptTexts)) {
        console.log(`Testing: ${testName}`);
        console.log('─'.repeat(50));
        
        try {
            results.totalTests++;
            
            const result = testTotalAmountDetection(receiptText);
            
            const testDetail = {
                testName,
                success: result.success,
                totalAmount: result.totalAmount,
                vatAmount: result.vatAmount,
                hasValidTotal: result.totalAmount > 0,
                hasValidVAT: result.vatAmount >= 0,
                receiptLength: receiptText.length,
                hasInvoiceNumber: /(?:INVOICE|RECEIPT|BILL|TXN|#)\s*[:]*\s*\d+/i.test(receiptText),
                hasDate: /\d{2}\/\d{2}\/\d{4}/.test(receiptText),
                hasTime: /\d{2}:\d{2}/.test(receiptText)
            };
            
            if (result.success && result.totalAmount > 0) {
                results.passedTests++;
                console.log(`✅ ${testName}: PASSED`);
            } else {
                results.failedTests++;
                console.log(`❌ ${testName}: FAILED`);
            }
            
            console.log(`   Total Amount: R${result.totalAmount}`);
            console.log(`   VAT Amount: R${result.vatAmount}`);
            console.log(`   Has Invoice #: ${testDetail.hasInvoiceNumber}`);
            console.log(`   Has Date: ${testDetail.hasDate}`);
            console.log(`   Has Time: ${testDetail.hasTime}`);
            
            results.testDetails.push(testDetail);
            
        } catch (error) {
            results.failedTests++;
            console.log(`❌ ${testName}: ERROR - ${error.message}`);
            
            results.testDetails.push({
                testName,
                success: false,
                error: error.message,
                hasValidTotal: false
            });
        }
        
        console.log();
    }
    
    // Test specific OCR pattern improvements
    console.log('=== TESTING SPECIFIC OCR PATTERN IMPROVEMENTS ===\n');
    
    const patternTests = [
        {
            name: 'Standard Bill Total Pattern',
            text: 'Bill Total 123.45',
            expected: 123.45
        },
        {
            name: 'Multi-line Bill Total with VAT',
            text: 'Bill Total\nVAT 15% (already included) 45.67\n234.56',
            expected: 234.56
        },
        {
            name: 'Bill Total with Flexible Spacing',
            text: 'Bill Total     \n    VAT information here\n    345.67',
            expected: 345.67
        },
        {
            name: 'Ocean Basket Specific Format',
            text: 'Bill Total\nVAT 15% (already included)\n456.78',
            expected: 456.78
        },
        {
            name: 'Currency Symbol Handling',
            text: 'Bill Total R567.89',
            expected: 567.89
        }
    ];
    
    let patternsPassed = 0;
    
    for (const test of patternTests) {
        console.log(`Testing Pattern: ${test.name}`);
        
        try {
            const result = testTotalAmountDetection(test.text);
            const passed = result.success && Math.abs(result.totalAmount - test.expected) < 0.01;
            
            if (passed) {
                patternsPassed++;
                console.log(`✅ Pattern Test PASSED: Expected R${test.expected}, Got R${result.totalAmount}`);
            } else {
                console.log(`❌ Pattern Test FAILED: Expected R${test.expected}, Got R${result.totalAmount}`);
            }
            
        } catch (error) {
            console.log(`❌ Pattern Test ERROR: ${error.message}`);
        }
        
        console.log();
    }
    
    // Generate comprehensive report
    console.log('=== COMPREHENSIVE TEST REPORT ===\n');
    
    console.log(`📊 TEST SUMMARY:`);
    console.log(`   Total Tests: ${results.totalTests}`);
    console.log(`   Passed: ${results.passedTests}`);
    console.log(`   Failed: ${results.failedTests}`);
    console.log(`   Success Rate: ${((results.passedTests / results.totalTests) * 100).toFixed(1)}%`);
    console.log();
    
    console.log(`📊 PATTERN TEST SUMMARY:`);
    console.log(`   Pattern Tests: ${patternTests.length}`);
    console.log(`   Patterns Passed: ${patternsPassed}`);
    console.log(`   Pattern Success Rate: ${((patternsPassed / patternTests.length) * 100).toFixed(1)}%`);
    console.log();
    
    console.log(`📊 DETAILED ANALYSIS:`);
    results.testDetails.forEach(detail => {
        if (detail.success) {
            console.log(`✅ ${detail.testName}:`);
            console.log(`   Amount: R${detail.totalAmount} | VAT: R${detail.vatAmount}`);
            console.log(`   Invoice: ${detail.hasInvoiceNumber ? 'YES' : 'NO'} | Date: ${detail.hasDate ? 'YES' : 'NO'} | Time: ${detail.hasTime ? 'YES' : 'NO'}`);
        } else {
            console.log(`❌ ${detail.testName}: ${detail.error || 'Failed to extract total amount'}`);
        }
    });
    
    console.log();
    
    // Overall assessment
    const overallSuccessRate = ((results.passedTests + patternsPassed) / (results.totalTests + patternTests.length)) * 100;
    
    console.log('=== OVERALL ASSESSMENT ===');
    console.log(`Combined Success Rate: ${overallSuccessRate.toFixed(1)}%`);
    
    if (overallSuccessRate >= 90) {
        console.log('🎉 EXCELLENT - Enhanced OCR is working very well');
    } else if (overallSuccessRate >= 75) {
        console.log('✅ GOOD - Enhanced OCR is working well with minor issues');
    } else if (overallSuccessRate >= 60) {
        console.log('⚠️  FAIR - Enhanced OCR needs improvement');
    } else {
        console.log('❌ POOR - Enhanced OCR requires significant fixes');
    }
    
    console.log();
    
    // Recommendations
    console.log('=== RECOMMENDATIONS ===');
    
    if (results.failedTests > 0) {
        console.log('• Review failed test cases for pattern improvements');
    }
    
    if (patternsPassed < patternTests.length) {
        console.log('• Add more OCR patterns for edge cases');
    }
    
    const hasInvoiceIssues = results.testDetails.some(detail => detail.success && !detail.hasInvoiceNumber);
    if (hasInvoiceIssues) {
        console.log('• Improve invoice number detection patterns');
    }
    
    console.log('• Monitor real-world receipt processing for additional patterns');
    console.log('• Consider adding fallback patterns for unusual formats');
    
    return {
        totalTests: results.totalTests + patternTests.length,
        passedTests: results.passedTests + patternsPassed,
        overallSuccessRate,
        detailedResults: results.testDetails
    };
}

// Run tests if this file is executed directly
if (require.main === module) {
    runRealisticTests()
        .then(report => {
            console.log('\n🏁 Realistic Testing Complete');
            process.exit(report.overallSuccessRate >= 75 ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Testing Failed:', error);
            process.exit(1);
        });
}

module.exports = { runRealisticTests, realisticReceiptTexts };