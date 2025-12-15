/**
 * Platform Signup Module
 * Handles user registration for the Laki Sparks platform
 */

import { auth, rtdb, ref, get, set, push, functions, httpsCallable, onAuthStateChanged } from './config/firebase-config.js';
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
            firstName: document.getElementById('firstName').value.trim(),
            lastName: document.getElementById('lastName').value.trim(),
            email: document.getElementById('email').value.trim(),
            password: document.getElementById('password').value,
            businessName: document.getElementById('businessName').value.trim(),
            businessAddress: document.getElementById('businessAddress').value.trim(),
            businessPhone: document.getElementById('businessPhone').value.trim(),
            businessType: document.getElementById('businessType').value,
            isFranchise: document.getElementById('isFranchise').checked,
            franchiseName: document.getElementById('franchiseName')?.value.trim() || '',
            brandName: document.getElementById('brandName')?.value.trim() || ''
        };

        // Validate passwords match
        if (formData.password !== document.getElementById('confirmPassword').value) {
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
            try {
                // Create user account
                const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                const user = userCredential.user;
                
                // Update user profile
                await updateProfile(user, {
                    displayName: `${formData.firstName} ${formData.lastName}`
                });
                
                // Force refresh the ID token to ensure it includes all necessary claims
                const idToken = await user.getIdToken(true);
                
                // Wait for auth state to be fully established
                // This is critical for the cloud function to receive the auth context
                await new Promise((resolve) => {
                    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
                        if (currentUser && currentUser.uid === user.uid) {
                            unsubscribe();
                            resolve();
                        }
                    });
                });
                
                // Get the functions instance and ensure we have the latest auth token
                const freshUser = auth.currentUser;
                if (!freshUser) {
                    throw new Error('User authentication failed - please try again');
                }
                
                // Get a fresh token right before the function call
                await freshUser.getIdToken(true);
                
                // Try the registerUser Cloud Function first
                let registrationSuccessful = false;
                try {
                    const registerUserFunction = httpsCallable(functions, 'registerUser');
                    
                    // Call the Cloud Function with user data
                    const result = await registerUserFunction({
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        businessName: formData.businessName,
                        businessAddress: formData.businessAddress,
                        businessPhone: formData.businessPhone,
                        businessType: formData.businessType,
                        isFranchise: formData.isFranchise,
                        franchiseName: formData.franchiseName,
                        brandName: formData.brandName,
                        selectedTier: this.selectedTier,
                        tierData: this.tiers[this.selectedTier] || {}
                    });
                    
                    if (result.data && result.data.success) {
                        registrationSuccessful = true;
                    }
                } catch (functionError) {
                    console.warn('[Signup] Cloud function failed:', functionError);
                    // Continue with fallback approach
                }
                
                // If cloud function failed, use direct database write as fallback
                if (!registrationSuccessful) {
                    console.log('[Signup] Using fallback database write');
                    
                    // Create user data
                    const userData = {
                        uid: freshUser.uid,
                        email: freshUser.email,
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        displayName: `${formData.firstName} ${formData.lastName}`,
                        businessInfo: {
                            name: formData.businessName,
                            address: formData.businessAddress,
                            phone: formData.businessPhone,
                            type: formData.businessType
                        },
                        isFranchise: formData.isFranchise,
                        franchiseName: formData.franchiseName,
                        brandName: formData.brandName,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        status: 'active',
                        role: 'user'
                    };
                    
                    // Create subscription data
                    const subscriptionData = {
                        userId: freshUser.uid,
                        tier: this.selectedTier,
                        status: 'trial',
                        startDate: Date.now(),
                        trialEndDate: Date.now() + (14 * 24 * 60 * 60 * 1000), // 14-day trial
                        features: (this.tiers[this.selectedTier] || {}).features || {},
                        limits: (this.tiers[this.selectedTier] || {}).limits || {},
                        metadata: {
                            signupSource: 'web',
                            initialTier: this.selectedTier
                        }
                    };
                    
                    // Create location data
                    const locationData = {
                        name: formData.businessName,
                        address: formData.businessAddress,
                        phone: formData.businessPhone,
                        type: formData.businessType,
                        ownerId: freshUser.uid,
                        isFranchise: formData.isFranchise,
                        franchiseName: formData.franchiseName,
                        brandName: formData.brandName || formData.businessName,
                        createdAt: Date.now(),
                        status: 'active'
                    };
                    
                    // Save all data to database with overwrite protection
                    const userRef = ref(rtdb, `users/${freshUser.uid}`);
                    const subscriptionRef = ref(rtdb, `subscriptions/${freshUser.uid}`);
                    
                    // Double-check if user exists (race condition protection)
                    const existingUserSnapshot = await get(userRef);
                    if (existingUserSnapshot.exists()) {
                        console.log(`⚠️ [Signup] User ${freshUser.uid} already exists, merging data instead of overwriting`);
                        const existingUserData = existingUserSnapshot.val();
                        
                        // Preserve existing data, especially phone numbers
                        const mergedUserData = {
                            ...existingUserData,
                            ...userData,
                            // Explicitly preserve phone numbers if they exist
                            phoneNumber: existingUserData.phoneNumber || userData.phoneNumber,
                            phone: existingUserData.phone || userData.phone,
                            businessPhone: existingUserData.businessPhone || userData.businessPhone,
                            updatedAt: Date.now()
                        };
                        
                        await update(userRef, mergedUserData);
                    } else {
                        await set(userRef, userData);
                    }
                    
                    // Check subscription as well
                    const existingSubscriptionSnapshot = await get(subscriptionRef);
                    if (existingSubscriptionSnapshot.exists()) {
                        console.log(`⚠️ [Signup] Subscription ${freshUser.uid} already exists, merging data`);
                        const existingSubscriptionData = existingSubscriptionSnapshot.val();
                        const mergedSubscriptionData = {
                            ...existingSubscriptionData,
                            ...subscriptionData,
                            updatedAt: Date.now()
                        };
                        await update(subscriptionRef, mergedSubscriptionData);
                    } else {
                        await set(subscriptionRef, subscriptionData);
                    }
                    
                    // Create location and link to user
                    const newLocationRef = push(ref(rtdb, 'locations'));
                    await set(newLocationRef, locationData);
                    await set(ref(rtdb, `userLocations/${freshUser.uid}/${newLocationRef.key}`), true);
                }
            } catch (userCreationError) {
                throw userCreationError;
            }

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
