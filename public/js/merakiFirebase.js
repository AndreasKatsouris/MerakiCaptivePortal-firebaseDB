/*
This script collects guest WiFi login form data, processes the parameters sent by Meraki,
stores the results in a Firebase database, and authenticates the user with the Meraki WiFi network.
*/

/**
 * Laki Sparks - Meraki Captive Portal
 * Version: 1.1
 * Last Updated: 2025-03-26
 * 
 * CHANGELOG:
 * v1.1 (2025-03-26):
 * - Fixed WiFi login redirect flow
 * - Implemented offline data storage via localStorage
 * - Fixed phone number collection with intlTelInput
 * - Added resource files for better UI experience
 * - Added fallback redirect methods for better reliability
 */

// Import Firebase modules from the centralized config file
import { auth, functions, httpsCallable, signInAnonymously } from './config/firebase-config.js';
import { logPageView, logFormSubmission, logWiFiConnection } from './config/firebase-analytics.js';

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

    console.log('=== WiFi LOGIN DEBUG: Script initialized ===');

    // Sign in anonymously so the submitWifiLogin CF has a stable per-
    // device UID for rate-limiting + write attribution. Anonymous Auth
    // uses the same auth hostname family as RTDB, which already works
    // through Meraki walled gardens at every deployed venue. Failure
    // here is non-fatal: the CF call will throw `unauthenticated`,
    // the client falls through to the localStorage offline retry
    // queue, and the Meraki redirect still fires unconditionally.
    signInAnonymously(auth).catch(err => {
        console.warn('WiFi LOGIN: anonymous auth failed; will retry via offline queue:', err);
    });
    
    // Parse and log all URL parameters for debugging
    const urlParams = {};
    const queryString = window.location.search;
    if (queryString) {
        console.log('WiFi LOGIN DEBUG: URL query string:', queryString);
        
        const urlSearchParams = new URLSearchParams(queryString);
        urlSearchParams.forEach((value, key) => {
            urlParams[key] = value;
            console.log(`WiFi LOGIN DEBUG: URL param - ${key}: ${value}`);
        });
    } else {
        console.warn('WiFi LOGIN DEBUG: No URL parameters found!');
    }
    
    // Meraki-specific URL parameters
    const base_grant_url = GetURLParameter('base_grant_url');
    const user_continue_url = GetURLParameter('user_continue_url');
    const node_mac = GetURLParameter('node_mac');
    const client_ip = GetURLParameter('client_ip');
    const client_mac = GetURLParameter('client_mac');
    
    // Log Meraki parameters specifically for troubleshooting
    console.log('=== WiFi LOGIN DEBUG: Meraki Parameters ===');
    console.log('base_grant_url:', base_grant_url);
    console.log('user_continue_url:', user_continue_url);
    console.log('node_mac:', node_mac);
    console.log('client_ip:', client_ip);
    console.log('client_mac:', client_mac);
    
    // Validate Meraki parameters
    if (!base_grant_url || base_grant_url === 'undefined') {
        console.error('WiFi LOGIN DEBUG: Missing base_grant_url! This is required for Meraki authentication.');
    }
    
    // Debugging function to log objects with circular references safely
    function safeLogObject(obj, label = 'Object') {
        try {
            console.log(`WiFi LOGIN DEBUG: ${label}:`, JSON.stringify(obj, null, 2));
        } catch (error) {
            console.log(`WiFi LOGIN DEBUG: ${label} (non-stringifiable):`, obj);
        }
    }
    
    // Log page view with Firebase Analytics
    try {
        logPageView('captive_portal');
    } catch (error) {
        console.error('Failed to log page view:', error);
    }

    // Parse Meraki supplied parameters
    const merakiParams = {
        base_grant_url,
        user_continue_url,
        node_mac,
        client_ip,
        client_mac
    };
    
    // Log parameters to console for debugging
    console.log("Meraki Parameters:", merakiParams);

    // Initialize phone input field with international telephone input library
    const phoneInputField = document.querySelector("#phone");
    let phoneInput;
    
    if (phoneInputField) {
        try {
            if (typeof window.intlTelInput === 'function') {
                console.log('WiFi LOGIN DEBUG: Initializing phone input with intlTelInput');
                phoneInput = window.intlTelInput(phoneInputField, {
                    initialCountry: "auto",
                    preferredCountries: ["za"],
                    separateDialCode: true,
                    utilsScript: "js/utils.js", // Use local file first
                    geoIpLookup: function(callback) {
                        try {
                            fetch('https://ipinfo.io/json')
                                .then(response => response.json())
                                .then(data => callback(data.country))
                                .catch(error => {
                                    console.warn('WiFi LOGIN DEBUG: GeoIP lookup failed:', error);
                                    callback('za'); // Default to South Africa if lookup fails
                                });
                        } catch (error) {
                            console.warn('WiFi LOGIN DEBUG: GeoIP lookup error:', error);
                            callback('za'); // Default to South Africa
                        }
                    }
                });
            } else {
                console.warn('WiFi LOGIN DEBUG: intlTelInput not available, using basic input');
                // Just use the basic input field
                phoneInputField.placeholder = "Enter your phone number";
            }
        } catch (error) {
            console.error('WiFi LOGIN DEBUG: Error initializing phone input:', error);
            // Just use the basic input field
            phoneInputField.placeholder = "Enter your phone number";
        }
    }

    // Form element selectors
    const form = document.querySelector('#loginForm');
    const nameInput = document.querySelector('#username');
    const emailInput = document.querySelector('#email');
    //const phoneInputField = document.querySelector('#phone');
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

    // Function to validate a field and show appropriate feedback
    function validateField(inputElement, isValid, errorMessage) {
        const feedbackElement = inputElement.nextElementSibling;
        
        if (!isValid) {
            inputElement.classList.add('is-invalid');
            inputElement.classList.remove('is-valid');
            if (feedbackElement) {
                feedbackElement.textContent = errorMessage;
                feedbackElement.style.display = 'block';
            }
        } else {
            inputElement.classList.remove('is-invalid');
            inputElement.classList.add('is-valid');
            if (feedbackElement) {
                feedbackElement.style.display = 'none';
            }
        }
        
        return isValid;
    }
    
    // Display error in the error container
    function displayError(message) {
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.style.display = 'block';
            errorContainer.className = 'alert alert-danger mt-3';
            
            // Scroll to error
            errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Auto-hide after 6 seconds
            setTimeout(() => {
                errorContainer.style.display = 'none';
            }, 6000);
        } else {
            console.error('Error container not found:', message);
        }
    }

    // Handle form submission
    if (form) {
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            console.log('Form submission started');
            
            // Clear any existing error messages
            if (errorContainer) {
                errorContainer.style.display = 'none';
            }
            
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
                const isPhoneValid = phoneInput.isValidNumber();
                isValid = validateField(phoneInputField, isPhoneValid, 
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
            
            console.log('Form validation complete, isValid:', isValid);
            
            // If validation is successful, process the form
            if (isValid) {
                // Create the form data object
                const formData = {
                    name: nameInput ? nameInput.value : '',
                    email: emailInput ? emailInput.value : '',
                    table: tableInput ? tableInput.value : '',
                    phoneNumber: phoneInput ? phoneInput.getNumber() : '' // Correctly get phone number using getNumber() method
                };
                
                // Store form data in localStorage for offline resilience
                try {
                    const sessionID = generateSessionID();
                    const storedData = {
                        sessionID: sessionID,
                        formData: formData,
                        client_mac: client_mac,
                        node_mac: node_mac,
                        timestamp: new Date().toISOString(),
                        base_grant_url: base_grant_url,
                        user_continue_url: user_continue_url
                    };
                    localStorage.setItem('pendingWifiLogin', JSON.stringify(storedData));
                    console.log('WiFi LOGIN DEBUG: Form data saved to localStorage with sessionID:', sessionID);

                    // Show success message
                    displaySuccess("Connecting to WiFi network...");

                    // Immediately redirect to Meraki auth URL
                    if (base_grant_url) {
                        const redirectURL = constructRedirectURL(base_grant_url, user_continue_url);

                        // Open-redirect guard. base_grant_url comes from
                        // the page's query string; without this check a
                        // crafted URL with an arbitrary host could phish
                        // guests through our captive portal.
                        if (!isAllowedMerakiHost(redirectURL)) {
                            console.error('WiFi LOGIN: refused to redirect to non-Meraki host:', redirectURL);
                            displayError('Invalid network configuration. Please contact venue staff.');
                            return;
                        }

                        console.log('WiFi LOGIN DEBUG: Redirecting to Meraki auth URL:', redirectURL);
                        setTimeout(() => {
                            // Direct redirect instead of using the removed safeRedirect function
                            try {
                                // Attempt primary redirect method
                                window.location.href = redirectURL;
                                
                                // Fallback methods
                                setTimeout(() => {
                                    if (document.visibilityState !== 'hidden') {
                                        // Try alternative redirect if first one didn't work
                                        const link = document.createElement('a');
                                        link.href = redirectURL;
                                        link.target = '_self';
                                        document.body.appendChild(link);
                                        link.click();
                                    }
                                }, 300);
                            } catch (error) {
                                console.error('WiFi LOGIN DEBUG: Redirect error:', error);
                                // Show manual link option
                                const manualDiv = document.createElement('div');
                                manualDiv.style.position = 'fixed';
                                manualDiv.style.bottom = '10px';
                                manualDiv.style.left = '10px';
                                manualDiv.style.right = '10px';
                                manualDiv.style.padding = '10px';
                                manualDiv.style.backgroundColor = '#ffeb3b';
                                manualDiv.style.color = '#000';
                                manualDiv.style.borderRadius = '5px';
                                manualDiv.style.zIndex = '9999';
                                manualDiv.innerHTML = `<p>If not redirected automatically, <a href="${redirectURL}" style="color:#0066cc;font-weight:bold;">click here</a> to connect.</p>`;
                                document.body.appendChild(manualDiv);
                            }
                        }, 500);
                    } else {
                        console.error('WiFi LOGIN DEBUG: Cannot redirect - missing base_grant_url');
                        displayError("Connection information is missing. Please refresh and try again.");
                    }
                } catch (error) {
                    console.error('WiFi LOGIN DEBUG: Error saving data:', error);
                    displayError("An error occurred. Please try again.");
                }

                // Attempt to process the form data in background, but don't wait for it
                processFormData(formData, client_mac, node_mac)
                    .then(sessionID => {
                        // Success handling moved to redirect function
                        console.log('WiFi LOGIN DEBUG: Background process completed with sessionID:', sessionID);
                    })
                    .catch(error => {
                        // Error already logged in processFormData, no need to display to user
                        // since we've already redirected
                        console.error('WiFi LOGIN DEBUG: Background process error:', error);
                    });
            } else {
                console.warn('WiFi LOGIN DEBUG: Form validation failed');
                displayError('Please correct the errors in the form before submitting.');
            }
        });
    }
    
    // Process form data and save to Firebase
    async function processFormData(formData, client_mac, node_mac) {
        console.log('WiFi LOGIN DEBUG: Processing form data...');
        console.log('WiFi LOGIN DEBUG: Form data:', formData);
        console.log('WiFi LOGIN DEBUG: Client MAC:', client_mac);
        console.log('WiFi LOGIN DEBUG: Node MAC:', node_mac);
        
        try {
            // Generate a unique session ID
            const sessionID = generateSessionID();
            console.log('WiFi LOGIN DEBUG: Generated session ID:', sessionID);
            
            // Add timestamp to form data
            formData.timestamp = new Date().toISOString();
            
            // Add MAC addresses to the formData (for reference)
            formData.client_mac = client_mac;
            formData.node_mac = node_mac;
            
            // Add client IP if present
            const client_ip = GetURLParameter('client_ip');
            if (client_ip) {
                formData.client_ip = client_ip;
            }
            
            // Write the user data to Firebase
            console.log('WiFi LOGIN DEBUG: Writing user data to Firebase...');
            await writeUserData({
                sessionID: sessionID,
                timestamp: formData.timestamp,
                client_mac: client_mac,
                node_mac: node_mac,
                ...formData
            }, client_mac, node_mac);
            console.log('WiFi LOGIN DEBUG: User data written successfully');
            
            // Store user preferences if provided
            if (formData.preferences) {
                console.log('WiFi LOGIN DEBUG: Storing user preferences...');
                const preferences = {
                    marketing: formData.preferences.marketing || false,
                    communication: formData.preferences.communication || false,
                    lastUpdated: formData.timestamp
                };
                await storeUserPreferences(client_mac, preferences);
                console.log('WiFi LOGIN DEBUG: User preferences stored successfully');
            }
            
            // Log connection for analytics
            console.log('WiFi LOGIN DEBUG: Logging user connection...');
            try {
                await logUserConnection({
                    timestamp: formData.timestamp,
                    sessionID: sessionID,
                    client_mac: client_mac,
                    macAddress: client_mac, // Include both formats to be safe
                    node_mac: node_mac,
                    ...formData
                });
                console.log('WiFi LOGIN DEBUG: User connection logged successfully');
            } catch (connError) {
                console.error('WiFi LOGIN DEBUG: Error logging connection, but continuing:', connError);
                // Continue despite connection logging error
            }
            
            return sessionID;
        } catch (error) {
            console.error('WiFi LOGIN DEBUG: Error in processFormData:', error);
            throw error;
        }
    }

    // Display success message
    function displaySuccess(message) {
        // Convert error container to success style
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.className = 'alert alert-success mt-3';
            errorContainer.style.display = 'block';
        }
    }

    // Validation functions
    function validateName(name) {
        name = name.trim();
        const nameParts = name.split(/\s+/);
        return nameParts.length >= 2 && nameParts.every(part => /^[a-zA-Z'-]+$/.test(part));
    }

    function validateEmail(email) {
        const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        return emailPattern.test(email);
    }

    function validateTable(table) {
        return table.trim() !== "";
    }

    // Submit the guest's form data via the submitWifiLogin CF.
    //
    // Previously this function called set(ref(rtdb, 'wifiLogins/...')) +
    // set(ref(rtdb, 'activeUsers/...')) directly, which required
    // .write:true on those nodes (public-internet exposure). Now we
    // route through a v2 onCall CF that authenticates the anonymous
    // guest, rate-limits per anon UID, validates shape, and writes via
    // the Admin SDK. The CF returns a server-generated sessionID
    // (replaces the prior Math.random() session ID).
    //
    // Failure modes:
    //   - Anon auth not yet ready -> CF throws unauthenticated -> caller
    //     keeps the localStorage offline-queue payload; checkAndUploadOfflineData
    //     retries on next page load.
    //   - CF unreachable (e.g. walled-garden missing *.cloudfunctions.net)
    //     -> same fallback path. No Meraki-redirect impact.
    async function writeUserData(data, client_mac, node_mac) {
        console.log('WiFi LOGIN DEBUG: Calling submitWifiLogin CF');

        const payload = {
            name: data.name || '',
            email: data.email || '',
            phoneNumber: data.phoneNumber || '',
            table: data.table || '',
            client_mac: client_mac || '',
            node_mac: node_mac || '',
            client_ip: data.client_ip || ''
        };

        const { data: result } = await submitWifiLoginCF(payload);
        console.log('WiFi LOGIN DEBUG: submitWifiLogin CF returned:', result);
        return result.sessionID;
    }

    // Stub: preferences are no longer persisted from the captive portal.
    // The form never collected them; the previous direct RTDB write to
    // /userPreferences was dead code. Retention/admin schema for
    // preferences will be revisited in the PR 2 Hi-Fi rewrite.
    async function storeUserPreferences(_macAddress, _preferences) {
        // Intentional no-op; see submitWifiLogin CF for the canonical write.
    }

    // Wire up the disconnect handler. The CF already wrote the
    // activeUsers record; this just attaches the beforeunload listener.
    // The disconnect write itself (logUserDisconnection) targets an
    // admin-only path post-rules-tightening and will fail silently —
    // acceptable for a best-effort browser-unload signal that's already
    // unreliable on mobile.
    async function logUserConnection(data) {
        const sessionID = data.sessionID || localStorage.getItem('sessionID') || generateSessionID();
        localStorage.setItem('sessionID', sessionID);

        window.addEventListener('beforeunload', function() {
            logUserDisconnection(sessionID);
        });

        return sessionID;
    }

    // Best-effort disconnect signal. Post-rules-tightening this is a
    // no-op from the client side (admin-only write). A dedicated
    // updateWifiDisconnect CF would be the proper fix; deferred to
    // backlog rather than scope-creeping this PR.
    async function logUserDisconnection(_sessionID) {
        // Intentional no-op; see PR description for the disconnect-tracking
        // backlog item.
    }
    
    // Function to generate a session ID
    function generateSessionID() {
        return 'session-' + Math.random().toString(36).substr(2, 9);
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
            
            console.log('WiFi LOGIN DEBUG: Constructed redirect URL:', redirectUrl);
            return redirectUrl;
        } catch (error) {
            console.error('WiFi LOGIN DEBUG: Error constructing redirect URL:', error);
            // Return the base_grant_url as a fallback
            return base_grant_url;
        }
    }

    // Add event listener to try uploading saved data after page loads
    window.addEventListener('load', function() {
        setTimeout(checkAndUploadOfflineData, 2000);
    });

    // Function to check for and upload offline data
    function checkAndUploadOfflineData() {
        try {
            const savedData = localStorage.getItem('pendingWifiLogin');
            if (savedData) {
                console.log('WiFi LOGIN DEBUG: Found saved login data, attempting to upload');
                const parsedData = JSON.parse(savedData);
                
                // Check if this is a post-authentication page load
                const currentUrl = window.location.href;
                if (currentUrl.includes('success=true') || 
                    currentUrl.includes(parsedData.user_continue_url) || 
                    !currentUrl.includes('captive-portal')) {
                    
                    console.log('WiFi LOGIN DEBUG: Detected successful authentication, uploading saved data');
                    
                    // Try to upload the saved data
                    writeUserData({
                        sessionID: parsedData.sessionID,
                        timestamp: parsedData.timestamp,
                        ...parsedData.formData,
                        client_mac: parsedData.client_mac,
                        node_mac: parsedData.node_mac
                    }, parsedData.client_mac, parsedData.node_mac)
                    .then(() => {
                        console.log('WiFi LOGIN DEBUG: Successfully uploaded saved data');
                        localStorage.removeItem('pendingWifiLogin');
                    })
                    .catch(error => {
                        console.error('WiFi LOGIN DEBUG: Failed to upload saved data:', error);
                        // Keep the data for later retry
                    });
                }
            }
        } catch (error) {
            console.error('WiFi LOGIN DEBUG: Error in checkAndUploadOfflineData:', error);
        }
    }
});
