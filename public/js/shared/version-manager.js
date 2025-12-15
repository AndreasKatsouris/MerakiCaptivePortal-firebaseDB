/**
 * Dashboard Version Manager
 * Handles version switching and feature flags for v1/v2 dashboard transition
 */

export class DashboardVersionManager {
  constructor() {
    this.currentVersion = 'v1'; // Default to stable v1
    this.versionConfig = {
      v1: {
        file: 'user-dashboard.html',
        name: 'Bootstrap Dashboard (Stable)',
        features: ['basic-ui', 'subscription-management', 'location-management']
      },
      v2: {
        file: 'user-dashboard-v2.html', 
        name: 'Enhanced Dashboard (shadcn-vue)',
        features: ['modern-ui', 'improved-accessibility', 'enhanced-animations', 'better-mobile']
      }
    };
    
    this.featureFlags = {
      enableV2: false,           // Global v2 enable flag
      v2BetaUsers: [],          // Array of user IDs with v2 access
      v2RolloutPercentage: 0,   // Gradual rollout percentage (0-100)
      forceV1Users: [],         // Users who should stay on v1
      allowVersionSwitching: true // Allow manual version switching
    };
  }

  /**
   * Check if user can access v2 dashboard
   * @param {Object} user - Current user object
   * @returns {boolean} - Whether user can access v2
   */
  canAccessV2(user) {
    if (!this.featureFlags.enableV2) {
      return false;
    }

    if (!user || !user.uid) {
      return false;
    }

    // Force v1 users always stay on v1
    if (this.featureFlags.forceV1Users.includes(user.uid)) {
      return false;
    }

    // Beta users get v2 access
    if (this.featureFlags.v2BetaUsers.includes(user.uid)) {
      return true;
    }

    // Gradual rollout based on percentage
    if (this.featureFlags.v2RolloutPercentage > 0) {
      const userHash = this.hashUserId(user.uid);
      const userPercentile = userHash % 100;
      return userPercentile < this.featureFlags.v2RolloutPercentage;
    }

    return false;
  }

  /**
   * Get recommended version for user
   * @param {Object} user - Current user object
   * @returns {string} - Recommended version ('v1' or 'v2')
   */
  getRecommendedVersion(user) {
    return this.canAccessV2(user) ? 'v2' : 'v1';
  }

  /**
   * Get version from URL parameters or local storage
   * @returns {string} - Version from URL or storage
   */
  getVersionFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlVersion = urlParams.get('version');
    
    if (urlVersion && this.versionConfig[urlVersion]) {
      // Store user preference
      if (this.featureFlags.allowVersionSwitching) {
        localStorage.setItem('dashboard-version-preference', urlVersion);
      }
      return urlVersion;
    }

    // Check local storage preference
    if (this.featureFlags.allowVersionSwitching) {
      const storedVersion = localStorage.getItem('dashboard-version-preference');
      if (storedVersion && this.versionConfig[storedVersion]) {
        return storedVersion;
      }
    }

    return null;
  }

  /**
   * Determine which version to use for current user
   * @param {Object} user - Current user object
   * @returns {string} - Version to use ('v1' or 'v2')
   */
  getVersionForUser(user) {
    // First check URL/preference override
    const urlVersion = this.getVersionFromUrl();
    if (urlVersion) {
      // Verify user can access requested version
      if (urlVersion === 'v2' && !this.canAccessV2(user)) {
        console.warn('User requested v2 but does not have access, falling back to v1');
        return 'v1';
      }
      return urlVersion;
    }

    // Return recommended version based on feature flags
    return this.getRecommendedVersion(user);
  }

  /**
   * Redirect to appropriate version
   * @param {string} version - Target version
   * @param {boolean} replaceHistory - Whether to replace current history entry
   */
  redirectToVersion(version, replaceHistory = false) {
    if (!this.versionConfig[version]) {
      console.error(`Invalid version: ${version}`);
      return;
    }

    const config = this.versionConfig[version];
    const currentUrl = new URL(window.location);
    const targetUrl = new URL(config.file, currentUrl.origin);
    
    // Preserve existing query parameters except version
    currentUrl.searchParams.delete('version');
    for (const [key, value] of currentUrl.searchParams) {
      targetUrl.searchParams.set(key, value);
    }

    // Add version parameter if switching
    if (version !== 'v1') {
      targetUrl.searchParams.set('version', version);
    }

    if (replaceHistory) {
      window.location.replace(targetUrl.toString());
    } else {
      window.location.href = targetUrl.toString();
    }
  }

  /**
   * Update feature flags (for admin/testing)
   * @param {Object} newFlags - New feature flag values
   */
  updateFeatureFlags(newFlags) {
    this.featureFlags = { ...this.featureFlags, ...newFlags };
    console.log('Feature flags updated:', this.featureFlags);
  }

  /**
   * Get available versions for current user
   * @param {Object} user - Current user object
   * @returns {Array} - Array of available version objects
   */
  getAvailableVersions(user) {
    const versions = [
      { 
        key: 'v1', 
        ...this.versionConfig.v1,
        available: true,
        current: this.currentVersion === 'v1'
      }
    ];

    if (this.canAccessV2(user)) {
      versions.push({
        key: 'v2',
        ...this.versionConfig.v2,
        available: true,
        current: this.currentVersion === 'v2'
      });
    }

    return versions;
  }

  /**
   * Create a simple hash from user ID for consistent rollout
   * @param {string} userId - User ID to hash
   * @returns {number} - Hash value
   */
  hashUserId(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Initialize version manager and perform version detection
   * @param {Object} user - Current user object
   * @returns {string} - Version to use
   */
  initialize(user) {
    this.currentVersion = this.getVersionForUser(user);
    
    // Log version decision for debugging
    console.log('Dashboard Version Manager:', {
      user: user?.uid || 'anonymous',
      version: this.currentVersion,
      canAccessV2: this.canAccessV2(user),
      featureFlags: this.featureFlags
    });

    return this.currentVersion;
  }
}

// Create singleton instance
export const versionManager = new DashboardVersionManager();

// Global access for debugging
if (typeof window !== 'undefined') {
  window.dashboardVersionManager = versionManager;
}