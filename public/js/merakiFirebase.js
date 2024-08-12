/*
This script will collect the form data and parameters sent by Meraki, store the results
in a Firebase database, then log the user into the Meraki WiFi network.
*/

// Initialize Firebase
const config = {
    apiKey: "AIzaSyBf96GNLhtz6FDdbLxIW9efh98WG__eQmk",
    authDomain: "merakicaptiveportal-firebasedb.firebaseapp.com",
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    projectId: "merakicaptiveportal-firebasedb",
    storageBucket: "merakicaptiveportal-firebasedb.appspot.com",
    messagingSenderId: "899985637961",
    appId: "1:899985637961:web:9c00572c7fec3a671e3598",
    measurementId: "G-476KXB93TV"
};

document.addEventListener('DOMContentLoaded', function() {
    firebase.initializeApp(config);

    // Initialize Firebase Analytics
    const analytics = firebase.analytics();

    // Log an event when the page loads
    analytics.logEvent('page_view', { page: 'captive_portal' });

    // Get a reference to the database service
    const database = firebase.database();

    // Parse Meraki supplied parameters
    const base_grant_url = decodeURIComponent(GetURLParameter("base_grant_url"));
    const user_continue_url = decodeURIComponent(GetURLParameter("user_continue_url"));
    const node_mac = GetURLParameter("node_mac");
    const client_ip = GetURLParameter("client_ip");
    const client_mac = GetURLParameter("client_mac");

    // Print Meraki provided parameters to console
    console.log("base_grant_url:", base_grant_url);
    console.log("client_ip:", client_ip);

    // Display Parameters for Demo (only if elements exist)
    const baseGrantElement = document.querySelector("div.baseGrantURL");
    if (baseGrantElement) baseGrantElement.textContent = base_grant_url;

    const userContinueElement = document.querySelector("div.userContinueURL");
    if (userContinueElement) userContinueElement.textContent = user_continue_url;

    const clientIPElement = document.querySelector("div.clientIP");
    if (clientIPElement) clientIPElement.textContent = client_ip;

    const clientMACElement = document.querySelector("div.clientMAC");
    if (clientMACElement) clientMACElement.textContent = client_mac;

    const nodeMACElement = document.querySelector("div.nodeMAC");
    if (nodeMACElement) nodeMACElement.textContent = node_mac;

    // Function to show validation messages
    function showValidationMessage(element, message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'validation-message';
        messageElement.textContent = message;
        element.parentNode.appendChild(messageElement);
    }

    // Function to remove all validation messages
    function removeValidationMessages() {
        const messages = document.querySelectorAll('.validation-message');
        messages.forEach(message => message.remove());
    }

    // Handle Form Submission
    document.querySelector('form').addEventListener('submit', function(event) {
        console.log("Processing loginForm");
        event.preventDefault();
        removeValidationMessages();

        let isValid = true;

        // Get form values
        const name = document.querySelector("input#username");
        const email = document.querySelector("input#email");
        const company = document.querySelector("input#company");
        const termsChecked = document.querySelector("#terms").checked;

        // Validate the inputs
        if (!validateName(name.value)) {
            showValidationMessage(name, "Please enter a valid full name (first name and surname).");
            isValid = false;
        }

        if (!validateEmail(email.value)) {
            showValidationMessage(email, "Please enter a valid email address.");
            isValid = false;
        }

        if (!validateCompany(company.value)) {
            showValidationMessage(company, "Please enter a valid company name.");
            isValid = false;
        }

        if (!termsChecked) {
            showValidationMessage(document.querySelector("#terms"), "You must agree to the terms and conditions.");
            isValid = false;
        }

        // If all validations pass, proceed with form submission
        if (isValid) {
            const formData = {
                "name": name.value,
                "email": email.value,
                "company": company.value
            };

            // Log the form submission event to Firebase Analytics
            analytics.logEvent('form_submission', formData);

            // Save data to Firebase
            console.log("Saving form data", formData);
            writeUserData(formData, client_mac, node_mac);

            // Redirect to Meraki auth URL
            let loginUrl = base_grant_url;
            if (user_continue_url !== "undefined") {
                loginUrl += "?continue_url=" + user_continue_url;
            }
            console.log("Logging in...", loginUrl);
            window.location.href = loginUrl;
        }
    });

    function validateName(name) {
        name = name.trim();
        const nameParts = name.split(/\s+/);
        return nameParts.length >= 2 && nameParts.every(part => /^[a-zA-Z'-]+$/.test(part));
    }

    function validateEmail(email) {
        const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        return emailPattern.test(email);
    }

    function validateCompany(company) {
        return company.trim() !== "";
    }

    // Function to write user data to Firebase
    function writeUserData(data, client_mac, node_mac) {
        const date = new Date();
        const localTimestamp = date.toLocaleString(); // User's local time
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; // User's time zone
        const sessionID = localStorage.getItem('sessionID'); // Retrieve the session ID
        const deviceType = navigator.userAgent; // Captures the device's user agent string
        const timestamp = date.getTime(); // Get the exact time of connection in milliseconds since Unix Epoch

        // Store user data in Firebase under the session ID
        database.ref('wifiLogins/' + sessionID).set({
            name: data.name,
            email: data.email,
            company: data.company,
            macAddress: client_mac,
            accessPointMAC: node_mac,
            timeStamp: timestamp,
            localTimeStamp: localTimestamp, // User's local time
            timeZone: timeZone, // User's time zone name
            deviceType: deviceType, // Device type/user agent

        });
    }
        // Function to store user preferences in Firebase using MAC address as the key
        function storeUserPreferences(macAddress, preferences) {
            firebase.database().ref('users/' + macAddress).set(preferences)
                .then(() => console.log('Preferences saved for MAC:', macAddress)) // Log success
                .catch(error => console.error('Error saving preferences:', error)); // Log any errors
        }

        // Example usage: Store preferences when the user selects them
        var userPreferences = {
            theme: 'dark', // User's preferred theme
            language: 'en' // User's preferred language
            // Additional preferences can be added here
        };
        storeUserPreferences(client_mac, userPreferences);
    
    

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
