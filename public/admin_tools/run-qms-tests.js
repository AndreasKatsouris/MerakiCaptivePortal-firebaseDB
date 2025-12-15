// Simple test runner for QMS tier integration tests
import { runAllTests } from './qms-tier-test-execution.js';

console.log('🚀 Starting QMS Tier Integration Tests...\n');

runAllTests()
    .then(results => {
        console.log('\n🎉 Tests completed successfully!');
        console.log(`Final Results: ${results.passed} passed, ${results.failed} failed, ${results.blocked} blocked`);
        process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    });