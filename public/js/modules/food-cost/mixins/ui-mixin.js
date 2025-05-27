/**
 * Food Cost Module - UI Mixin
 * Common UI utilities and helper methods for the Food Cost module
 */

export const UIMixin = {
    methods: {
        /**
         * Show a notification using SweetAlert
         * @param {string} title - Alert title
         * @param {string} text - Alert text
         * @param {string} icon - Alert icon (success, error, warning, info)
         */
        showNotification(title, text, icon = 'success') {
            Swal.fire({
                title,
                text,
                icon,
                confirmButtonColor: '#3085d6'
            });
        },
        
        /**
         * Show a confirmation dialog
         * @param {string} title - Dialog title
         * @param {string} text - Dialog text
         * @param {string} confirmText - Text for confirm button
         * @param {Function} onConfirm - Callback for confirmation
         */
        showConfirmation(title, text, confirmText = 'Yes', onConfirm) {
            Swal.fire({
                title,
                text,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: confirmText
            }).then((result) => {
                if (result.isConfirmed && typeof onConfirm === 'function') {
                    onConfirm();
                }
            });
        },
        
        /**
         * Format a number as currency
         * @param {number} value - Value to format
         * @param {string} currencySymbol - Optional currency symbol
         * @returns {string} - Formatted currency value
         */
        formatCurrency(value, currencySymbol = '') {
            if (value === undefined || value === null) return currencySymbol + '0.00';
            
            return currencySymbol + parseFloat(value).toFixed(2);
        },
        
        /**
         * Get CSS class for category badge
         * @param {string} category - Category name
         * @returns {string} - CSS class for badge
         */
        getCategoryBadgeClass(category) {
            if (!category) return '';
            
            // Create a hash from the category string
            const hash = Array.from(category).reduce(
                (acc, char) => acc + char.charCodeAt(0), 0
            );
            const hue = Math.abs(hash) % 360;
            return `badge-category-${hue % 5}`;
        },
        
        /**
         * Toggle visibility of a component
         * @param {string} component - Component name to toggle
         */
        toggleComponent(component) {
            if (this[component] !== undefined) {
                this[component] = !this[component];
            }
        },
        
        /**
         * Show a loading indicator
         * @param {string} title - Loading text
         * @returns {Object} - SweetAlert instance
         */
        showLoading(title = 'Processing...') {
            return Swal.fire({
                title,
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
        },
        
        /**
         * Show calculation details for a stock item
         * @param {Object} item - Stock item
         * @param {Object} calculationDetails - Pre-calculated details
         */
        showCalculationDetails(item, calculationDetails) {
            const details = calculationDetails || this.getItemCalculationDetails(item);
            
            // Create safety stock display
            const safetyDisplay = details.params.safetyStockPercentage > 0 ? 
                `<li>Apply Safety Stock: Base Usage (${details.calculations.baseUsage.toFixed(2)}) × Safety Factor (${(1 + (details.params.safetyStockPercentage / 100)).toFixed(2)}) = ${details.calculations.withSafety.toFixed(2)}</li>` : '';
            
            // Create critical item buffer display
            const criticalDisplay = details.calculations.criticalApplied ? 
                `<li>Apply Critical Item Buffer: Usage with Safety (${details.calculations.withSafety.toFixed(2)}) × Critical Factor (${(1 + (details.params.criticalItemBuffer / 100)).toFixed(2)}) = ${details.calculations.forecastUsage.toFixed(2)}</li>` : '';
            
            Swal.fire({
                title: `Calculation Details: ${item.description}`,
                html: `
                    <div class="text-left">
                        <p><strong>Usage Calculation:</strong> ${details.formattedCalculations.usageCalculation}</p>
                        <p><strong>Cost of Usage:</strong> ${details.formattedCalculations.costOfUsage}</p>
                        <p><strong>Usage per Day:</strong> ${details.formattedCalculations.usagePerDay}</p>
                        <p><strong>Reorder Point:</strong> ${details.formattedCalculations.reorderPoint}</p>
                        <hr>
                        <p><strong>Theoretical Order Quantity:</strong></p>
                        <ol>
                            <li>${details.formattedCalculations.forecastPeriod}</li>
                            <li>${details.formattedCalculations.baseUsage}</li>
                            ${safetyDisplay}
                            ${criticalDisplay}
                            <li>${details.formattedCalculations.requiredOrder}</li>
                            <li>${details.formattedCalculations.finalOrder}</li>
                        </ol>
                    </div>
                `,
                confirmButtonText: 'Close',
                confirmButtonColor: '#3085d6',
                width: '600px'
            });
        }
    }
};
