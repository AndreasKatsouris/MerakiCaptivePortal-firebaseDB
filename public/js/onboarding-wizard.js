// Import Firebase config
import { auth, rtdb, ref, get, set, update, push } from './config/firebase-config.js';

// Wizard state
let currentStep = 1;
const totalSteps = 4;
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

        // Initialize onboarding
        initializeOnboarding(user);
    });
}

function initializeOnboarding(user) {
    console.log('Initializing onboarding for user:', user.uid);

    // Pre-fill business name from user's display name if available
    if (user.displayName) {
        document.getElementById('business-name').value = user.displayName;
    }

    // Pre-fill contact phone from user's email if it looks like a phone
    if (user.email && user.email.includes('@')) {
        // Leave empty for user to fill
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
            onboardingData.location = {
                name: document.getElementById('location-name').value,
                address: document.getElementById('location-address').value,
                city: document.getElementById('location-city').value,
                timezone: document.getElementById('location-timezone').value
            };
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

        // Create first location
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
