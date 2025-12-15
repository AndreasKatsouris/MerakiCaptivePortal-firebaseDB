/**
 * Receipt Template Manager
 * Handles CRUD operations for receipt extraction templates
 * Allows admins to create, read, update, and delete templates without code changes
 */

const {
    rtdb,
    ref,
    get,
    set,
    push,
    update,
    remove,
    storage,
    bucket
} = require('./config/firebase-admin.js');

/**
 * Load all active receipt templates sorted by priority
 * @param {string|null} brandHint - Optional brand name to filter templates
 * @returns {Promise<Array>} Array of active templates
 */
async function loadActiveTemplates(brandHint = null) {
    try {
        const templatesRef = ref(rtdb, 'receiptTemplates');
        const snapshot = await get(templatesRef);

        if (!snapshot.exists()) {
            console.log('No receipt templates found');
            return [];
        }

        const templatesData = snapshot.val();
        const templates = [];

        // Convert object to array with IDs
        for (const [templateId, template] of Object.entries(templatesData)) {
            if (template.status === 'active' || template.status === 'testing') {
                templates.push({
                    id: templateId,
                    ...template
                });
            }
        }

        // Filter by brand if hint provided
        const filteredTemplates = brandHint
            ? templates.filter(t => t.brandName.toLowerCase() === brandHint.toLowerCase())
            : templates;

        // Sort by priority (descending - higher priority checked first)
        filteredTemplates.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        console.log(`Loaded ${filteredTemplates.length} active templates${brandHint ? ` for brand: ${brandHint}` : ''}`);
        return filteredTemplates;

    } catch (error) {
        console.error('Error loading templates:', error);
        return [];
    }
}

/**
 * Get a single template by ID
 * @param {string} templateId - Template ID
 * @returns {Promise<object|null>} Template data or null
 */
async function getTemplate(templateId) {
    try {
        const templateRef = ref(rtdb, `receiptTemplates/${templateId}`);
        const snapshot = await get(templateRef);

        if (!snapshot.exists()) {
            return null;
        }

        return {
            id: templateId,
            ...snapshot.val()
        };
    } catch (error) {
        console.error('Error getting template:', error);
        return null;
    }
}

/**
 * Create a new receipt template
 * @param {object} templateData - Template configuration
 * @param {string} userId - User ID of creator
 * @returns {Promise<object>} Created template with ID
 */
