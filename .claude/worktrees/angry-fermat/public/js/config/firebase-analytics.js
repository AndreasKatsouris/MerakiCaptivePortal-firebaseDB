/**
 * Firebase Analytics Module
 * 
 * Provides functions for logging various analytics events in the application.
 * Uses the Firebase Analytics SDK to track user behavior and page interactions.
 */

import { getAnalytics, logEvent } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js';
import { app } from './firebase-config.js';

// Initialize Firebase Analytics
let analytics;
try {
    analytics = getAnalytics(app);
    console.log('Firebase Analytics initialized successfully');
} catch (error) {
    console.error('Error initializing Firebase Analytics:', error);
}

/**
 * Logs a page view event
 * @param {string} pageName - The name of the page being viewed
 */
export function logPageView(pageName) {
    if (!analytics) {
        console.error('Analytics not initialized. Cannot log page view.');
        return;
    }
    
    try {
        logEvent(analytics, 'page_view', {
            page_name: pageName,
            page_location: window.location.href,
            page_path: window.location.pathname,
            timestamp: Date.now()
        });
        console.log(`Page view logged: ${pageName}`);
    } catch (error) {
        console.error('Error logging page view:', error);
        throw error; // Rethrow to allow caller to handle it
    }
}

/**
 * Logs a form submission event
 * @param {Object} formData - The data submitted via the form
 */
export function logFormSubmission(formData) {
    if (!analytics) {
        console.error('Analytics not initialized. Cannot log form submission.');
        return;
    }
    
    try {
        const sanitizedData = {
            form_id: 'login_form',
            form_name: 'WiFi Login Form',
            has_name: !!formData.name,
            has_email: !!formData.email,
            has_phone: !!formData.phoneNumber,
            has_table: !!formData.table,
            timestamp: Date.now()
        };
        
        logEvent(analytics, 'form_submission', sanitizedData);
        console.log('Form submission logged with analytics');
    } catch (error) {
        console.error('Error logging form submission:', error);
        throw error; // Rethrow to allow caller to handle it
    }
}

/**
 * Logs a WiFi connection event
 * @param {Object} connectionData - Data about the WiFi connection
 */
export function logWiFiConnection(connectionData) {
    if (!analytics) {
        console.error('Analytics not initialized. Cannot log WiFi connection.');
        return;
    }
    
    try {
        const connectionInfo = {
            session_id: connectionData.sessionID,
            duration: connectionData.duration || 3600,
            connection_type: 'guest_wifi',
            timestamp: Date.now()
        };
        
        logEvent(analytics, 'wifi_connection', connectionInfo);
        console.log('WiFi connection logged with analytics');
    } catch (error) {
        console.error('Error logging WiFi connection:', error);
        throw error; // Rethrow to allow caller to handle it
    }
}

/**
 * Logs a custom event
 * @param {string} eventName - The name of the custom event
 * @param {Object} eventParams - Parameters associated with the event
 */
export function logCustomEvent(eventName, eventParams = {}) {
    if (!analytics) {
        console.error('Analytics not initialized. Cannot log custom event.');
        return;
    }
    
    try {
        // Add timestamp to all events
        const params = {
            ...eventParams,
            timestamp: Date.now()
        };
        
        logEvent(analytics, eventName, params);
        console.log(`Custom event logged: ${eventName}`);
    } catch (error) {
        console.error(`Error logging custom event ${eventName}:`, error);
        throw error; // Rethrow to allow caller to handle it
    }
}
