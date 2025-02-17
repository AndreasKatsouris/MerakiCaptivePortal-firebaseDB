import { authManager } from '../auth/auth.js';
import { AdminClaims } from '../auth/admin-claims.js';

/**
 * AdminLoginComponent handles admin-specific authentication
 * This includes:
 * 1. Admin-specific login UI
 * 2. Admin access verification
 * 3. Admin-specific error handling
 * 4. Admin session management
 */
class AdminLoginComponent {
    constructor() {
        console.log('[AdminLogin] Initializing AdminLoginComponent');
        this.form = document.getElementById('loginForm');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.errorDiv = document.getElementById('error-message');
        this.loadingIndicator = document.getElementById('loading-indicator');
        
        // Check if user is already logged in as admin
        this.checkExistingAdminSession();
        this.setupEventListeners();
        console.log('[AdminLogin] Component initialized');
    }

    /**
     * Check if there's an existing admin session
     */
    async checkExistingAdminSession() {
        console.log('[AdminLogin] Checking existing admin session');
        try {
            // Initialize auth and wait for state
            console.log('[AdminLogin] Initializing auth manager');
            const user = await authManager.initialize();
            
            if (user) {
                console.log('[AdminLogin] Found existing user:', user.uid);
                // If user exists, verify admin status
                console.log('[AdminLogin] Verifying admin status');
                const isAdmin = await AdminClaims.verifyAdminStatus(user);
                
                if (isAdmin) {
                    console.log('[AdminLogin] User is admin, redirecting to dashboard');
                    // If admin, redirect to dashboard
                    window.location.href = '/admin-dashboard.html';
                } else {
                    console.log('[AdminLogin] User is not admin, signing out');
                    // If not admin, sign out
                    await authManager.signOut();
                }
            } else {
                console.log('[AdminLogin] No existing user found');
            }
        } catch (error) {
            console.error('[AdminLogin] Session check failed:', error);
        }
    }

    /**
     * Set up event listeners for the login form
     */
    setupEventListeners() {
        console.log('[AdminLogin] Setting up event listeners');
        this.form.addEventListener('submit', async (event) => {
            event.preventDefault();
            console.log('[AdminLogin] Login form submitted');
            await this.handleAdminLogin();
        });
    }

    /**
     * Handle admin login attempt
     * This method:
     * 1. Uses core auth for basic authentication
     * 2. Verifies admin privileges
     * 3. Manages admin-specific error states
     * 4. Handles admin session initialization
     */
    async handleAdminLogin() {
        const email = this.emailInput.value;
        console.log('[AdminLogin] Attempting login for:', email);
        
        try {
            this.setLoading(true);
            this.clearError();
            
            // Step 1: Basic authentication using core auth
            console.log('[AdminLogin] Attempting basic authentication');
            const user = await authManager.signIn(email, this.passwordInput.value);
            console.log('[AdminLogin] Basic authentication successful');
            
            // Step 2: Admin verification
            console.log('[AdminLogin] Verifying admin privileges');
            const isAdmin = await AdminClaims.verifyAdminStatus(user);
            
            if (!isAdmin) {
                console.log('[AdminLogin] User is not admin, signing out');
                // Step 3: Handle non-admin user
                await authManager.signOut();
                this.showError('Access denied. You do not have admin privileges.');
                return;
            }

            console.log('[AdminLogin] Admin verification successful');

            // Step 4: Initialize admin session
            console.log('[AdminLogin] Initializing admin session');
            await this.initializeAdminSession(user);
            
            // Step 5: Redirect to admin dashboard
            console.log('[AdminLogin] Redirecting to dashboard');
            window.location.href = '/admin-dashboard.html';
        } catch (error) {
            console.error('[AdminLogin] Login error:', error);
            this.handleAdminLoginError(error);
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Initialize admin session with necessary privileges and settings
     */
    async initializeAdminSession(user) {
        console.log('[AdminLogin] Starting admin session initialization');
        try {
            // Ensure fresh token with admin claims
            console.log('[AdminLogin] Refreshing token');
            await user.getIdToken(true);
            
            // Set up admin-specific session data
            console.log('[AdminLogin] Setting session data');
            localStorage.setItem('lastAdminLogin', new Date().toISOString());
            console.log('[AdminLogin] Session initialization complete');
        } catch (error) {
            console.error('[AdminLogin] Session initialization failed:', error);
            throw error;
        }
    }

    /**
     * Handle admin-specific login errors
     */
    handleAdminLoginError(error) {
        console.log('[AdminLogin] Handling error:', error);
        let errorMessage = 'Login failed. Please check your credentials and try again.';
        
        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                errorMessage = 'Invalid email or password.';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many failed attempts. Please try again later.';
                break;
            case 'auth/user-disabled':
                errorMessage = 'This admin account has been disabled.';
                break;
            default:
                errorMessage = 'An error occurred during login. Please try again.';
        }
        
        console.log('[AdminLogin] Showing error message:', errorMessage);
        this.showError(errorMessage);
    }

    /**
     * UI Helpers
     */
    setLoading(isLoading) {
        console.log('[AdminLogin] Setting loading state:', isLoading);
        this.loadingIndicator.style.display = isLoading ? 'block' : 'none';
        this.form.querySelectorAll('input, button').forEach(el => {
            el.disabled = isLoading;
        });
    }

    showError(message) {
        console.log('[AdminLogin] Showing error:', message);
        this.errorDiv.textContent = message;
        this.errorDiv.style.display = 'block';
    }

    clearError() {
        console.log('[AdminLogin] Clearing error messages');
        this.errorDiv.textContent = '';
        this.errorDiv.style.display = 'none';
    }
}

// Initialize admin login component
console.log('[AdminLogin] Creating AdminLoginComponent instance');
const adminLogin = new AdminLoginComponent();
