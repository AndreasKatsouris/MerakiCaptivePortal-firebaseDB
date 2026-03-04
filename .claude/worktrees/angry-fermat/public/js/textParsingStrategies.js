const parseText = {
    /**
     * Parse receipt text using standard format strategy
     * @param {string} text - Raw text from receipt
     * @returns {object} Parsed receipt data
     */
    standardFormat(text) {
        const lines = text.split('\n');
        const data = {
            items: [],
            rawText: text
        };

        try {
            // Extract store details (usually first few lines)
            data.storeName = lines[0]?.trim() || '';
            data.storeLocation = lines[1]?.trim() || '';

            // Find invoice number
            const invoiceMatch = text.match(/(?:Invoice|Receipt)\s*#?\s*(\d+)/i);
            data.invoiceNumber = invoiceMatch ? invoiceMatch[1] : null;

            // Find date
            const dateMatch = text.match(/(\d{2}[-/.]\d{2}[-/.]\d{4})/);
            data.date = dateMatch ? dateMatch[1] : null;

            // Find total amount
            const totalMatch = text.match(/Total:?\s*R?\s*(\d+\.\d{2})/i);
            data.totalAmount = totalMatch ? parseFloat(totalMatch[1]) : 0;

            // Extract items
            let inItemsSection = false;
            lines.forEach(line => {
                // Look for start of items section
                if (line.match(/qty|quantity|item|description/i)) {
                    inItemsSection = true;
                    return;
                }

                // Look for end of items section
                if (line.match(/subtotal|total|tax/i)) {
                    inItemsSection = false;
                    return;
                }

                // Parse items
                if (inItemsSection) {
                    const itemMatch = line.match(/(.+?)\s+(\d+)\s+R?\s*(\d+\.\d{2})/);
                    if (itemMatch) {
                        data.items.push({
                            name: itemMatch[1].trim(),
                            quantity: parseInt(itemMatch[2]),
                            price: parseFloat(itemMatch[3])
                        });
                    }
                }
            });

            return data;
        } catch (error) {
            throw new Error(`Standard format parsing failed: ${error.message}`);
        }
    },

    /**
     * Parse receipt text using alternative format strategy
     * @param {string} text - Raw text from receipt
     * @returns {object} Parsed receipt data
     */
    alternativeFormat(text) {
        const data = {
            items: [],
            rawText: text
        };

        try {
            // Store name is usually between asterisks or in all caps
            const storeMatch = text.match(/\*\*\*(.+?)\*\*\*/) || text.match(/^([A-Z\s]{5,})/m);
            data.storeName = storeMatch ? storeMatch[1].trim() : '';

            // Look for location pattern
            const locationMatch = text.match(/(?:Location|Branch|Store):\s*(.+?)(?:\n|$)/i);
            data.storeLocation = locationMatch ? locationMatch[1].trim() : '';

            // Find invoice/receipt number with broader pattern
            const invoiceMatch = text.match(/(?:INV|RCP|#)[:.]?\s*(\w+)/i);
            data.invoiceNumber = invoiceMatch ? invoiceMatch[1] : null;

            // Multiple date formats
            const datePatterns = [
                /(\d{2}[-/.]\d{2}[-/.]\d{4})/,
                /(\d{4}[-/.]\d{2}[-/.]\d{2})/,
                /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i
            ];

            for (const pattern of datePatterns) {
                const match = text.match(pattern);
                if (match) {
                    data.date = match[1];
                    break;
                }
            }

            // Find total amount with currency variations
            const totalMatch = text.match(/(?:Total|Amount|Sum):\s*(?:R|ZAR)?\s*(\d+\.\d{2})/i);
            data.totalAmount = totalMatch ? parseFloat(totalMatch[1]) : 0;

            // Extract items with flexible pattern
            const itemPattern = /(.{3,}?)\s+(\d+(?:\.\d{2})?)\s*(?:x\s*)?(\d+(?:\.\d{2})?)/g;
            let match;
            while ((match = itemPattern.exec(text)) !== null) {
                const quantity = parseFloat(match[2]);
                const price = parseFloat(match[3]);
                if (!isNaN(quantity) && !isNaN(price)) {
                    data.items.push({
                        name: match[1].trim(),
                        quantity,
                        price
                    });
                }
            }

            return data;
        } catch (error) {
            throw new Error(`Alternative format parsing failed: ${error.message}`);
        }
    },

    /**
     * Generic fallback parser for unknown formats
     * @param {string} text - Raw text from receipt
     * @returns {object} Parsed receipt data
     */
    genericFormat(text) {
        const data = {
            items: [],
            rawText: text
        };

        try {
            // Get the first line as store name
            const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
            data.storeName = lines[0] || '';

            // Look for any number that could be an invoice number
            const numberMatch = text.match(/(\d{4,})/);
            data.invoiceNumber = numberMatch ? numberMatch[1] : null;

            // Look for any date-like pattern
            const dateMatch = text.match(/(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/);
            data.date = dateMatch ? dateMatch[1] : null;

            // Look for currency amounts
            const amounts = text.match(/R?\s*\d+\.\d{2}/g) || [];
            // Assume the largest amount is the total
            if (amounts.length > 0) {
                const parsedAmounts = amounts.map(amount => 
                    parseFloat(amount.replace(/R?\s*/, ''))
                );
                data.totalAmount = Math.max(...parsedAmounts);
            } else {
                data.totalAmount = 0;
            }

            return data;
        } catch (error) {
            throw new Error(`Generic format parsing failed: ${error.message}`);
        }
    }
};

module.exports = { parseText };