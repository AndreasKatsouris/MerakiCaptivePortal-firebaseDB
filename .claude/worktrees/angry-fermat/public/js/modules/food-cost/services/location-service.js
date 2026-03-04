/**
 * Location Service for Food Cost Module
 * Handles fetching and managing user locations
 */

import { auth, rtdb, ref, get } from '../../../config/firebase-config.js';

export const LocationService = {
    /**
     * Get all locations for the current user
     * @returns {Promise<Array>} Array of location objects
     */
    async getUserLocations() {
        try {
            const user = auth.currentUser;
            if (!user) {
                console.error('[LocationService] No authenticated user');
                return [];
            }

            // Get user's location IDs
            const userLocationsRef = ref(rtdb, `userLocations/${user.uid}`);
            const userLocationsSnapshot = await get(userLocationsRef);
            
            if (!userLocationsSnapshot.exists()) {
                console.log('[LocationService] No locations found for user');
                return [];
            }

            const locationIds = Object.keys(userLocationsSnapshot.val());
            const locations = [];

            // Fetch each location's details
            for (const locationId of locationIds) {
                const locationRef = ref(rtdb, `locations/${locationId}`);
                const locationSnapshot = await get(locationRef);
                
                if (locationSnapshot.exists()) {
                    const locationData = locationSnapshot.val();
                    locations.push({
                        id: locationId,
                        ...locationData,
                        displayName: this.formatLocationDisplay(locationData)
                    });
                }
            }

            console.log('[LocationService] Found locations:', locations);
            return locations;

        } catch (error) {
            console.error('[LocationService] Error fetching locations:', error);
            return [];
        }
    },

    /**
     * Format location display name
     * @param {Object} location - Location data
     * @returns {string} Formatted display name
     */
    formatLocationDisplay(location) {
        let display = location.name;
        
        // Add brand name if different from business name
        if (location.brandName && location.brandName !== location.name) {
            display = `${location.brandName} - ${location.name}`;
        }
        
        // Add franchise info if applicable
        if (location.isFranchise && location.franchiseName) {
            display += ` (${location.franchiseName})`;
        }
        
        return display;
    },

    /**
     * Get a single location by ID
     * @param {string} locationId - Location ID
     * @returns {Promise<Object|null>} Location object or null
     */
    async getLocationById(locationId) {
        try {
            const locationRef = ref(rtdb, `locations/${locationId}`);
            const snapshot = await get(locationRef);
            
            if (snapshot.exists()) {
                const locationData = snapshot.val();
                return {
                    id: locationId,
                    ...locationData,
                    displayName: this.formatLocationDisplay(locationData)
                };
            }
            
            return null;
        } catch (error) {
            console.error('[LocationService] Error fetching location:', error);
            return null;
        }
    },

    /**
     * Check if user has multiple locations
     * @returns {Promise<boolean>} True if user has multiple locations
     */
    async hasMultipleLocations() {
        const locations = await this.getUserLocations();
        return locations.length > 1;
    },

    /**
     * Get default location (first location)
     * @returns {Promise<Object|null>} Default location or null
     */
    async getDefaultLocation() {
        const locations = await this.getUserLocations();
        return locations.length > 0 ? locations[0] : null;
    }
};
