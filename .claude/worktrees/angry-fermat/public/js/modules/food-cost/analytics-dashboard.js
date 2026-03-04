/**
 * Food Cost Analytics Dashboard
 * Version: 1.0.0
 * 
 * Provides industry-standard analytics for food cost management
 * including KPIs, trends analysis, and actionable recommendations
 */

// Firebase functions will be loaded dynamically
let ref, get, rtdb;

// Load Firebase dependencies
async function loadFirebaseDependencies() {
  try {
    // Try ES module import
    const firebaseModule = await import('../../config/firebase-config.js');
    ref = firebaseModule.ref;
    get = firebaseModule.get;
    rtdb = firebaseModule.rtdb;
    return true;
  } catch (error) {
    console.warn('Could not import Firebase from module, using window fallback:', error);
    // Fallback to window.firebaseExports
    if (window.firebaseExports) {
      ref = window.firebaseExports.ref;
      get = window.firebaseExports.get;
      rtdb = window.firebaseExports.rtdb;
      return true;
    } else {
      console.error('Firebase not available');
      return false;
    }
  }
}

// Industry standard thresholds
const INDUSTRY_STANDARDS = {
  foodCostPercentage: {
    excellent: { min: 25, max: 30 },
    good: { min: 30, max: 35 },
    warning: { min: 35, max: 40 },
    critical: { min: 40, max: 100 }
  },
  wastePercentage: {
    excellent: { min: 0, max: 2 },
    good: { min: 2, max: 4 },
    warning: { min: 4, max: 6 },
    critical: { min: 6, max: 100 }
  },
  inventoryTurnover: {
    excellent: { min: 6, max: 8 },
    good: { min: 4, max: 6 },
    warning: { min: 2, max: 4 },
    critical: { min: 0, max: 2 }
  },
  primeCost: {
    excellent: { min: 0, max: 55 },
    good: { min: 55, max: 60 },
    warning: { min: 60, max: 65 },
    critical: { min: 65, max: 100 }
  }
};

