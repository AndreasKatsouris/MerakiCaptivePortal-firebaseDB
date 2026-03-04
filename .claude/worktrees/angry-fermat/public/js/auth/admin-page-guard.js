// Admin Page Guard - MUST load before any other scripts
// This file checks authentication and admin privileges before allowing page access

import { auth } from '../config/firebase-config.js';
import { AdminClaims } from './admin-claims.js';

console.log('[AdminPageGuard] Initializing admin page protection...');

// Hide page content immediately
if (document.body) {
    document.body.style.display = 'none';
}

// Listen for auth state changes
auth.onAuthStateChanged(async (user) => {
    console.log('[AdminPageGuard] Auth state changed:', user ? `User ${user.uid}` : 'No user');

    // No user - redirect to login
    if (!user) {
        console.warn('[AdminPageGuard] No authenticated user, redirecting to admin login');
        window.location.href = '/admin-login.html';
        return;
    }

    // User exists - verify admin privileges
    try {
        console.log('[AdminPageGuard] Verifying admin status for user:', user.uid);
        const isAdmin = await AdminClaims.verifyAdminStatus(user);

        if (!isAdmin) {
            console.error('[AdminPageGuard] User does not have admin privileges');
            alert('Access Denied: Admin privileges required');
            await auth.signOut();
            window.location.href = '/admin-login.html';
            return;
        }

        // Admin verified - show page
        console.log('[AdminPageGuard] Admin privileges confirmed, showing page');
        if (document.body) {
            document.body.style.display = 'block';
        }
    } catch (error) {
        console.error('[AdminPageGuard] Error verifying admin status:', error);
        alert('Authentication error. Please try logging in again.');
        window.location.href = '/admin-login.html';
    }
});

// Timeout fallback - if auth doesn't resolve in 5 seconds, redirect
setTimeout(() => {
    if (document.body && document.body.style.display === 'none') {
        console.warn('[AdminPageGuard] Auth check timeout, redirecting to login');
        window.location.href = '/admin-login.html';
    }
}, 5000);
