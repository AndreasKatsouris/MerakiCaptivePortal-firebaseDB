/**
 * User Login Module
 * Handles user authentication for the Laki Sparks platform
 */

import { auth, rtdb, ref, get, update, signInWithEmailAndPassword, onAuthStateChanged, set } from './config/firebase-config.js';
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
                
                // If no userData or role is not explicitly 'admin', treat as regular user
                if (!userData || (userData.role !== 'admin' && userData.isAdmin !== true)) {
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

            // FIXED: Get user data with retry mechanism to avoid race conditions
            const userRef = ref(rtdb, `users/${user.uid}`);
            let userData = null;
            let retryCount = 0;
            const maxRetries = 3;

            // Retry mechanism to handle potential race conditions
            while (retryCount < maxRetries) {
                const userSnapshot = await get(userRef);
                userData = userSnapshot.val();
                
                if (userData) {
                    break; // User data found
                }
                
                retryCount++;
                if (retryCount < maxRetries) {
                    console.log(`🔄 [UserLogin] User data not found, retrying... (${retryCount}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms before retry
                }
            }

            if (!userData) {
                // FIXED: Only create minimal user profile for truly new users
                console.log(`🆕 [UserLogin] Creating new user record for: ${user.uid}`);
                // SAFETY CHECK: Double-check if user exists with minimal delay
                await new Promise(resolve => setTimeout(resolve, 100));
                const doubleCheckSnapshot = await get(userRef);
                if (doubleCheckSnapshot.exists()) {
                    console.log(`⚠️ [UserLogin] User ${user.uid} created during operation, switching to update mode`);
                    // User was created during our operation, preserve existing data
                    const existingData = doubleCheckSnapshot.val();
                    const userUpdates = {
                        ...existingData,
                        email: user.email,
                        role: existingData.role || 'user',
                        updatedAt: Date.now()
                    };
                    await update(userRef, userUpdates);
                    userData = userUpdates;
                } else {
                    // Safe to create new user
                    const newUserData = {
                        uid: user.uid,
                        email: user.email,
                        role: 'user',
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    await set(userRef, newUserData);
                    userData = newUserData;
                }
                console.log(`✅ [UserLogin] New user record created`);
            } else {
                // FIXED: User exists, preserve ALL existing data and only update login info
                console.log(`🔄 [UserLogin] Updating login info for existing user: ${user.uid}`);
                
                // SAFETY CHECK: Log if phoneNumber exists to monitor preservation
                if (userData.phoneNumber) {
                    console.log(`✅ [UserLogin] Preserving phoneNumber for user ${user.uid}:`, userData.phoneNumber);
                }
                
                // Only update login-related fields, preserve everything else
                const loginUpdates = {
                    email: user.email, // Update email in case it changed
                    lastLogin: Date.now(),
                    updatedAt: Date.now()
                };
                
                console.log(`📝 [UserLogin] Updating user ${user.uid} with preserved fields:`, {
                    preservedFields: Object.keys(userData),
                    updatedFields: Object.keys(loginUpdates),
                    hasPhoneNumber: !!(userData.phoneNumber || userData.phone || userData.businessPhone),
                    hasRole: !!userData.role,
                    hasAdminStatus: !!userData.isAdmin
                });
                
                // FIXED: Use update() instead of set() to preserve existing data
                await update(userRef, loginUpdates);
            }

            // Check if user is admin trying to access regular user login
            if (userData.role === 'admin' || userData.isAdmin === true) {
                // If explicitly marked as admin, block access
                await auth.signOut();
                throw new Error('Invalid user type. Please use the admin login for administrator accounts.');
            }
            // If role is 'user', undefined, or any other value, treat as regular user

            // Check subscription status
            const subscriptionSnapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
            const subscription = subscriptionSnapshot.val();

            if (!subscription) {
                throw new Error('No subscription found for this account');
            }

            // Check if account is active
            if (userData.status && userData.status !== 'active') {
                await auth.signOut();
                throw new Error('Your account is not active. Please contact support.');
            }

            // Handle remember me
            if (rememberMe) {
                localStorage.setItem('rememberedEmail', email);
            } else {
                localStorage.removeItem('rememberedEmail');
            }

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
            } else if (error.code === 'auth/invalid-credential') {
                this.showAlert('Invalid credentials', 'danger');
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
