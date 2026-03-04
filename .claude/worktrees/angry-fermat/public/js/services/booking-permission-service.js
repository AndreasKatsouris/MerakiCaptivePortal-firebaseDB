import { auth, rtdb, ref, get } from '../config/firebase-config.js';
import { AdminClaims } from '../auth/admin-claims.js';

/**
 * Service for managing booking permissions based on location access and admin status
 */
export class BookingPermissionService {
    /**
     * Check if current user can manage bookings for a specific booking
     * @param {Object} booking - Booking object with location information
     * @param {Object} user - Firebase user object (optional, defaults to current user)
     * @returns {Promise<Object>} Permission result with access status and reason
     */
    static async canManageBooking(booking, user = null) {
        console.log('[BookingPermissionService] Checking booking management permissions...');
        
        const currentUser = user || auth.currentUser;
        if (!currentUser) {
            return {
                hasAccess: false,
                reason: 'User not authenticated',
                accessLevel: 'none'
            };
        }

        try {
            // Check admin status first (highest priority)
            console.log('[BookingPermissionService] Checking admin status...');
            const isAdmin = await AdminClaims.verifyAdminStatus(currentUser);
            if (isAdmin) {
                console.log('[BookingPermissionService] Admin access granted');
                return {
                    hasAccess: true,
                    reason: 'Admin privileges',
                    accessLevel: 'admin'
                };
            }

            // Check location-based permissions
            if (!booking || !booking.location) {
                return {
                    hasAccess: false,
                    reason: 'Booking location not specified',
                    accessLevel: 'none'
                };
            }

            console.log('[BookingPermissionService] Checking location-based permissions for location:', booking.location);
            const locationAccess = await this.hasLocationAccess(booking.location, currentUser.uid);
            
            if (locationAccess.hasAccess) {
                console.log('[BookingPermissionService] Location access granted:', locationAccess.accessType);
                return {
                    hasAccess: true,
                    reason: `Location ${locationAccess.accessType}`,
                    accessLevel: 'location_manager'
                };
            }

            console.log('[BookingPermissionService] Access denied - no location permissions');
            return {
                hasAccess: false,
                reason: 'No permissions for this location',
                accessLevel: 'none'
            };

        } catch (error) {
            console.error('[BookingPermissionService] Error checking permissions:', error);
            return {
                hasAccess: false,
                reason: 'Permission check failed: ' + error.message,
                accessLevel: 'error'
            };
        }
    }

    /**
     * Check if user has access to a specific location (ownership or management)
     * @param {string} locationId - Location identifier
     * @param {string} userId - User identifier
     * @returns {Promise<Object>} Location access result
     */
    static async hasLocationAccess(locationId, userId) {
        try {
            console.log('[BookingPermissionService] Checking location access for user:', userId, 'location:', locationId);

            // Check if user owns the location
            console.log('[BookingPermissionService] Checking location ownership...');
            const locationRef = ref(rtdb, `locations/${locationId}`);
            const locationSnapshot = await get(locationRef);
            
            if (locationSnapshot.exists()) {
                const locationData = locationSnapshot.val();
                if (locationData.ownerId === userId) {
                    console.log('[BookingPermissionService] User owns the location');
                    return {
                        hasAccess: true,
                        accessType: 'owner'
                    };
                }
            }

            // Check if user is assigned to manage the location
            console.log('[BookingPermissionService] Checking location assignment...');
            const userLocationRef = ref(rtdb, `userLocations/${userId}/${locationId}`);
            const userLocationSnapshot = await get(userLocationRef);
            
            if (userLocationSnapshot.exists()) {
                console.log('[BookingPermissionService] User is assigned to location');
                return {
                    hasAccess: true,
                    accessType: 'manager'
                };
            }

            console.log('[BookingPermissionService] No location access found');
            return {
                hasAccess: false,
                accessType: 'none'
            };

        } catch (error) {
            console.error('[BookingPermissionService] Error checking location access:', error);
            return {
                hasAccess: false,
                accessType: 'error',
                error: error.message
            };
        }
    }

    /**
     * Get all locations the user can manage
     * @param {string} userId - User identifier (optional, defaults to current user)
     * @returns {Promise<Array>} Array of location IDs user can manage
     */
    static async getUserManagedLocations(userId = null) {
        try {
            const currentUser = auth.currentUser;
            const targetUserId = userId || (currentUser ? currentUser.uid : null);
            
            if (!targetUserId) {
                throw new Error('User not authenticated');
            }

            console.log('[BookingPermissionService] Getting managed locations for user:', targetUserId);

            // Check if user is admin (can manage all locations)
            const isAdmin = await AdminClaims.verifyAdminStatus(currentUser);
            if (isAdmin) {
                console.log('[BookingPermissionService] Admin user - fetching all locations');
                const locationsRef = ref(rtdb, 'locations');
                const locationsSnapshot = await get(locationsRef);
                
                if (locationsSnapshot.exists()) {
                    return Object.keys(locationsSnapshot.val());
                }
                return [];
            }

            const managedLocations = [];

            // Get owned locations
            const locationsRef = ref(rtdb, 'locations');
            const locationsSnapshot = await get(locationsRef);
            
            if (locationsSnapshot.exists()) {
                const allLocations = locationsSnapshot.val();
                Object.keys(allLocations).forEach(locationId => {
                    if (allLocations[locationId].ownerId === targetUserId) {
                        managedLocations.push(locationId);
                    }
                });
            }

            // Get assigned locations
            const userLocationsRef = ref(rtdb, `userLocations/${targetUserId}`);
            const userLocationsSnapshot = await get(userLocationsRef);
            
            if (userLocationsSnapshot.exists()) {
                const assignedLocations = Object.keys(userLocationsSnapshot.val());
                assignedLocations.forEach(locationId => {
                    if (!managedLocations.includes(locationId)) {
                        managedLocations.push(locationId);
                    }
                });
            }

            console.log('[BookingPermissionService] User can manage locations:', managedLocations);
            return managedLocations;

        } catch (error) {
            console.error('[BookingPermissionService] Error getting managed locations:', error);
            return [];
        }
    }

    /**
     * Filter bookings to only include those the user can manage
     * @param {Array} bookings - Array of booking objects
     * @param {string} userId - User identifier (optional)
     * @returns {Promise<Array>} Filtered array of bookings user can manage
     */
    static async filterManagedBookings(bookings, userId = null) {
        try {
            const managedLocations = await this.getUserManagedLocations(userId);
            const currentUser = auth.currentUser;
            const isAdmin = await AdminClaims.verifyAdminStatus(currentUser);

            // If admin, return all bookings
            if (isAdmin) {
                return bookings;
            }

            // Filter bookings by location access
            return bookings.filter(booking => {
                return managedLocations.includes(booking.location);
            });

        } catch (error) {
            console.error('[BookingPermissionService] Error filtering bookings:', error);
            return [];
        }
    }
}