async function createTemplate(templateData, userId) {
    try {
        // Validate required fields
        const requiredFields = ['templateName', 'brandName', 'patterns', 'status', 'priority'];
        for (const field of requiredFields) {
            if (!templateData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Generate new template ID
        const templateRef = push(rtdb, 'receiptTemplates');
        const templateId = templateRef.key;

        // Prepare template data
        const newTemplate = {
            ...templateData,
            createdAt: Date.now(),
            createdBy: userId,
            updatedAt: Date.now(),
            updatedBy: userId,
            statistics: {
                usageCount: 0,
                successCount: 0,
                failureCount: 0,
                lastUsed: null,
                successRate: 0,
                avgConfidence: 0
            },
            version: 1,
            parentTemplateId: null
        };

        // Save to database
        await set(templateRef, newTemplate);

        console.log('Template created successfully:', templateId);
        return {
            id: templateId,
            ...newTemplate
        };

    } catch (error) {
        console.error('Error creating template:', error);
        throw new Error(`Failed to create template: ${error.message}`);
    }
}

/**
 * Update an existing template
 * @param {string} templateId - Template ID to update
 * @param {object} updates - Fields to update
 * @param {string} userId - User ID of updater
 * @returns {Promise<object>} Updated template
 */
async function updateTemplate(templateId, updates, userId) {
    try {
        const templateRef = ref(rtdb, `receiptTemplates/${templateId}`);
        const snapshot = await get(templateRef);

        if (!snapshot.exists()) {
            throw new Error('Template not found');
        }

        const currentTemplate = snapshot.val();

        // Prepare updates
        const updateData = {
            ...updates,
            updatedAt: Date.now(),
            updatedBy: userId,
            version: (currentTemplate.version || 1) + 1
        };

        // Update in database
        await update(templateRef, updateData);

        console.log('Template updated successfully:', templateId);
        return {
            id: templateId,
            ...currentTemplate,
            ...updateData
        };

    } catch (error) {
        console.error('Error updating template:', error);
        throw new Error(`Failed to update template: ${error.message}`);
    }
}

/**
 * Delete a template (soft delete - set status to deprecated)
 * @param {string} templateId - Template ID to delete
 * @param {string} userId - User ID of deleter
 * @returns {Promise<boolean>} Success status
 */
async function deleteTemplate(templateId, userId) {
    try {
        return await updateTemplate(templateId, {
            status: 'deprecated',
            deprecatedAt: Date.now(),
            deprecatedBy: userId
        }, userId);
    } catch (error) {
        console.error('Error deleting template:', error);
        throw new Error(`Failed to delete template: ${error.message}`);
    }
}

/**
 * Hard delete a template (permanently remove)
 * @param {string} templateId - Template ID to delete
 * @returns {Promise<boolean>} Success status
 */
async function hardDeleteTemplate(templateId) {
    try {
        const templateRef = ref(rtdb, `receiptTemplates/${templateId}`);
        await remove(templateRef);
        console.log('Template permanently deleted:', templateId);
        return true;
    } catch (error) {
        console.error('Error hard deleting template:', error);
        throw new Error(`Failed to permanently delete template: ${error.message}`);
    }
}

/**
 * Update template statistics after processing a receipt
 * @param {string} templateId - Template ID
 * @param {boolean} success - Whether extraction was successful
 * @param {number} confidence - Confidence score (0-1)
 * @returns {Promise<void>}
 */
async function updateTemplateStatistics(templateId, success, confidence = 0) {
    try {
        const templateRef = ref(rtdb, `receiptTemplates/${templateId}`);
        const snapshot = await get(templateRef);

        if (!snapshot.exists()) {
            console.warn('Template not found for statistics update:', templateId);
            return;
        }

        const template = snapshot.val();
        const stats = template.statistics || {};

        // Calculate new statistics
        const newUsageCount = (stats.usageCount || 0) + 1;
        const newSuccessCount = (stats.successCount || 0) + (success ? 1 : 0);
        const newFailureCount = (stats.failureCount || 0) + (success ? 0 : 1);
        const newSuccessRate = (newSuccessCount / newUsageCount) * 100;

        // Calculate moving average confidence
        const prevAvgConfidence = stats.avgConfidence || 0;
        const prevCount = stats.usageCount || 0;
        const newAvgConfidence = ((prevAvgConfidence * prevCount) + confidence) / newUsageCount;

        // Update statistics
        await update(ref(rtdb, `receiptTemplates/${templateId}/statistics`), {
            usageCount: newUsageCount,
            successCount: newSuccessCount,
            failureCount: newFailureCount,
            successRate: Math.round(newSuccessRate * 10) / 10, // Round to 1 decimal
            avgConfidence: Math.round(newAvgConfidence * 100) / 100, // Round to 2 decimals
            lastUsed: Date.now()
        });

        console.log(`Template ${templateId} statistics updated: ${newSuccessRate.toFixed(1)}% success rate`);

        // Check if template is degrading (below 70% success rate after 10+ uses)
        if (newUsageCount >= 10 && newSuccessRate < 70) {
            console.warn(`⚠️ Template ${templateId} (${template.templateName}) has degraded to ${newSuccessRate.toFixed(1)}% success rate`);
            // Could trigger an alert here
        }

    } catch (error) {
        console.error('Error updating template statistics:', error);
    }
}

/**
 * Log a pattern match attempt for monitoring
 * @param {object} logData - Log data
 * @returns {Promise<void>}
 */
async function logPatternMatch(logData) {
    try {
        const {
            receiptId,
            templateId,
            templateName,
            brandName,
            success,
            confidence,
            extractedFields,
            failureReasons = [],
            processingTimeMs
        } = logData;

        const logRef = push(rtdb, 'receiptPatternLogs');

        await set(logRef, {
            receiptId,
            templateId: templateId || null,
            templateName: templateName || 'Legacy Extraction',
            brandName: brandName || null,
            success,
            confidence: confidence || 0,
            extractedFields: extractedFields || {},
            failureReasons,
            processingTimeMs: processingTimeMs || 0,
            timestamp: Date.now()
        });

        console.log(`Pattern match logged: ${success ? '✓ Success' : '✗ Failed'} (${templateName})`);

    } catch (error) {
        console.error('Error logging pattern match:', error);
        // Don't throw - logging failures shouldn't break receipt processing
    }
}

/**
 * Get template performance logs
 * @param {string|null} templateId - Optional template ID to filter
 * @param {number} limit - Max number of logs to return
 * @returns {Promise<Array>} Array of log entries
 */
async function getTemplateLogs(templateId = null, limit = 100) {
    try {
        const logsRef = templateId
            ? ref(rtdb, 'receiptPatternLogs')
            : ref(rtdb, 'receiptPatternLogs');

        const snapshot = await get(logsRef);

        if (!snapshot.exists()) {
            return [];
        }

        const logsData = snapshot.val();
        let logs = [];

        // Convert to array
        for (const [logId, log] of Object.entries(logsData)) {
            if (!templateId || log.templateId === templateId) {
                logs.push({
                    id: logId,
                    ...log
                });
            }
        }

        // Sort by timestamp (most recent first)
        logs.sort((a, b) => b.timestamp - a.timestamp);

        // Limit results
        return logs.slice(0, limit);

    } catch (error) {
        console.error('Error getting template logs:', error);
        return [];
    }
}

/**
 * Upload receipt image to Firebase Storage
 * @param {Buffer} imageBuffer - Image file buffer
 * @param {string} filename - Original filename
 * @param {string} templateId - Template ID
 * @returns {Promise<string>} Public URL of uploaded image
 */
async function uploadTemplateImage(imageBuffer, filename, templateId) {
    try {
        const timestamp = Date.now();
        const ext = filename.split('.').pop();
        const storagePath = `receipt-templates/${templateId}/${timestamp}_example.${ext}`;

        const file = bucket.file(storagePath);

        await file.save(imageBuffer, {
            metadata: {
                contentType: 'image/jpeg',
                metadata: {
                    templateId: templateId,
                    originalName: filename,
                    uploadedAt: new Date().toISOString()
                }
            }
        });

        // Make file publicly readable
        await file.makePublic();

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        console.log('Template image uploaded:', publicUrl);

        return publicUrl;

    } catch (error) {
        console.error('Error uploading template image:', error);
        throw new Error(`Failed to upload image: ${error.message}`);
    }
}

/**
 * Get all templates (for admin dashboard)
 * @param {object} filters - Filter options
 * @returns {Promise<Array>} Filtered templates
 */
async function getAllTemplates(filters = {}) {
    try {
        const templatesRef = ref(rtdb, 'receiptTemplates');
        const snapshot = await get(templatesRef);

        if (!snapshot.exists()) {
            return [];
        }

        const templatesData = snapshot.val();
        let templates = [];

        // Convert to array
        for (const [templateId, template] of Object.entries(templatesData)) {
            templates.push({
                id: templateId,
                ...template
            });
        }

        // Apply filters
        if (filters.brandName) {
            templates = templates.filter(t =>
                t.brandName.toLowerCase().includes(filters.brandName.toLowerCase())
            );
        }

        if (filters.status) {
            templates = templates.filter(t => t.status === filters.status);
        }

        if (filters.minSuccessRate !== undefined) {
            templates = templates.filter(t =>
                (t.statistics?.successRate || 0) >= filters.minSuccessRate
            );
        }

        // Sort options
        if (filters.sortBy) {
            switch (filters.sortBy) {
                case 'priority':
                    templates.sort((a, b) => (b.priority || 0) - (a.priority || 0));
                    break;
                case 'successRate':
                    templates.sort((a, b) =>
                        (b.statistics?.successRate || 0) - (a.statistics?.successRate || 0)
                    );
                    break;
                case 'usageCount':
                    templates.sort((a, b) =>
                        (b.statistics?.usageCount || 0) - (a.statistics?.usageCount || 0)
                    );
                    break;
                case 'createdAt':
                default:
                    templates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            }
        }

        return templates;

    } catch (error) {
        console.error('Error getting all templates:', error);
        return [];
    }
}

module.exports = {
    loadActiveTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    hardDeleteTemplate,
    updateTemplateStatistics,
    logPatternMatch,
    getTemplateLogs,
    uploadTemplateImage,
    getAllTemplates
};
