/**
 * Example: Analytics Module with Feature Access Control
 * This demonstrates how to integrate feature access control into existing modules
 */

import { auth, rtdb, ref, get, onValue } from '../../../config/firebase-config.js';
import featureAccessControl from '../services/feature-access-control.js';
import { FeatureGuard, FeatureButton } from '../components/feature-guard.js';

/**
 * Enhanced Analytics Dashboard with Feature Access Control
 */
export const AnalyticsDashboard = {
  name: 'AnalyticsDashboard',
  
  components: {
    FeatureGuard,
    FeatureButton
  },
  
  data() {
    return {
      // Basic analytics data (available to all users)
      basicMetrics: {
        totalVisits: 0,
        uniqueVisitors: 0,
        avgSessionDuration: 0
      },
      
      // Advanced analytics data (requires analyticsAdvanced feature)
      advancedMetrics: {
        conversionRate: 0,
        bounceRate: 0,
        topReferrers: [],
        userFlow: []
      },
      
      // Real-time analytics (requires analyticsRealtime feature)
      realtimeData: {
        activeUsers: 0,
        currentPageViews: []
      },
      
      // Feature access states
      features: {
        hasBasic: false,
        hasAdvanced: false,
        hasRealtime: false,
        hasPredictive: false
      },
      
      isLoading: true,
      error: null
    };
  },
  
  async created() {
    await this.checkFeatureAccess();
    await this.loadAnalyticsData();
  },
  
  methods: {
    /**
     * Check which analytics features the user has access to
     */
    async checkFeatureAccess() {
      try {
        // Check all analytics features in parallel
        const [basic, advanced, realtime, predictive] = await Promise.all([
          featureAccessControl.checkFeatureAccess('analyticsBasic'),
          featureAccessControl.checkFeatureAccess('analyticsAdvanced'),
          featureAccessControl.checkFeatureAccess('analyticsRealtime'),
          featureAccessControl.checkFeatureAccess('analyticsPredictive')
        ]);
        
        this.features = {
          hasBasic: basic.hasAccess,
          hasAdvanced: advanced.hasAccess,
          hasRealtime: realtime.hasAccess,
          hasPredictive: predictive.hasAccess
        };
        
        // If user doesn't have basic analytics, show upgrade prompt
        if (!this.features.hasBasic) {
          await featureAccessControl.showAccessDeniedMessage('analyticsBasic', {
            onUpgradeClick: () => {
              window.location.href = '#subscription-management';
            }
          });
        }
      } catch (error) {
        console.error('[Analytics] Error checking feature access:', error);
        this.error = 'Failed to check feature access';
      }
    },
    
    /**
     * Load analytics data based on feature access
     */
    async loadAnalyticsData() {
      try {
        this.isLoading = true;
        
        // Always try to load basic metrics if user has access
        if (this.features.hasBasic) {
          await this.loadBasicMetrics();
        }
        
        // Load advanced metrics if user has access
        if (this.features.hasAdvanced) {
          await this.loadAdvancedMetrics();
        }
        
        // Set up real-time listeners if user has access
        if (this.features.hasRealtime) {
          this.setupRealtimeListeners();
        }
        
      } catch (error) {
        console.error('[Analytics] Error loading data:', error);
        this.error = 'Failed to load analytics data';
      } finally {
        this.isLoading = false;
      }
    },
    
    async loadBasicMetrics() {
      // Simulate loading basic metrics
      const snapshot = await get(ref(rtdb, 'analytics/basic'));
      const data = snapshot.val() || {};
      
      this.basicMetrics = {
        totalVisits: data.totalVisits || 0,
        uniqueVisitors: data.uniqueVisitors || 0,
        avgSessionDuration: data.avgSessionDuration || 0
      };
    },
    
    async loadAdvancedMetrics() {
      // Simulate loading advanced metrics
      const snapshot = await get(ref(rtdb, 'analytics/advanced'));
      const data = snapshot.val() || {};
      
      this.advancedMetrics = {
        conversionRate: data.conversionRate || 0,
        bounceRate: data.bounceRate || 0,
        topReferrers: data.topReferrers || [],
        userFlow: data.userFlow || []
      };
    },
    
    setupRealtimeListeners() {
      // Set up real-time data listeners
      onValue(ref(rtdb, 'analytics/realtime/activeUsers'), (snapshot) => {
        this.realtimeData.activeUsers = snapshot.val() || 0;
      });
      
      onValue(ref(rtdb, 'analytics/realtime/pageViews'), (snapshot) => {
        const data = snapshot.val() || {};
        this.realtimeData.currentPageViews = Object.values(data);
      });
    },
    
    async exportData(format) {
      // Check if user has export feature
      const { hasAccess } = await featureAccessControl.checkFeatureAccess('analyticsExport');
      
      if (!hasAccess) {
        await featureAccessControl.showAccessDeniedMessage('analyticsExport');
        return;
      }
      
      // Perform export
      console.log(`Exporting data in ${format} format...`);
      // Export logic here
    },
    
    async generatePredictiveInsights() {
      // This is handled by the FeatureButton component
      console.log('Generating predictive insights...');
      // Predictive analytics logic here
    }
  },
  
  template: `
    <div class="analytics-dashboard">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>Analytics Dashboard</h2>
        <div class="btn-group">
          <feature-button
            feature="analyticsExport"
            text="Export Data"
            icon="fa-download"
            variant="outline-primary"
            size="sm"
            @click="exportData('csv')">
          </feature-button>
          <feature-button
            feature="analyticsPredictive"
            text="Predictive Insights"
            icon="fa-brain"
            variant="outline-success"
            size="sm"
            @click="generatePredictiveInsights">
          </feature-button>
        </div>
      </div>
      
      <!-- Loading State -->
      <div v-if="isLoading" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading analytics...</span>
        </div>
      </div>
      
      <!-- Error State -->
      <div v-else-if="error" class="alert alert-danger">
        <i class="fas fa-exclamation-triangle me-2"></i>{{ error }}
      </div>
      
      <!-- Analytics Content -->
      <div v-else>
        <!-- Basic Analytics (always visible if user has access) -->
        <feature-guard feature="analyticsBasic" :show-placeholder="true">
          <div class="row mb-4">
            <div class="col-md-4">
              <div class="card">
                <div class="card-body">
                  <h5 class="card-title">Total Visits</h5>
                  <h2 class="text-primary">{{ basicMetrics.totalVisits.toLocaleString() }}</h2>
                </div>
              </div>
            </div>
            <div class="col-md-4">
              <div class="card">
                <div class="card-body">
                  <h5 class="card-title">Unique Visitors</h5>
                  <h2 class="text-success">{{ basicMetrics.uniqueVisitors.toLocaleString() }}</h2>
                </div>
              </div>
            </div>
            <div class="col-md-4">
              <div class="card">
                <div class="card-body">
                  <h5 class="card-title">Avg. Session</h5>
                  <h2 class="text-info">{{ Math.round(basicMetrics.avgSessionDuration) }}s</h2>
                </div>
              </div>
            </div>
          </div>
        </feature-guard>
        
        <!-- Advanced Analytics -->
        <feature-guard feature="analyticsAdvanced" :show-placeholder="true">
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">Advanced Metrics</h5>
            </div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-6">
                  <h6>Conversion Rate</h6>
                  <div class="progress mb-3">
                    <div class="progress-bar bg-success" 
                         :style="{width: advancedMetrics.conversionRate + '%'}">
                      {{ advancedMetrics.conversionRate }}%
                    </div>
                  </div>
                </div>
                <div class="col-md-6">
                  <h6>Bounce Rate</h6>
                  <div class="progress mb-3">
                    <div class="progress-bar bg-warning" 
                         :style="{width: advancedMetrics.bounceRate + '%'}">
                      {{ advancedMetrics.bounceRate }}%
                    </div>
                  </div>
                </div>
              </div>
              
              <h6 class="mt-3">Top Referrers</h6>
              <ul class="list-group">
                <li v-for="referrer in advancedMetrics.topReferrers.slice(0, 5)" 
                    :key="referrer.source"
                    class="list-group-item d-flex justify-content-between">
                  <span>{{ referrer.source }}</span>
                  <span class="badge bg-primary">{{ referrer.visits }}</span>
                </li>
              </ul>
            </div>
          </div>
        </feature-guard>
        
        <!-- Real-time Analytics -->
        <feature-guard feature="analyticsRealtime" :show-placeholder="true"
                      placeholder-message="Upgrade to monitor your analytics in real-time">
          <div class="card mb-4">
            <div class="card-header bg-danger text-white">
              <h5 class="mb-0">
                <i class="fas fa-circle text-white blink me-2"></i>
                Real-time Analytics
              </h5>
            </div>
            <div class="card-body">
              <div class="d-flex align-items-center mb-3">
                <h2 class="mb-0 me-3">{{ realtimeData.activeUsers }}</h2>
                <span class="text-muted">Active users right now</span>
              </div>
              
              <h6>Current Page Views</h6>
              <div class="table-responsive">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>Viewers</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="page in realtimeData.currentPageViews" :key="page.path">
                      <td>{{ page.path }}</td>
                      <td>{{ page.viewers }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </feature-guard>
        
        <!-- Predictive Analytics -->
        <feature-guard feature="analyticsPredictive" :show-placeholder="true">
          <div class="card">
            <div class="card-header bg-success text-white">
              <h5 class="mb-0">
                <i class="fas fa-brain me-2"></i>
                Predictive Insights
              </h5>
            </div>
            <div class="card-body">
              <p class="text-muted">AI-powered predictions and insights coming soon...</p>
            </div>
          </div>
        </feature-guard>
      </div>
    </div>
  `
};

// CSS for blinking animation
const style = document.createElement('style');
style.textContent = `
  @keyframes blink {
    0% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 1; }
  }
  .blink {
    animation: blink 1.5s infinite;
  }
`;
document.head.appendChild(style);

export default AnalyticsDashboard;
