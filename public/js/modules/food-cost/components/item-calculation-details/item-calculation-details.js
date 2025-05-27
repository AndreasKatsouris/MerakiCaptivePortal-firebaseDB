/**
 * Food Cost Module - Item Calculation Details Component
 * Displays detailed calculation breakdown for stock items
 * Version: 1.9.4-2025-04-19
 */

export const ItemCalculationDetailsModal = {
    name: 'item-calculation-details-modal',
    
    methods: {
        /**
         * Show calculation details for a specific stock item
         * Displays theoretical order quantity and calculation breakdown using SweetAlert
         * @param {Object} item - The stock item to show calculation details for
         * @param {Object} config - Configuration parameters for calculations
         */
        showDetails(item, config = {}) {
            if (!item) return;
            
            // Use the calculation functions from OrderCalculator
            const { calculateOrderDetails, getCalculationDetails } = window.FoodCost.OrderCalculator;
            
            // Set up calculation parameters based on provided config
            const calculationParams = {
                orderCycle: config.orderCycle || 7, // How often delivery occurs
                daysToNextDelivery: config.daysToNextDelivery || 7,
                coveringDays: config.coveringDays || config.leadTimeDays || 2, // Support both parameter names
                safetyStockPercentage: config.safetyStockPercentage || 20,
                criticalItemBuffer: config.criticalItemBuffer || 30,
                isCritical: item.category && 
                    (item.category.toLowerCase().includes('critical') || 
                     item.category.toLowerCase().includes('essential')),
                stockPeriodDays: config.stockPeriodDays || 7
            };
            
            // Get the detailed calculation results
            const calculationResults = calculateOrderDetails(item, calculationParams);
            const orderQuantity = parseInt(calculationResults.orderResults.recommendedOrderQty) || 0;
            const details = getCalculationDetails(item, calculationParams);
            
            // Add unit cost calculation information
            details.unitCostCalculation = window.FoodCost.OrderCalculator.getUnitCostCalculationDetails(item);
            
            // Ensure we have the latest calculated order quantity in our details
            details.orderCalculation.recommendedOrderQty = orderQuantity;
            
            // Build the modal HTML content
            const title = `Calculation Details: ${item.description} (${item.itemCode})`;
            const content = this.buildModalContent(details, item, calculationParams);
            
            // Show the details in a modal using SweetAlert
            Swal.fire({
                title: title,
                html: content,
                width: '800px',
                confirmButtonText: 'Close',
                confirmButtonColor: '#3085d6',
                showClass: {
                    popup: 'animated fadeInDown faster'
                },
                hideClass: {
                    popup: 'animated fadeOutUp faster'
                }
            });
        },
        
        /**
         * Build the HTML content for the modal
         * @param {Object} details - Calculation details from OrderCalculator
         * @param {Object} item - Stock item
         * @param {Object} calculationParams - Calculation parameters
         * @returns {string} - HTML content for the modal
         */
        buildModalContent(details, item, calculationParams) {
            return `
                <div class="card mb-3">
                    <div class="card-header bg-primary text-white">
                        <strong>Item Information</strong>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <dl class="row mb-0">
                                    <dt class="col-sm-5">Item Code:</dt>
                                    <dd class="col-sm-7">${details.itemCode}</dd>
                                    
                                    <dt class="col-sm-5">Description:</dt>
                                    <dd class="col-sm-7">${details.description}</dd>
                                    
                                    <dt class="col-sm-5">Category:</dt>
                                    <dd class="col-sm-7">${details.category || 'N/A'}</dd>
                                    
                                    <dt class="col-sm-5">Current Stock:</dt>
                                    <dd class="col-sm-7">${details.orderCalculation.currentStock || '0.00'} units</dd>
                                </dl>
                            </div>
                            <div class="col-md-6">
                                <dl class="row mb-0">
                                    <dt class="col-sm-5">Usage/Day:</dt>
                                    <dd class="col-sm-7">${details.usageDetails.usagePerDay || '0.00'} units/day</dd>
                                    
                                    <dt class="col-sm-5">Unit Cost:</dt>
                                    <dd class="col-sm-7">$${item.unitCost ? Number(item.unitCost).toFixed(2) : '0.00'} per unit</dd>
                                    
                                    <dt class="col-sm-5">Reorder Point:</dt>
                                    <dd class="col-sm-7">${item.reorderPoint ? Number(item.reorderPoint).toFixed(2) : '0.00'}</dd>
                                    
                                    <dt class="col-sm-5">Critical Item:</dt>
                                    <dd class="col-sm-7">${details.criticalityDetails?.isCritical ? 'Yes' : 'No'}</dd>
                                </dl>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="card mb-3">
                    <div class="card-header bg-info text-white">
                        <strong>Unit Cost Calculation</strong>
                    </div>
                    <div class="card-body">
                        <div class="bg-light p-3 rounded mb-3">
                            <div class="fw-bold mb-2">Current Unit Cost: $${parseFloat(details.unitCostCalculation.currentUnitCost).toFixed(2)}</div>
                            <div class="mb-2">Calculation Method: ${details.unitCostCalculation.method}</div>
                            <div class="small text-muted">${details.unitCostCalculation.formula}</div>
                            
                            <div class="mt-3 small">
                                <strong>Note:</strong> ${details.unitCostCalculation.notes}
                            </div>
                        </div>
                    </div>
                </div>
                
                ${details.criticalityDetails ? `
                <div class="card mb-3">
                    <div class="card-header bg-warning text-dark">
                        <strong>Criticality Assessment</strong>
                    </div>
                    <div class="card-body">
                        <div class="alert ${details.criticalityDetails.isCritical ? 'alert-warning' : 'alert-info'}">
                            <strong>Criticality Status: ${details.criticalityDetails.isCritical ? 'CRITICAL' : 'Not Critical'}</strong>
                            <br>
                            <small>${details.criticalityDetails.reason || 'No specific reason provided'}</small>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="border-bottom pb-2">Criticality Score: ${details.criticalityDetails.score}/100</h6>
                                <div class="progress mb-3" style="height: 20px;">
                                    <div class="progress-bar ${details.criticalityDetails.score >= 70 ? 'bg-danger' : details.criticalityDetails.score >= 50 ? 'bg-warning' : 'bg-success'}" 
                                         role="progressbar" 
                                         style="width: ${details.criticalityDetails.score}%" 
                                         aria-valuenow="${details.criticalityDetails.score}" 
                                         aria-valuemin="0" 
                                         aria-valuemax="100">
                                        ${details.criticalityDetails.score}%
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <h6 class="border-bottom pb-2">Score Components</h6>
                                <ul class="list-group">
                                    <li class="list-group-item d-flex justify-content-between align-items-center">
                                        Volatility
                                        <span class="badge bg-primary rounded-pill">${details.criticalityDetails.details.volatilityScore}/40</span>
                                    </li>
                                    <li class="list-group-item d-flex justify-content-between align-items-center">
                                        Stock Level
                                        <span class="badge bg-primary rounded-pill">${details.criticalityDetails.details.stockLevelScore}/30</span>
                                    </li>
                                    <li class="list-group-item d-flex justify-content-between align-items-center">
                                        Supplier Reliability
                                        <span class="badge bg-primary rounded-pill">${details.criticalityDetails.details.supplierScore}/30</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                        
                        <div class="mt-3">
                            <h6 class="border-bottom pb-2">Criticality Factors</h6>
                            <dl class="row">
                                <dt class="col-sm-5">Manually Marked:</dt>
                                <dd class="col-sm-7">${details.criticalityDetails.details.isManuallyMarked ? 'Yes' : 'No'}</dd>
                                
                                <dt class="col-sm-5">Critical Category:</dt>
                                <dd class="col-sm-7">${details.criticalityDetails.details.isInCriticalCategory ? 'Yes' : 'No'}</dd>
                                
                                <dt class="col-sm-5">Critical Score:</dt>
                                <dd class="col-sm-7">${details.criticalityDetails.details.hasCriticalScore ? 'Yes' : 'No'} ${details.criticalityDetails.details.hasCriticalScore ? '(≥ 70 points)' : ''}</dd>
                            </dl>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <div class="card mb-3">
                    <div class="card-header bg-success text-white">
                        <strong>Order Quantity Calculation</strong>
                    </div>
                    <div class="card-body">
                        <div class="alert ${details.orderCalculation.needsReordering ? 'alert-warning' : 'alert-info'}">
                            <strong>Recommended Order Quantity: ${details.orderCalculation.recommendedOrderQty} units</strong>
                            ${details.orderCalculation.needsReordering ? 
                                '<br><small>This item needs to be reordered based on projected stock levels.</small>' : 
                                '<br><small>This item does not currently need reordering.</small>'}
                        </div>
                        
                        <div class="alert alert-secondary mb-3">
                            <h6 class="font-weight-bold">Formula Overview:</h6>
                            <ol class="mb-0">
                                <li><strong>Reorder Point</strong> = Current Stock - (Usage Per Day × Days to Next Delivery)</li>
                                <li><strong>Forecasted Demand</strong> = (Order Cycle × Usage Per Day) + Safety Stock</li>
                                <li><strong>Order Quantity</strong> = If Forecasted Demand > Reorder Point, then calculate Forecasted Demand - Reorder Point</li>
                            </ol>
                        </div>
                        
                        <h6 class="border-bottom pb-2">Current Stock Information</h6>
                        <dl class="row">
                            <dt class="col-sm-5">Current Stock:</dt>
                            <dd class="col-sm-7">${details.orderCalculation.currentStock} units</dd>
                            
                            <dt class="col-sm-5">Daily Usage Rate:</dt>
                            <dd class="col-sm-7">${details.usageDetails.usagePerDay} units per day</dd>
                        </dl>
                        
                        <h6 class="border-bottom pb-2">Reorder Point Calculation</h6>
                        <dl class="row">
                            <dt class="col-sm-5">Days to Next Delivery:</dt>
                            <dd class="col-sm-7">${details.orderCalculation.daysToNextDelivery} days</dd>
                            
                            <dt class="col-sm-5">Projected Usage:</dt>
                            <dd class="col-sm-7">${details.orderCalculation.projectedUsage} units <small class="text-muted">(${details.usageDetails.usagePerDay} units/day × ${details.orderCalculation.daysToNextDelivery} days)</small></dd>
                            
                            <dt class="col-sm-5">Reorder Point:</dt>
                            <dd class="col-sm-7">${details.orderCalculation.reorderPoint} units <small class="text-muted">(Current Stock - Projected Usage)</small></dd>
                        </dl>
                        
                        <h6 class="border-bottom pb-2">Forecasted Demand Calculation</h6>
                        <dl class="row">
                            <dt class="col-sm-5">Order Cycle:</dt>
                            <dd class="col-sm-7">${calculationParams.orderCycle} days <small class="text-muted">(standard delivery cycle)</small></dd>
                            
                            <dt class="col-sm-5">Base Usage:</dt>
                            <dd class="col-sm-7">${details.orderCalculation.baseUsage} units <small class="text-muted">(${details.usageDetails.usagePerDay} units/day × ${calculationParams.orderCycle} days)</small></dd>
                            
                            <dt class="col-sm-5">Safety Stock:</dt>
                            <dd class="col-sm-7">${details.orderCalculation.safetyStock} units <small class="text-muted">(${calculationParams.safetyStockPercentage}% of base usage)</small></dd>
                            
                            <dt class="col-sm-5">Required Stock:</dt>
                            <dd class="col-sm-7">${details.orderCalculation.requiredStock} units <small class="text-muted">(Base Usage + Safety Stock)</small></dd>
                        </dl>
                        
                        <h6 class="border-bottom pb-2">Final Order Determination</h6>
                        <dl class="row">
                            <dt class="col-sm-5">Forecasted Demand:</dt>
                            <dd class="col-sm-7">${details.orderCalculation.requiredStock} units <small class="text-muted">(Base Usage + Safety Stock)</small></dd>
                            
                            <dt class="col-sm-5">Needs Reordering:</dt>
                            <dd class="col-sm-7">${details.orderCalculation.needsReordering ? '<span class="text-danger">Yes</span>' : '<span class="text-success">No</span>'}</dd>
                            
                            <dt class="col-sm-5">Recommended Order:</dt>
                            <dd class="col-sm-7">${details.orderCalculation.recommendedOrderQty} units</dd>
                        </dl>
                    </div>
                </div>
            `;
        }
    }
};
