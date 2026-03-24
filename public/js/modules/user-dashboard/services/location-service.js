/**
 * Location Service
 * Handles location CRUD operations via Firebase RTDB
 */

import { rtdb, ref, get, set, push, update } from '../../../config/firebase-config.js'

/**
 * Fetch all locations for a user
 * Reads userLocations index, then fetches each location in parallel
 * @param {string} uid - User ID
 * @returns {Promise<Array<Object>>} Array of location objects with id
 */
export async function fetchUserLocations(uid) {
  const locationsSnapshot = await get(ref(rtdb, `userLocations/${uid}`))
  const userLocationsData = locationsSnapshot.val()

  if (!userLocationsData) return []

  const locationIds = Object.keys(userLocationsData)

  const locationPromises = locationIds.map(async (locationId) => {
    const locationSnapshot = await get(ref(rtdb, `locations/${locationId}`))
    if (locationSnapshot.exists()) {
      return {
        id: locationId,
        ...locationSnapshot.val()
      }
    }
    return null
  })

  const locationResults = await Promise.all(locationPromises)
  return locationResults.filter(location => location !== null)
}

/**
 * Create a new location
 * @param {string} uid - User ID
 * @param {Object} locationData - Location data (name, address, phone, type, timezone)
 * @returns {Promise<Object>} Created location with id
 */
export async function createLocation(uid, locationData) {
  const newLocationRef = push(ref(rtdb, 'locations'))
  const locationId = newLocationRef.key

  const fullLocationData = {
    ...locationData,
    status: 'active',
    createdAt: Date.now(),
    createdBy: uid,
    userId: uid
  }

  await set(newLocationRef, fullLocationData)
  await set(ref(rtdb, `userLocations/${uid}/${locationId}`), true)

  return {
    id: locationId,
    ...fullLocationData
  }
}

/**
 * Update an existing location
 * @param {string} locationId - Location ID
 * @param {Object} data - Fields to update
 * @returns {Promise<void>}
 */
export async function updateLocation(locationId, data) {
  const updateData = {
    ...data,
    updatedAt: Date.now()
  }
  await update(ref(rtdb, `locations/${locationId}`), updateData)
}

/**
 * Delete a location using atomic multi-path delete
 * @param {string} uid - User ID
 * @param {string} locationId - Location ID
 * @returns {Promise<void>}
 */
export async function removeLocation(uid, locationId) {
  const updates = {
    [`userLocations/${uid}/${locationId}`]: null,
    [`locations/${locationId}`]: null
  }
  await update(ref(rtdb), updates)
}
