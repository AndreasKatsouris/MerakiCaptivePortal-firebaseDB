const vision = require('@google-cloud/vision');
const admin = require('firebase-admin');
const { parseText } = require('./textParsingStrategies');
const logger = require('./logger');

class ReceiptProcessor {
    constructor() {
        this.visionClient = new vision.ImageAnnotatorClient();
    }

    /**
     * Process a receipt image with multiple parsing strategies
     * @param {string} imageUrl - URL of the receipt image
     * @param {string} phoneNumber - Phone number of the guest
     * @returns {Promise<object>} - Parsed and validated receipt data
     */
    async processReceipt(imageUrl, phoneNumber) {
        try {
            logger.info(`Processing receipt for phone: ${phoneNumber}, Image: ${imageUrl}`);
            
            // Detect text with multiple confidence levels
            const [result] = await this.detectReceiptText(imageUrl);
            
            if (!result || !result.textAnnotations || result.textAnnotations.length === 0) {
                throw new Error('No text could be detected on the receipt');
            }

            // Extract full text
            const fullText = result.textAnnotations[0].description;
            
            // Try multiple parsing strategies
            const parsedData = await this.parseReceiptData(fullText);
            
            // Validate parsed data
            this.validateParsedData(parsedData);

            // Prepare receipt data for storage
            const receiptData = this.formatReceiptData(parsedData, imageUrl, phoneNumber);
            
            // Save receipt to Firebase
            const receiptId = await this.saveReceiptData(receiptData);

            return {
                receiptId,
                ...receiptData
            };
        } catch (error) {
            logger.error('Receipt processing error', { 
                imageUrl, 
                phoneNumber, 
                errorMessage: error.message 
            });
            throw error;
        }
    }

    /**
     * Detect text in receipt image with multiple vision techniques
     * @param {string} imageUrl - URL of the receipt image
     * @returns {Promise<Array>} - Vision API detection result
     */
    async detectReceiptText(imageUrl) {
        try {
            // Use multiple detection types for robustness
            return await Promise.all([
                this.visionClient.textDetection(imageUrl),
                this.visionClient.documentTextDetection(imageUrl)
            ]);
        } catch (error) {
            logger.error('Text detection failed', { imageUrl, error });
            throw new Error('Unable to detect text in receipt image');
        }
    }

    /**
     * Parse receipt data using multiple strategies
     * @param {string} fullText - Detected text from receipt
     * @returns {Promise<object>} - Parsed receipt data
     */
    async parseReceiptData(fullText) {
        const parsingStrategies = [
            this.parseStandardFormat,
            this.parseAlternativeFormat,
            this.parseGenericFormat
        ];

        for (const strategy of parsingStrategies) {
            try {
                const parsedData = await strategy(fullText);
                if (this.isValidParsedData(parsedData)) {
                    return parsedData;
                }
            } catch (error) {
                logger.warn('Parsing strategy failed', { strategy: strategy.name });
            }
        }

        throw new Error('Could not parse receipt using any available strategy');
    }

    /**
     * Validate parsed receipt data
     * @param {object} parsedData - Parsed receipt data
     * @throws {Error} If data is invalid
     */
    validateParsedData(parsedData) {
        const requiredFields = [
            'storeName', 
            'totalAmount', 
            'date', 
            'invoiceNumber'
        ];

        for (const field of requiredFields) {
            if (!parsedData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Additional validation logic
        if (parsedData.totalAmount <= 0) {
            throw new Error('Invalid total amount');
        }
    }

    /**
     * Format receipt data for storage
     * @param {object} parsedData - Parsed receipt data
     * @param {string} imageUrl - Receipt image URL
     * @param {string} phoneNumber - Guest phone number
     * @returns {object} Formatted receipt data
     */
    formatReceiptData(parsedData, imageUrl, phoneNumber) {
        return {
            storeName: parsedData.storeName,
            invoiceNumber: parsedData.invoiceNumber,
            totalAmount: parsedData.totalAmount,
            date: parsedData.date,
            items: parsedData.items || [],
            imageUrl,
            processedAt: admin.database.ServerValue.TIMESTAMP,
            guestPhoneNumber: phoneNumber,
            status: 'pending_validation',
            rawText: parsedData.rawText
        };
    }

    /**
     * Save receipt data to Firebase
     * @param {object} receiptData - Formatted receipt data
     * @returns {string} Generated receipt ID
     */
    async saveReceiptData(receiptData) {
        const receiptRef = admin.database().ref('receipts').push();
        await receiptRef.set(receiptData);
        return receiptRef.key;
    }

    // Placeholder parsing methods (to be implemented with specific logic)
    async parseStandardFormat(text) { /* Implementation */ }
    async parseAlternativeFormat(text) { /* Implementation */ }
    async parseGenericFormat(text) { /* Implementation */ }

    /**
     * Check if parsed data meets basic validation
     * @param {object} parsedData - Parsed receipt data
     * @returns {boolean} Validity of parsed data
     */
    isValidParsedData(parsedData) {
        return !!(
            parsedData.storeName && 
            parsedData.totalAmount && 
            parsedData.date
        );
    }
}

module.exports = new ReceiptProcessor();