/*
This script collects guest WiFi login form data, processes the parameters sent by Meraki,
stores the results in a Firebase database, and authenticates the user with the Meraki WiFi network.
*/

// Import Firebase modules from the centralized config file
import { rtdb, ref, set, update, push, get } from './config/firebase-config.js';
import { logPageView, logFormSubmission, logWiFiConnection } from './config/firebase-analytics.js';

document.addEventListener('DOMContentLoaded', function() {
    'use strict';
    
    console.log('=== WiFi LOGIN DEBUG: Script initialized ===');
    
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
                    phoneNumber: phoneInput ? phoneInput.value : '' // Ensure we use phoneNumber consistently
                };
                
                // Log the form submission to analytics
                try {
                    logFormSubmission(formData);
                    console.log('Analytics event logged');
                } catch (error) {
                    console.error('Failed to log form submission:', error);
                    // Continue with the rest of the process even if analytics fails
                }
                
                // Process form and save data to Firebase
                processFormData(formData, client_mac, node_mac)
                    .then(sessionID => {
                        // DEBUGGING: Log the session ID
                        console.log('WiFi LOGIN DEBUG: Generated session ID:', sessionID);
                        
                        // Get the Meraki parameters for redirection
                        let redirectUrl = '';
                        
                        try {
                            // First, ensure we have properly decoded base_grant_url and user_continue_url
                            // For maximum compatibility, try to use the format directly from Meraki documentation
                            
                            console.log('WiFi LOGIN DEBUG: Original base_grant_url:', base_grant_url);
                            console.log('WiFi LOGIN DEBUG: Original user_continue_url:', user_continue_url);
                            
                            // Remove URL encoding if present
                            let decodedBaseGrantUrl = base_grant_url;
                            let decodedContinueUrl = user_continue_url;
                            
                            try {
                                if (decodedBaseGrantUrl.includes('%')) {
                                    decodedBaseGrantUrl = decodeURIComponent(decodedBaseGrantUrl);
                                }
                                if (decodedContinueUrl && decodedContinueUrl.includes('%')) {
                                    decodedContinueUrl = decodeURIComponent(decodedContinueUrl);
                                }
                            } catch (e) {
                                console.error('WiFi LOGIN DEBUG: Error decoding URLs:', e);
                            }
                            
                            console.log('WiFi LOGIN DEBUG: Decoded base_grant_url:', decodedBaseGrantUrl);
                            console.log('WiFi LOGIN DEBUG: Decoded user_continue_url:', decodedContinueUrl);
                            
                            // Try multiple formats of the URL to ensure compatibility
                            
                            // Format 1: Standard format per Meraki documentation
                            const format1 = `${decodedBaseGrantUrl}?continue_url=${encodeURIComponent(decodedContinueUrl)}&duration=3600`;
                            console.log('WiFi LOGIN DEBUG: Format 1 URL:', format1);
                            
                            // Format 2: Using base_grant_url directly (some deployments need this)
                            const format2 = decodedBaseGrantUrl;
                            console.log('WiFi LOGIN DEBUG: Format 2 URL:', format2);
                            
                            // Format 3: With only continue_url parameter
                            const format3 = `${decodedBaseGrantUrl}?continue_url=${encodeURIComponent(decodedContinueUrl)}`;
                            console.log('WiFi LOGIN DEBUG: Format 3 URL:', format3);
                            
                            // Format 4: Alternative parameter order
                            const format4 = `${decodedBaseGrantUrl}?duration=3600&continue_url=${encodeURIComponent(decodedContinueUrl)}`;
                            console.log('WiFi LOGIN DEBUG: Format 4 URL:', format4);
                            
                            // Store the URLs for redirection
                            redirectUrl = format1; // Use the standard format as the primary URL
                            
                            // Store all formats in localStorage for emergency recovery
                            localStorage.setItem('merakiFormat1', format1);
                            localStorage.setItem('merakiFormat2', format2);
                            localStorage.setItem('merakiFormat3', format3);
                            localStorage.setItem('merakiFormat4', format4);
                            
                        } catch (urlError) {
                            console.error('WiFi LOGIN DEBUG: Error constructing URLs:', urlError);
                            // Fallback to basic format
                            redirectUrl = base_grant_url;
                        }
                        
                        // Show success message before redirect
                        displaySuccess('Login successful! Connecting to WiFi...');
                        console.log('WiFi LOGIN DEBUG: Success message displayed, redirecting in 1.5 seconds');
                        
                        // Create a more reliable redirection function with multiple fallbacks
                        function safeRedirect(url, attempts) {
                            console.log(`WiFi LOGIN DEBUG: Trying redirect attempt ${attempts} to:`, url);
                            
                            // Create a popup message to inform the user
                            const popupDiv = document.createElement('div');
                            popupDiv.style.position = 'fixed';
                            popupDiv.style.bottom = '10px';
                            popupDiv.style.left = '10px';
                            popupDiv.style.right = '10px';
                            popupDiv.style.padding = '10px';
                            popupDiv.style.backgroundColor = '#ffeb3b';
                            popupDiv.style.color = '#000';
                            popupDiv.style.borderRadius = '5px';
                            popupDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                            popupDiv.style.zIndex = '9999';
                            popupDiv.innerHTML = `
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span>If not redirected automatically, <a href="${url}" style="color:#0066cc;font-weight:bold;">click here</a> to connect.</span>
                                <button style="background:transparent;border:none;font-size:20px;cursor:pointer;" onclick="this.parentNode.parentNode.remove()">×</button>
                                </div>
                            `;
                            document.body.appendChild(popupDiv);
                            
                            // Try multiple redirection methods
                            try {
                                // Method 1: window.location.href (most compatible)
                                window.location.href = url;
                                
                                // Add some fallback methods with timeouts
                                setTimeout(() => {
                                    try {
                                        // Method 2: Create and click a link
                                        const link = document.createElement('a');
                                        link.setAttribute('href', url);
                                        link.style.display = 'none';
                                        document.body.appendChild(link);
                                        link.click();
                                    } catch (e) {
                                        console.warn('WiFi LOGIN DEBUG: Link click method failed:', e);
                                    }
                                }, 300);
                                
                                setTimeout(() => {
                                    try {
                                        // Method 3: Try window.location.replace
                                        window.location.replace(url);
                                    } catch (e) {
                                        console.warn('WiFi LOGIN DEBUG: Replace method failed:', e);
                                    }
                                }, 600);
                                
                                setTimeout(() => {
                                    try {
                                        // Method 4: Try window.open
                                        window.open(url, '_self');
                                    } catch (e) {
                                        console.warn('WiFi LOGIN DEBUG: Window open method failed:', e);
                                    }
                                }, 900);
                                
                            } catch (error) {
                                console.error('WiFi LOGIN DEBUG: All redirect methods failed:', error);
                            }
                        }
                        
                        // Attempt redirects with multiple URL formats
                        setTimeout(() => {
                            try {
                                // Get URLs from localStorage (in case they've been updated)
                                const format1 = localStorage.getItem('merakiFormat1') || redirectUrl;
                                const format2 = localStorage.getItem('merakiFormat2') || decodedBaseGrantUrl;
                                const format3 = localStorage.getItem('merakiFormat3');
                                const format4 = localStorage.getItem('merakiFormat4');
                                
                                // First attempt with format 1 (standard)
                                safeRedirect(format1, 1);
                                
                                // Set up fallbacks with different formats
                                setTimeout(() => {
                                    if (document.visibilityState !== 'hidden') {
                                        console.log('WiFi LOGIN DEBUG: User still here, trying format 2...');
                                        safeRedirect(format2, 2);
                                        
                                        setTimeout(() => {
                                            if (document.visibilityState !== 'hidden') {
                                                console.log('WiFi LOGIN DEBUG: User still here, trying format 3...');
                                                safeRedirect(format3, 3);
                                                
                                                setTimeout(() => {
                                                    if (document.visibilityState !== 'hidden') {
                                                        console.log('WiFi LOGIN DEBUG: Final attempt with format 4...');
                                                        safeRedirect(format4, 4);
                                                    }
                                                }, 2000);
                                            }
                                        }, 2000);
                                    }
                                }, 2000);
                                
                            } catch (redirectError) {
                                console.error('WiFi LOGIN DEBUG: Error during redirect sequence:', redirectError);
                                alert('Connection issue detected. Please click the link in the yellow box to connect.');
                            }
                        }, 1500);
                    })
                    .catch(error => {
                        console.error('WiFi LOGIN DEBUG: Form submission failed:', error);
                        displayError('Error: ' + error.message);
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

    // Function to write user data to Firebase using the proper Firebase methods
    async function writeUserData(data, client_mac, node_mac) {
        console.log('WiFi LOGIN DEBUG: Starting writeUserData function');
        
        try {
            // Validate required parameters
            if (!client_mac) {
                console.error('WiFi LOGIN DEBUG: Missing client_mac in writeUserData');
                throw new Error('Missing client MAC address');
            }
            
            // Generate a session ID if not already provided
            const sessionID = data.sessionID || generateSessionID();
            console.log('WiFi LOGIN DEBUG: Using session ID:', sessionID);
            
            // Create wifi login data structure
            const loginData = {
                timestamp: data.timestamp || new Date().toISOString(),
                name: data.name || '',
                email: data.email || '',
                phoneNumber: data.phoneNumber || '', // Changed from 'phone' to 'phoneNumber' for consistency
                client_mac: client_mac,
                node_mac: node_mac || '',
                client_ip: data.client_ip || '',
                sessionID: sessionID,
                active: true,
                message: data.message || ''
            };
            console.log('WiFi LOGIN DEBUG: Login data prepared:', loginData);
            
            // Create a new entry in the wifiLogins collection
            console.log('WiFi LOGIN DEBUG: Writing to wifiLogins path...');
            try {
                await set(ref(rtdb, `wifiLogins/${sessionID}`), loginData);
                console.log('WiFi LOGIN DEBUG: Successfully wrote to wifiLogins path');
            } catch (fbError) {
                console.error('WiFi LOGIN DEBUG: Error writing to wifiLogins:', fbError);
                throw fbError;
            }
            
            // Add to active users
            console.log('WiFi LOGIN DEBUG: Writing to activeUsers path...');
            try {
                await set(ref(rtdb, `activeUsers/${client_mac}`), {
                    sessionID: sessionID,
                    timestamp: loginData.timestamp,
                    lastSeen: loginData.timestamp,
                    name: loginData.name || '',
                    email: loginData.email || '',
                    phoneNumber: loginData.phoneNumber || '' // Added phone number to activeUsers record
                });
                console.log('WiFi LOGIN DEBUG: Successfully wrote to activeUsers path');
            } catch (fbError) {
                console.error('WiFi LOGIN DEBUG: Error writing to activeUsers:', fbError);
                // Continue even if this fails
            }
            
            console.log('WiFi LOGIN DEBUG: All Firebase writes completed successfully');
            return sessionID;
        } catch (error) {
            console.error('WiFi LOGIN DEBUG: Error in writeUserData:', error);
            throw error;
        }
    }

    // Function to store user preferences in Firebase using MAC address as the key
    async function storeUserPreferences(macAddress, preferences) {
        if (!macAddress) return;
        
        try {
            await set(ref(rtdb, 'userPreferences/' + macAddress), {
                ...preferences,
                updatedAt: Date.now()
            });
            console.log('Preferences saved for MAC:', macAddress);
        } catch (error) {
            console.error('Error saving preferences:', error);
            throw error; // Rethrow to be handled by the caller
        }
    }
    
    // Function to log user connection data
    async function logUserConnection(data) {
        try {
            console.log('WiFi LOGIN DEBUG: logUserConnection called with data:', data);
            
            // Ensure we have valid data values and provide defaults where necessary
            const date = new Date();
            const localTimestamp = date.toLocaleString();
            const sessionID = data.sessionID || localStorage.getItem('sessionID') || generateSessionID();
            
            // Store sessionID for potential future use
            localStorage.setItem('sessionID', sessionID);
            
            // Extract and validate the MAC address - this is the source of the error
            const macAddress = data.client_mac || data.macAddress || '';
            
            if (!macAddress) {
                console.warn('WiFi LOGIN DEBUG: No MAC address provided for connection logging');
            }
            
            console.log('WiFi LOGIN DEBUG: Using MAC address:', macAddress);
            console.log('WiFi LOGIN DEBUG: Using session ID:', sessionID);
        
            const connectionData = {
                sessionID: sessionID,
                name: data.name || '',
                email: data.email || '',
                table: data.table || '',
                phoneNumber: data.phoneNumber || '',
                macAddress: macAddress,
                connectionTime: localTimestamp,
                timestamp: Date.now(),
                status: 'connected'
            };
            
            console.log('WiFi LOGIN DEBUG: Connection data prepared:', connectionData);
        
            // Store the connection data in Firebase under the 'activeUsers' node
            if (sessionID) {
                console.log(`WiFi LOGIN DEBUG: Writing to activeUsers/${sessionID}`);
                await set(ref(rtdb, `activeUsers/${sessionID}`), connectionData);
                console.log('WiFi LOGIN DEBUG: Successfully wrote connection data to Firebase');
            } else {
                throw new Error('Invalid session ID for connection logging');
            }
            
            // Set up disconnect handler
            window.addEventListener('beforeunload', function() {
                logUserDisconnection(sessionID);
            });
            
            return sessionID;
        } catch (error) {
            console.error('Database operation failed in logUserConnection:', error);
            // Don't throw the error, just log it and return a session ID anyway
            // This prevents the connection error from blocking the WiFi login
            return data.sessionID || localStorage.getItem('sessionID') || generateSessionID();
        }
    }
    
    // Function to log user disconnection
    async function logUserDisconnection(sessionID) {
        if (!sessionID) return;
        
        try {
            const disconnectionTime = new Date().toLocaleString();
            
            // Update the status of the session to 'disconnected'
            await update(ref(rtdb, 'activeUsers/' + sessionID), {
                status: 'disconnected',
                disconnectionTime: disconnectionTime,
                disconnectedAt: Date.now()
            });
        } catch (error) {
            console.error('Database operation failed in logUserDisconnection:', error);
            // No need to throw as this is called during page unload
        }
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
});
