/**
 * User Subscription Management Module
 * Handles subscription viewing, upgrades, and usage tracking
 */

import { auth, rtdb, ref, get, set, update } from '../config/firebase-config.js';
import { featureAccessControl } from './access-control/services/feature-access-control.js';
import { PLATFORM_FEATURES } from './access-control/services/platform-features.js';

class UserSubscriptionManager {
    constructor() {
        this.currentUser = null;
        this.subscription = null;
        this.tiers = null;
        this.usage = null;
        
        this.init();
    }

    async init() {
        // Check authentication
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                document.getElementById('userDisplayName').textContent = user.displayName || user.email;
                await this.loadSubscriptionData();
            } else {
                window.location.href = 'login.html';
            }
        });

        // Set up logout
        document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            auth.signOut().then(() => {
                window.location.href = 'index.html';
            });
        });
    }

    /**
     * Get tier ID from subscription, handling both tier and tierId field names
     * @returns {string} Tier ID with fallback to 'free'
     */
    getTierId() {
        return this.subscription?.tierId || this.subscription?.tier || 'free';
    }

    async loadSubscriptionData() {
        try {
            this.showLoading(true);
            
            // Load subscription data
            await Promise.all([
                this.loadUserSubscription(),
                this.loadAvailableTiers(),
                this.loadUsageData()
            ]);

            // Update UI
            this.updateCurrentPlanDisplay();
            this.updateAvailablePlansDisplay();
            this.updateUsageDisplay();
            this.loadBillingHistory();
            
            this.showLoading(false);
        } catch (error) {
            console.error('Error loading subscription data:', error);
            this.showError('Failed to load subscription data. Please try again.');
        }
    }

    async loadUserSubscription() {
        const subscriptionRef = ref(rtdb, `subscriptions/${this.currentUser.uid}`);
        const snapshot = await get(subscriptionRef);
        this.subscription = snapshot.val();
        
        if (!this.subscription) {
            // Create a free tier subscription if none exists
            this.subscription = {
                tierId: 'free',
                status: 'active',
                startDate: Date.now(),
                billingCycle: 'free'
            };
            await set(subscriptionRef, this.subscription);
        }
    }

    async loadAvailableTiers() {
        try {
            // First try to load from database
            let tiersRef = ref(rtdb, 'subscriptionTiers');
            let snapshot = await get(tiersRef);
            let tiersData = snapshot.val();
            
            // If database doesn't have tiers, initialize from code
            if (!tiersData) {
                console.log('No tiers found in database, initializing with default tiers');
                await this.initializeTiersInDatabase();
                
                // Try to load again after initialization
                snapshot = await get(tiersRef);
                tiersData = snapshot.val() || {};
            }
            
            // Convert to array and sort by price
            this.tiers = Object.entries(tiersData)
                .map(([id, tier]) => ({ 
                    id, 
                    name: tier.name || id.charAt(0).toUpperCase() + id.slice(1),
                    description: tier.description || 'Plan description',
                    pricing: tier.pricing || tier.monthlyPrice ? { monthly: tier.monthlyPrice } : { monthly: 0 },
                    isVisible: tier.isVisible || true,
                    features: tier.features || {},
                    ...tier 
                }))
                .sort((a, b) => {
                    const aPrice = a.pricing?.monthly || a.monthlyPrice || 0;
                    const bPrice = b.pricing?.monthly || b.monthlyPrice || 0;
                    return aPrice - bPrice;
                });
                
            console.log('Loaded tiers:', this.tiers);
        } catch (error) {
            console.error('Error loading tiers:', error);
            // Set default tiers if loading fails
            await this.setDefaultTiers();
        }
    }

    async initializeTiersInDatabase() {
        try {
            // Define proper tier structure that matches platform features
            const defaultTiers = {
                free: {
                    name: 'Free Plan',
                    description: 'Basic features to get started',
                    monthlyPrice: 0,
                    annualPrice: 0,
                    isVisible: true, // Always visible for free tier
                    features: {
                        wifiBasic: true,
                        guestManagementBasic: true,
                        analyticsBasic: true,
                        campaignBasic: true
                    },
                    limits: {
                        locations: 1,
                        monthlyUsers: 100,
                        campaignsPerMonth: 2
                    }
                },
                starter: {
                    name: 'Starter Plan',
                    description: 'Essential features for growing businesses',
                    monthlyPrice: 49.99,
                    annualPrice: 499.99,
                    isVisible: true, // Public tier
                    features: {
                        wifiBasic: true,
                        wifiPremium: true,
                        guestManagementBasic: true,
                        analyticsBasic: true,
                        campaignBasic: true,
                        rewardsBasic: true,
                        whatsappBasic: true,
                        multiLocation: true
                    },
                    limits: {
                        locations: 3,
                        monthlyUsers: 1000,
                        campaignsPerMonth: 10
                    }
                },
                professional: {
                    name: 'Professional Plan',
                    description: 'Advanced features for established businesses',
                    monthlyPrice: 99.99,
                    annualPrice: 999.99,
                    isVisible: true, // Public tier
                    features: {
                        wifiBasic: true,
                        wifiPremium: true,
                        wifiAnalytics: true,
                        guestManagementBasic: true,
                        guestManagementAdvanced: true,
                        analyticsBasic: true,
                        analyticsAdvanced: true,
                        campaignBasic: true,
                        campaignAdvanced: true,
                        rewardsBasic: true,
                        rewardsAdvanced: true,
                        whatsappBasic: true,
                        whatsappAutomation: true,
                        receiptProcessingOCR: true,
                        foodCostBasic: true,
                        multiLocation: true,
                        guestInsights: true
                    },
                    limits: {
                        locations: 10,
                        monthlyUsers: 5000,
                        campaignsPerMonth: 50
                    }
                },
                enterprise: {
                    name: 'Enterprise Plan',
                    description: 'Complete solution for large operations',
                    monthlyPrice: 199.99,
                    annualPrice: 1999.99,
                    isVisible: false, // Hidden tier - contact sales only
                    features: {
                        wifiBasic: true,
                        wifiPremium: true,
                        wifiAnalytics: true,
                        guestManagementBasic: true,
                        guestManagementAdvanced: true,
                        analyticsBasic: true,
                        analyticsAdvanced: true,
                        analyticsPredictive: true,
                        campaignBasic: true,
                        campaignAdvanced: true,
                        campaignAutomation: true,
                        rewardsBasic: true,
                        rewardsAdvanced: true,
                        rewardsGamefication: true,
                        whatsappBasic: true,
                        whatsappAutomation: true,
                        whatsappBroadcast: true,
                        receiptProcessingOCR: true,
                        receiptAnalytics: true,
                        foodCostBasic: true,
                        foodCostAdvanced: true,
                        foodCostAnalytics: true,
                        multiLocation: true,
                        guestInsights: true,
                        apiAccess: true,
                        thirdPartyIntegrations: true,
                        supportPriority: true
                    },
                    limits: {
                        locations: -1, // unlimited
                        monthlyUsers: -1, // unlimited
                        campaignsPerMonth: -1 // unlimited
                    }
                }
            };

            // Save to database
            await set(ref(rtdb, 'subscriptionTiers'), defaultTiers);
            console.log('Initialized subscription tiers in database');
        } catch (error) {
            console.error('Error initializing tiers in database:', error);
        }
    }

    async setDefaultTiers() {
        this.tiers = [
            {
                id: 'free',
                name: 'Free Plan',
                description: 'Basic features to get started',
                pricing: { monthly: 0, annual: 0 },
                isVisible: true,
                features: {
                    wifiBasic: true,
                    guestManagementBasic: true,
                    analyticsBasic: true,
                    campaignBasic: true
                }
            },
            {
                id: 'starter',
                name: 'Starter Plan',
                description: 'Essential features for growing businesses',
                pricing: { monthly: 49.99, annual: 499.99 },
                isVisible: true,
                features: {
                    wifiBasic: true,
                    wifiPremium: true,
                    guestManagementBasic: true,
                    analyticsBasic: true,
                    campaignBasic: true,
                    rewardsBasic: true,
                    whatsappBasic: true,
                    multiLocation: true
                }
            },
            {
                id: 'professional',
                name: 'Professional Plan',
                description: 'Advanced features for established businesses',
                pricing: { monthly: 99.99, annual: 999.99 },
                isVisible: true,
                features: {
                    wifiBasic: true,
                    wifiPremium: true,
                    wifiAnalytics: true,
                    guestManagementBasic: true,
                    guestManagementAdvanced: true,
                    analyticsBasic: true,
                    analyticsAdvanced: true,
                    campaignBasic: true,
                    campaignAdvanced: true,
                    rewardsBasic: true,
                    rewardsAdvanced: true,
                    whatsappBasic: true,
                    whatsappAutomation: true,
                    receiptProcessingOCR: true,
                    foodCostBasic: true,
                    multiLocation: true,
                    guestInsights: true
                }
            },
            {
                id: 'enterprise',
                name: 'Enterprise Plan',
                description: 'Complete solution for large operations',
                pricing: { monthly: 199.99, annual: 1999.99 },
                isVisible: false, // Hidden from public
                features: {
                    wifiBasic: true,
                    wifiPremium: true,
                    wifiAnalytics: true,
                    guestManagementBasic: true,
                    guestManagementAdvanced: true,
                    analyticsBasic: true,
                    analyticsAdvanced: true,
                    analyticsPredictive: true,
                    campaignBasic: true,
                    campaignAdvanced: true,
                    campaignAutomation: true,
                    rewardsBasic: true,
                    rewardsAdvanced: true,
                    rewardsGamefication: true,
                    whatsappBasic: true,
                    whatsappAutomation: true,
                    whatsappBroadcast: true,
                    receiptProcessingOCR: true,
                    receiptAnalytics: true,
                    foodCostBasic: true,
                    foodCostAdvanced: true,
                    foodCostAnalytics: true,
                    multiLocation: true,
                    guestInsights: true,
                    apiAccess: true,
                    thirdPartyIntegrations: true,
                    supportPriority: true
                }
            }
        ];
    }

    async loadUsageData() {
        // Simulate usage data - in production, this would come from actual usage tracking
        const usageRef = ref(rtdb, `usage/${this.currentUser.uid}/${new Date().getMonth()}`);
        const snapshot = await get(usageRef);
        this.usage = snapshot.val() || {
            users: 0,
            campaigns: 0,
            apiCalls: 0,
            storage: 0
        };
    }

    updateCurrentPlanDisplay() {
        // Handle case where tiers aren't loaded yet
        if (!this.tiers || this.tiers.length === 0) {
            console.warn('Tiers not loaded yet');
            document.getElementById('currentPlanName').textContent = 'Loading...';
            document.getElementById('planDescription').textContent = 'Please wait...';
            return;
        }

        // Find current tier or use free tier as fallback
        const currentTier = this.tiers.find(t => t.id === this.getTierId()) || 
                           this.tiers.find(t => t.id === 'free') || 
                           {
                               id: 'free',
                               name: 'Free Plan',
                               description: 'Basic features to get started',
                               pricing: { monthly: 0 },
                               features: {}
                           };
        
        // Update header
        let statusText = 'Inactive';
        if (this.subscription.status === 'active') {
            statusText = 'Active Account';
        } else if (this.subscription.status === 'trial') {
            const daysRemaining = this.subscription.trialEndDate
                ? Math.ceil((this.subscription.trialEndDate - Date.now()) / (24 * 60 * 60 * 1000))
                : 0;
            statusText = daysRemaining > 0 ? `Trial (${daysRemaining} days left)` : 'Trial Expired';
        }
        document.getElementById('accountStatus').textContent = statusText;
        
        // Update plan details
        document.getElementById('currentPlanName').textContent = currentTier.name;
        document.getElementById('planDescription').textContent = currentTier.description;
        
        // Update pricing
        if (currentTier.pricing?.monthly > 0) {
            document.getElementById('planPrice').textContent = `$${currentTier.pricing.monthly}`;
            document.getElementById('billingCycle').textContent = 
                this.subscription.billingCycle === 'annual' ? '/year' : '/month';
        } else {
            document.getElementById('planPrice').textContent = 'Free';
            document.getElementById('billingCycle').textContent = '';
        }
        
        // Update features
        const featuresGrid = document.getElementById('planFeatures');
        featuresGrid.innerHTML = '';
        
        // Update icon based on tier
        const iconMap = {
            'free': 'fa-user',
            'starter': 'fa-star',
            'professional': 'fa-crown',
            'enterprise': 'fa-building'
        };
        const planIcon = document.getElementById('planIcon');
        if (planIcon) {
            planIcon.className = `fas ${iconMap[currentTier.id] || 'fa-crown'}`;
        }
        
        // Get all possible features from PLATFORM_FEATURES
        Object.values(PLATFORM_FEATURES).forEach(feature => {
            const isEnabled = currentTier.features?.[feature.id] === true;
            const featureEl = document.createElement('div');
            featureEl.className = 'feature-item';
            featureEl.innerHTML = `
                <i class="fas ${isEnabled ? 'fa-check text-success' : 'fa-times text-muted'}"></i>
                <span class="${isEnabled ? '' : 'text-muted'}">${feature.name}</span>
            `;
            featuresGrid.appendChild(featureEl);
        });
    }

    updateFeaturesList(tier) {
        const featuresContainer = document.getElementById('planFeatures');
        featuresContainer.innerHTML = '';
        
        // Get all features from PLATFORM_FEATURES that match the tier's features
        const tierFeatures = [];
        const availableFeatures = [];
        
        Object.entries(PLATFORM_FEATURES).forEach(([featureId, feature]) => {
            const isEnabled = tier.features && tier.features[featureId] === true;
            
            if (isEnabled) {
                tierFeatures.push(feature);
            } else {
                availableFeatures.push(feature);
            }
        });
        
        // Group by category for better organization
        const groupedFeatures = {};
        tierFeatures.forEach(feature => {
            const category = feature.category || 'other';
            if (!groupedFeatures[category]) {
                groupedFeatures[category] = [];
            }
            groupedFeatures[category].push(feature);
        });
        
        // Display included features by category
        Object.entries(groupedFeatures).forEach(([category, features]) => {
            if (features.length > 0) {
                // Add category header
                const categoryHeader = document.createElement('div');
                categoryHeader.className = 'feature-category-header mt-3 mb-2';
                categoryHeader.innerHTML = `<h6 class="text-uppercase text-muted mb-2">${category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</h6>`;
                featuresContainer.appendChild(categoryHeader);
                
                // Add features in category
                features.forEach(feature => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <i class="fas fa-check-circle text-success"></i>
                        <span>${feature.name}</span>
                        <small class="text-muted d-block ms-4">${feature.description}</small>
                    `;
                    featuresContainer.appendChild(li);
                });
            }
        });
        
        // If no features found, show a message
        if (tierFeatures.length === 0) {
            const noFeatures = document.createElement('li');
            noFeatures.innerHTML = '<i class="fas fa-info-circle text-muted"></i><span class="text-muted">Basic platform access</span>';
            featuresContainer.appendChild(noFeatures);
        }
    }

    updateAvailablePlansDisplay() {
        const plansContainer = document.getElementById('availablePlans');
        plansContainer.innerHTML = '';
        
        // Filter tiers - only show visible ones to regular users
        // Note: Admins might see all tiers in a different interface
        const visibleTiers = this.tiers.filter(tier => tier.isVisible !== false);
        
        // If no visible tiers, show a message
        if (visibleTiers.length === 0) {
            plansContainer.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle me-2"></i>
                        No subscription plans are currently available. Please contact support for custom pricing.
                    </div>
                </div>
            `;
            return;
        }
        
        visibleTiers.forEach((tier, index) => {
            const isCurrentPlan = tier.id === this.getTierId();
            const isRecommended = tier.id === 'professional'; // Recommend professional tier
            
            const planCard = document.createElement('div');
            planCard.className = `plan-card ${isRecommended ? 'recommended' : ''}`;
            
            planCard.innerHTML = `
                <h4 class="plan-name">${tier.name}</h4>
                <p class="plan-description">${tier.description}</p>
                <div class="plan-price-display">
                    ${tier.pricing?.monthly > 0 ? `$${tier.pricing.monthly}` : 'Free'}
                    <small>${tier.pricing?.monthly > 0 ? '/month' : ''}</small>
                </div>
                <ul class="features-list">
                    ${this.getHighlightFeatures(tier).map(f => 
                        `<li><i class="fas fa-check-circle"></i>${f}</li>`
                    ).join('')}
                </ul>
                <button class="upgrade-button" 
                    ${isCurrentPlan ? 'disabled' : ''}
                    onclick="subscriptionManager.upgradeToPlan('${tier.id}')">
                    ${isCurrentPlan ? 'Current Plan' : 'Upgrade'}
                </button>
            `;
            
            plansContainer.appendChild(planCard);
        });
        
        // Add enterprise contact note if enterprise tier is hidden
        const enterpriseTier = this.tiers.find(t => t.id === 'enterprise');
        if (enterpriseTier && enterpriseTier.isVisible === false) {
            const contactCard = document.createElement('div');
            contactCard.className = 'plan-card border-2 border-dashed';
            contactCard.innerHTML = `
                <h4 class="plan-name text-muted">Enterprise Plan</h4>
                <p class="plan-description text-muted">Custom solutions for large organizations</p>
                <div class="plan-price-display text-muted">
                    Custom Pricing
                </div>
                <ul class="features-list">
                    <li class="text-muted"><i class="fas fa-star"></i>Unlimited everything</li>
                    <li class="text-muted"><i class="fas fa-headset"></i>Dedicated support</li>
                    <li class="text-muted"><i class="fas fa-cogs"></i>Custom integrations</li>
                    <li class="text-muted"><i class="fas fa-shield-alt"></i>SLA guarantees</li>
                </ul>
                <button class="upgrade-button" onclick="contactSales()">
                    Contact Sales
                </button>
            `;
            plansContainer.appendChild(contactCard);
        }
    }

    getHighlightFeatures(tier) {
        // Return key features for each tier
        const highlights = {
            'free': ['Basic WiFi Guest Management', '1 Location', 'Basic Analytics'],
            'starter': ['WhatsApp Messaging', '3 Locations', 'Campaign Management'],
            'professional': ['Advanced Analytics', '10 Locations', 'Rewards System', 'Priority Support'],
            'enterprise': ['Unlimited Locations', 'Custom Integrations', 'Dedicated Support', 'SLA']
        };
        
        return highlights[tier.id] || [];
    }

    updateUsageDisplay() {
        const currentTier = this.tiers.find(t => t.id === this.getTierId());
        const limits = currentTier?.limits || {};
        
        const usageContainer = document.getElementById('usageMetrics');
        usageContainer.innerHTML = '';
        
        const metrics = [
            { 
                label: 'Monthly Users', 
                current: this.usage.users || 0, 
                limit: limits.monthlyUsers || 'Unlimited',
                icon: 'fa-users'
            },
            { 
                label: 'Active Campaigns', 
                current: this.usage.campaigns || 0, 
                limit: limits.campaignsPerMonth || 'Unlimited',
                icon: 'fa-bullhorn'
            },
            { 
                label: 'API Calls', 
                current: this.usage.apiCalls || 0, 
                limit: limits.apiCallsPerDay || 'Unlimited',
                icon: 'fa-plug'
            },
            { 
                label: 'Storage Used', 
                current: `${(this.usage.storage || 0) / 1024 / 1024}MB`, 
                limit: limits.storageGB ? `${limits.storageGB}GB` : 'Unlimited',
                icon: 'fa-database'
            }
        ];
        
        metrics.forEach(metric => {
            const percentage = metric.limit !== 'Unlimited' 
                ? (metric.current / metric.limit) * 100 
                : 0;
            const isWarning = percentage > 80;
            
            const metricHtml = `
                <div class="usage-item">
                    <div class="usage-label">
                        <span><i class="fas ${metric.icon} me-2"></i>${metric.label}</span>
                        <span>${metric.current} / ${metric.limit}</span>
                    </div>
                    <div class="usage-bar">
                        <div class="usage-fill ${isWarning ? 'warning' : ''}" 
                             style="width: ${Math.min(percentage, 100)}%"></div>
                    </div>
                </div>
            `;
            usageContainer.innerHTML += metricHtml;
        });
    }

    async loadBillingHistory() {
        // In production, this would load from a payment provider or billing system
        const billingContainer = document.getElementById('billingHistory');
        
        // For now, show sample data if not on free tier
        const tierId = this.getTierId();
        if (tierId !== 'free') {
            billingContainer.innerHTML = `
                <tr>
                    <td>${new Date().toLocaleDateString()}</td>
                    <td>${this.tiers.find(t => t.id === tierId)?.name} Plan</td>
                    <td>$${this.tiers.find(t => t.id === tierId)?.pricing?.monthly}</td>
                    <td><span class="status-badge paid">Paid</span></td>
                    <td><a href="#" onclick="downloadInvoice('latest')"><i class="fas fa-download"></i></a></td>
                </tr>
            `;
        }
    }

    async upgradeToPlan(tierId) {
        const tier = this.tiers.find(t => t.id === tierId);
        if (!tier) return;
        
        const result = await Swal.fire({
            title: `Upgrade to ${tier.name}?`,
            html: `
                <p>${tier.description}</p>
                <h4>$${tier.pricing?.monthly || 0}/month</h4>
                <p class="text-muted">You'll be charged immediately and your new features will be available right away.</p>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Upgrade Now',
            confirmButtonColor: '#667eea'
        });
        
        if (result.isConfirmed) {
            try {
                // Update subscription
                await update(ref(rtdb, `subscriptions/${this.currentUser.uid}`), {
                    tierId: tierId,
                    updatedAt: Date.now(),
                    previousTier: this.getTierId()
                });
                
                // Clear feature access cache
                featureAccessControl.clearCache();
                
                await Swal.fire({
                    title: 'Success!',
                    text: `You've been upgraded to the ${tier.name} plan.`,
                    icon: 'success',
                    confirmButtonColor: '#667eea'
                });
                
                // Reload page to show new plan
                window.location.reload();
            } catch (error) {
                console.error('Upgrade error:', error);
                Swal.fire({
                    title: 'Error',
                    text: 'Failed to upgrade your plan. Please try again.',
                    icon: 'error',
                    confirmButtonColor: '#667eea'
                });
            }
        }
    }

    showLoading(show) {
        document.getElementById('loadingState').style.display = show ? 'flex' : 'none';
        document.getElementById('mainContent').style.display = show ? 'none' : 'block';
    }

    showError(message) {
        Swal.fire({
            title: 'Error',
            text: message,
            icon: 'error',
            confirmButtonColor: '#667eea'
        });
    }
}

