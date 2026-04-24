// Import Firebase config
import { auth, rtdb, ref, get, set, update, push } from './config/firebase-config.js';
import { updatePassword } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { escapeHtml } from './modules/compliance/utils/html-escape.js';

// Wizard state
let currentStep = 1;
const totalSteps = 4;
let hasAssignedLocations = false;
let assignedLocationIds = [];
let onboardingData = {
    businessInfo: {},
    location: {},
    preferences: {
        features: []
    }
};

// Initialize wizard
document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndInit();
    setupEventListeners();
});

async function checkAuthAndInit() {
    // Check if user is authenticated
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            // Redirect to login if not authenticated
            window.location.href = 'login.html';
            return;
        }

        // Check if user has already completed onboarding
        const onboardingRef = ref(rtdb, `onboarding-progress/${user.uid}`);
        const snapshot = await get(onboardingRef);

        if (snapshot.exists()) {
            const progress = snapshot.val();
            if (progress.completed) {
                // User already completed onboarding, redirect to dashboard
                window.location.href = 'user-dashboard.html';
                return;
            }
        }

        // Check if user needs to change their temporary password
        const userSnapshot = await get(ref(rtdb, `users/${user.uid}/requiresPasswordChange`));
        if (userSnapshot.exists() && userSnapshot.val() === true) {
            showPasswordChangeOverlay(user);
        }

        // Initialize onboarding
        initializeOnboarding(user);
    });
}

function showPasswordChangeOverlay(user) {
    const overlay = document.getElementById('password-change-overlay');
    overlay.style.display = 'flex';

    const form = document.getElementById('password-change-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const errorEl = document.getElementById('password-error');
        const btn = document.getElementById('change-password-btn');

        errorEl.style.display = 'none';

        if (newPassword !== confirmPassword) {
            errorEl.textContent = 'Passwords do not match.';
            errorEl.style.display = 'block';
            return;
        }

        if (newPassword.length < 8) {
            errorEl.textContent = 'Password must be at least 8 characters.';
            errorEl.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Updating...';

        try {
            await updatePassword(user, newPassword);
            await update(ref(rtdb, `users/${user.uid}`), {
                requiresPasswordChange: false,
                passwordChangedAt: Date.now()
            });

            overlay.style.display = 'none';
        } catch (error) {
            console.error('Password change failed:', error);
            if (error.code === 'auth/requires-recent-login') {
                errorEl.textContent = 'Session expired. Please log out and log back in with your temporary password, then try again.';
            } else {
                errorEl.textContent = 'Failed to update password: ' + error.message;
            }
            errorEl.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-lock me-2"></i> Set New Password';
        }
    });
}

async function initializeOnboarding(user) {
    console.log('Initializing onboarding for user:', user.uid);

    // Pre-fill business name from user's display name if available
    if (user.displayName) {
        document.getElementById('business-name').value = user.displayName;
    }

    // Check for pre-assigned locations
    try {
        const userLocSnap = await get(ref(rtdb, `userLocations/${user.uid}`));
        if (userLocSnap.exists()) {
            const userLocs = userLocSnap.val();
            assignedLocationIds = Object.keys(userLocs);

            if (assignedLocationIds.length > 0) {
                hasAssignedLocations = true;

                // Fetch location names and build the display
                const listEl = document.getElementById('assigned-locations-list');
                listEl.innerHTML = '';

                for (const locId of assignedLocationIds) {
                    const locSnap = await get(ref(rtdb, `locations/${locId}`));
                    const locData = locSnap.val() || {};
                    const name = locData.name || locId;
                    const address = locData.address || '';
                    const city = locData.city || '';

                    const card = document.createElement('div');
                    card.className = 'card mb-2 border-success';
                    const addressLine = [address, city].filter(Boolean).join(', ') || 'No address set';
                    card.innerHTML = `
                        <div class="card-body d-flex align-items-center py-3">
                            <i class="fas fa-map-marker-alt text-success fa-lg me-3"></i>
                            <div>
                                <h6 class="mb-0">${escapeHtml(name)}</h6>
                                <small class="text-muted">${escapeHtml(addressLine)}</small>
                            </div>
                            <i class="fas fa-check-circle text-success ms-auto"></i>
                        </div>`;
                    listEl.appendChild(card);
                }

                // Show assigned view, hide create form
                document.getElementById('assigned-locations-view').style.display = 'block';
                document.getElementById('new-location-view').style.display = 'none';

                // Remove required from hidden form fields
                document.querySelectorAll('#location-setup-form [required]').forEach(el => {
                    el.removeAttribute('required');
                });
            }
        }
    } catch (err) {
        console.error('Error checking assigned locations:', err);
    }
}

function setupLocationToggle() {
    const showBtn = document.getElementById('show-add-location-btn');
    if (showBtn) {
        showBtn.addEventListener('click', () => {
            document.getElementById('new-location-view').style.display = 'block';
            document.getElementById('new-location-view').querySelector('h4').textContent = 'Add Another Location';
            showBtn.style.display = 'none';

            // Re-add required to form fields
            document.getElementById('location-name').setAttribute('required', '');
            document.getElementById('location-address').setAttribute('required', '');
            document.getElementById('location-city').setAttribute('required', '');
        });
    }
}

