/*
This script collects guest WiFi login form data, processes the parameters sent by Meraki,
stores the results in a Firebase database, and authenticates the user with the Meraki WiFi network.
*/

/**
 * Laki Sparks - Meraki Captive Portal
 * Version: 2.0
 * Last Updated: 2026-05-19
 *
 * CHANGELOG:
 * v2.0 (2026-05-19):
 * - Hi-Fi v2 rewrite: drop offline queue, dead stubs, debug log spam
 * - Submit handler rewritten as async state machine (idle -> validate -> submitting -> success/error)
 * - CF errors now user-visible inline; Meraki redirect fires only on CF success
 * - marketingConsent field added to CF payload
 * - Native <dialog> modal bindings added
 * - Validation helpers relaxed to match submitWifiLogin CF (Unicode names, + emails)
 */

// Import Firebase modules from the centralized config file
import { auth, functions, httpsCallable, signInAnonymously } from './config/firebase-config.js';
import { logPageView } from './config/firebase-analytics.js';

// Allowed host patterns for the Meraki splash-grant redirect. The
// `base_grant_url` query param is operator-controlled in the Meraki
// dashboard, but our page receives it from any URL and writes it to
// window.location.href; without this guard a crafted URL could phish
// guests through our captive portal. Per the 2014 Meraki EXCAP
// whitepaper the host is dynamic on the subdomain but the family is
// stable (n##.meraki.com or *.network-auth.com).
const ALLOWED_MERAKI_HOST_PATTERNS = [
    /^n\d+\.meraki\.com$/i,
    /\.network-auth\.com$/i
];
function isAllowedMerakiHost(url) {
    try {
        const u = new URL(url);
        return ALLOWED_MERAKI_HOST_PATTERNS.some(p => p.test(u.hostname));
    } catch {
        return false;
    }
}

// Callable handle for the server-side write CF. Replaces the prior
// direct-RTDB writes which required .write:true on wifiLogins/
// activeUsers/userPreferences — a public-internet exposure.
const submitWifiLoginCF = httpsCallable(functions, 'submitWifiLogin');

