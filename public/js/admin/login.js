import { authManager } from '../auth/auth.js';
import { AdminUserManagement } from './user-management.js';

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
        this.form = document.getElementById('loginForm');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.errorDiv = document.getElementById('error-message');
        this.loadingIndicator = document.getElementById('loading-indicator');
        
        // Check if user is already logged in as admin
        this.checkExistingAdminSession();
        this.setupEventListeners();
    }

    /**
     * Check if there's an existing admin session
     */
    async checkExistingAdminSession() {
        try {
            // Initialize auth and wait for state
            const user = await authManager.initialize();
            
            if (user) {
                // If user exists, verify admin status
                const isAdmin = await AdminUserManagement.verifyAdminStatus(user.uid);
                if (isAdmin) {
                    // If admin, redirect to dashboard
                    window.location.href = '/admin-dashboard.html';
                } else {
                    // If not admin, sign out
                    await authManager.signOut();
                }
            }
        } catch (error) {
            console.error('Session check failed:', error);
        }
    }

    /**
     * Set up event listeners for the login form
     */
    setupEventListeners() {
        this.form.addEventListener('submit', async (event) => {
            event.preventDefault();
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
        const password = this.passwordInput.value;
        
        try {
            this.setLoading(true);
            this.clearError();
            
            // Step 1: Basic authentication using core auth
            const user = await authManager.signIn(email, password);
            
            // Step 2: Admin verification
            const isAdmin = await AdminUserManagement.verifyAdminStatus(user.uid);
            
            if (!isAdmin) {
                // Step 3: Handle non-admin user
                await authManager.signOut();
                this.showError('Access denied. You do not have admin privileges.');
                return;
            }

            // Step 4: Initialize admin session
            await this.initializeAdminSession(user);
            
            // Step 5: Redirect to admin dashboard
            window.location.href = '/admin-dashboard.html';
        } catch (error) {
            console.error('Admin login error:', error);
            this.handleAdminLoginError(error);
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Initialize admin session with necessary privileges and settings
     */
    async initializeAdminSession(user) {
        try {
            // Ensure fresh token with admin claims
            await user.getIdToken(true);
            
            // Set up admin-specific session data
            localStorage.setItem('lastAdminLogin', new Date().toISOString());
        } catch (error) {
            console.error('Failed to initialize admin session:', error);
            throw error;
        }
    }

    /**
     * Handle admin-specific login errors
     */
    handleAdminLoginError(error) {
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
        
        this.showError(errorMessage);
    }

    /**
     * UI Helpers
     */
    setLoading(isLoading) {
        this.loadingIndicator.style.display = isLoading ? 'block' : 'none';
        this.form.querySelectorAll('input, button').forEach(el => {
            el.disabled = isLoading;
        });
    }

    showError(message) {
        this.errorDiv.textContent = message;
        this.errorDiv.style.display = 'block';
    }

    clearError() {
        this.errorDiv.textContent = '';
        this.errorDiv.style.display = 'none';
    }
}

// Initialize admin login component
const adminLogin = new AdminLoginComponent();
