import { auth } from '../auth/auth.js';
import { AdminClaims } from '../auth/admin-claims.js';

class LoginComponent {
    constructor() {
        this.initialized = false;
        this.form = document.getElementById('loginForm');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            await auth.initialize();
            this.setupEventListeners();
            this.initialized = true;
        } catch (error) {
            console.error('Login component initialization failed:', error);
            throw error;
        }
    }

    setupEventListeners() {
        this.form.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.handleLogin();
        });
    }

    async handleLogin() {
        try {
            const email = this.emailInput.value;
            const password = this.passwordInput.value;

            // Attempt login
            const user = await auth.login(email, password);
            
            // Verify and set admin status
            const adminStatus = await AdminClaims.setAdminClaim(user);
            
            if (!adminStatus.success) {
                await auth.logout();
                throw new Error('Admin access required');
            }

            // Redirect to dashboard
            window.location.href = '/admin-dashboard.html';
        } catch (error) {
            console.error('Login failed:', error);
            alert(error.message);
        }
    }
}

// Initialize login component
const loginComponent = new LoginComponent();
loginComponent.initialize();
