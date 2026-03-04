/**
 * Template-Based Receipt Extraction Engine
 * Applies admin-configured templates to extract data from receipts
 * without requiring code changes
 */

const { loadActiveTemplates, updateTemplateStatistics, logPatternMatch } = require('./receiptTemplateManager');

/**
 * Extract receipt data using templates
 * @param {string} ocrText - Full OCR text from receipt
 * @param {string|null} brandHint - Optional brand name hint
 * @returns {Promise<object>} Extraction result
 */
async function extractWithTemplates(ocrText, brandHint = null) {
    const startTime = Date.now();

    try {
        console.log('🔍 Starting template-based extraction...');

        // Load active templates (filtered by brand if hint provided)
        const templates = await loadActiveTemplates(brandHint);

        if (templates.length === 0) {
            console.log('No active templates found, will use legacy extraction');
            return {
                success: false,
                confidence: 0,
                reason: 'no_templates_available',
                extractedData: null,
                templateUsed: null
            };
        }

        console.log(`Found ${templates.length} candidate templates to try`);

        // Try each template in priority order
        for (const template of templates) {
            console.log(`Trying template: "${template.templateName}" (Priority: ${template.priority})`);

            const result = await applyTemplate(template, ocrText);

            // Log the attempt
            await logPatternMatch({
                receiptId: null, // Will be set by caller
                templateId: template.id,
                templateName: template.templateName,
                brandName: template.brandName,
                success: result.success,
                confidence: result.confidence,
                extractedFields: result.fieldResults,
                failureReasons: result.failureReasons,
                processingTimeMs: Date.now() - startTime
            });

            // Update statistics
            await updateTemplateStatistics(template.id, result.success, result.confidence);

            // If successful with good confidence, use this result
            if (result.success && result.confidence >= 0.7) {
                const processingTime = Date.now() - startTime;
                console.log(`✅ Template "${template.templateName}" succeeded with ${(result.confidence * 100).toFixed(1)}% confidence (${processingTime}ms)`);

                return {
                    success: true,
                    confidence: result.confidence,
                    extractedData: result.extractedData,
                    templateUsed: {
                        id: template.id,
                        name: template.templateName
                    },
                    processingTimeMs: processingTime
                };
            }

            console.log(`Template "${template.templateName}" failed or low confidence (${(result.confidence * 100).toFixed(1)}%)`);
        }

        // No template succeeded
        console.log('⚠️ No templates succeeded, will fallback to legacy extraction');
        return {
            success: false,
            confidence: 0,
            reason: 'all_templates_failed',
            extractedData: null,
            templateUsed: null,
            processingTimeMs: Date.now() - startTime
        };

    } catch (error) {
        console.error('Error in template-based extraction:', error);
        return {
            success: false,
            confidence: 0,
            reason: 'extraction_error',
            error: error.message,
            extractedData: null,
            templateUsed: null,
            processingTimeMs: Date.now() - startTime
        };
    }
}

/**
 * Apply a single template to OCR text
 * @param {object} template - Template configuration
 * @param {string} ocrText - OCR text to extract from
 * @returns {Promise<object>} Extraction result
 */
