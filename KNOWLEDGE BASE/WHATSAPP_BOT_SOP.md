# WhatsApp Bot Standard Operating Procedure (SOP)

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Message Flow](#message-flow)
4. [Command Processing](#command-processing)
5. [Receipt Processing](#receipt-processing)
6. [Error Handling](#error-handling)
7. [Maintenance Procedures](#maintenance-procedures)
8. [Testing Procedures](#testing-procedures)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Performance Monitoring](#performance-monitoring)

---

## System Overview

The WhatsApp Bot is a conversational AI system that processes customer messages via WhatsApp through Twilio's API. It handles receipt validation, rewards management, and customer support for a rewards program.

### Key Features
- **Friendly Bot Persona**: All messages clearly identify the system as a bot with emojis and conversational tone
- **Receipt Processing**: OCR-based receipt analysis and campaign matching
- **Rewards Management**: Point tracking, reward issuance, and redemption
- **Command Processing**: Natural language command recognition
- **Data Consent Management**: GDPR-compliant consent handling
- **Multi-language Support**: Designed for scalable localization

### Technology Stack
- **Platform**: Firebase Cloud Functions (Node.js)
- **Database**: Firebase Realtime Database
- **Messaging**: Twilio WhatsApp API
- **OCR**: Custom receipt processing engine
- **Authentication**: Firebase Admin SDK

---

## Architecture

### File Structure
```
functions/
├── receiveWhatsappMessage.js    # Main message router (entry point)
├── menuLogic.js                 # Centralized command processing
├── receiptProcessor.js          # Receipt OCR and analysis
├── guardRail.js                 # Campaign matching logic
├── rewardsProcessor.js          # Reward generation and management
├── voucherService.js            # Voucher code management
├── dataManagement.js            # User data operations
├── twilioClient.js              # Twilio configuration
├── consent/                     # Consent management modules
├── utils/
│   └── whatsappClient.js        # WhatsApp messaging utility (prevents circular deps)
└── config/
    └── firebase-admin.js        # Firebase configuration
```

### System Components

#### 1. Message Router (`receiveWhatsappMessage.js`)
**Purpose**: Entry point for all WhatsApp messages. Handles routing and initial processing.

**Responsibilities**:
- Webhook endpoint for Twilio
- Guest data management
- Consent flow handling
- Message type routing (text vs. media)
- Receipt processing orchestration
- Name collection for new users

#### 2. Command Processor (`menuLogic.js`)
**Purpose**: Centralized command handling with pattern matching.

**Responsibilities**:
- Command pattern recognition
- All text command processing
- Reward management commands
- Point balance queries
- Help system
- Database operations for rewards and points

**Dependencies**: 
- `utils/whatsappClient.js` for messaging
- `config/firebase-admin.js` for database operations
- `dataManagement.js` for user data operations

#### 3. WhatsApp Utility (`utils/whatsappClient.js`)
**Purpose**: Dedicated utility for WhatsApp messaging to prevent circular dependencies.

**Responsibilities**:
- WhatsApp message sending via Twilio
- Phone number format validation
- Message delivery error handling

**Benefits**:
- Prevents circular dependencies between modules
- Single source of truth for messaging logic
- Easier testing and maintenance

#### 4. Receipt Processor (`receiptProcessor.js`)
**Purpose**: OCR and receipt data extraction.

**Key Functions**:
- Image analysis and text extraction
- Receipt format recognition
- Data validation and cleaning
- Brand/store identification

#### 5. Campaign Matcher (`guardRail.js`)
**Purpose**: Validates receipts against active campaigns.

**Key Functions**:
- Campaign criteria validation
- Eligibility checking
- Reward type qualification
- Business rule enforcement

#### 6. Rewards Processor (`rewardsProcessor.js`)
**Purpose**: Reward generation and lifecycle management.

**Key Functions**:
- Reward creation and assignment
- Voucher code management
- Expiration handling
- Notification sending via WhatsApp utility

**Dependencies**:
- `utils/whatsappClient.js` for sending notifications

---

## Message Flow

### High-Level Flow Diagram
```
WhatsApp User Message
          ↓
    Twilio Webhook
          ↓
receiveWhatsappMessage.js
          ↓
   Request Validation
          ↓
   Guest Data Retrieval
          ↓
    [Has Name?] ──No──→ Name Collection Flow
          ↓ Yes
    Consent Management
          ↓
   [Message Type?]
    ↙         ↘
  Image      Text
    ↓          ↓
Receipt     Command
Processing  Processing
    ↓          ↓
Campaign    menuLogic.js
Matching       ↓
    ↓       Pattern
Reward      Matching
Processing     ↓
    ↓       Command
Response    Execution
Sent          ↓
           Response
           Sent
```

### Detailed Processing Steps

#### 1. Initial Message Processing
```javascript
// receiveWhatsappMessage.js
1. Validate HTTP request (POST from Twilio)
2. Extract message data (Body, From, MediaUrl0)
3. Clean phone number format
4. Get or create guest record
5. Check if guest has registered name
   - If no name: handleNameCollection()
   - If has name: continue to consent check
```

#### 2. Consent Management
```javascript
6. Check consent status
7. Handle consent flow if required
   - Check for pending consent responses
   - Process yes/no responses
   - Set consent flags in database
8. Validate command consent requirements
```

#### 3. Message Routing
```javascript
9. Route by message type:
   - Image (MediaUrl0): → Receipt Processing
   - Text (Body): → Command Processing
   - Invalid: → Error handling
```

#### 4. Receipt Processing Flow
```javascript
// Receipt Processing Path
10. OCR processing (receiptProcessor.js)
11. Campaign matching (guardRail.js)
12. Reward generation (rewardsProcessor.js)
13. Success/failure response
14. Database updates
15. User notification
```

#### 5. Command Processing Flow
```javascript
// Command Processing Path (menuLogic.js)
10. Normalize command text
11. Pattern matching against COMMANDS object
12. Command execution:
    - CHECK_POINTS: Get user points
    - CHECK_REWARDS: List user rewards
    - USE_REWARD: Generate use code
    - DELETE_DATA: Remove user data
    - HELP: Show help menu
13. Response generation
14. WhatsApp message sending
```

---

## Command Processing

### Command System Architecture

The command system uses a centralized pattern-matching approach in `menuLogic.js`:

```javascript
const COMMANDS = {
    COMMAND_TYPE: {
        patterns: ['pattern1', 'pattern2'],
        handler: async (phoneNumber, ...args) => { /* logic */ }
    }
}
```

### Supported Commands

#### 1. Points Commands
**Patterns**: `check points`, `my points`, `point balance`, `check my points`
**Response**: `🤖 You currently have {X} points! 🎯`

#### 2. Rewards Commands
**Patterns**: `view rewards`, `my rewards`, `check rewards`, `show rewards`
**Response**: Detailed reward listing with statuses and expiration dates

#### 3. Help Commands
**Patterns**: `help`, `hi`, `hello`, `menu`, `start`
**Response**: Complete bot capabilities menu with emojis

#### 4. Data Management Commands
**Patterns**: `delete my data`, `remove my information`
**Process**:
1. Complete user data deletion
2. Compliance with GDPR requirements
3. Confirmation message

### Command Processing Flow
```javascript
async function processMessage(message, phoneNumber) {
    // 1. Input validation
    // 2. Normalize message text
    // 3. Pattern matching loop
    for (const [commandType, command] of Object.entries(COMMANDS)) {
        if (command.patterns.some(pattern => 
            normalizedMessage.includes(pattern))) {
            // 4. Execute command handler
            return await command.handler(phoneNumber, message);
        }
    }
    // 5. Default help response if no match
    return helpMessage;
}
```

---

## Receipt Processing

### Receipt Processing Pipeline

#### Stage 1: Image Reception and Validation
```javascript
// receiveWhatsappMessage.js - handleReceiptProcessing()
1. Receive MediaUrl0 from Twilio
2. Validate consent requirements
3. Check guest authentication
4. Log processing start
```

#### Stage 2: OCR and Data Extraction
```javascript
// receiptProcessor.js - processReceipt()
1. Download image from MediaUrl0
2. Perform OCR text extraction
3. Parse receipt structure:
   - Brand/restaurant name
   - Store location
   - Date and time
   - Items and prices
   - Total amount
   - Invoice number
4. Data validation and cleaning
5. Return structured receipt data
```

#### Stage 3: Campaign Matching
```javascript
// guardRail.js - matchReceiptToCampaign()
1. Load active campaigns from database
2. Brand matching against receipt
3. Validate campaign criteria:
   - Minimum purchase amount
   - Valid time windows
   - Required items
   - Store eligibility
   - Campaign period
4. Check reward type eligibility
5. Return match result with eligible rewards
```

#### Stage 4: Reward Processing
```javascript
// rewardsProcessor.js - processReward()
1. Generate rewards for eligible types
2. Create reward records in database
3. Assign voucher codes if applicable
4. Set expiration dates
5. Create guest-reward relationships
6. Send success notifications
```

### Receipt Data Structure
```javascript
const receiptData = {
    brandName: 'Ocean Basket',
    storeName: 'Gateway Theatre of Shopping',
    date: '2024-01-15',
    time: '14:30',
    items: [
        { name: 'Fish & Chips', price: 89.90 },
        { name: 'Prawns', price: 129.90 }
    ],
    totalAmount: 219.80,
    invoiceNumber: 'INV-001234',
    receiptId: 'generated-unique-id',
    processedAt: Date.now()
};
```

### Campaign Matching Logic
```javascript
const matchCriteria = {
    brandMatch: true,
    minimumAmount: { required: 50, actual: 219.80, met: true },
    timeWindow: { required: '09:00-21:00', actual: '14:30', met: true },
    storeEligibility: { eligible: true },
    campaignPeriod: { active: true },
    requiredItems: { required: [], found: [], met: true }
};
```

### Success Response Example
```
🎉 Congratulations John! 🎉

Your receipt has earned you:

• R10 Discount Voucher
  Expires: 15/02/2024
• 50 Loyalty Points
  Expires: 15/04/2024

Reply "view rewards" anytime to check your rewards!
```

### Failure Response Examples
```
🤖 Hi John! I've analyzed your receipt but couldn't validate it for rewards this time.

📸 Receipt clarity issues:
• The total amount isn't clear
• The receipt date isn't visible

💡 To help me read your receipt better:
• Take the photo in good lighting
• Make sure the receipt is flat and not folded
• Include the entire receipt in the photo
• Ensure all text is clearly visible

🎉 Keep trying - I'm here to help you earn those rewards!
```

---

## Error Handling

### Error Categories and Responses

#### 1. Network/System Errors
**Error Types**: Connection timeouts, server unavailability
**Bot Response**: 
```
🤖 Oops! I'm having trouble connecting to my servers right now. 
Please give me a few minutes and try again! 🔄
```

#### 2. OCR/Image Processing Errors
**Error Types**: Poor image quality, unreadable text
**Bot Response**:
```
🤖 I'm having trouble reading your receipt clearly. 
Let me help you get a better photo:

📸 Photo tips:
• Use good lighting with no glare
• Keep the receipt flat and not folded
• Include the entire receipt in the photo
• Make sure all text is clearly visible

Try again - I'm here to help! 🎯
```

#### 3. Campaign Validation Errors
**Error Types**: No matching campaigns, eligibility failures
**Bot Response**: Detailed breakdown with specific improvement tips

#### 4. Database Errors
**Error Types**: Firebase connection issues, data corruption
**Handling**: 
- Automatic retry mechanisms
- Data integrity repairs
- Graceful degradation
- Admin alerts

#### 5. Twilio/WhatsApp Errors
**Error Types**: Message delivery failures, rate limiting
**Handling**:
- Message queuing
- Retry with exponential backoff
- Alternative notification methods

### Error Logging and Monitoring
```javascript
// Comprehensive error logging
console.error('Error details:', {
    errorType: error.name,
    message: error.message,
    stack: error.stack,
    phoneNumber: phoneNumber,
    messageType: 'receipt/command',
    timestamp: Date.now(),
    additionalContext: { /* relevant data */ }
});
```

---

## Maintenance Procedures

### Daily Maintenance Tasks

#### 1. System Health Checks
- [ ] Check Firebase Function execution logs
- [ ] Monitor Twilio webhook delivery status
- [ ] Verify database connection health
- [ ] Review error rates and patterns
- [ ] Check for circular dependency warnings in deployment logs

#### 2. Data Integrity Checks
- [ ] Run orphaned reward cleanup
- [ ] Validate guest data consistency
- [ ] Check campaign configuration integrity
- [ ] Monitor voucher code pool levels

#### 3. Performance Monitoring
- [ ] Function execution times
- [ ] Message processing throughput
- [ ] Database query performance
- [ ] Memory usage patterns

### Weekly Maintenance Tasks

#### 1. Data Analysis and Reporting
- [ ] User engagement metrics
- [ ] Receipt processing success rates
- [ ] Campaign performance analysis
- [ ] Error trend analysis

#### 2. System Optimization
- [ ] Database indexing review
- [ ] Function cold start optimization
- [ ] Memory usage optimization
- [ ] Code performance profiling
- [ ] Dependency structure review for potential circular dependencies

#### 3. Security and Compliance
- [ ] Access log reviews
- [ ] Consent compliance audit
- [ ] Data retention policy enforcement
- [ ] Security vulnerability scanning

### Monthly Maintenance Tasks

#### 1. System Updates
- [ ] Dependencies security updates
- [ ] Firebase SDK updates
- [ ] Node.js runtime updates
- [ ] Third-party service updates
- [ ] Utility module updates and consolidation

#### 2. Capacity Planning
- [ ] Resource usage projections
- [ ] Scaling requirements assessment
- [ ] Cost optimization review
- [ ] Performance benchmark updates

#### 3. Disaster Recovery Testing
- [ ] Backup system verification
- [ ] Recovery procedure testing
- [ ] Data migration testing
- [ ] Failover mechanism testing

### Architecture Maintenance

#### 1. Dependency Management
**Purpose**: Prevent circular dependencies and maintain clean architecture

**Best Practices**:
- Keep utility functions in dedicated modules (`utils/`)
- Avoid importing high-level modules from low-level utilities
- Regular dependency graph analysis
- Use dedicated communication modules for cross-service messaging

**Warning Signs**:
- "Accessing non-existent property of module exports inside circular dependency"
- Undefined function errors during module initialization
- Inconsistent behavior during cold starts

**Resolution Steps**:
```javascript
// ❌ BAD: Creates circular dependency
// fileA.js
const { functionB } = require('./fileB');

// fileB.js  
const { functionA } = require('./fileA');

// ✅ GOOD: Use shared utility
// fileA.js
const { sharedFunction } = require('./utils/shared');

// fileB.js
const { sharedFunction } = require('./utils/shared');

// utils/shared.js - No dependencies on fileA or fileB
```

#### 2. Module Structure Guidelines
**File Organization**:
- `receiveWhatsappMessage.js` - Entry point and routing only
- `menuLogic.js` - Command processing and business logic
- `utils/` - Shared utilities with no business logic dependencies
- `config/` - Configuration modules only

**Import Rules**:
- Utils should not import business logic modules
- Business logic can import utils
- Avoid deep dependency chains (max 3 levels recommended)

### Maintenance Commands

#### Database Cleanup
```javascript
// Orphaned reward cleanup
const orphanedReferences = await findOrphanedRewards();
await cleanupOrphanedReferences(phoneNumber, orphanedReferences);
```

#### Performance Monitoring
```javascript
// Function execution time tracking
const startTime = Date.now();
// ... function execution
const executionTime = Date.now() - startTime;
console.log(`Function executed in ${executionTime}ms`);
```

---

## Testing Procedures

### Unit Testing

#### 1. Command Processing Tests
```javascript
// Test command pattern matching
const testCommands = [
    { input: 'check my points', expected: 'CHECK_POINTS' },
    { input: 'view rewards', expected: 'CHECK_REWARDS' },
    { input: 'hello', expected: 'HELP' },
    { input: 'delete my data', expected: 'DELETE_DATA' }
];

testCommands.forEach(test => {
    const result = processMessage(test.input, testPhoneNumber);
    assert(result.commandType === test.expected);
});
```

#### 2. Receipt Processing Tests
```javascript
// Test OCR accuracy
const testReceipts = [
    { image: 'test_receipt_1.jpg', expected: { brand: 'Ocean Basket', total: 89.90 }},
    { image: 'test_receipt_2.jpg', expected: { brand: 'KFC', total: 45.50 }}
];

testReceipts.forEach(async test => {
    const result = await processReceipt(test.image, testPhoneNumber);
    assert(result.brandName === test.expected.brand);
    assert(result.totalAmount === test.expected.total);
});
```

#### 3. Campaign Matching Tests
```javascript
// Test campaign validation
const testCampaigns = [
    { receipt: validOceanBasketReceipt, expected: { valid: true, rewards: 2 }},
    { receipt: invalidLowAmountReceipt, expected: { valid: false, reason: 'minimum_amount' }}
];

testCampaigns.forEach(async test => {
    const result = await matchReceiptToCampaign(test.receipt);
    assert(result.isValid === test.expected.valid);
});
```

### Integration Testing

#### 1. End-to-End Message Flow
```javascript
// Test complete message processing
async function testEndToEndFlow() {
    // 1. Send test message via Twilio
    const testMessage = await sendTestMessage(testPhoneNumber, 'check my points');
    
    // 2. Verify webhook processing
    await waitForProcessing(1000);
    
    // 3. Check response was sent
    const responses = await getWhatsAppResponses(testPhoneNumber);
    assert(responses.length > 0);
    assert(responses[0].includes('You currently have'));
}
```

#### 2. Receipt Processing Flow
```javascript
async function testReceiptFlow() {
    // 1. Send test receipt image
    const response = await sendTestReceipt(testPhoneNumber, 'valid_receipt.jpg');
    
    // 2. Verify processing completion
    await waitForProcessing(5000);
    
    // 3. Check reward generation
    const rewards = await getGuestRewards(testPhoneNumber);
    assert(rewards.length > 0);
    
    // 4. Verify notification sent
    const messages = await getWhatsAppResponses(testPhoneNumber);
    assert(messages.some(msg => msg.includes('Congratulations')));
}
```

### Utility Module Testing
```javascript
// Test WhatsApp messaging utility
const { sendWhatsAppMessage } = require('../utils/whatsappClient');

describe('WhatsApp Client Utility', () => {
    test('should format phone numbers correctly', async () => {
        // Test phone number formatting
        const testNumber = '+27123456789';
        const result = await sendWhatsAppMessage(testNumber, 'test message');
        // Verify proper whatsapp: prefix handling
    });
    
    test('should handle missing phone numbers', async () => {
        await expect(sendWhatsAppMessage(null, 'test'))
            .rejects.toThrow('Phone number is required');
    });
    
    test('should handle Twilio errors gracefully', async () => {
        // Mock Twilio error scenarios
        // Verify error handling and logging
    });
});

// Test dependency isolation
test('utility should not create circular dependencies', () => {
    const fs = require('fs');
    const path = require('path');
    
    // Read utility file
    const utilityCode = fs.readFileSync(
        path.join(__dirname, '../utils/whatsappClient.js'), 
        'utf8'
    );
    
    // Verify it doesn't import business logic modules
    expect(utilityCode).not.toMatch(/require.*menuLogic/);
    expect(utilityCode).not.toMatch(/require.*rewardsProcessor/);
    expect(utilityCode).not.toMatch(/require.*receiveWhatsappMessage/);
});

### Performance Testing

#### 1. Load Testing
```javascript
// Test concurrent message processing
async function loadTest() {
    const concurrentMessages = 100;
    const promises = [];
    
    for (let i = 0; i < concurrentMessages; i++) {
        promises.push(sendTestMessage(`+27${1000000000 + i}`, 'help'));
    }
    
    const startTime = Date.now();
    await Promise.all(promises);
    const endTime = Date.now();
    
    console.log(`Processed ${concurrentMessages} messages in ${endTime - startTime}ms`);
}
```

#### 2. Memory Usage Testing
```javascript
// Monitor memory usage during operation
function monitorMemoryUsage() {
    const used = process.memoryUsage();
    console.log('Memory usage:', {
        rss: `${Math.round(used.rss / 1024 / 1024 * 100) / 100} MB`,
        heapTotal: `${Math.round(used.heapTotal / 1024 / 1024 * 100) / 100} MB`,
        heapUsed: `${Math.round(used.heapUsed / 1024 / 1024 * 100) / 100} MB`,
        external: `${Math.round(used.external / 1024 / 1024 * 100) / 100} MB`
    });
}
```

#### 3. Dependency Graph Testing
```javascript
// Test for circular dependencies in build process
const madge = require('madge');

async function checkCircularDependencies() {
    const result = await madge('./functions/', {
        format: 'commonjs'
    });
    
    const circular = result.circular();
    if (circular.length > 0) {
        console.error('Circular dependencies found:', circular);
        throw new Error('Circular dependencies detected');
    }
    
    console.log('✅ No circular dependencies found');
}
```

### Test Data Management

#### 1. Test User Setup
```javascript
// Create test user with known state
async function setupTestUser(phoneNumber) {
    const testUser = {
        phoneNumber: phoneNumber,
        name: 'Test User',
        points: 100,
        createdAt: Date.now(),
        consent: {
            granted: true,
            grantedAt: Date.now()
        }
    };
    
    await set(ref(`guests/${phoneNumber}`), testUser);
    return testUser;
}
```

#### 2. Test Data Cleanup
```javascript
// Clean up test data after testing
async function cleanupTestData(phoneNumbers) {
    const cleanupPromises = phoneNumbers.map(phone => 
        remove(ref(`guests/${phone}`))
    );
    await Promise.all(cleanupPromises);
}
```

---

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Messages Not Being Received

**Symptoms**: WhatsApp messages not triggering webhook
**Possible Causes**:
- Twilio webhook URL configuration
- Firebase Function deployment issues
- Network connectivity problems
- **Signature enforcement rejecting requests** (see "Webhook signature verification" below) — `403 Invalid Twilio signature.` in logs

**Diagnostic Steps**:
1. Check Twilio webhook logs
2. Verify Firebase Function deployment status
3. Test webhook URL accessibility
4. Check Twilio account status
5. Check function logs for `🔐 Twilio signature INVALID` — if present in `enforce` mode, the reconstructed URL or token is wrong (see below)

**Solutions**:
```bash
# Redeploy Firebase Functions
firebase deploy --only functions

# Check function logs
firebase functions:log

# Test webhook endpoint
curl -X POST [webhook-url] -d "test=1"
```

#### Webhook signature verification (CRIT-07)

The inbound webhook verifies Twilio's `X-Twilio-Signature` (HMAC-SHA1, via the
account `TWILIO_TOKEN`) before processing — closing a forged-message vector. It is
staged via the `TWILIO_SIGNATURE_MODE` env var in `functions/.env` (see
`functions/.env.template`):

| Mode | Behaviour |
|------|-----------|
| `monitor` (default) | Validate + log `🔐 Twilio signature OK`/`INVALID`, but still process requests |
| `enforce` | Reject (`403`) on invalid/missing signature — the secure end-state |
| `off` | Skip the check entirely (escape hatch) |

**Promotion procedure (`monitor` → `enforce`):**
1. Deploy with `TWILIO_SIGNATURE_MODE=monitor`. Send real WhatsApp traffic.
2. In `firebase functions:log`, confirm every genuine message logs `🔐 Twilio signature OK` with `valid:true`, `hasToken:true`, and a reconstructed `url` that byte-matches the Twilio console webhook URL.
3. ⚠️ **Confirm `TWILIO_TOKEN` is populated in the function runtime BEFORE setting `enforce`** — a missing token makes `enforce` reject *all* traffic (`403`). The `hasToken:true` log field in step 2 is the check.
4. Set `TWILIO_SIGNATURE_MODE=enforce` and redeploy. If legitimate messages start 403ing, set it back to `monitor` and re-diff the logged `url`.

#### 2. Receipt Processing Failures

**Symptoms**: Receipt images not being processed or returning errors
**Possible Causes**:
- OCR service issues
- Image quality problems
- Campaign configuration errors

**Diagnostic Steps**:
1. Check OCR service logs
2. Test with known good receipt images
3. Verify campaign configurations
4. Check image download from Twilio

**Solutions**:
```javascript
// Test OCR processing
const testResult = await processReceipt(testImageUrl, testPhoneNumber);
console.log('OCR Result:', testResult);

// Verify campaign matching
const campaigns = await getActiveCampaigns();
console.log('Active campaigns:', campaigns.length);
```

#### 3. Database Connection Issues

**Symptoms**: Database operations failing or timing out
**Possible Causes**:
- Firebase connection problems
- Database rules issues
- Network connectivity

**Diagnostic Steps**:
1. Check Firebase console for errors
2. Verify database rules
3. Test database connectivity
4. Check quota usage

**Solutions**:
```javascript
// Test database connection
try {
    const testRef = ref('test/connection');
    await set(testRef, { timestamp: Date.now() });
    await remove(testRef);
    console.log('Database connection: OK');
} catch (error) {
    console.error('Database connection failed:', error);
}
```

#### 4. High Error Rates

**Symptoms**: Unusual number of errors in logs
**Possible Causes**:
- Code bugs
- External service issues
- Resource exhaustion

**Diagnostic Steps**:
1. Analyze error patterns in logs
2. Check resource usage metrics
3. Monitor external service status
4. Review recent code changes

**Solutions**:
- Implement circuit breaker patterns
- Add more comprehensive error handling
- Scale resources if needed
- Rollback problematic deployments

#### 5. Message Delivery Issues

**Symptoms**: Bot responses not reaching users
**Possible Causes**:
- Twilio API issues
- Rate limiting
- WhatsApp policy violations

**Diagnostic Steps**:
1. Check Twilio delivery status
2. Review message content for policy compliance
3. Monitor rate limiting
4. Verify phone number formats

**Solutions**:
```javascript
// Implement message retry logic
async function sendWithRetry(phoneNumber, message, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await sendWhatsAppMessage(phoneNumber, message);
            return;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}
```

#### 6. Circular Dependency Issues

**Symptoms**: 
- Warning: "Accessing non-existent property of module exports inside circular dependency"
- Functions undefined at runtime despite being exported
- Inconsistent behavior during deployment

**Possible Causes**:
- Modules importing each other directly or through a chain
- Business logic modules importing utility modules that import them back
- Shared functions placed in modules that have other dependencies

**Diagnostic Steps**:
1. Check import statements in recently modified files
2. Trace dependency chains using `npm ls` or manual analysis
3. Look for unused imports that might create cycles
4. Check deployment logs for specific circular dependency warnings

**Solutions**:
```javascript
// 1. Move shared functions to dedicated utils
// Before (creates circular dependency):
// menuLogic.js imports rewardsProcessor.js
// rewardsProcessor.js imports menuLogic.js for sendWhatsAppMessage

// After (clean separation):
// utils/whatsappClient.js contains sendWhatsAppMessage
// Both menuLogic.js and rewardsProcessor.js import from utils/whatsappClient.js

// 2. Remove unused imports
// Check if imported functions are actually used
const { unusedFunction } = require('./someModule'); // ❌ Remove if unused

// 3. Use dependency injection pattern for complex cases
function processReward(data, sendMessageFn) {
    // Use passed function instead of importing
    sendMessageFn(phoneNumber, message);
}
```

**Prevention**:
- Regular code reviews focusing on import statements
- Use linting rules to detect circular dependencies
- Keep utilities separate from business logic
- Document dependency flows in architecture diagrams

### Emergency Procedures

#### 1. System Outage Response
1. **Immediate Actions**:
   - Check Firebase Functions status
   - Verify Twilio service status
   - Check database connectivity
   - Review recent deployments

2. **Communication**:
   - Notify relevant stakeholders
   - Prepare user communication if needed
   - Document incident details

3. **Recovery Steps**:
   - Rollback to last known good deployment
   - Scale resources if needed
   - Implement temporary workarounds
   - Monitor system recovery

#### 2. Data Corruption Response
1. **Assessment**:
   - Identify scope of corruption
   - Determine affected users
   - Check backup availability

2. **Recovery**:
   - Stop affected processes
   - Restore from backups if available
   - Implement data repair scripts
   - Verify data integrity

3. **Prevention**:
   - Review backup procedures
   - Implement additional validation
   - Update monitoring systems

### Monitoring and Alerting

#### 1. Key Metrics to Monitor
- **Function Execution Time**: Alert if > 30 seconds
- **Error Rate**: Alert if > 5% in 5 minutes
- **Message Processing Volume**: Monitor for unusual spikes
- **Database Response Time**: Alert if > 1 second average
- **Memory Usage**: Alert if > 80% consistently

#### 2. Alert Configuration
```javascript
// Example alerting thresholds
const alertThresholds = {
    errorRate: 0.05,        // 5% error rate
    responseTime: 30000,    // 30 seconds
    memoryUsage: 0.8,       // 80% memory usage
    messageVolume: 1000     // 1000 messages per minute
};
```

---

## Performance Monitoring

### Key Performance Indicators (KPIs)

#### 1. System Performance
- **Message Processing Time**: Target < 5 seconds for text, < 30 seconds for receipts
- **System Uptime**: Target > 99.9%
- **Error Rate**: Target < 1%
- **Throughput**: Messages processed per minute
- **Deployment Success Rate**: Target > 95% (no circular dependency warnings)

#### 2. User Experience
- **Response Accuracy**: Percentage of correctly processed commands
- **Receipt Processing Success Rate**: Percentage of successfully processed receipts
- **User Satisfaction**: Based on completion rates and feedback

#### 3. Business Metrics
- **User Engagement**: Active users per day/week/month
- **Reward Redemption Rate**: Percentage of issued rewards that are redeemed
- **Campaign Effectiveness**: Conversion rates by campaign

#### 4. Architecture Health
- **Circular Dependencies**: Target = 0 (monitored in deployment logs)
- **Module Coupling**: Low coupling between business logic modules
- **Utility Reusability**: Percentage of shared functions in utils vs. duplicated code
- **Code Maintainability**: Time to implement new features or fix bugs

### Monitoring Dashboard

#### 1. Real-time Metrics
```javascript
// Example metrics collection
const metrics = {
    timestamp: Date.now(),
    messagesProcessed: messageCount,
    averageResponseTime: avgResponseTime,
    errorCount: errorCount,
    activeUsers: uniqueUsersLast24h,
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage()
};

// Send to monitoring service
await sendMetrics(metrics);
```

#### 2. Performance Alerts
- Function timeout alerts
- High error rate alerts
- Memory usage alerts
- Database connection alerts
- Unusual traffic pattern alerts

### Optimization Strategies

#### 1. Function Optimization
- Minimize cold starts with pre-warming
- Optimize memory allocation
- Implement connection pooling
- Use efficient data structures

#### 2. Database Optimization
- Implement proper indexing
- Use connection pooling
- Optimize query patterns
- Implement caching strategies

#### 3. Message Processing Optimization
- Implement message queuing for high volume
- Use batch processing where appropriate
- Optimize image processing pipeline
- Implement intelligent retries

---

## Conclusion

This SOP provides comprehensive guidance for operating and maintaining the WhatsApp Bot system. Regular review and updates of these procedures ensure optimal system performance and user experience.

### Key Success Factors
1. **Proactive Monitoring**: Continuous system health monitoring
2. **Rapid Response**: Quick identification and resolution of issues
3. **User-Centric Design**: Focus on user experience and satisfaction
4. **Continuous Improvement**: Regular optimization and feature enhancement
5. **Documentation**: Maintaining up-to-date documentation and procedures

### Support and Escalation
- **Level 1**: Automated monitoring and basic troubleshooting
- **Level 2**: Advanced technical support and system administration
- **Level 3**: Development team for code-level issues and enhancements

---

*Document Version: 1.0*  
*Last Updated: January 2024*  
*Next Review: March 2024* 