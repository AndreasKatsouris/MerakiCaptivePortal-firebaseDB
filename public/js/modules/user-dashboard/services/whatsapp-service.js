/**
 * WhatsApp Service
 * Handles WhatsApp mapping operations via Cloud Functions
 */

import { auth } from '../../../config/firebase-config.js'

const WHATSAPP_API_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/getUserWhatsAppNumbers'

/**
 * Fetch WhatsApp mappings for the current user's locations
 * @returns {Promise<Object>} WhatsApp mappings and tier limits
 */
export async function fetchWhatsAppMappings() {
  const user = auth.currentUser
  if (!user) {
    return { locationMappings: [], tierLimits: {} }
  }

  const token = await user.getIdToken()
  const response = await fetch(WHATSAPP_API_URL, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`WhatsApp API responded with status ${response.status}`)
  }

  const data = await response.json()

  if (!data.success) {
    throw new Error('WhatsApp API returned unsuccessful response')
  }

  return {
    locationMappings: data.locationMappings || [],
    tierLimits: data.tierLimits || {}
  }
}

/**
 * Find WhatsApp mapping for a specific location
 * @param {Array<Object>} mappings - All WhatsApp mappings
 * @param {string} locationId - Location ID to find
 * @returns {Object|undefined} Matching mapping or undefined
 */
export function findMappingForLocation(mappings, locationId) {
  return mappings.find(m => m.locationId === locationId)
}

/**
 * Check if a location has active WhatsApp
 * @param {Array<Object>} mappings - All WhatsApp mappings
 * @param {string} locationId - Location ID
 * @returns {boolean} Whether WhatsApp is active for this location
 */
export function isWhatsAppActive(mappings, locationId) {
  const mapping = findMappingForLocation(mappings, locationId)
  return !!(mapping && mapping.isActive)
}
