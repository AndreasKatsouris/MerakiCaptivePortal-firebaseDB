# Coding Standards & Style Guide

## Overview

This document defines the coding standards, naming conventions, and best practices for the MerakiCaptivePortal-firebaseDB project.

---

## File Naming Conventions

### Standard: **kebab-case**

✅ **Correct**:
```
queue-management.js
guest-analytics.js
receipt-processor.js
admin-dashboard.html
```

❌ **Incorrect**:
```
queueManagement.js    # camelCase
GuestAnalytics.js     # PascalCase
receipt_processor.js  # snake_case
```

### Special Cases

**Vue Components**: Use **PascalCase** (Vue convention)
```
QueueList.vue
GuestCard.vue
BookingForm.vue
```

**React Components**: Use **PascalCase** (React convention)
```
QueueList.jsx
GuestCard.jsx
BookingForm.jsx
```

**Configuration Files**: Use framework conventions
```
vite.config.js         # lowercase
tailwind.config.js     # lowercase
.eslintrc.js          # lowercase with dot
```

---

## Directory Naming

### Standard: **kebab-case**

✅ **Correct**:
```
queue-management/
guest-analytics/
access-control/
food-cost/
```

❌ **Incorrect**:
```
queueManagement/      # camelCase
Queue_Management/     # PascalCase with underscore
```

---

## JavaScript/TypeScript Naming

### Variables & Functions: **camelCase**

```javascript
// Variables
const queueManager = new QueueManager();
let guestCount = 0;
const isActive = true;

// Functions
function processReceipt(receipt) { }
function calculateTotal(items) { }
async function fetchGuestData(id) { }
```

### Classes & Constructors: **PascalCase**

```javascript
class QueueManager { }
class GuestAnalytics { }
class ReceiptProcessor { }

// Constructor functions
function BookingService() { }
```

### Constants: **UPPER_SNAKE_CASE**

```javascript
const MAX_QUEUE_SIZE = 100;
const DEFAULT_TIMEOUT = 5000;
const API_BASE_URL = 'https://api.example.com';
const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled'
};
```

### Private Variables/Methods: Prefix with `_`

```javascript
class QueueManager {
  _privateVariable = 0;
  
  _privateMethod() {
    // Implementation
  }
  
  publicMethod() {
    return this._privateMethod();
  }
}
```

### Boolean Variables: Use `is`, `has`, `can`, `should` prefixes

```javascript
const isActive = true;
const hasPermission = false;
const canEdit = true;
const shouldUpdate = false;
```

---

## CSS Class Naming

### Standard: **BEM (Block Element Modifier)**

```css
/* Block */
.queue-list { }

/* Element */
.queue-list__item { }
.queue-list__title { }

/* Modifier */
.queue-list__item--active { }
.queue-list__item--disabled { }
```

### Utility Classes: **kebab-case**

```css
.text-center { }
.mb-4 { }
.flex-column { }
```

---

## HTML/Template Conventions

### IDs: **kebab-case**

```html
<div id="guest-list"></div>
<button id="submit-booking"></button>
```

### Data Attributes: **kebab-case**

```html
<div data-guest-id="123"></div>
<button data-action-type="submit"></button>
```

---

## Module Organization

### Exports

**Named Exports** (Preferred for utilities):
```javascript
// utils/date-utils.js
export function formatDate(date) { }
export function parseDate(string) { }

// Import
import { formatDate, parseDate } from './utils/date-utils.js';
```

**Default Exports** (For main module functionality):
```javascript
// services/queue-service.js
export default class QueueService { }

// Import
import QueueService from './services/queue-service.js';
```

### File Structure

Every feature module should have:

```
feature-name/
├── index.js              # Public API (exports)
├── components/           # UI components
├── services/             # Business logic
├── utils/                # Feature utilities
├── constants.js          # Feature constants
└── types.js              # Types/interfaces
```

**index.js** example:
```javascript
// Export public API only
export { default as QueueManager } from './services/queue-manager.js';
export { QueueList } from './components/queue-list.js';
export { QUEUE_STATUS } from './constants.js';

// Don't export internal utilities
```

---

## Comment Conventions

### File Headers

```javascript
/**
 * Queue Management Service
 * 
 * Handles queue operations including adding, removing,
 * and updating queue items.
 * 
 * @module services/queue-service
 * @requires firebase-admin
 */
```

### Function Documentation (JSDoc)

```javascript
/**
 * Process a receipt and extract line items
 * 
 * @param {Object} receipt - Receipt object from Firebase
 * @param {string} receipt.imageUrl - URL to receipt image
 * @param {string} receipt.locationId - Location identifier
 * @returns {Promise<Object>} Processed receipt with line items
 * @throws {Error} If OCR fails or receipt is invalid
 */
async function processReceipt(receipt) {
  // Implementation
}
```

### Inline Comments

```javascript
// ✅ GOOD: Explain WHY, not WHAT
// Debounce search to avoid excessive API calls
const debouncedSearch = debounce(search, 300);

// ❌ BAD: States the obvious
// Set the value to true
const isActive = true;
```

### TODO Comments

```javascript
// TODO: Add input validation
// FIXME: Memory leak in queue observer
// HACK: Temporary workaround for Firebase bug #1234
// NOTE: This relies on external API rate limits
```

---

## Import Organization

### Order

1. External dependencies
2. Internal modules (absolute paths)
3. Relative imports
4. Styles

