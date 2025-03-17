/*
This script collects guest WiFi login form data, processes the parameters sent by Meraki,
stores the results in a Firebase database, and authenticates the user with the Meraki WiFi network.
*/

// Import Firebase modules from the centralized config file
import { rtdb, ref, set, update, push, get } from './config/firebase-config.js';
import { logPageView, logFormSubmission, logWiFiConnection } from './config/firebase-analytics.js';

document.addEventListener('DOMContentLoaded', function() {
    // Log page view with Firebase Analytics
    try {
        logPageView('captive_portal');
    } catch (error) {
        console.error('Failed to log page view:', error);
    }

    // Parse Meraki supplied parameters
    const base_grant_url = decodeURIComponent(GetURLParameter("base_grant_url") || '');
    const user_continue_url = decodeURIComponent(GetURLParameter("user_continue_url") || '');
    const node_mac = GetURLParameter("node_mac") || '';
    const client_ip = GetURLParameter("client_ip") || '';
    const client_mac = GetURLParameter("client_mac") || '';

    // Log parameters to console for debugging
    console.log("Meraki Parameters:", {
        base_grant_url,
        user_continue_url,
        node_mac,
        client_ip,
        client_mac
    });

    // Initialize phone input field with international telephone input library
    const phoneInputField = document.querySelector("#phone");
    let phoneInput;
    
    if (phoneInputField) {
        phoneInput = window.intlTelInput(phoneInputField, {
            initialCountry: "auto",
            geoIpLookup: function(callback) {
                fetch('https://ipinfo.io/json')
                    .then(response => response.json())
                    .then(data => callback(data.country))
                    .catch(() => callback('za')); // Default to South Africa if geolocation fails
            },
            utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js"
        });
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
                        // Redirect to Meraki auth URL
                        const duration = 3600; // 1 hour session duration
                        let loginUrl = base_grant_url;
                        
                        if (user_continue_url && user_continue_url !== "undefined") {
                            // Add the user's intended website to the login parameters
                            loginUrl += "?continue_url=" + encodeURIComponent(user_continue_url) + 
                                      "&duration=" + duration;
                        } else {
                            loginUrl += "?duration=" + duration;
                        }
                        
                        console.log('Redirecting to:', loginUrl);
                        
                        // Log WiFi connection to analytics
                        try {
                            logWiFiConnection({
                                sessionID: sessionID,
                                macAddress: client_mac,
                                duration: duration
                            });
                        } catch (error) {
                            console.error('Failed to log WiFi connection:', error);
                            // Continue with the redirect even if analytics fails
                        }
                        
                        // Show success message before redirect
                        displaySuccess('Login successful! Connecting to WiFi...');
                        
                        // Redirect after a short delay to show the success message
                        setTimeout(() => {
                            window.location.href = loginUrl;
                        }, 1500);
                    })
                    .catch(error => {
                        console.error('Error during form processing:', error);
                        displayError('An error occurred while processing your request. Please try again.');
                    });
            } else {
                displayError('Please correct the errors in the form before submitting.');
                
                // Scroll to the first invalid field
                const firstInvalid = document.querySelector('.is-invalid');
                if (firstInvalid) {
                    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    firstInvalid.focus();
                }
            }
        });
    }
    
    // Process form data and save to Firebase
    async function processFormData(formData, client_mac, node_mac) {
        try {
            console.log('Saving data to Firebase:', formData);
            // Write user data to Firebase
            const sessionID = await writeUserData(formData, client_mac, node_mac);
            
            // Store user preferences
            const userPreferences = {
                theme: 'light',
                language: 'en'
            };
            await storeUserPreferences(client_mac, userPreferences);
            
            // Log connection
            await logUserConnection({
                ...formData,
                macAddress: client_mac
            });
            
            return sessionID;
        } catch (error) {
            console.error('Error in processFormData:', error);
            throw error; // Rethrow to be handled by the caller
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
        try {
            const date = new Date();
            const localTimestamp = date.toLocaleString(); // User's local time
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; // User's time zone
            const sessionID = localStorage.getItem('sessionID') || generateSessionID(); // Retrieve or generate session ID
            localStorage.setItem('sessionID', sessionID);
            const deviceType = navigator.userAgent; // Captures the device's user agent string

            // Store user data in Firebase under the session ID using proper Firebase methods
            await set(ref(rtdb, 'wifiLogins/' + sessionID), {
                name: data.name,
                email: data.email,
                table: data.table,
                phoneNumber: data.phoneNumber || '',
                macAddress: client_mac,
                accessPointMAC: node_mac,
                localTimeStamp: localTimestamp,
                timeZone: timeZone,
                deviceType: deviceType,
                createdAt: Date.now()
            });
            
            return sessionID;
        } catch (error) {
            console.error('Database operation failed in writeUserData:', error);
            throw error; // Rethrow to be handled by the caller
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
