/**
 * Session Expiry Handler
 * Monitors auth state and redirects to login when session expires
 */

import { auth, onAuthStateChanged } from '../config/firebase-config.js';

/**
 * List of protected pages that require authentication
 * These pages will redirect to login if session expires
 */
const PROTECTED_PAGES = [
    'user-dashboard.html',
    'guest-management.html',
    'queue-management.html',
    'bookings.html',
    'food-cost-analytics.html',
    'campaigns.html',
    'analytics.html',
    'user-subscription.html',
    'receipt-settings.html',
    'receipt-management.html',
    'reward-management.html',
    'admin-dashboard.html',
    'onboarding-wizard.html'
];

/**
 * Check if current page is a protected page
 * @returns {boolean}
 */
function isProtectedPage() {
    const currentPage = window.location.pathname.split('/').pop();
    return PROTECTED_PAGES.some(page => currentPage.includes(page));
}

/**
 * Redirect to login with session expiry message
 */
function redirectToLogin() {
    console.log('🔒 [SessionExpiry] Session expired, redirecting to login');

    // Store the message in sessionStorage so login page can display it
    sessionStorage.setItem('sessionExpired', 'true');
    sessionStorage.setItem('sessionExpiredMessage', 'Session expired, please log in');

    // Store the attempted URL to redirect back after login
    sessionStorage.setItem('redirectAfterLogin', window.location.href);

    // Redirect to login page
    window.location.href = '/user-login.html';
}

/**
 * Initialize session expiry monitoring
 * This function should be called on every protected page
 */
export function initSessionExpiryHandler() {
    console.log('🔧 [SessionExpiry] Initializing session expiry handler');

    // Only monitor session on protected pages
    if (!isProtectedPage()) {
        console.log('📖 [SessionExpiry] Not a protected page, skipping');
        return;
    }

    console.log('🔒 [SessionExpiry] Protected page detected, monitoring session');

    let previousAuthState = null;
    let isInitialLoad = true;

    // Monitor auth state changes
    onAuthStateChanged(auth, (user) => {
        console.log('🔄 [SessionExpiry] Auth state changed:', user ? `User: ${user.uid}` : 'No user');

        // On initial page load, just record the state
        if (isInitialLoad) {
            previousAuthState = user;
            isInitialLoad = false;

            // If no user on initial load of protected page, redirect immediately
            if (!user) {
                console.log('⚠️ [SessionExpiry] No user on initial load of protected page');
                redirectToLogin();
            }
            return;
        }

        // If user was logged in but is now null, session has expired
        if (previousAuthState && !user) {
            console.log('⚠️ [SessionExpiry] User was logged in, now logged out - session expired');
            redirectToLogin();
            return;
        }

        // Update previous state
        previousAuthState = user;
    });

    // Also monitor token refresh failures (indicates expired token)
    if (auth.currentUser) {
        auth.currentUser.getIdToken(false).catch((error) => {
            console.error('❌ [SessionExpiry] Token refresh failed:', error);
            if (error.code === 'auth/user-token-expired' || error.code === 'auth/id-token-expired') {
                console.log('⚠️ [SessionExpiry] Token expired, redirecting to login');
                redirectToLogin();
            }
        });
    }
}

/**
 * Manually expire the current session (for testing)
 * This signs out the user and clears local storage
 */
export async function expireSession() {
    console.log('🔧 [SessionExpiry] Manually expiring session for testing');
    try {
        await auth.signOut();
        console.log('✅ [SessionExpiry] Session expired successfully');
    } catch (error) {
        console.error('❌ [SessionExpiry] Error expiring session:', error);
    }
}

/**
 * Check if session expiry message should be displayed
 * This function should be called on login page
 * @returns {string|null} The session expiry message, or null if no message
 */
export function getSessionExpiryMessage() {
    const sessionExpired = sessionStorage.getItem('sessionExpired');
    const message = sessionStorage.getItem('sessionExpiredMessage');

    if (sessionExpired === 'true' && message) {
        // Clear the flags after retrieving
        sessionStorage.removeItem('sessionExpired');
        sessionStorage.removeItem('sessionExpiredMessage');
        return message;
    }

    return null;
}

/**
 * Get redirect URL after login (if user was redirected from protected page)
 * @returns {string|null}
 */
export function getRedirectAfterLogin() {
    const redirectUrl = sessionStorage.getItem('redirectAfterLogin');
    if (redirectUrl) {
        sessionStorage.removeItem('redirectAfterLogin');
        return redirectUrl;
    }
    return null;
}