function setupEventListeners() {
    // Next button
    document.getElementById('next-btn').addEventListener('click', handleNext);

    // Previous button
    document.getElementById('prev-btn').addEventListener('click', handlePrevious);

    // Go to dashboard button
    document.getElementById('go-to-dashboard').addEventListener('click', goToDashboard);

    // Feature cards selection
    document.querySelectorAll('.feature-card').forEach(card => {
        card.addEventListener('click', () => {
            card.classList.toggle('selected');
        });
    });

    // Location toggle (add new when pre-assigned exist)
    setupLocationToggle();
}

async function handleNext() {
    // Validate current step before proceeding
    if (!validateCurrentStep()) {
        return;
    }

    // Save current step data
    saveCurrentStepData();

    if (currentStep < totalSteps) {
        currentStep++;
        updateWizard();
    }

    // If we're on the last step, complete onboarding
    if (currentStep === totalSteps) {
        await completeOnboarding();
    }
}

function handlePrevious() {
    if (currentStep > 1) {
        currentStep--;
        updateWizard();
    }
}

function validateCurrentStep() {
    // Skip validation on location step if user has pre-assigned locations and didn't add a new one
    if (currentStep === 2 && hasAssignedLocations) {
        const newLocView = document.getElementById('new-location-view');
        if (newLocView.style.display === 'none') {
            return true;
        }
    }

    const currentStepElement = document.querySelector('.wizard-step.active');
    const form = currentStepElement.querySelector('form');

    if (form) {
        if (!form.checkValidity()) {
            form.reportValidity();
            return false;
        }
    }

    return true;
}

function saveCurrentStepData() {
    switch(currentStep) {
        case 1:
            onboardingData.businessInfo = {
                name: document.getElementById('business-name').value,
                type: document.getElementById('business-type').value,
                phone: document.getElementById('contact-phone').value
            };
            break;
        case 2:
            // Only save location data if the user is creating a new one
            if (!hasAssignedLocations || document.getElementById('new-location-view').style.display !== 'none') {
                const locName = document.getElementById('location-name').value;
                if (locName) {
                    onboardingData.location = {
                        name: locName,
                        address: document.getElementById('location-address').value,
                        city: document.getElementById('location-city').value,
                        timezone: document.getElementById('location-timezone').value
                    };
                }
            }
            break;
        case 3:
            // Get selected features
            const selectedFeatures = [];
            document.querySelectorAll('.feature-card.selected').forEach(card => {
                selectedFeatures.push(card.dataset.feature);
            });

            onboardingData.preferences = {
                features: selectedFeatures,
                currency: document.getElementById('currency').value
            };
            break;
    }
}

function updateWizard() {
    // Hide all steps
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.classList.remove('active');
    });

    // Show current step
    document.querySelector(`.wizard-step[data-step="${currentStep}"]`).classList.add('active');

    // Update progress bar
    const progress = ((currentStep - 1) / (totalSteps - 1)) * 100;
    document.getElementById('wizard-progress').style.width = `${progress}%`;

    // Update step dots
    for (let i = 1; i <= totalSteps; i++) {
        const dot = document.getElementById(`step-dot-${i}`);
        dot.classList.remove('active', 'completed');

        if (i < currentStep) {
            dot.classList.add('completed');
            dot.textContent = '';
        } else if (i === currentStep) {
            dot.classList.add('active');
            dot.textContent = i;
        } else {
            dot.textContent = i;
        }
    }

    // Update navigation buttons
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    if (currentStep === 1) {
        prevBtn.style.display = 'none';
    } else {
        prevBtn.style.display = 'block';
    }

    if (currentStep === totalSteps) {
        nextBtn.style.display = 'none';
    } else {
        nextBtn.style.display = 'block';
    }
}

async function completeOnboarding() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        console.log('Completing onboarding with data:', onboardingData);

        // Save business info to user profile
        await update(ref(rtdb, `users/${user.uid}`), {
            businessName: onboardingData.businessInfo.name,
            businessType: onboardingData.businessInfo.type,
            contactPhone: onboardingData.businessInfo.phone,
            currency: onboardingData.preferences.currency,
            onboardingCompleted: true,
            onboardingCompletedAt: Date.now()
        });

        // Create new location only if the user filled in the form
        if (onboardingData.location && onboardingData.location.name) {
            const locationRef = push(ref(rtdb, 'locations'));
            const locationId = locationRef.key;

            await set(locationRef, {
                id: locationId,
                name: onboardingData.location.name,
                address: onboardingData.location.address,
                city: onboardingData.location.city,
                timezone: onboardingData.location.timezone,
                ownerId: user.uid,
                createdAt: Date.now(),
                active: true
            });

            // Link location to user
            await set(ref(rtdb, `userLocations/${user.uid}/${locationId}`), {
                locationId: locationId,
                role: 'owner',
                addedAt: Date.now()
            });
        }

        // Save onboarding progress
        await set(ref(rtdb, `onboarding-progress/${user.uid}`), {
            completed: true,
            completedAt: Date.now(),
            completedSteps: ['business-info', 'location-setup', 'preferences'],
            currentStep: 'completed',
            selectedFeatures: onboardingData.preferences.features,
            toursSeen: []
        });

        console.log('Onboarding completed successfully');

    } catch (error) {
        console.error('Error completing onboarding:', error);
        alert('Failed to complete onboarding. Please try again.');
    }
}

function goToDashboard() {
    window.location.href = 'user-dashboard.html';
}