document.addEventListener('DOMContentLoaded', function() {
    'use strict';

    // Sign in anonymously so the submitWifiLogin CF has a stable per-
    // device UID for rate-limiting + write attribution. Anonymous Auth
    // uses the same auth hostname family as RTDB, which already works
    // through Meraki walled gardens at every deployed venue. Failure
    // here is non-fatal: the CF call will throw `unauthenticated`,
    // which the submit handler surfaces as an inline retry prompt.
    signInAnonymously(auth).catch(err => {
        console.warn('WiFi LOGIN: anonymous auth failed; CF call may throw unauthenticated:', err);
    });

    // Meraki-specific URL parameters
    const base_grant_url = GetURLParameter('base_grant_url');
    const user_continue_url = GetURLParameter('user_continue_url');
    const node_mac = GetURLParameter('node_mac');
    const client_ip = GetURLParameter('client_ip');
    const client_mac = GetURLParameter('client_mac');

    // Validate Meraki parameters
    if (!base_grant_url || base_grant_url === 'undefined') {
        console.error('WiFi LOGIN: Missing base_grant_url — required for Meraki authentication.');
    }

    // Log page view with Firebase Analytics
    try {
        logPageView('captive_portal');
    } catch (error) {
        console.error('Failed to log page view:', error);
    }

    // Initialize phone input field with international telephone input library
    const phoneInputField = document.querySelector("#phone");
    let phoneInput;

    if (phoneInputField) {
        try {
            if (typeof window.intlTelInput === 'function') {
                phoneInput = window.intlTelInput(phoneInputField, {
                    initialCountry: "auto",
                    preferredCountries: ["za"],
                    separateDialCode: true,
                    utilsScript: "js/utils.js",
                    geoIpLookup: function(callback) {
                        try {
                            fetch('https://ipinfo.io/json')
                                .then(response => response.json())
                                .then(data => callback(data.country))
                                .catch(error => {
                                    console.warn('WiFi LOGIN: GeoIP lookup failed:', error);
                                    callback('za');
                                });
                        } catch (error) {
                            console.warn('WiFi LOGIN: GeoIP lookup error:', error);
                            callback('za');
                        }
                    }
                });
            } else {
                console.warn('WiFi LOGIN: intlTelInput not available, using basic input');
                phoneInputField.placeholder = "Enter your phone number";
            }
        } catch (error) {
            console.error('WiFi LOGIN: Error initializing phone input:', error);
            phoneInputField.placeholder = "Enter your phone number";
        }
    }

    // Form element selectors
    const form = document.querySelector('#loginForm');
    const nameInput = document.querySelector('#username');
    const emailInput = document.querySelector('#email');
    const tableInput = document.querySelector('#table');
    const termsCheckbox = document.querySelector('#terms');
    const errorContainer = document.querySelector('#error-container');

    // Add input event listeners for real-time validation feedback
    if (nameInput) {
        nameInput.addEventListener('input', function() {
            validateField(nameInput, validateName(nameInput.value),
                'Please enter your full name (first name and surname)');
        });
    }

    if (emailInput) {
        emailInput.addEventListener('input', function() {
            validateField(emailInput, validateEmail(emailInput.value),
                'Please enter a valid email address');
        });
    }

    if (phoneInputField && phoneInput) {
        phoneInputField.addEventListener('input', function() {
            const isValid = phoneInput.isValidNumber();
            validateField(phoneInputField, isValid,
                'Please enter a valid phone number with country code');
        });
    }

    if (tableInput) {
        tableInput.addEventListener('input', function() {
            validateField(tableInput, validateTable(tableInput.value),
                'Please enter your table number');
        });
    }

    if (termsCheckbox) {
        termsCheckbox.addEventListener('change', function() {
            const feedbackElement = document.querySelector('#termsValidationMessage');
            if (feedbackElement) {
                if (!termsCheckbox.checked) {
                    feedbackElement.textContent = 'You must agree to the terms and conditions';
                    feedbackElement.style.display = 'block';
                } else {
                    feedbackElement.style.display = 'none';
                }
            }
        });
    }

    // Bind native <dialog> open/close for the privacy + terms modals.
    // Page HTML uses <dialog id="privacyModal"> and <dialog id="termsModal">
    // with trigger elements [data-open-modal="privacyModal"] etc. PR 2 drops
    // Bootstrap's data-bs-toggle in favour of these handlers.
    document.querySelectorAll('[data-open-modal]').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const id = trigger.getAttribute('data-open-modal');
            const dialog = document.getElementById(id);
            if (dialog && typeof dialog.showModal === 'function') {
                dialog.showModal();
            }
        });
    });
    document.querySelectorAll('dialog [data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('dialog')?.close());
    });
    // Tap-outside dismiss: native <dialog> emits a click on the dialog itself
    // (not the inner content) when the user taps the ::backdrop.
    document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.close();
        });
    });

    // Function to validate a field and show appropriate feedback
    function validateField(inputElement, isValid, errorMessage) {
        const feedbackElement = inputElement.nextElementSibling;
        if (!isValid) {
            inputElement.classList.add('is-invalid');
            if (feedbackElement && feedbackElement.classList.contains('wf-error')) {
                feedbackElement.textContent = errorMessage;
            }
        } else {
            inputElement.classList.remove('is-invalid');
        }
        return isValid;
    }

    // Display error in the error container
    function displayError(message) {
        if (!errorContainer) {
            console.error('Error container not found:', message);
            return;
        }
        errorContainer.textContent = message;
        errorContainer.className = 'wf-status wf-status--error';
        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Auto-hide after 6s so the user can re-tap without the stale error
        setTimeout(() => {
            if (errorContainer.classList.contains('wf-status--error')) {
                errorContainer.className = 'wf-status';
            }
        }, 6000);
    }

    // Display success message
    function displaySuccess(message) {
        if (!errorContainer) return;
        errorContainer.textContent = message;
        errorContainer.className = 'wf-status wf-status--success';
    }

    // Validation helpers — match the submitWifiLogin CF exactly (functions/index.js
    // lines starting at the `name.split(/\s+/).length >= 2` check). Client validation
    // here is purely real-time UX feedback; the server is the source of truth.
    function validateName(name) {
        return name.trim().split(/\s+/).length >= 2;
    }

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validateTable(_table) {
        // Optional field; helper text says "Leave blank if not seated".
        return true;
    }

    // Handle form submission. State machine: idle -> validate -> submitting
    // -> (success -> redirect) | (error -> idle).
    //
    // The Meraki redirect is the sacred step; we only fire it on CF success
    // (or when the user chooses to retry after a transient error). The
    // open-redirect guard rejects unknown hosts before the redirect, never
    // after, so the only way bad input gets past it is operator config.
    let isSubmitting = false;

    if (form) {
        form.addEventListener('submit', async function(event) {
            event.preventDefault();
            if (isSubmitting) return;

            // Clear any existing error
            if (errorContainer) errorContainer.style.display = 'none';

            // Validate all fields
            let isValid = true;
            if (nameInput) {
                isValid = validateField(nameInput, validateName(nameInput.value),
                    'Please enter your full name (first name and surname)') && isValid;
            }
            if (emailInput) {
                isValid = validateField(emailInput, validateEmail(emailInput.value),
                    'Please enter a valid email address') && isValid;
            }
            if (phoneInputField && phoneInput) {
                isValid = validateField(phoneInputField, phoneInput.isValidNumber(),
                    'Please enter a valid phone number with country code') && isValid;
            }
            if (tableInput) {
                isValid = validateField(tableInput, validateTable(tableInput.value),
                    'Please enter your table number') && isValid;
            }
            if (termsCheckbox) {
                const termsValid = termsCheckbox.checked;
                const feedbackElement = document.querySelector('#termsValidationMessage');
                if (!termsValid) {
                    isValid = false;
                    if (feedbackElement) {
                        feedbackElement.textContent = 'You must agree to the terms and conditions';
                        feedbackElement.style.display = 'block';
                    }
                } else if (feedbackElement) {
                    feedbackElement.style.display = 'none';
                }
            }

            if (!isValid) {
                displayError('Please correct the errors in the form before submitting.');
                return;
            }

            // Open-redirect guard BEFORE the CF call (per spec state machine).
            // base_grant_url must be a known Meraki host; otherwise we refuse to
            // redirect later, so refuse now and tell the user.
            if (!base_grant_url) {
                displayError('Connection information is missing. Please refresh and try again.');
                return;
            }
            const redirectURL = constructRedirectURL(base_grant_url, user_continue_url);
            if (!isAllowedMerakiHost(redirectURL)) {
                console.error('WiFi LOGIN: refused to redirect to non-Meraki host:', redirectURL);
                displayError('This venue’s WiFi configuration looks unusual. Please ask venue staff for help.');
                return;
            }

            // Begin submitting state
            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = 'Connecting…';
            }

            const marketingConsentEl = document.querySelector('#marketingConsent');
            const payload = {
                name: nameInput ? nameInput.value : '',
                email: emailInput ? emailInput.value : '',
                phoneNumber: phoneInput ? phoneInput.getNumber() : '',
                table: tableInput ? tableInput.value : '',
                marketingConsent: !!(marketingConsentEl && marketingConsentEl.checked),
                client_mac: client_mac || '',
                node_mac: node_mac || '',
                client_ip: client_ip || ''
            };

            try {
                await submitWifiLoginCF(payload);
                // Success: hold the spinner briefly so the user sees confirmation,
                // then fire the Meraki redirect. We DO NOT redirect on error
                // (operator decision in spec) -- user retries via the inline error.
                displaySuccess('Connecting to WiFi network…');
                setTimeout(() => { window.location.href = redirectURL; }, 500);
            } catch (err) {
                console.error('WiFi LOGIN: submitWifiLogin CF rejected:', err);
                displayError(mapCfErrorToUserCopy(err));
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHtml;
                }
                isSubmitting = false;
            }
        });
    }

    // Map CF error codes (Firebase callable HttpsError) to user-facing copy.
    function mapCfErrorToUserCopy(err) {
        const code = err && err.code ? String(err.code) : '';
        if (code.endsWith('unauthenticated')) {
            return 'Almost there — please tap Connect again.';
        }
        if (code.endsWith('resource-exhausted')) {
            return 'Just a moment — please wait a few seconds and try again.';
        }
        if (code.endsWith('invalid-argument')) {
            return 'Please check your details and try again.';
        }
        return 'We hit a snag. Tap Connect to retry.';
    }

    // Helper function to parse URL parameters
    function GetURLParameter(sParam) {
        const sPageURL = window.location.search.substring(1);
        const sURLVariables = sPageURL.split('&');
        for (let i = 0; i < sURLVariables.length; i++) {
            const sParameterName = sURLVariables[i].split('=');
            if (sParameterName[0] === sParam) {
                return sParameterName[1];
            }
        }
        return null;
    }

    // Function to construct the proper redirect URL
    function constructRedirectURL(base_grant_url, user_continue_url) {
        try {
            // Make sure the base_grant_url is properly decoded
            const decodedBaseGrantUrl = decodeURIComponent(base_grant_url);

            // Check if we have a user_continue_url
            let continueUrl = '';
            if (user_continue_url) {
                continueUrl = decodeURIComponent(user_continue_url);
            }

            // Build the full redirect URL
            // If the base_grant_url already has parameters, add continue_url as &continue_url=
            // Otherwise, add it as ?continue_url=
            const separator = decodedBaseGrantUrl.includes('?') ? '&' : '?';
            const redirectUrl = continueUrl
                ? `${decodedBaseGrantUrl}${separator}continue_url=${encodeURIComponent(continueUrl)}`
                : decodedBaseGrantUrl;

            return redirectUrl;
        } catch (error) {
            console.error('WiFi LOGIN: Error constructing redirect URL:', error);
            // Return the base_grant_url as a fallback
            return base_grant_url;
        }
    }
});