async function applyTemplate(template, ocrText) {
    const fieldResults = {};
    const confidenceScores = [];
    const failureReasons = [];

    try {
        const lines = ocrText.split('\n').map(line => line.trim());

        // Extract each field using template patterns
        const patterns = template.patterns || {};

        // Brand Name
        if (patterns.brandName) {
            const brandResult = extractField(ocrText, lines, patterns.brandName, 'brandName');
            fieldResults.brandName = brandResult;
            if (brandResult.success) {
                confidenceScores.push(brandResult.confidence);
            } else {
                failureReasons.push(`Failed to extract brandName: ${brandResult.reason}`);
            }
        }

        // Store Name
        if (patterns.storeName) {
            const storeResult = extractField(ocrText, lines, patterns.storeName, 'storeName');
            fieldResults.storeName = storeResult;
            if (storeResult.success) {
                confidenceScores.push(storeResult.confidence);
            } else {
                failureReasons.push(`Failed to extract storeName: ${storeResult.reason}`);
            }
        }

        // Invoice Number
        if (patterns.invoiceNumber) {
            const invoiceResult = extractField(ocrText, lines, patterns.invoiceNumber, 'invoiceNumber');
            fieldResults.invoiceNumber = invoiceResult;
            if (invoiceResult.success) {
                confidenceScores.push(invoiceResult.confidence);
            } else {
                failureReasons.push(`Failed to extract invoiceNumber: ${storeResult.reason}`);
            }
        }

        // Date
        if (patterns.date) {
            const dateResult = extractField(ocrText, lines, patterns.date, 'date');
            fieldResults.date = dateResult;
            if (dateResult.success) {
                confidenceScores.push(dateResult.confidence);
            } else {
                failureReasons.push(`Failed to extract date: ${dateResult.reason}`);
            }
        }

        // Time
        if (patterns.time) {
            const timeResult = extractField(ocrText, lines, patterns.time, 'time');
            fieldResults.time = timeResult;
            if (timeResult.success) {
                confidenceScores.push(timeResult.confidence);
            }
        }

        // Total Amount (REQUIRED)
        if (patterns.totalAmount) {
            const totalResult = extractField(ocrText, lines, patterns.totalAmount, 'totalAmount');
            fieldResults.totalAmount = totalResult;
            if (totalResult.success) {
                confidenceScores.push(totalResult.confidence);
            } else {
                failureReasons.push(`Failed to extract totalAmount: ${totalResult.reason}`);
                // Total amount is critical - fail early
                return {
                    success: false,
                    confidence: 0,
                    extractedData: null,
                    fieldResults,
                    failureReasons
                };
            }
        }

        // Items (if pattern provided)
        if (patterns.items) {
            const itemsResult = extractItems(ocrText, lines, patterns.items);
            fieldResults.items = itemsResult;
            if (itemsResult.success) {
                confidenceScores.push(itemsResult.confidence);
            }
        }

        // Waiter Name (optional)
        if (patterns.waiterName) {
            const waiterResult = extractField(ocrText, lines, patterns.waiterName, 'waiterName');
            fieldResults.waiterName = waiterResult;
        }

        // Table Number (optional)
        if (patterns.tableNumber) {
            const tableResult = extractField(ocrText, lines, patterns.tableNumber, 'tableNumber');
            fieldResults.tableNumber = tableResult;
        }

        // Calculate overall confidence
        const avgConfidence = confidenceScores.length > 0
            ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
            : 0;

        // Check minimum required fields
        const hasRequiredFields =
            fieldResults.brandName?.success &&
            fieldResults.totalAmount?.success &&
            (fieldResults.invoiceNumber?.success || fieldResults.date?.success);

        if (!hasRequiredFields) {
            return {
                success: false,
                confidence: avgConfidence,
                extractedData: null,
                fieldResults,
                failureReasons
            };
        }

        // Build extracted data object
        const extractedData = {
            brandName: fieldResults.brandName?.value || 'Unknown Brand',
            storeName: fieldResults.storeName?.value || 'Unknown Location',
            storeAddress: '', // Could be added to patterns
            fullStoreName: `${fieldResults.brandName?.value || ''} ${fieldResults.storeName?.value || ''}`.trim(),
            invoiceNumber: fieldResults.invoiceNumber?.value || null,
            date: fieldResults.date?.value || null,
            time: fieldResults.time?.value || null,
            waiterName: fieldResults.waiterName?.value || null,
            tableNumber: fieldResults.tableNumber?.value || null,
            totalAmount: fieldResults.totalAmount?.value || 0,
            vatAmount: fieldResults.vatAmount?.value || 0,
            items: fieldResults.items?.value || [],
            subtotal: fieldResults.items?.subtotal || 0,
            rawText: ocrText,
            extractionMethod: 'template',
            templateId: template.id,
            templateName: template.templateName
        };

        return {
            success: true,
            confidence: avgConfidence,
            extractedData,
            fieldResults,
            failureReasons
        };

    } catch (error) {
        console.error('Error applying template:', error);
        return {
            success: false,
            confidence: 0,
            extractedData: null,
            fieldResults,
            failureReasons: [...failureReasons, `Exception: ${error.message}`]
        };
    }
}

/**
 * Extract a single field using pattern configuration
 * @param {string} fullText - Full OCR text
 * @param {Array} lines - Array of text lines
 * @param {object} pattern - Pattern configuration
 * @param {string} fieldName - Name of field being extracted
 * @returns {object} Extraction result
 */
function extractField(fullText, lines, pattern, fieldName) {
    try {
        const regex = new RegExp(pattern.regex, pattern.flags || 'i');

        // Apply line range filter if specified
        let searchText = fullText;
        if (pattern.lineRange && Array.isArray(pattern.lineRange) && pattern.lineRange.length === 2) {
            const [start, end] = pattern.lineRange;
            const relevantLines = lines.slice(start, end + 1);
            searchText = relevantLines.join('\n');
        }

        // Apply context requirements
        if (pattern.contextRequired) {
            switch (pattern.contextRequired) {
                case 'before_summary':
                    // Extract only before SUMMARY section
                    const summaryIndex = searchText.toUpperCase().indexOf('SUMMARY');
                    if (summaryIndex !== -1) {
                        searchText = searchText.substring(0, summaryIndex);
                    }
                    break;
                case 'after_items':
                    // Extract only after items section
                    const itemsIndex = searchText.toUpperCase().indexOf('ITEMS');
                    if (itemsIndex !== -1) {
                        searchText = searchText.substring(itemsIndex);
                    }
                    break;
            }
        }

        // Perform extraction
        const match = searchText.match(regex);

        if (!match) {
            return {
                success: false,
                confidence: 0,
                value: null,
                reason: 'pattern_no_match'
            };
        }

        // Extract value (use first capture group if exists, otherwise full match)
        let value = match[1] !== undefined ? match[1] : match[0];

        // Apply post-processing based on field type
        value = postProcessValue(value, fieldName);

        // Validate value
        const validation = validateFieldValue(value, fieldName);
        if (!validation.valid) {
            return {
                success: false,
                confidence: 0,
                value: null,
                reason: `validation_failed: ${validation.reason}`
            };
        }

        return {
            success: true,
            confidence: pattern.confidence || 0.8,
            value,
            reason: null
        };

    } catch (error) {
        console.error(`Error extracting field ${fieldName}:`, error);
        return {
            success: false,
            confidence: 0,
            value: null,
            reason: `exception: ${error.message}`
        };
    }
}

