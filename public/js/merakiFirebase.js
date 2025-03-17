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
        phoneInput = window.intlTelInput(phoneInputField, {
            initialCountry: "auto",
            preferredCountries: ["za"],
            separateDialCode: true,
            utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js",
            geoIpLookup: function(callback) {
                fetch('https://ipinfo.io/json')
                    .then(response => response.json())
                    .then(data => callback(data.country))
                    .catch(() => callback('za')); // Default to South Africa if geolocation fails
            }
        });
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
                    table: tableInput ? tableInput.value : ''
                };
                
                // Add phone number if available
                if (phoneInputField && phoneInput) {
                    formData.phoneNumber = phoneInput.getNumber();
                }
                
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
                        
                        // Redirect to Meraki auth URL
                        const duration = 3600; // 1 hour session duration
                        
                        // Make sure base_grant_url is valid
                        if (!base_grant_url || base_grant_url === "undefined") {
                            console.error('WiFi LOGIN DEBUG: Missing base_grant_url for redirection!');
                            displayError('Missing Meraki authentication URL. Please refresh the page and try again.');
                            return;
                        }
                        
                        // Clean and sanitize the URL
                        let loginUrl = base_grant_url.trim();
                        console.log('WiFi LOGIN DEBUG: Base grant URL (cleaned):', loginUrl);
                        
                        // Check if the URL already has query parameters
                        const hasQueryParams = loginUrl.includes('?');
                        const paramConnector = hasQueryParams ? '&' : '?';
                        console.log('WiFi LOGIN DEBUG: URL has existing parameters:', hasQueryParams);
                        console.log('WiFi LOGIN DEBUG: Parameter connector to use:', paramConnector);
                        
                        // Build the parameters separately
                        let params = new URLSearchParams();
                        
                        // DEBUGGING: Log user_continue_url details
                        console.log('WiFi LOGIN DEBUG: user_continue_url present:', !!user_continue_url);
                        console.log('WiFi LOGIN DEBUG: user_continue_url value:', user_continue_url);
                        
                        if (user_continue_url && user_continue_url !== "undefined") {
                            params.append('continue_url', user_continue_url);
                            console.log('WiFi LOGIN DEBUG: Added continue_url parameter:', user_continue_url);
                        } else {
                            console.log('WiFi LOGIN DEBUG: No continue_url parameter added (missing or undefined)');
                        }
                        
                        params.append('duration', duration.toString());
                        console.log('WiFi LOGIN DEBUG: Added duration parameter:', duration);
                        
                        // Debug the params object
                        console.log('WiFi LOGIN DEBUG: URLSearchParams string:', params.toString());
                        
                        // Append params to the URL using the correct connector
                        loginUrl += paramConnector + params.toString();
                        
                        // DEBUGGING: Log the final URL
                        console.log('WiFi LOGIN DEBUG: FINAL Redirect URL:', loginUrl);
                        
                        // Log WiFi connection to analytics
                        try {
                            console.log('WiFi LOGIN DEBUG: Logging WiFi connection to analytics...');
                            logWiFiConnection({
                                sessionID: sessionID,
                                macAddress: client_mac,
                                duration: duration
                            });
                            console.log('WiFi LOGIN DEBUG: Successfully logged WiFi connection');
                        } catch (error) {
                            console.error('WiFi LOGIN DEBUG: Failed to log WiFi connection:', error);
                            // Continue with the redirect even if analytics fails
                        }
                        
                        // Show success message before redirect
                        displaySuccess('Login successful! Connecting to WiFi...');
                        console.log('WiFi LOGIN DEBUG: Success message displayed, redirecting in 1.5 seconds');
                        
                        // Redirect after a short delay to show the success message
                        setTimeout(() => {
                            console.log('WiFi LOGIN DEBUG: Now redirecting to:', loginUrl);
                            window.location.href = loginUrl;
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
            
            // Add timestamp
            formData.timestamp = new Date().toISOString();
            formData.sessionID = sessionID;
            
            // Store the user data in Firebase
            console.log('WiFi LOGIN DEBUG: Writing user data to Firebase...');
            await writeUserData(formData, client_mac, node_mac);
            console.log('WiFi LOGIN DEBUG: User data written successfully');
            
            // Store user preferences if available
            if (formData.name || formData.email || formData.phone) {
                console.log('WiFi LOGIN DEBUG: Storing user preferences...');
                const preferences = {
                    name: formData.name || '',
                    email: formData.email || '',
                    phone: formData.phone || '',
                    lastLogin: formData.timestamp
                };
                await storeUserPreferences(client_mac, preferences);
                console.log('WiFi LOGIN DEBUG: User preferences stored successfully');
            }
            
            // Log connection for analytics
            console.log('WiFi LOGIN DEBUG: Logging user connection...');
            await logUserConnection({
                timestamp: formData.timestamp,
                sessionID: sessionID,
                client_mac: client_mac,
                node_mac: node_mac,
                ...formData
            });
            console.log('WiFi LOGIN DEBUG: User connection logged successfully');
            
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
                phone: data.phone || '',
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
                    lastSeen: loginData.timestamp
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
            const date = new Date();
            const localTimestamp = date.toLocaleString();
            const sessionID = localStorage.getItem('sessionID') || generateSessionID();
            localStorage.setItem('sessionID', sessionID);
        
            const connectionData = {
                sessionID: sessionID,
                name: data.name,
                email: data.email,
                table: data.table,
                phoneNumber: data.phoneNumber || '',
                macAddress: data.macAddress,
                connectionTime: localTimestamp,
                timestamp: Date.now(),
                status: 'connected'
            };
        
            // Store the connection data in Firebase under the 'activeUsers' node
            await set(ref(rtdb, 'activeUsers/' + sessionID), connectionData);
            
            // Set up disconnect handler
            window.addEventListener('beforeunload', function() {
                logUserDisconnection(sessionID);
            });
            
            return sessionID;
        } catch (error) {
            console.error('Database operation failed in logUserConnection:', error);
            throw error; // Rethrow to be handled by the caller
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
