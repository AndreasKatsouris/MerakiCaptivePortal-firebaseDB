/**
 * User Login Module
 * Handles user authentication for the Laki Sparks platform
 */

import { auth, rtdb, ref, get, signInWithEmailAndPassword, onAuthStateChanged } from './config/firebase-config.js';
import { showToast } from './utils/toast.js';

class UserLoginManager {
    constructor() {
        this.init();
    }

    async init() {
        // Check if user is already logged in
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Check if user is a regular user (not admin)
                const userSnapshot = await get(ref(rtdb, `users/${user.uid}`));
                const userData = userSnapshot.val();
                
                if (userData && userData.role === 'user') {
                    // Redirect to user dashboard
                    window.location.href = '/user-dashboard.html';
                }
            }
        });

        this.setupEventListeners();
        this.checkForMessages();
    }

    setupEventListeners() {
        const loginForm = document.getElementById('loginForm');
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        // Handle remember me
        const rememberMe = document.getElementById('rememberMe');
        const savedEmail = localStorage.getItem('rememberedEmail');
        if (savedEmail) {
            document.getElementById('email').value = savedEmail;
            rememberMe.checked = true;
        }
    }

    checkForMessages() {
        // Check for redirect messages
        const urlParams = new URLSearchParams(window.location.search);
        const message = urlParams.get('message');
        
        if (message === 'logout') {
            this.showAlert('You have been logged out successfully.', 'success');
        } else if (message === 'unauthorized') {
            this.showAlert('Please log in to access that page.', 'warning');
        } else if (message === 'session-expired') {
            this.showAlert('Your session has expired. Please log in again.', 'warning');
        }
    }

    showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alertContainer');
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        alertContainer.appendChild(alertDiv);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    }

    async handleLogin() {
        const loginBtn = document.getElementById('loginBtn');
        const loginBtnText = document.getElementById('loginBtnText');
        const loginBtnSpinner = document.getElementById('loginBtnSpinner');

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;

        // Validate inputs
        if (!email || !password) {
            showToast('Please enter both email and password', 'error');
            return;
        }

        // Show loading state
        loginBtn.disabled = true;
        loginBtnText.textContent = 'Logging in...';
        loginBtnSpinner.style.display = 'inline-block';

        try {
            // Sign in user
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Verify user role
            const userSnapshot = await get(ref(rtdb, `users/${user.uid}`));
            const userData = userSnapshot.val();

            if (!userData) {
                throw new Error('User data not found');
            }

            if (userData.role !== 'user') {
                // Not a regular user, sign out and show error
                await auth.signOut();
                throw new Error('Invalid user type. Please use the admin login for administrator accounts.');
            }

            // Check subscription status
            const subscriptionSnapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
            const subscription = subscriptionSnapshot.val();

            if (!subscription) {
                throw new Error('No subscription found for this account');
            }

            // Check if account is active
            if (userData.status !== 'active') {
                await auth.signOut();
                throw new Error('Your account is not active. Please contact support.');
            }

            // Handle remember me
            if (rememberMe) {
                localStorage.setItem('rememberedEmail', email);
            } else {
                localStorage.removeItem('rememberedEmail');
            }

            // Update last login
            await set(ref(rtdb, `users/${user.uid}/lastLogin`), Date.now());

            showToast('Login successful! Redirecting...', 'success');

            // Redirect to user dashboard
            setTimeout(() => {
                window.location.href = '/user-dashboard.html';
            }, 1000);

        } catch (error) {
            console.error('Login error:', error);

            // Handle specific error cases
            if (error.code === 'auth/user-not-found') {
                this.showAlert('No account found with this email address.', 'danger');
            } else if (error.code === 'auth/wrong-password') {
                this.showAlert('Incorrect password. Please try again.', 'danger');
            } else if (error.code === 'auth/invalid-email') {
                this.showAlert('Invalid email address format.', 'danger');
            } else if (error.code === 'auth/user-disabled') {
                this.showAlert('This account has been disabled. Please contact support.', 'danger');
            } else if (error.code === 'auth/too-many-requests') {
                this.showAlert('Too many failed login attempts. Please try again later.', 'danger');
            } else if (error.message) {
                this.showAlert(error.message, 'danger');
            } else {
                this.showAlert('Login failed. Please try again.', 'danger');
            }
        } finally {
            // Reset button state
            loginBtn.disabled = false;
            loginBtnText.textContent = 'Log In';
            loginBtnSpinner.style.display = 'none';
        }
    }
}

// Initialize login manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new UserLoginManager();
});