/**
 * Extract items from receipt using pattern configuration
 * @param {string} fullText - Full OCR text
 * @param {Array} lines - Array of text lines
 * @param {object} pattern - Items pattern configuration
 * @returns {object} Extraction result
 */
function extractItems(fullText, lines, pattern) {
    try {
        const items = [];
        let subtotal = 0;

        // Find section boundaries
        const startMarkers = pattern.sectionMarkers || pattern.startMarkers || [];
        const endMarkers = pattern.endMarkers || ['Bill Total', 'SUMMARY', 'Total'];

        let inItemsSection = false;
        let startIndex = -1;
        let endIndex = lines.length;

        // Find start of items section
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (startMarkers.some(marker => line.toUpperCase().includes(marker.toUpperCase()))) {
                inItemsSection = true;
                startIndex = i + 1; // Start from next line
                break;
            }
        }

        // Find end of items section
        if (startIndex !== -1) {
            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i];
                if (endMarkers.some(marker => line.toUpperCase().includes(marker.toUpperCase()))) {
                    endIndex = i;
                    break;
                }
            }
        }

        if (startIndex === -1 || startIndex >= endIndex) {
            return {
                success: false,
                confidence: 0,
                value: [],
                subtotal: 0,
                reason: 'items_section_not_found'
            };
        }

        // Extract items based on format
        const itemRegex = new RegExp(pattern.regex || pattern.itemFormat, 'i');

        for (let i = startIndex; i < endIndex; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const match = line.match(itemRegex);
            if (match) {
                const item = {
                    name: match[1]?.trim() || '',
                    quantity: parseInt(match[2]) || 1,
                    unitPrice: parseFloat(match[3]) || 0,
                    totalPrice: parseFloat(match[4]) || 0
                };

                items.push(item);
                subtotal += item.totalPrice;
            }
        }

        if (items.length === 0) {
            return {
                success: false,
                confidence: 0,
                value: [],
                subtotal: 0,
                reason: 'no_items_matched'
            };
        }

        return {
            success: true,
            confidence: 0.8,
            value: items,
            subtotal,
            reason: null
        };

    } catch (error) {
        console.error('Error extracting items:', error);
        return {
            success: false,
            confidence: 0,
            value: [],
            subtotal: 0,
            reason: `exception: ${error.message}`
        };
    }
}

/**
 * Post-process extracted value based on field type
 * @param {any} value - Extracted value
 * @param {string} fieldName - Field name
 * @returns {any} Processed value
 */
function postProcessValue(value, fieldName) {
    if (!value) return value;

    switch (fieldName) {
        case 'totalAmount':
        case 'vatAmount':
            // Parse as float
            return parseFloat(value.toString().replace(/[^\d.]/g, ''));

        case 'invoiceNumber':
            // Remove non-alphanumeric
            return value.toString().replace(/[^\w\d]/g, '');

        case 'brandName':
        case 'storeName':
            // Trim and title case
            return value.toString().trim();

        case 'date':
            // Ensure consistent date format (DD/MM/YYYY)
            return value.toString().trim();

        case 'time':
            // Ensure consistent time format (HH:MM)
            return value.toString().trim();

        default:
            return value.toString().trim();
    }
}

/**
 * Validate extracted field value
 * @param {any} value - Value to validate
 * @param {string} fieldName - Field name
 * @returns {object} Validation result
 */
function validateFieldValue(value, fieldName) {
    switch (fieldName) {
        case 'totalAmount':
            if (typeof value !== 'number' || value <= 0) {
                return { valid: false, reason: 'amount must be positive number' };
            }
            if (value > 100000) {
                return { valid: false, reason: 'amount unreasonably high' };
            }
            return { valid: true };

        case 'invoiceNumber':
            if (!value || value.length < 3) {
                return { valid: false, reason: 'invoice number too short' };
            }
            return { valid: true };

        case 'date':
            // Basic date format validation
            if (!value || !/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(value)) {
                return { valid: false, reason: 'invalid date format' };
            }
            return { valid: true };

        default:
            return { valid: true };
    }
}

module.exports = {
    extractWithTemplates,
    applyTemplate,
    extractField,
    extractItems
};