```javascript
// 1. External dependencies
import firebase from 'firebase/app';
import 'firebase/database';
import { format } from 'date-fns';

// 2. Internal modules
import { firebaseConfig } from '@/config/firebase.js';

// 3. Relative imports
import { formatDate } from './utils/date-utils.js';
import { QueueManager } from './services/queue-manager.js';

// 4. Styles
import './styles/queue.css';
```

---

## Code Formatting

### Indentation
- **2 spaces** (no tabs)

### Line Length
- Maximum **100 characters** (soft limit)
- Break long lines logically

### Quotes
- **Single quotes** for strings: `'hello'`
- **Template literals** for interpolation: `` `Hello ${name}` ``

### Semicolons
- **Required** at end of statements

### Spacing

```javascript
// ✅ GOOD
function add(a, b) {
  return a + b;
}

const obj = { name: 'John', age: 30 };
const arr = [1, 2, 3];

if (condition) {
  doSomething();
}

// ❌ BAD
function add(a,b){
  return a+b;
}

const obj={name:'John',age:30};
if(condition){
  doSomething();
}
```

---

## Best Practices

### Avoid Magic Numbers/Strings

```javascript
// ❌ BAD
if (status === 'confirmed') { }
setTimeout(callback, 300000);

// ✅ GOOD
const BOOKING_STATUS = { CONFIRMED: 'confirmed' };
const FIVE_MINUTES_MS = 5 * 60 * 1000;

if (status === BOOKING_STATUS.CONFIRMED) { }
setTimeout(callback, FIVE_MINUTES_MS);
```

### Use Descriptive Names

```javascript
// ❌ BAD
const d = new Date();
const arr = [];
function proc(x) { }

// ✅ GOOD
const currentDate = new Date();
const guestList = [];
function processReceipt(receipt) { }
```

### Avoid Abbreviations

```javascript
// ❌ BAD
const usr = getCurrentUsr();
const rcp = processRcp(data);

// ✅ GOOD
const user = getCurrentUser();
const receipt = processReceipt(data);

// ✅ ACCEPTABLE: Well-known abbreviations
const id = generateId();
const url = buildUrl();
const html = renderHtml();
```

### Function Size

- Maximum **50 lines** per function (soft limit)
- If longer, extract helper functions

### File Size

- Maximum **400 lines** per file (soft limit)
- If longer, split into multiple files

---

## Git Commit Messages

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code formatting (no logic changes)
- `refactor`: Code restructuring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(queue): add real-time queue updates

Implement WebSocket connection for live queue status.
Updates UI automatically when queue changes.

Closes #123
```

```
fix(receipt): correct OCR text extraction

Fixed issue where line items were not parsed correctly
for multi-line receipt entries.

Fixes #456
```

---

## Error Handling

### Always use descriptive error messages

```javascript
// ❌ BAD
throw new Error('Error');
throw new Error('Invalid');

// ✅ GOOD
throw new Error('Queue item not found with ID: ' + id);
throw new Error('Receipt must have at least one line item');
```

### Use custom error classes

```javascript
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

throw new ValidationError('Guest phone number is required');
```

---

## Testing Conventions

### Test File Naming

```
src/services/queue-service.js
tests/unit/services/queue-service.test.js
```

### Test Structure

```javascript
describe('QueueService', () => {
  describe('addToQueue', () => {
    it('should add guest to queue', async () => {
      // Arrange
      const guest = { name: 'John', phone: '+1234567890' };
      
      // Act
      const result = await queueService.addToQueue(guest);
      
      // Assert
      expect(result.status).toBe('queued');
    });
  });
});
```

---

## Files That Need Renaming

Based on current codebase analysis, these files should be renamed to follow conventions:

### Root JavaScript Files

| Current | Recommended |
|---------|-------------|
| `admin-dashboard.js` | ✅ Already correct |
| `GuestAnalytics.js` | `guest-analytics.js` |
| `merakiFirebase.js` | `meraki-firebase.js` |
| `textParsingStrategies.js` | `text-parsing-strategies.js` |

### Functions

| Current | Recommended |
|---------|-------------|
| `queueManagement.js` | `queue-management.js` |
| `queueService.js` | `queue-service.js` |
| `queueCache.js` | `queue-cache.js` |
| `queueAnalytics.js` | `queue-analytics.js` |
| `dataManagement.js` | `data-management.js` |
| `menuLogic.js` | `menu-logic.js` |
| `guardRail.js` | `guard-rail.js` |
| `guestSync.js` | `guest-sync.js` |
| `receiptProcessor.js` | `receipt-processor.js` |
| `rewardsProcessor.js` | `rewards-processor.js` |
| `receiptTemplateManager.js` | `receipt-template-manager.js` |
| `voucherService.js` | ✅ Already correct |
| `whatsappMigration.js` | `whatsapp-migration.js` |
| `whatsappManagement.js` | `whatsapp-management.js` |

**Note**: Renaming should be done carefully with a migration script to update all imports.

---

## Enforcement

### Tools

- **ESLint**: For JavaScript linting
- **Prettier**: For code formatting
- **Stylelint**: For CSS linting

### Configuration Files Needed

Create these configuration files:

```bash
.eslintrc.js
.prettierrc.js
.stylelintrc.js
```

### Pre-commit Hooks

Use **Husky** + **lint-staged** to enforce standards:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.js": ["eslint --fix", "prettier --write"],
    "*.css": ["stylelint --fix", "prettier --write"]
  }
}
```

---

**Last Updated**: 2025-12-15  
**Status**: Active Standard
