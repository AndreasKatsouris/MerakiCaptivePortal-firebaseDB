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

    //alert('Step 1: DOMContentLoaded event triggered. Press OK to initialize Firebase.');
    firebase.initializeApp(config);
    
   // alert('Step 2: Firebase initialized. Press OK to proceed to analytics initialization.');
    // Initialize Firebase Analytics
    const analytics = firebase.analytics();

    // Log an event when the page loads
    analytics.logEvent('page_view', { page: 'captive_portal' });

   // alert('Step 3: Firebase Analytics initialized. Press OK to proceed to database reference setup.');

    // Get a reference to the database service
    const database = firebase.database();

   // alert('Step 4: Database reference set up. Press OK to parse Meraki parameters.');

    // Parse Meraki supplied parameters
    const base_grant_url = decodeURIComponent(GetURLParameter("base_grant_url"));
    const user_continue_url = decodeURIComponent(GetURLParameter("user_continue_url"));
    const node_mac = GetURLParameter("node_mac");
    const client_ip = GetURLParameter("client_ip");
    const client_mac = GetURLParameter("client_mac");

    // Apply customization settings from Firebase
    // Updated Customization Settings
    firebase.database().ref('customization/').once('value')
     .then(snapshot => {
         const settings = snapshot.val();
         if (settings) {
             applySettings(settings);
         } else {
             console.error('No customization settings found.');
             displayError('No customization settings found. Default settings will be applied.');
         }
     })
     .catch(error => {
         console.error('Error retrieving settings:', error);
         displayError('Error retrieving settings. Default settings will be applied.');
     });
     function applySettings(settings) {
        document.body.style.backgroundColor = settings.bgColor || '#ffffff'; // Default to white if no bgColor
        document.body.style.fontFamily = settings.font || 'Arial, sans-serif'; // Default to Arial if no font
        document.body.style.fontSize = settings.fontSize ? settings.fontSize + 'px' : '14px'; // Default to 14px if no fontSize
    
        const logoElement = document.getElementById('logo');
        if (settings.logoURL && logoElement) {
            logoElement.src = settings.logoURL;
        } else {
            displayError('No logo URL found. Default logo will be displayed.');
        }
        // Apply background image if set
        if (settings.bgImageURL) {
            document.body.style.backgroundImage = `url(${settings.bgImageURL})`;
            document.body.style.backgroundSize = 'cover'; // Ensure the image covers the whole background
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundRepeat = 'no-repeat';
            
        }

     }
     function displayError(message) {
        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.style.display = 'block';
        } else {
            console.warn('Error container not found on the page.');
        }
    }
     /** 
     firebase.database().ref('customization/').once('value').then(snapshot => {
        
        const settings = snapshot.val();
        console.log('Retrieved settings:', settings); // Debugging: Output retrieved settings
        if (settings) {
            const styleSheet = document.styleSheets[0]; // Assuming it's the first stylesheet
            styleSheet.insertRule(`body { background-color: ${settings.bgColor}; }`, styleSheet.cssRules.length);
            //document.body.style.backgroundColor = settings.bgColor;
            document.body.style.backgroundColor = `${settings.bgColor} !important`;
            document.body.style.fontFamily = settings.font;
            document.body.style.fontSize = settings.fontSize + 'px';
  
            if (settings.logoURL) {
                document.getElementById('logo').src = settings.logoURL;
            }
        } else {
            console.error('No customization settings found.');
        }
    }).catch(error => console.error('Error retrieving settings:', error));
*/
   // alert(`Step 5: Parameters parsed.\nBase Grant URL: ${base_grant_url}\nUser Continue URL: ${user_continue_url}\nClient IP: ${client_ip}\nPress OK to log these parameters to the console.`);

    // Print Meraki provided parameters to console
    console.log("base_grant_url:", base_grant_url);
    console.log("client_ip:", client_ip);
    console.log("user_continue_url:", user_continue_url);

   // alert('Step 6: Parameters logged. Press OK to proceed to form submission setup.');

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
        //alert('Step 7: Form submission triggered. Press OK to start validation.');
        console.log("Processing loginForm");
        event.preventDefault();
        removeValidationMessages();

        let isValid = true;

        // Get form values
        const name = document.querySelector("input#username");
        const email = document.querySelector("input#email");
        const table = document.querySelector("input#table");

        //alert('Step 8: Form values captured. Press OK to validate.');

        //const phoneInputField = document.querySelector("input#phone");
        /** const phoneInput = window.intlTelInput(phoneInputField, {
            initialCountry: "auto",
            geoIpLookup: function(callback) {
                fetch('https://ipinfo.io/json')
                        .then(response => response.json())
                        .then(data => callback(data.country))
                        .catch(() => callback('us'));
                },
            utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js"
        });
        //const phoneInput = window.intlTelInput(phoneInputField, {
        //    utilsScript:
        //      "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js",
        //  });
        const phoneNumber = phoneInput.getNumber(); // Get the complete number including country code
        */
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

        if (!validateTable(table.value)) {
            showValidationMessage(table, "Please enter a valid table number.");
            isValid = false;
        }

        if (!termsChecked) {
            showValidationMessage(document.querySelector("#terms"), "You must agree to the terms and conditions.");
            isValid = false;
        }
        // Validate Phone Number
        //const phoneNumber = phoneInput.getNumber();
        //if (!phoneNumber.isValidNumber()) {
        //    showValidationMessage(phoneInputField, "Please enter a valid phone number.");
        //    isValid = false;
        //}

        //alert(`Step 9: Validation complete. Is the data valid? ${isValid}. Press OK to proceed.`);

        console.log("Is all DATA valid ?", isValid);
        // If all validations pass, proceed with form submission
        if (isValid) {
            const formData = {
                "name": name.value,
                "email": email.value,
                "table": table.value//,
                //"phoneNumber": phoneNumber
            };
            //alert('Step 10: Data is valid. Press OK to log the form submission to Firebase Analytics.');
             // Log the form submission event to Firebase Analytics
            analytics.logEvent('form_submission', formData);

            //alert('Step 11: Data logged to analytics. Press OK to save data to Firebase.');

            // Save data to Firebase
            console.log("Saving form data", formData);
            writeUserData(formData, client_mac, node_mac);

            /** Redirect to Meraki auth URL
            let loginUrl = base_grant_url;
            if (user_continue_url !== "undefined") {
                loginUrl += "?continue_url=" + encodeURIComponent(user_continue_url);
            }*/
                let duration = 3600;
                var loginUrl = base_grant_url;
                if(user_continue_url !== "undefined"){
                    // add the users intended website to the login parameters.
                    // You could also re-write the user_continue_url if you wanted a custom 
                    // landing page.
                    loginUrl += "?continue_url="+user_continue_url + "?duration=" + duration;
                }
            //alert(`Step 12: Form data saved. Press OK to log in.\nRedirecting to: ${loginUrl}`);
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

    function validateTable(table) {
        return table.trim() !== "";
    }

    // Function to write user data to Firebase
    function writeUserData(data, client_mac, node_mac) {
        const date = new Date();
        const localTimestamp = date.toLocaleString(); // User's local time
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; // User's time zone
        const sessionID = localStorage.getItem('sessionID') || generateNewSessionID(); // Retrieve the session ID
        localStorage.setItem('sessionID', sessionID);
        const deviceType = navigator.userAgent; // Captures the device's user agent string
        //const timestamp = date.getTime(); // Get the exact time of connection in milliseconds since Unix Epoch

        // Store user data in Firebase under the session ID
        database.ref('wifiLogins/' + sessionID).set({
            name: data.name,
            email: data.email,
            table: data.table,
            //phoneNumber: data.phoneNumber,
            macAddress: client_mac,
            accessPointMAC: node_mac,
            //timeStamp: timestamp,
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
    
    // Capturing Connection Data
    function logUserConnection(data) {
        const date = new Date();
        const localTimestamp = date.toLocaleString(); // User's local time
        const sessionID = localStorage.getItem('sessionID') || generateNewSessionID(); // Retrieve or generate the session ID
        localStorage.setItem('sessionID', sessionID);
    
        const connectionData = {
            sessionID: sessionID,
            name: data.name,
            email: data.email,
            table : data.table,
            macAddress: data.macAddress,
            connectionTime: localTimestamp,
            status: 'connected' // Indicate the user is currently connected
        };
    
        // Store the connection data in Firebase under the 'activeUsers' node
        firebase.database().ref('activeUsers/' + sessionID).set(connectionData);
    }
    function logUserDisconnection(sessionID) {
        const disconnectionTime = new Date().toLocaleString(); // Get the current time
    
        // Update the status of the session to 'disconnected'
        firebase.database().ref('activeUsers/' + sessionID).update({
            status: 'disconnected',
            disconnectionTime: disconnectionTime
        });
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