export const FoodCostAnalyticsDashboard = {
  name: 'FoodCostAnalyticsDashboard',
  
  data() {
    return {
      isLoading: true,
      user: null,
      locations: [],
      selectedLocation: 'all',
      dateRange: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      },
      stockData: [],
      kpis: {
        foodCostPercentage: 0,
        wastePercentage: 0,
        inventoryTurnover: 0,
        primeCost: 0,
        topCostItems: [],
        categoryBreakdown: {}
      },
      charts: {
        costTrend: null,
        itemList: null,
        topItems: null,
        wasteTrend: null
      },
      recommendations: [],
      errorMessage: '',
      debugMode: false,
      itemListData: [],
      itemListFilters: {
        itemCount: '10',
        category: 'all',
        costCenter: 'all'
      },
      availableCategories: [],
      availableCostCenters: []
          };
    },
    
    async mounted() {
    // Add custom styles for table headers
    const style = document.createElement('style');
    style.textContent = `
      /* Fix for table header visibility */
      .table thead th,
      .table-light th {
        color: #212529 !important;
        background-color: #f8f9fa !important;
      }
      
      .table-responsive .table thead th {
        color: #495057 !important;
        font-weight: 600;
      }
      
      /* Ensure table text is always dark */
      .table td {
        color: #212529 !important;
      }
      
      /* Fix for sticky header */
      .table thead.sticky-top {
        background-color: #f8f9fa !important;
        box-shadow: 0 2px 2px -1px rgba(0, 0, 0, 0.4);
      }
    `;
    document.head.appendChild(style);
    this._customStyle = style;
    
    try {
      // Check for debug mode in URL
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('debug') === 'true') {
        this.debugMode = true;
        console.log('Debug mode enabled via URL parameter');
      }
      
      // Load Firebase dependencies first
      const firebaseLoaded = await loadFirebaseDependencies();
      if (!firebaseLoaded) {
        this.errorMessage = 'Failed to load Firebase dependencies. Please check your connection.';
        this.isLoading = false;
        return;
      }
      
      await this.loadLocations();
      if (this.locations.length > 0) {
        this.selectedLocation = this.locations[0].id;
        await this.loadAnalytics();
      } else {
        this.isLoading = false;
        this.errorMessage = 'No locations found. Please ensure you have locations configured.';
      }
    } catch (error) {
      console.error('Error in mounted hook:', error);
      this.errorMessage = `Failed to initialize analytics: ${error.message}`;
      this.isLoading = false;
    }
  },
  
  beforeUnmount() {
    // Clean up custom styles
    if (this._customStyle && this._customStyle.parentNode) {
      this._customStyle.parentNode.removeChild(this._customStyle);
    }
    
    // Clean up charts when component is destroyed
    this.destroyAllCharts();
  },
  
  methods: {
    async loadLocations() {
      try {
        if (!ref || !get || !rtdb) {
          throw new Error('Firebase functions not available');
        }
        
        // Get current user from auth
        const authModule = await import('../../config/firebase-config.js');
        const currentUser = authModule.auth.currentUser;
        
        if (!currentUser) {
          throw new Error('No authenticated user');
        }
        
        // First get user's location IDs from userLocations
        const userLocationsRef = ref(rtdb, `userLocations/${currentUser.uid}`);
        const userLocationsSnapshot = await get(userLocationsRef);
        
        if (!userLocationsSnapshot.exists()) {
          this.locations = [];
          console.log('User has no locations assigned');
          return;
        }
        
        // Get the location IDs
        const locationIds = Object.keys(userLocationsSnapshot.val());
        
        // Now fetch only those locations
        this.locations = [];
        for (const locationId of locationIds) {
          const locationRef = ref(rtdb, `locations/${locationId}`);
          const locationSnapshot = await get(locationRef);
          
          if (locationSnapshot.exists()) {
            const locationData = locationSnapshot.val();
            this.locations.push({
              id: locationId,
              name: locationData.name || locationId,
              ...locationData
            });
          }
        }
        
        console.log('Loaded user locations:', this.locations);
      } catch (error) {
        console.error('Error loading locations:', error);
        throw error; // Re-throw to be caught in mounted()
      }
    },
    
    async loadAnalytics() {
      this.isLoading = true;
      this.errorMessage = null; // Clear any previous errors
      
      // Destroy existing charts before loading new data
      this.destroyAllCharts();
      
      try {
        console.log('Loading analytics for location:', this.selectedLocation);
        
        // First try the location-specific path (new structure)
        let stockUsageRef = ref(rtdb, `locations/${this.selectedLocation}/stockUsage`);
        let snapshot = await get(stockUsageRef);
        
        if (!snapshot.exists()) {
          console.log('No data at location-specific path, trying root stockUsage path...');
          // Try the root stockUsage path (old structure) 
          stockUsageRef = ref(rtdb, 'stockUsage');
          snapshot = await get(stockUsageRef);
          
          if (snapshot.exists()) {
            // Filter by storeName or selectedLocationId
            const allData = snapshot.val();
            const filteredData = {};
            
            Object.entries(allData).forEach(([key, record]) => {
              if (record.storeName === this.selectedLocation || 
                  record.selectedLocationId === this.selectedLocation) {
                filteredData[key] = record;
              }
            });
            
            if (Object.keys(filteredData).length > 0) {
              console.log('Found data at root path, filtered records:', Object.keys(filteredData).length);
              this.stockData = this.processStockData(filteredData);
              this.calculateKPIs();
              this.generateRecommendations();
              // Delay chart rendering to ensure DOM is ready
              this.$nextTick(() => {
                setTimeout(() => {
                  this.renderCharts();
                }, 100);
              });
            } else {
              this.showNoDataMessage();
            }
          } else {
            this.showNoDataMessage();
          }
        } else {
          const data = snapshot.val();
          console.log('Found data at location-specific path, records:', Object.keys(data).length);
          this.stockData = this.processStockData(data);
          this.calculateKPIs();
          this.generateRecommendations();
          // Delay chart rendering to ensure DOM is ready
          this.$nextTick(() => {
            setTimeout(() => {
              this.renderCharts();
            }, 100);
          });
        }
      } catch (error) {
        console.error('Error loading analytics:', error);
        this.errorMessage = `Error loading analytics: ${error.message}`;
      } finally {
        this.isLoading = false;
      }
    },
    
    processStockData(rawData) {
      // Convert Firebase data to array and filter by date range
      const startDate = new Date(this.dateRange.start);
      const endDate = new Date(this.dateRange.end);
      
      console.log('Processing stock data:', rawData);
      console.log('Date range:', this.dateRange);
      
      const processedData = Object.entries(rawData)
        .map(([timestamp, data]) => {
          // Handle both timestamp as key and timestamp in data
          const dateTimestamp = data.timestamp || parseInt(timestamp);
          const recordDate = new Date(dateTimestamp);
          
          // Extract sales data with multiple fallbacks
          const salesTotal = data.salesData?.total || 
                           data.salesData?.salesTotal ||
                           data.salesAmount || 
                           data.salesTotal ||
                           data.totals?.salesTotal ||
                           0;
          
          return {
            ...data,
            date: recordDate,
            timestamp: dateTimestamp,
            salesTotal: salesTotal // Normalized sales field
          };
        })
        .filter(record => {
          const inRange = record.date >= startDate && record.date <= endDate;
          console.log(`Record date ${record.date.toISOString()} in range: ${inRange}`);
          return inRange;
        })
        .sort((a, b) => a.date - b.date);
      
      console.log('Processed data count:', processedData.length);
      console.log('Sample record:', processedData[0]);
      if (processedData[0]) {
        console.log('Sample record sales:', processedData[0].salesTotal);
      }
      
      return processedData;
    },
    
    calculateKPIs() {
      if (this.stockData.length === 0) {
        console.log('No stock data to calculate KPIs');
        return;
      }
      
      console.log('Calculating KPIs for', this.stockData.length, 'records');
      
      // Calculate food cost percentage
      const totalRevenue = this.stockData.reduce((sum, record) => {
        const sales = record.salesTotal; // Use normalized field
        console.log('Record sales:', sales);
        return sum + sales;
      }, 0);
      
      const totalCost = this.stockData.reduce((sum, record) => {
        // Try different possible paths for cost data
        const cost = record.totals?.totalCostOfUsage || 
                    record.totalCostOfUsage || 
                    record.costOfUsage || 
                    0;
        console.log('Record cost:', cost);
        return sum + cost;
      }, 0);
      
      console.log('Total Revenue:', totalRevenue);
      console.log('Total Cost:', totalCost);
      
      this.kpis.foodCostPercentage = totalRevenue > 0 
        ? ((totalCost / totalRevenue) * 100).toFixed(2) 
        : 0;
      
      // Calculate waste percentage
      const totalWaste = this.stockData.reduce((sum, record) => 
        sum + this.calculateWasteValue(record), 0);
      
      console.log('Total Waste:', totalWaste);
      
      this.kpis.wastePercentage = totalCost > 0 
        ? ((totalWaste / totalCost) * 100).toFixed(2) 
        : 0;
      
      // Calculate inventory turnover
      this.kpis.inventoryTurnover = this.calculateInventoryTurnover();
      
      // Calculate prime cost (food cost + labor cost)
      // For demo, assuming labor cost is 30% of revenue
      const laborCost = totalRevenue * 0.30;
      this.kpis.primeCost = totalRevenue > 0 
        ? (((totalCost + laborCost) / totalRevenue) * 100).toFixed(2) 
        : 0;
      
      console.log('KPIs calculated:', this.kpis);
      
      // Calculate top cost items
      this.calculateTopCostItems();
      
      // Calculate category breakdown
      this.calculateCategoryBreakdown();
      
      // Calculate item list data
      this.calculateItemListData();
    },
    
    calculateWasteValue(record) {
      // Calculate waste based on variance between expected and actual usage
      let wasteValue = 0;
      if (record.stockItems) {
        Object.values(record.stockItems).forEach(item => {
          const variance = (item.openingQty || 0) + (item.purchaseQty || 0) - 
                          (item.closingQty || 0) - (item.usage || 0);
          if (variance > 0) {
            wasteValue += variance * (item.unitCost || 0);
          }
        });
      }
      return wasteValue;
    },
    
    calculateInventoryTurnover() {
      if (this.stockData.length < 2) {
        console.log('Not enough data for inventory turnover calculation');
        return 0;
      }
      
      // Calculate average inventory value
      const avgInventoryValue = this.stockData.reduce((sum, record) => {
        const inventoryValue = Object.values(record.stockItems || {}).reduce((itemSum, item) => 
          itemSum + ((item.closingQty || 0) * (item.unitCost || 0)), 0);
        return sum + inventoryValue;
      }, 0) / this.stockData.length;
      
      // Calculate cost of goods sold for the period
      const totalCOGS = this.stockData.reduce((sum, record) => {
        const cost = record.totals?.totalCostOfUsage || 
                    record.totalCostOfUsage || 
                    0;
        return sum + cost;
      }, 0);
      
      // Calculate based on monthly turnover
      const daysDiff = Math.max(1, (new Date(this.dateRange.end) - new Date(this.dateRange.start)) / (1000 * 60 * 60 * 24));
      const monthlyTurnover = daysDiff > 0 ? (totalCOGS / avgInventoryValue) * (30 / daysDiff) : 0;
      
      console.log('Inventory turnover calculation:', {
        avgInventoryValue,
        totalCOGS,
        daysDiff,
        monthlyTurnover
      });
      
      return monthlyTurnover > 0 ? monthlyTurnover.toFixed(2) : 0;
    },
    
    calculateTopCostItems() {
      const itemCosts = {};
      
      this.stockData.forEach(record => {
        Object.values(record.stockItems || {}).forEach(item => {
          const costOfUsage = (item.usage || 0) * (item.unitCost || 0);
          // Use multiple possible field names for item name
          const itemName = item.itemName || item.description || item.name || item.itemCode || 'Unknown Item';
          
          if (!itemCosts[itemName]) {
            itemCosts[itemName] = {
              name: itemName,
              totalCost: 0,
              totalUsage: 0,
              avgUnitCost: item.unitCost || 0
            };
          }
          itemCosts[itemName].totalCost += costOfUsage;
          itemCosts[itemName].totalUsage += item.usage || 0;
        });
      });
      
      console.log('Top cost items calculated:', itemCosts);
      
      this.kpis.topCostItems = Object.values(itemCosts)
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, 10);
    },
    
    calculateCategoryBreakdown() {
      const categoryData = {};
      
      this.stockData.forEach(record => {
        Object.values(record.stockItems || {}).forEach(item => {
          const category = item.category || 'Uncategorized';
          const costOfUsage = (item.usage || 0) * (item.unitCost || 0);
          
          if (!categoryData[category]) {
            categoryData[category] = {
              name: category,
              totalCost: 0,
              itemCount: 0
            };
          }
          categoryData[category].totalCost += costOfUsage;
          categoryData[category].itemCount++;
        });
      });
      
      this.kpis.categoryBreakdown = categoryData;
    },
    
    calculateItemListData() {
      const itemDetails = {};
      const categories = new Set();
      const costCenters = new Set();
      
      this.stockData.forEach(record => {
        Object.values(record.stockItems || {}).forEach(item => {
          const costOfUsage = (item.usage || 0) * (item.unitCost || 0);
          const itemName = item.itemName || item.description || item.name || item.itemCode || 'Unknown Item';
          const category = item.category || 'Uncategorized';
          const costCenter = item.costCenter || item.location || 'Main Kitchen';
          
          categories.add(category);
          costCenters.add(costCenter);
          
          if (!itemDetails[itemName]) {
            itemDetails[itemName] = {
              name: itemName,
              category: category,
              costCenter: costCenter,
              totalCost: 0,
              totalUsage: 0,
              avgUnitCost: item.unitCost || 0,
              unit: item.unit || 'unit',
              usageCount: 0
            };
          }
          
          itemDetails[itemName].totalCost += costOfUsage;
          itemDetails[itemName].totalUsage += item.usage || 0;
          itemDetails[itemName].usageCount++;
        });
      });
      
      // Convert to array and sort by total cost
      this.itemListData = Object.values(itemDetails)
        .sort((a, b) => b.totalCost - a.totalCost);
      
      // Set available filters
      this.availableCategories = ['all', ...Array.from(categories).sort()];
      this.availableCostCenters = ['all', ...Array.from(costCenters).sort()];
      
      console.log('Item list data calculated:', this.itemListData.length, 'items');
      console.log('Categories:', this.availableCategories);
      console.log('Cost Centers:', this.availableCostCenters);
    },
    
    getFilteredItemList() {
      let filteredItems = [...this.itemListData];
      
      // Apply category filter
      if (this.itemListFilters.category !== 'all') {
        filteredItems = filteredItems.filter(item => 
          item.category === this.itemListFilters.category
        );
      }
      
      // Apply cost center filter
      if (this.itemListFilters.costCenter !== 'all') {
        filteredItems = filteredItems.filter(item => 
          item.costCenter === this.itemListFilters.costCenter
        );
      }
      
      // Apply item count limit
      if (this.itemListFilters.itemCount !== 'all') {
        const limit = parseInt(this.itemListFilters.itemCount);
        filteredItems = filteredItems.slice(0, limit);
      }
      
      return filteredItems;
    },
    
    generateRecommendations() {
      this.recommendations = [];
      
      // Food cost percentage recommendations
      const fcpStatus = this.getMetricStatus(this.kpis.foodCostPercentage, 'foodCostPercentage');
      if (fcpStatus === 'warning' || fcpStatus === 'critical') {
        this.recommendations.push({
          type: 'cost',
          severity: fcpStatus,
          title: 'High Food Cost Percentage',
          description: `Your food cost percentage is ${this.kpis.foodCostPercentage}%, which is above the industry standard of 25-35%.`,
          actions: [
            'Review portion sizes and ensure consistency',
            'Negotiate better prices with suppliers',
            'Analyze your top cost items for optimization opportunities',
            'Consider menu engineering to promote high-margin items'
          ]
        });
      }
      
      // Waste recommendations
      const wasteStatus = this.getMetricStatus(this.kpis.wastePercentage, 'wastePercentage');
      if (wasteStatus === 'warning' || wasteStatus === 'critical') {
        this.recommendations.push({
          type: 'waste',
          severity: wasteStatus,
          title: 'High Waste Percentage',
          description: `Your waste percentage is ${this.kpis.wastePercentage}%, exceeding the recommended maximum of 4%.`,
          actions: [
            'Implement FIFO (First In, First Out) inventory management',
            'Review prep quantities and adjust to actual demand',
            'Train staff on proper storage and handling procedures',
            'Consider donating excess food before it spoils'
          ]
        });
      }
      
      // Inventory turnover recommendations
      const turnoverStatus = this.getMetricStatus(this.kpis.inventoryTurnover, 'inventoryTurnover');
      if (turnoverStatus === 'warning' || turnoverStatus === 'critical') {
        this.recommendations.push({
          type: 'inventory',
          severity: turnoverStatus,
          title: 'Low Inventory Turnover',
          description: `Your inventory turnover rate is ${this.kpis.inventoryTurnover}, below the optimal range of 4-8 times per month.`,
          actions: [
            'Reduce order quantities to match actual usage',
            'Identify slow-moving items and reduce stock levels',
            'Improve demand forecasting accuracy',
            'Consider more frequent deliveries for perishables'
          ]
        });
      }
      
      // Top cost items recommendation
      if (this.kpis.topCostItems.length > 0) {
        const topItem = this.kpis.topCostItems[0];
        this.recommendations.push({
          type: 'optimization',
          severity: 'info',
          title: 'Cost Optimization Opportunity',
          description: `"${topItem.name}" accounts for the highest cost in your inventory.`,
          actions: [
            'Review usage patterns and consider alternatives',
            'Negotiate volume discounts with suppliers',
            'Ensure proper portioning to avoid overuse',
            'Consider menu price adjustments if needed'
          ]
        });
      }
    },
    
    getMetricStatus(value, metric) {
      const standards = INDUSTRY_STANDARDS[metric];
      if (!standards) return 'unknown';
      
      if (value >= standards.excellent.min && value <= standards.excellent.max) return 'excellent';
      if (value >= standards.good.min && value <= standards.good.max) return 'good';
      if (value >= standards.warning.min && value <= standards.warning.max) return 'warning';
      if (value >= standards.critical.min && value <= standards.critical.max) return 'critical';
      
      return 'unknown';
    },
    
    renderCharts() {
      this.$nextTick(() => {
        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
          console.error('Chart.js is not loaded. Please ensure Chart.js is included before this module.');
          return;
        }
        
        this.renderCostTrendChart();
        this.renderItemListTable();
        this.renderTopItemsChart();
        this.renderWasteTrendChart();
      });
    },
    
    renderCostTrendChart() {
      const ctx = document.getElementById('costTrendChart');
      if (!ctx) {
        console.warn('Canvas element "costTrendChart" not found');
        return;
      }
      
      // Destroy existing chart if it exists
      if (this.charts.costTrend) {
        this.charts.costTrend.destroy();
        this.charts.costTrend = null;
      }
      
      const labels = this.stockData.map(record => 
        record.date.toLocaleDateString()
      );
      
      const costData = this.stockData.map(record => 
        record.totals?.totalCostOfUsage || record.totalCostOfUsage || 0
      );
      
      const revenueData = this.stockData.map(record => record.salesTotal);
      
      console.log('Chart data - Labels:', labels);
      console.log('Chart data - Costs:', costData);
      console.log('Chart data - Revenue:', revenueData);
      
      try {
        this.charts.costTrend = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Food Cost',
              data: costData,
              borderColor: 'rgb(255, 99, 132)',
              backgroundColor: 'rgba(255, 99, 132, 0.1)',
              tension: 0.1
            }, {
              label: 'Revenue',
              data: revenueData,
              borderColor: 'rgb(54, 162, 235)',
              backgroundColor: 'rgba(54, 162, 235, 0.1)',
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: 'Cost vs Revenue Trend'
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                      label += ': ';
                    }
                    if (context.parsed.y !== null) {
                      label += context.parsed.y.toLocaleString();
                    }
                    return label;
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function(value) {
                    return value.toLocaleString();
                  }
                }
              }
            }
          }
        });
      } catch (error) {
        console.error('Error creating cost trend chart:', error);
      }
    },
    
    renderItemListTable() {
      const container = document.getElementById('categoryBreakdownChart');
      if (!container) {
        console.warn('Container element "categoryBreakdownChart" not found');
        return;
      }
      
      // Get filtered items
      const filteredItems = this.getFilteredItemList();
      
      // Create the item list HTML
      let html = `
        <div class="item-list-container">
          <div class="item-list-header d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">Item Cost Analysis</h5>
            <div class="d-flex gap-2">
              <select class="form-select form-select-sm" style="width: auto;" 
                      onchange="window.foodCostAnalytics.updateItemFilter('itemCount', this.value)">
                <option value="10" ${this.itemListFilters.itemCount === '10' ? 'selected' : ''}>Top 10</option>
                <option value="20" ${this.itemListFilters.itemCount === '20' ? 'selected' : ''}>Top 20</option>
                <option value="all" ${this.itemListFilters.itemCount === 'all' ? 'selected' : ''}>All Items</option>
              </select>
              
              <select class="form-select form-select-sm" style="width: auto;"
                      onchange="window.foodCostAnalytics.updateItemFilter('category', this.value)">
                ${this.availableCategories.map(cat => 
                  `<option value="${cat}" ${this.itemListFilters.category === cat ? 'selected' : ''}>
                    ${cat === 'all' ? 'All Categories' : cat}
                  </option>`
                ).join('')}
              </select>
              
              <select class="form-select form-select-sm" style="width: auto;"
                      onchange="window.foodCostAnalytics.updateItemFilter('costCenter', this.value)">
                ${this.availableCostCenters.map(cc => 
                  `<option value="${cc}" ${this.itemListFilters.costCenter === cc ? 'selected' : ''}>
                    ${cc === 'all' ? 'All Cost Centers' : cc}
                  </option>`
                ).join('')}
              </select>
            </div>
          </div>
          
          <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
            <table class="table table-hover table-sm">
              <thead class="table-light sticky-top">
                <tr>
                  <th style="width: 30%">Item Name</th>
                  <th style="width: 15%">Category</th>
                  <th style="width: 15%">Cost Center</th>
                  <th style="width: 10%" class="text-end">Usage</th>
                  <th style="width: 15%" class="text-end">Total Cost</th>
                  <th style="width: 15%" class="text-end">% of Total</th>
                </tr>
              </thead>
              <tbody>
      `;
      
      const totalCost = filteredItems.reduce((sum, item) => sum + item.totalCost, 0);
      
      if (filteredItems.length === 0) {
        html += `
          <tr>
            <td colspan="6" class="text-center text-muted py-3">
              No items found matching the selected filters
            </td>
          </tr>
        `;
      } else {
        filteredItems.forEach((item, index) => {
          const percentage = totalCost > 0 ? ((item.totalCost / totalCost) * 100).toFixed(1) : 0;
          const avgCost = item.usageCount > 0 ? (item.totalCost / item.usageCount).toFixed(2) : 0;
          
          html += `
            <tr>
              <td>
                <div class="fw-medium">${item.name}</div>
                <small class="text-muted">Avg cost: ${avgCost}/use</small>
              </td>
              <td><span class="badge bg-secondary">${item.category}</span></td>
              <td>${item.costCenter}</td>
              <td class="text-end">${item.totalUsage.toFixed(2)} ${item.unit}</td>
              <td class="text-end fw-medium">${item.totalCost.toFixed(2)}</td>
              <td class="text-end">
                <div class="d-flex align-items-center justify-content-end">
                  <div class="progress flex-grow-1 me-2" style="height: 20px; max-width: 100px;">
                    <div class="progress-bar ${percentage > 10 ? 'bg-warning' : 'bg-info'}" 
                         role="progressbar" 
                         style="width: ${percentage}%"
                         aria-valuenow="${percentage}" 
                         aria-valuemin="0" 
                         aria-valuemax="100">
                    </div>
                  </div>
                  <span class="text-nowrap">${percentage}%</span>
                </div>
              </td>
            </tr>
          `;
        });
        
        // Add summary row
        html += `
          <tr class="table-secondary fw-bold">
            <td colspan="4">Total (${filteredItems.length} items)</td>
            <td class="text-end">${totalCost.toFixed(2)}</td>
            <td class="text-end">100%</td>
          </tr>
        `;
      }
      
      html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
      
      // Replace the canvas with the table
      container.outerHTML = `<div id="categoryBreakdownChart" class="card-body">${html}</div>`;
      
      // Store the filter update function on the window object for easy access
      window.foodCostAnalytics = {
        updateItemFilter: (filterType, value) => {
          this.itemListFilters[filterType] = value;
          this.renderItemListTable();
        }
      };
    },
    
    // Wrapper for backward compatibility
    renderCategoryBreakdownChart() {
      this.renderItemListTable();
    },
    
    renderTopItemsChart() {
      const ctx = document.getElementById('topItemsChart');
      if (!ctx) {
        console.warn('Canvas element "topItemsChart" not found');
        return;
      }
      
      // Destroy existing chart if it exists
      if (this.charts.topItems) {
        this.charts.topItems.destroy();
        this.charts.topItems = null;
      }
      
      const topItems = this.kpis.topCostItems.slice(0, 5);
      
      if (topItems.length === 0) {
        console.warn('No top items data to display');
        return;
      }
      
      try {
        this.charts.topItems = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: topItems.map(item => item.name),
            datasets: [{
              label: 'Total Cost',
              data: topItems.map(item => item.totalCost),
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgb(54, 162, 235)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: 'Top 5 Cost Items'
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                      label += ': ';
                    }
                    if (context.parsed.y !== null) {
                      label += context.parsed.y.toLocaleString();
                    }
                    return label;
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function(value) {
                    return value.toLocaleString();
                  }
                }
              }
            }
          }
        });
      } catch (error) {
        console.error('Error creating top items chart:', error);
      }
    },
    
    renderWasteTrendChart() {
      const ctx = document.getElementById('wasteTrendChart');
      if (!ctx) {
        console.warn('Canvas element "wasteTrendChart" not found');
        return;
      }
      
      // Destroy existing chart if it exists
      if (this.charts.wasteTrend) {
        this.charts.wasteTrend.destroy();
        this.charts.wasteTrend = null;
      }
      
      const labels = this.stockData.map(record => 
        record.date.toLocaleDateString()
      );
      
      const wasteData = this.stockData.map(record => 
        this.calculateWasteValue(record)
      );
      
      try {
        this.charts.wasteTrend = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Waste Value',
              data: wasteData,
              borderColor: 'rgb(255, 159, 64)',
              backgroundColor: 'rgba(255, 159, 64, 0.1)',
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: 'Waste Trend'
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                      label += ': ';
                    }
                    if (context.parsed.y !== null) {
                      label += context.parsed.y.toLocaleString();
                    }
                    return label;
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function(value) {
                    return value.toLocaleString();
                  }
                }
              }
            }
          }
        });
      } catch (error) {
        console.error('Error creating waste trend chart:', error);
      }
    },
    
    showNoDataMessage() {
      // Show a message when no data is available
      console.log('No stock usage data found for the selected location and date range');
      this.errorMessage = `
        <div>
          <p>No stock usage data found for the selected location and date range.</p>
          <p>You can:</p>
          <ul>
                                <li>Save stock data from the <a href="/js/modules/food-cost/cost-driver.html" target="_blank">Food Cost module</a></li>
            <li><a href="/generate-test-stock-data.html" target="_blank">Generate test data</a> for this location</li>
            <li>Check if you have the correct location selected</li>
            <li>Adjust the date range to include days with data</li>
          </ul>
        </div>
      `;
    },
    
    exportReport() {
      // Generate PDF or CSV report
      console.log('Exporting analytics report...');
      // Implementation for report generation
    },
    
    async refreshData() {
      console.log('Refreshing analytics data...');
      this.errorMessage = null;
      await this.loadAnalytics();
    },
    
    destroyAllCharts() {
      // Destroy all chart instances to prevent memory leaks
      Object.keys(this.charts).forEach(chartKey => {
        if (this.charts[chartKey]) {
          try {
            this.charts[chartKey].destroy();
            this.charts[chartKey] = null;
          } catch (error) {
            console.warn(`Error destroying chart ${chartKey}:`, error);
          }
        }
      });
    }
  },
  
  template: `
    <div class="food-cost-analytics-dashboard">
      <!-- Header -->
      <div class="analytics-header mb-4">
        <h2 class="h4 mb-3">Food Cost Analytics Dashboard</h2>
        
        <!-- Controls -->
        <div class="row mb-3">
          <div class="col-md-4">
            <label for="locationSelect" class="form-label">Location</label>
            <select 
              id="locationSelect"
              v-model="selectedLocation" 
              @change="loadAnalytics"
              class="form-select"
            >
              <option v-for="location in locations" :key="location.id" :value="location.id">
                {{ location.name }}
              </option>
            </select>
          </div>
          
          <div class="col-md-3">
            <label for="startDate" class="form-label">Start Date</label>
            <input 
              id="startDate"
              type="date" 
              v-model="dateRange.start" 
              @change="loadAnalytics"
              class="form-control"
            >
          </div>
          
          <div class="col-md-3">
            <label for="endDate" class="form-label">End Date</label>
            <input 
              id="endDate"
              type="date" 
              v-model="dateRange.end" 
              @change="loadAnalytics"
              class="form-control"
            >
          </div>
          
          <div class="col-md-2 d-flex align-items-end">
            <div class="btn-group w-100" role="group">
              <button 
                @click="exportReport" 
                class="btn btn-outline-primary"
                title="Export analytics report"
              >
                <i class="fas fa-download"></i>
              </button>
              <button 
                @click="refreshData" 
                class="btn btn-outline-primary"
                title="Refresh data"
              >
                <i class="fas fa-sync"></i>
              </button>
              <button 
                @click="debugMode = !debugMode" 
                class="btn btn-outline-secondary"
                :class="{ 'active': debugMode }"
                title="Toggle debug mode"
              >
                <i class="fas fa-bug"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Error State -->
      <div v-if="errorMessage" class="alert alert-warning" role="alert">
        <h4 class="alert-heading"><i class="fas fa-info-circle me-2"></i>No Data Available</h4>
        <div v-html="errorMessage"></div>
      </div>
      
      <!-- Loading State -->
      <div v-if="isLoading && !errorMessage" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2">Loading analytics data...</p>
      </div>
      
      <!-- KPI Cards -->
      <div v-if="!isLoading && !errorMessage" class="analytics-content">
        <div class="row mb-4">
          <div class="col-md-3 mb-3">
            <div class="card kpi-card" :class="'kpi-' + getMetricStatus(kpis.foodCostPercentage, 'foodCostPercentage')">
              <div class="card-body">
                <h6 class="card-subtitle mb-2 text-muted">Food Cost %</h6>
                <h3 class="card-title">{{ kpis.foodCostPercentage }}%</h3>
                <p class="card-text small">Industry: 25-35%</p>
              </div>
            </div>
          </div>
          
          <div class="col-md-3 mb-3">
            <div class="card kpi-card" :class="'kpi-' + getMetricStatus(kpis.wastePercentage, 'wastePercentage')">
              <div class="card-body">
                <h6 class="card-subtitle mb-2 text-muted">Waste %</h6>
                <h3 class="card-title">{{ kpis.wastePercentage }}%</h3>
                <p class="card-text small">Target: < 4%</p>
              </div>
            </div>
          </div>
          
          <div class="col-md-3 mb-3">
            <div class="card kpi-card" :class="'kpi-' + getMetricStatus(kpis.inventoryTurnover, 'inventoryTurnover')">
              <div class="card-body">
                <h6 class="card-subtitle mb-2 text-muted">Inventory Turnover</h6>
                <h3 class="card-title">{{ kpis.inventoryTurnover }}x</h3>
                <p class="card-text small">Target: 4-8x/month</p>
              </div>
            </div>
          </div>
          
          <div class="col-md-3 mb-3">
            <div class="card kpi-card" :class="'kpi-' + getMetricStatus(kpis.primeCost, 'primeCost')">
              <div class="card-body">
                <h6 class="card-subtitle mb-2 text-muted">Prime Cost %</h6>
                <h3 class="card-title">{{ kpis.primeCost }}%</h3>
                <p class="card-text small">Target: < 60%</p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Charts Row -->
        <div class="row mb-4">
          <div class="col-md-6 mb-3">
            <div class="card">
              <div class="card-body">
                <canvas id="costTrendChart"></canvas>
              </div>
            </div>
          </div>
          
          <div class="col-md-6 mb-3">
            <div class="card">
              <div class="card-body">
                <canvas id="categoryBreakdownChart"></canvas>
              </div>
            </div>
          </div>
        </div>
        
        <div class="row mb-4">
          <div class="col-md-6 mb-3">
            <div class="card">
              <div class="card-body">
                <canvas id="topItemsChart"></canvas>
              </div>
            </div>
          </div>
          
          <div class="col-md-6 mb-3">
            <div class="card">
              <div class="card-body">
                <canvas id="wasteTrendChart"></canvas>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Debug Panel -->
        <div v-if="debugMode && stockData.length > 0" class="card mb-4">
          <div class="card-header bg-dark text-white">
            <h5 class="mb-0"><i class="fas fa-bug me-2"></i>Debug Information</h5>
          </div>
          <div class="card-body">
            <p><strong>Records loaded:</strong> {{ stockData.length }}</p>
            <p><strong>Date range:</strong> {{ dateRange.start }} to {{ dateRange.end }}</p>
            <p><strong>Selected location:</strong> {{ selectedLocation }}</p>
            <details>
              <summary>KPIs Calculated</summary>
              <pre>{{ JSON.stringify(kpis, null, 2) }}</pre>
            </details>
            <details v-if="stockData.length > 0">
              <summary>First Record Data</summary>
              <pre>{{ JSON.stringify(stockData[0], null, 2) }}</pre>
            </details>
          </div>
        </div>
        
        <!-- Recommendations -->
        <div v-if="recommendations.length > 0" class="recommendations-section">
          <h4 class="mb-3">Recommendations</h4>
          <div class="accordion" id="recommendationsAccordion">
            <div 
              v-for="(rec, index) in recommendations" 
              :key="index"
              class="accordion-item"
            >
              <h2 class="accordion-header" :id="'heading' + index">
                <button 
                  class="accordion-button" 
                  :class="{ collapsed: index !== 0 }"
                  type="button" 
                  data-bs-toggle="collapse" 
                  :data-bs-target="'#collapse' + index" 
                  :aria-expanded="index === 0 ? 'true' : 'false'" 
                  :aria-controls="'collapse' + index"
                >
                  <i 
                    class="fas me-2" 
                    :class="{
                      'fa-exclamation-circle text-danger': rec.severity === 'critical',
                      'fa-exclamation-triangle text-warning': rec.severity === 'warning',
                      'fa-info-circle text-info': rec.severity === 'info'
                    }"
                  ></i>
                  {{ rec.title }}
                </button>
              </h2>
              <div 
                :id="'collapse' + index" 
                class="accordion-collapse collapse" 
                :class="{ show: index === 0 }"
                :aria-labelledby="'heading' + index" 
                data-bs-parent="#recommendationsAccordion"
              >
                <div class="accordion-body">
                  <p>{{ rec.description }}</p>
                  <h6>Recommended Actions:</h6>
                  <ul>
                    <li v-for="(action, actionIndex) in rec.actions" :key="actionIndex">
                      {{ action }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
};

// Export initialization function
export function initializeFoodCostAnalytics(containerId = 'food-cost-analytics-container') {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`Container with ID "${containerId}" not found`);
    return null;
  }
  
  // Create Vue app instance
  const app = Vue.createApp(FoodCostAnalyticsDashboard);
  app.mount(container);
  
  return app;
}

// Register globally if needed
if (window.FoodCost) {
  window.FoodCost.AnalyticsDashboard = FoodCostAnalyticsDashboard;
  window.FoodCost.initializeAnalytics = initializeFoodCostAnalytics;
} 