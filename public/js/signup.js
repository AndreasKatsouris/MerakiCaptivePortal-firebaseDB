/**
 * Platform Signup Module
 * Handles user registration for the Laki Sparks platform
 */

import { auth, rtdb, ref, get, functions, httpsCallable } from './config/firebase-config.js';
import { createUserWithEmailAndPassword, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { showToast } from './utils/toast.js';

class SignupManager {
    constructor() {
        this.selectedTier = null;
        this.tiers = {};
        this.init();
    }

    async init() {
        await this.loadTiers();
        this.setupEventListeners();
    }

    async loadTiers() {
        try {
            const tiersSnapshot = await get(ref(rtdb, 'subscriptionTiers'));
            this.tiers = tiersSnapshot.val() || {};
            this.renderTiers();
        } catch (error) {
            console.error('Error loading tiers:', error);
            showToast('Error loading subscription plans', 'error');
        }
    }

    renderTiers() {
        const tierCardsContainer = document.getElementById('tierCards');
        tierCardsContainer.innerHTML = '';

        // Convert tiers object to array and sort by price
        const tierArray = Object.entries(this.tiers).map(([id, tier]) => ({
            id,
            ...tier
        })).sort((a, b) => (a.monthlyPrice || 0) - (b.monthlyPrice || 0));

        // If no tiers available, show a message
        if (tierArray.length === 0) {
            tierCardsContainer.innerHTML = `
                <div class="col-12 text-center">
                    <p class="text-muted">No subscription plans available at the moment.</p>
                </div>
            `;
            return;
        }

        // Render each tier
        tierArray.forEach((tier, index) => {
            const col = document.createElement('div');
            col.className = 'col-md-4';

            // Make the middle tier featured if we have 3 tiers, otherwise make the most expensive one featured
            const isFeatured = tierArray.length === 3 ? index === 1 : index === tierArray.length - 1;
            const features = tier.features || {};
            
            col.innerHTML = `
                <div class="tier-card ${isFeatured ? 'featured' : ''}">
                    ${isFeatured ? '<div class="featured-badge">Most Popular</div>' : ''}
                    <h3>${tier.name || 'Unnamed Tier'}</h3>
                    <div class="price">
                        <span class="currency">$</span>
                        <span class="amount">${tier.monthlyPrice || 0}</span>
                        <span class="period">/month</span>
                    </div>
                    <p class="description">${tier.description || ''}</p>
                    <ul class="features">
                        ${this.renderFeatures(features, tier.limits)}
                    </ul>
                    <button class="select-tier-btn ${isFeatured ? 'featured' : ''}" 
                            data-tier-id="${tier.id}">
                        Select ${tier.name || 'This Plan'}
                    </button>
                </div>
            `;

            tierCardsContainer.appendChild(col);
        });

        // Add click handlers
        document.querySelectorAll('.select-tier-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tierId = e.target.dataset.tierId;
                this.selectTier(tierId);
            });
        });
    }

    renderFeatures(features, limits) {
        const featureList = [];

        if (features.locations) {
            featureList.push(`<li><i class="fas fa-check"></i> ${features.locations} Location${features.locations > 1 ? 's' : ''}</li>`);
        }

        if (features.users) {
            featureList.push(`<li><i class="fas fa-check"></i> ${features.users} User${features.users > 1 ? 's' : ''}</li>`);
        }

        if (features.guestProfiles) {
            featureList.push(`<li><i class="fas fa-check"></i> ${features.guestProfiles === -1 ? 'Unlimited' : features.guestProfiles} Guest Profiles</li>`);
        }

        if (features.campaigns) {
            featureList.push(`<li><i class="fas fa-check"></i> ${features.campaigns === -1 ? 'Unlimited' : features.campaigns} Campaign${features.campaigns !== 1 ? 's' : ''}/month</li>`);
        }

        if (features.analytics) {
            featureList.push(`<li><i class="fas fa-check"></i> Advanced Analytics</li>`);
        }

        if (features.apiAccess) {
            featureList.push(`<li><i class="fas fa-check"></i> API Access</li>`);
        }

        if (features.support) {
            featureList.push(`<li><i class="fas fa-check"></i> ${features.support} Support</li>`);
        }

        return featureList.join('');
    }

    selectTier(tierId) {
        this.selectedTier = tierId;
        const tier = this.tiers[tierId];
        
        // Update selected tier info
        document.getElementById('selectedTierInfo').innerHTML = `
            <h4>${tier.name} Plan</h4>
            <p class="mb-0">$${tier.monthlyPrice}/month</p>
        `;

        // Show signup form section
        document.getElementById('pricingSection').style.display = 'none';
        document.getElementById('signupFormSection').style.display = 'block';
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    setupEventListeners() {
        // Back to pricing link
        document.getElementById('backToPricing').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('signupFormSection').style.display = 'none';
            document.getElementById('pricingSection').style.display = 'block';
            this.selectedTier = null;
        });

        // Signup form submission
        document.getElementById('signupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleSignup();
        });

        // Password validation
        document.getElementById('password').addEventListener('input', (e) => {
            this.validatePassword(e.target.value);
        });
    }

    validatePassword(password) {
        const requirements = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };

        // Update UI to show password requirements
        const reqList = document.querySelector('.password-requirements ul');
        const reqItems = reqList.querySelectorAll('li');
        
        reqItems[0].style.color = requirements.length ? '#4CAF50' : '#666';
        reqItems[1].style.color = requirements.uppercase && requirements.lowercase ? '#4CAF50' : '#666';
        reqItems[2].style.color = requirements.number ? '#4CAF50' : '#666';
        reqItems[3].style.color = requirements.special ? '#4CAF50' : '#666';

        return Object.values(requirements).every(req => req);
    }

    async handleSignup() {
        const submitBtn = document.getElementById('submitBtn');
        const submitBtnText = document.getElementById('submitBtnText');
        const submitBtnSpinner = document.getElementById('submitBtnSpinner');

        // Get form values
        const formData = {
            businessName: document.getElementById('businessName').value.trim(),
            businessAddress: document.getElementById('businessAddress').value.trim(),
            businessPhone: document.getElementById('businessPhone').value.trim(),
            businessType: document.getElementById('businessType').value,
            firstName: document.getElementById('firstName').value.trim(),
            lastName: document.getElementById('lastName').value.trim(),
            email: document.getElementById('email').value.trim(),
            password: document.getElementById('password').value,
            confirmPassword: document.getElementById('confirmPassword').value
        };

        // Validate passwords match
        if (formData.password !== formData.confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }

        // Validate password strength
        if (!this.validatePassword(formData.password)) {
            showToast('Password does not meet requirements', 'error');
            return;
        }

        // Check terms agreement
        if (!document.getElementById('agreeTerms').checked) {
            showToast('Please agree to the terms and conditions', 'error');
            return;
        }

        // Show loading state
        submitBtn.disabled = true;
        submitBtnText.textContent = 'Creating Account...';
        submitBtnSpinner.style.display = 'inline-block';

        try {
            // Create user account
            const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
            const user = userCredential.user;

            // Update user profile
            await updateProfile(user, {
                displayName: `${formData.firstName} ${formData.lastName}`
            });

            // Use the registerUser Cloud Function to create user data in the database
            const registerUserFunction = httpsCallable(functions, 'registerUser');
            
            // Call the Cloud Function with user data
            await registerUserFunction({
                firstName: formData.firstName,
                lastName: formData.lastName,
                businessName: formData.businessName,
                businessAddress: formData.businessAddress,
                businessPhone: formData.businessPhone,
                businessType: formData.businessType,
                selectedTier: this.selectedTier,
                tierData: this.tiers[this.selectedTier] || {}
            });

            showToast('Account created successfully! Redirecting to dashboard...', 'success');

            // Redirect to user dashboard after 2 seconds
            setTimeout(() => {
                window.location.href = '/user-dashboard.html';
            }, 2000);

        } catch (error) {
            console.error('Signup error:', error);
            
            // Handle specific error cases
            if (error.code === 'auth/email-already-in-use') {
                showToast('This email is already registered. Please log in instead.', 'error');
            } else if (error.code === 'auth/weak-password') {
                showToast('Password is too weak. Please use a stronger password.', 'error');
            } else if (error.code === 'auth/invalid-email') {
                showToast('Invalid email address format.', 'error');
            } else {
                showToast('Error creating account. Please try again.', 'error');
            }
        } finally {
            // Reset button state
            submitBtn.disabled = false;
            submitBtnText.textContent = 'Create Account';
            submitBtnSpinner.style.display = 'none';
        }
    }
}

// Initialize signup manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SignupManager();
});
