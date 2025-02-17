import { authManager } from '../auth/auth.js';
import { AdminUserManagement } from './user-management.js';

class AdminLoginComponent {
    constructor() {
        this.form = document.getElementById('loginForm');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.errorDiv = document.getElementById('error-message');
        this.loadingIndicator = document.getElementById('loading-indicator');
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.form.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.handleAdminLogin(event);
        });
    }

    async handleAdminLogin(event) {
        event.preventDefault();
        
        const email = this.emailInput.value;
        const password = this.passwordInput.value;
        
        try {
            this.setLoading(true);
            this.clearError();
            
            // Use core auth service for sign in
            const user = await authManager.signIn(email, password);
            
            // Verify admin status
            const isAdmin = await AdminUserManagement.verifyAdminStatus(user.uid);
            
            if (!isAdmin) {
                await authManager.signOut();
                this.showError('Access denied. You do not have admin privileges.');
                return;
            }
            
            // Redirect to admin dashboard
            window.location.href = '/admin-dashboard.html';
        } catch (error) {
            console.error('Admin login error:', error);
            let errorMessage = 'Login failed. Please check your credentials and try again.';
            
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                errorMessage = 'Invalid email or password.';
            }
            
            this.showError(errorMessage);
        } finally {
            this.setLoading(false);
        }
    }

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