// Global functions for button clicks
window.showCancelDialog = async () => {
    const result = await Swal.fire({
        title: 'Cancel Subscription?',
        text: 'Are you sure you want to cancel your subscription? You\'ll lose access to premium features.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, cancel it',
        confirmButtonColor: '#e11d48'
    });
    
    if (result.isConfirmed) {
        // Handle cancellation
        Swal.fire('Cancelled', 'Your subscription has been cancelled.', 'success');
    }
};

window.showPaymentMethods = () => {
    Swal.fire({
        title: 'Payment Methods',
        text: 'Payment method management coming soon!',
        icon: 'info',
        confirmButtonColor: '#667eea'
    });
};

window.downloadInvoices = () => {
    Swal.fire({
        title: 'Download Invoices',
        text: 'Invoice download feature coming soon!',
        icon: 'info',
        confirmButtonColor: '#667eea'
    });
};

window.downloadInvoice = (invoiceId) => {
    Swal.fire({
        title: 'Downloading Invoice',
        text: `Downloading invoice ${invoiceId}...`,
        icon: 'info',
        timer: 2000,
        showConfirmButton: false
    });
};

window.contactSupport = () => {
    window.location.href = 'mailto:support@lakisparks.com?subject=Subscription Support';
};

window.contactSales = () => {
    Swal.fire({
        title: 'Contact Sales Team',
        html: `
            <p>Interested in our Enterprise plan? Our sales team will help you find the perfect solution.</p>
            <div class="d-grid gap-2 mt-3">
                <a href="mailto:sales@lakisparks.com?subject=Enterprise Plan Inquiry" class="btn btn-primary">
                    <i class="fas fa-envelope me-2"></i>Email Sales Team
                </a>
                <a href="tel:+1234567890" class="btn btn-outline-primary">
                    <i class="fas fa-phone me-2"></i>Call Sales: +1 (234) 567-890
                </a>
            </div>
        `,
        icon: 'info',
        showConfirmButton: false,
        showCloseButton: true,
        confirmButtonColor: '#667eea'
    });
};

// Initialize subscription manager
const subscriptionManager = new UserSubscriptionManager();
window.subscriptionManager = subscriptionManager;
