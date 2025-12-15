/**
 * Performance Testing Suite for Receipt Processing System
 * Tests processing times, resource usage, and scalability
 */

const { testTotalAmountDetection } = require('./receiptProcessor');
const { realisticReceiptTexts } = require('./test-receipt-processor-realistic');

/**
 * Performance Test Configuration
 */
const PERFORMANCE_CONFIG = {
    ACCEPTABLE_PROCESSING_TIME: 2000,      // 2 seconds
    MAX_PROCESSING_TIME: 5000,             // 5 seconds
    BATCH_SIZE: 10,                        // Number of receipts to process in batch
    STRESS_TEST_SIZE: 50,                  // Number of receipts for stress testing
    MEMORY_THRESHOLD: 100 * 1024 * 1024,   // 100MB memory threshold
    CONCURRENT_REQUESTS: 5                  // Number of concurrent processing requests
};

/**
 * Memory Usage Monitoring
 */
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
        external: usage.external,
        arrayBuffers: usage.arrayBuffers
    };
}

/**
 * Format memory size for display
 */
function formatMemorySize(bytes) {
    const MB = 1024 * 1024;
    return (bytes / MB).toFixed(2) + ' MB';
}

/**
 * Single Receipt Processing Performance Test
 */
async function testSingleReceiptPerformance() {
    console.log('=== SINGLE RECEIPT PROCESSING PERFORMANCE ===\n');
    
    const performanceResults = [];
    
    for (const [receiptName, receiptText] of Object.entries(realisticReceiptTexts)) {
        console.log(`Testing: ${receiptName}`);
        
        const memoryBefore = getMemoryUsage();
        const startTime = process.hrtime.bigint();
        
        try {
            const result = testTotalAmountDetection(receiptText);
            
            const endTime = process.hrtime.bigint();
            const memoryAfter = getMemoryUsage();
            
            const processingTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
            const memoryUsed = memoryAfter.heapUsed - memoryBefore.heapUsed;
            
            const performanceData = {
                receiptName,
                processingTime,
                memoryUsed,
                memoryBefore: memoryBefore.heapUsed,
                memoryAfter: memoryAfter.heapUsed,
                success: result.success,
                acceptable: processingTime <= PERFORMANCE_CONFIG.ACCEPTABLE_PROCESSING_TIME,
                withinLimit: processingTime <= PERFORMANCE_CONFIG.MAX_PROCESSING_TIME
            };
            
            performanceResults.push(performanceData);
            
            console.log(`   Processing Time: ${processingTime.toFixed(2)}ms`);
            console.log(`   Memory Used: ${formatMemorySize(memoryUsed)}`);
            console.log(`   Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
            console.log(`   Performance: ${performanceData.acceptable ? 'ACCEPTABLE' : 'SLOW'}`);
            
        } catch (error) {
            console.error(`   ERROR: ${error.message}`);
            
            performanceResults.push({
                receiptName,
                processingTime: 0,
                memoryUsed: 0,
                success: false,
                error: error.message,
                acceptable: false,
                withinLimit: false
            });
        }
        
        console.log();
    }
    
    return performanceResults;
}

/**
 * Batch Processing Performance Test
 */
async function testBatchProcessingPerformance() {
    console.log('=== BATCH PROCESSING PERFORMANCE ===\n');
    
    const receiptTexts = Object.values(realisticReceiptTexts);
    const batchSize = PERFORMANCE_CONFIG.BATCH_SIZE;
    const batches = [];
    
    // Create batches
    for (let i = 0; i < receiptTexts.length; i += batchSize) {
        batches.push(receiptTexts.slice(i, i + batchSize));
    }
    
    console.log(`Processing ${batches.length} batches of ${batchSize} receipts each`);
    console.log();
    
    const batchResults = [];
    
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`Processing Batch ${i + 1}/${batches.length}`);
        
        const memoryBefore = getMemoryUsage();
        const startTime = process.hrtime.bigint();
        
        try {
            const promises = batch.map(receiptText => 
                Promise.resolve(testTotalAmountDetection(receiptText))
            );
            
            const results = await Promise.all(promises);
            
            const endTime = process.hrtime.bigint();
            const memoryAfter = getMemoryUsage();
            
            const batchProcessingTime = Number(endTime - startTime) / 1000000;
            const avgProcessingTime = batchProcessingTime / batch.length;
            const memoryUsed = memoryAfter.heapUsed - memoryBefore.heapUsed;
            const successCount = results.filter(r => r.success).length;
            
            const batchData = {
                batchNumber: i + 1,
                batchSize: batch.length,
                batchProcessingTime,
                avgProcessingTime,
                memoryUsed,
                successCount,
                failureCount: batch.length - successCount,
                successRate: (successCount / batch.length) * 100,
                acceptable: avgProcessingTime <= PERFORMANCE_CONFIG.ACCEPTABLE_PROCESSING_TIME
            };
            
            batchResults.push(batchData);
            
            console.log(`   Batch Size: ${batch.length} receipts`);
            console.log(`   Total Time: ${batchProcessingTime.toFixed(2)}ms`);
            console.log(`   Avg Time/Receipt: ${avgProcessingTime.toFixed(2)}ms`);
            console.log(`   Memory Used: ${formatMemorySize(memoryUsed)}`);
            console.log(`   Success Rate: ${batchData.successRate.toFixed(1)}%`);
            console.log(`   Performance: ${batchData.acceptable ? 'ACCEPTABLE' : 'SLOW'}`);
            
        } catch (error) {
            console.error(`   Batch ERROR: ${error.message}`);
            
            batchResults.push({
                batchNumber: i + 1,
                batchSize: batch.length,
                error: error.message,
                acceptable: false
            });
        }
        
        console.log();
    }
    
    return batchResults;
}

/**
 * Concurrent Processing Performance Test
 */
async function testConcurrentProcessingPerformance() {
    console.log('=== CONCURRENT PROCESSING PERFORMANCE ===\n');
    
    const receiptTexts = Object.values(realisticReceiptTexts);
    const concurrentRequests = PERFORMANCE_CONFIG.CONCURRENT_REQUESTS;
    
    console.log(`Testing ${concurrentRequests} concurrent processing requests`);
    console.log();
    
    const memoryBefore = getMemoryUsage();
    const startTime = process.hrtime.bigint();
    
    try {
        // Create concurrent processing promises
        const concurrentPromises = Array.from({ length: concurrentRequests }, (_, i) => {
            const receiptText = receiptTexts[i % receiptTexts.length];
            return Promise.resolve(testTotalAmountDetection(receiptText));
        });
        
        const results = await Promise.all(concurrentPromises);
        
        const endTime = process.hrtime.bigint();
        const memoryAfter = getMemoryUsage();
        
        const totalProcessingTime = Number(endTime - startTime) / 1000000;
        const avgProcessingTime = totalProcessingTime / concurrentRequests;
        const memoryUsed = memoryAfter.heapUsed - memoryBefore.heapUsed;
        const successCount = results.filter(r => r.success).length;
        
        const concurrentData = {
            concurrentRequests,
            totalProcessingTime,
            avgProcessingTime,
            memoryUsed,
            successCount,
            failureCount: concurrentRequests - successCount,
            successRate: (successCount / concurrentRequests) * 100,
            acceptable: avgProcessingTime <= PERFORMANCE_CONFIG.ACCEPTABLE_PROCESSING_TIME,
            memoryEfficient: memoryUsed <= PERFORMANCE_CONFIG.MEMORY_THRESHOLD
        };
        
        console.log(`   Concurrent Requests: ${concurrentRequests}`);
        console.log(`   Total Time: ${totalProcessingTime.toFixed(2)}ms`);
        console.log(`   Avg Time/Request: ${avgProcessingTime.toFixed(2)}ms`);
        console.log(`   Memory Used: ${formatMemorySize(memoryUsed)}`);
        console.log(`   Success Rate: ${concurrentData.successRate.toFixed(1)}%`);
        console.log(`   Performance: ${concurrentData.acceptable ? 'ACCEPTABLE' : 'SLOW'}`);
        console.log(`   Memory Efficiency: ${concurrentData.memoryEfficient ? 'EFFICIENT' : 'HIGH USAGE'}`);
        
        return concurrentData;
        
    } catch (error) {
        console.error(`   Concurrent Processing ERROR: ${error.message}`);
        
        return {
            concurrentRequests,
            error: error.message,
            acceptable: false,
            memoryEfficient: false
        };
    }
}

/**
 * Stress Test with High Load
 */
async function testStressPerformance() {
    console.log('=== STRESS TEST PERFORMANCE ===\n');
    
    const receiptTexts = Object.values(realisticReceiptTexts);
    const stressTestSize = PERFORMANCE_CONFIG.STRESS_TEST_SIZE;
    
    console.log(`Stress testing with ${stressTestSize} receipt processing requests`);
    console.log();
    
    const memoryBefore = getMemoryUsage();
    const startTime = process.hrtime.bigint();
    
    try {
        const stressPromises = Array.from({ length: stressTestSize }, (_, i) => {
            const receiptText = receiptTexts[i % receiptTexts.length];
            return Promise.resolve(testTotalAmountDetection(receiptText));
        });
        
        const results = await Promise.all(stressPromises);
        
        const endTime = process.hrtime.bigint();
        const memoryAfter = getMemoryUsage();
        
        const totalProcessingTime = Number(endTime - startTime) / 1000000;
        const avgProcessingTime = totalProcessingTime / stressTestSize;
        const memoryUsed = memoryAfter.heapUsed - memoryBefore.heapUsed;
        const successCount = results.filter(r => r.success).length;
        
        const stressData = {
            stressTestSize,
            totalProcessingTime,
            avgProcessingTime,
            memoryUsed,
            successCount,
            failureCount: stressTestSize - successCount,
            successRate: (successCount / stressTestSize) * 100,
            acceptable: avgProcessingTime <= PERFORMANCE_CONFIG.ACCEPTABLE_PROCESSING_TIME,
            memoryEfficient: memoryUsed <= PERFORMANCE_CONFIG.MEMORY_THRESHOLD,
            throughput: stressTestSize / (totalProcessingTime / 1000) // receipts per second
        };
        
        console.log(`   Stress Test Size: ${stressTestSize} receipts`);
        console.log(`   Total Time: ${totalProcessingTime.toFixed(2)}ms`);
        console.log(`   Avg Time/Receipt: ${avgProcessingTime.toFixed(2)}ms`);
        console.log(`   Memory Used: ${formatMemorySize(memoryUsed)}`);
        console.log(`   Success Rate: ${stressData.successRate.toFixed(1)}%`);
        console.log(`   Throughput: ${stressData.throughput.toFixed(2)} receipts/second`);
        console.log(`   Performance: ${stressData.acceptable ? 'ACCEPTABLE' : 'SLOW'}`);
        console.log(`   Memory Efficiency: ${stressData.memoryEfficient ? 'EFFICIENT' : 'HIGH USAGE'}`);
        
        return stressData;
        
    } catch (error) {
        console.error(`   Stress Test ERROR: ${error.message}`);
        
        return {
            stressTestSize,
            error: error.message,
            acceptable: false,
            memoryEfficient: false
        };
    }
}

/**
 * Main Performance Testing Function
 */
async function runPerformanceTests() {
    console.log('🚀 STARTING PERFORMANCE TESTING SUITE\n');
    console.log('Testing Processing Times and Resource Usage');
    console.log('='.repeat(60) + '\n');
    
    try {
        // Initial memory baseline
        const initialMemory = getMemoryUsage();
        console.log(`Initial Memory Usage: ${formatMemorySize(initialMemory.heapUsed)}`);
        console.log();
        
        // Run all performance tests
        const singleResults = await testSingleReceiptPerformance();
        const batchResults = await testBatchProcessingPerformance();
        const concurrentResults = await testConcurrentProcessingPerformance();
        const stressResults = await testStressPerformance();
        
        // Generate comprehensive performance report
        console.log('=== COMPREHENSIVE PERFORMANCE REPORT ===\n');
        
        // Single receipt performance analysis
        console.log('📊 SINGLE RECEIPT PERFORMANCE:');
        const avgSingleTime = singleResults.reduce((sum, r) => sum + r.processingTime, 0) / singleResults.length;
        const acceptableSingle = singleResults.filter(r => r.acceptable).length;
        
        console.log(`   Average Processing Time: ${avgSingleTime.toFixed(2)}ms`);
        console.log(`   Acceptable Performance: ${acceptableSingle}/${singleResults.length} (${((acceptableSingle / singleResults.length) * 100).toFixed(1)}%)`);
        console.log(`   Fastest: ${Math.min(...singleResults.map(r => r.processingTime)).toFixed(2)}ms`);
        console.log(`   Slowest: ${Math.max(...singleResults.map(r => r.processingTime)).toFixed(2)}ms`);
        console.log();
        
        // Batch performance analysis
        console.log('📊 BATCH PROCESSING PERFORMANCE:');
        const avgBatchTime = batchResults.reduce((sum, r) => sum + (r.avgProcessingTime || 0), 0) / batchResults.length;
        const acceptableBatch = batchResults.filter(r => r.acceptable).length;
        
        console.log(`   Average Batch Processing Time: ${avgBatchTime.toFixed(2)}ms per receipt`);
        console.log(`   Acceptable Batch Performance: ${acceptableBatch}/${batchResults.length} (${((acceptableBatch / batchResults.length) * 100).toFixed(1)}%)`);
        console.log();
        
        // Concurrent performance analysis
        console.log('📊 CONCURRENT PROCESSING PERFORMANCE:');
        console.log(`   Concurrent Requests: ${concurrentResults.concurrentRequests}`);
        console.log(`   Average Processing Time: ${concurrentResults.avgProcessingTime?.toFixed(2)}ms`);
        console.log(`   Success Rate: ${concurrentResults.successRate?.toFixed(1)}%`);
        console.log(`   Performance: ${concurrentResults.acceptable ? 'ACCEPTABLE' : 'SLOW'}`);
        console.log();
        
        // Stress test analysis
        console.log('📊 STRESS TEST PERFORMANCE:');
        console.log(`   Test Size: ${stressResults.stressTestSize} receipts`);
        console.log(`   Average Processing Time: ${stressResults.avgProcessingTime?.toFixed(2)}ms`);
        console.log(`   Throughput: ${stressResults.throughput?.toFixed(2)} receipts/second`);
        console.log(`   Success Rate: ${stressResults.successRate?.toFixed(1)}%`);
        console.log(`   Performance: ${stressResults.acceptable ? 'ACCEPTABLE' : 'SLOW'}`);
        console.log();
        
        // Overall assessment
        console.log('=== OVERALL PERFORMANCE ASSESSMENT ===');
        
        const overallAcceptable = (
            (acceptableSingle / singleResults.length) >= 0.8 &&
            (acceptableBatch / batchResults.length) >= 0.8 &&
            concurrentResults.acceptable &&
            stressResults.acceptable
        );
        
        console.log(`Overall Performance Rating: ${overallAcceptable ? 'ACCEPTABLE' : 'NEEDS IMPROVEMENT'}`);
        
        // Performance recommendations
        console.log('\n=== PERFORMANCE RECOMMENDATIONS ===');
        
        if (avgSingleTime > PERFORMANCE_CONFIG.ACCEPTABLE_PROCESSING_TIME) {
            console.log('• Optimize single receipt processing time');
        }
        
        if (avgBatchTime > PERFORMANCE_CONFIG.ACCEPTABLE_PROCESSING_TIME) {
            console.log('• Consider batch processing optimizations');
        }
        
        if (!concurrentResults.acceptable) {
            console.log('• Improve concurrent processing performance');
        }
        
        if (!stressResults.acceptable) {
            console.log('• Optimize for high-load scenarios');
        }
        
        if (!concurrentResults.memoryEfficient || !stressResults.memoryEfficient) {
            console.log('• Optimize memory usage and implement garbage collection');
        }
        
        console.log('• Monitor production performance metrics');
        console.log('• Consider implementing performance caching');
        
        return {
            singleResults,
            batchResults,
            concurrentResults,
            stressResults,
            overallAcceptable,
            avgSingleTime,
            avgBatchTime
        };
        
    } catch (error) {
        console.error('💥 Performance Testing Failed:', error);
        return {
            error: error.message,
            overallAcceptable: false
        };
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runPerformanceTests()
        .then(report => {
            console.log('\n🏁 Performance Testing Complete');
            process.exit(report.overallAcceptable ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Testing Failed:', error);
            process.exit(1);
        });
}

module.exports = { 
    runPerformanceTests,
    testSingleReceiptPerformance,
    testBatchProcessingPerformance,
    testConcurrentProcessingPerformance,
    testStressPerformance,
    PERFORMANCE_CONFIG
};