import { auth, signInWithEmailAndPassword, signOut } from '../config/firebase-config.js';
import { AdminClaims } from '../auth/admin-claims.js';

// Initialize Firebase (make sure to replace with your config)
const firebaseConfig = {
    // Your firebase config here
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

class LoginComponent {
    constructor() {
        this.form = document.getElementById('loginForm');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.errorDiv = document.getElementById('error-message');
        this.initialize();
    }

    initialize() {
        // Check if user is already logged in
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                const isAdmin = await AdminClaims.verifyAdminStatus(user);
                if (isAdmin) {
                    window.location.href = '/admin-dashboard.html';
                }
            }
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.form.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.handleLogin();
        });
    }

    async handleLogin() {
        try {
            this.setLoading(true);
            this.clearError();

            const email = this.emailInput.value;
            const password = this.passwordInput.value;

            // Attempt login
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Verify admin status
            const isAdmin = await AdminClaims.verifyAdminStatus(user);
            
            if (!isAdmin) {
                await signOut(auth);
                throw new Error('You do not have admin privileges');
            }

            // Force token refresh to get latest claims
            await AdminClaims.refreshToken(user);

            // Redirect to dashboard
            window.location.href = '/admin-dashboard.html';
        } catch (error) {
            console.error('Login failed:', error);
            this.showError(this.getErrorMessage(error));
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(isLoading) {
        this.form.classList.toggle('loading', isLoading);
        this.emailInput.disabled = isLoading;
        this.passwordInput.disabled = isLoading;
    }

    showError(message) {
        this.errorDiv.textContent = message;
        this.errorDiv.style.display = 'block';
    }

    clearError() {
        this.errorDiv.textContent = '';
        this.errorDiv.style.display = 'none';
    }

    getErrorMessage(error) {
        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                return 'Invalid email or password';
            case 'auth/too-many-requests':
                return 'Too many failed attempts. Please try again later';
            default:
                return error.message;
        }
    }
}

// Initialize login component
new LoginComponent();
