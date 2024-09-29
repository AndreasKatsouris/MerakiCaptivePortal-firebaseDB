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

// Error handling function
function handleError(error, context) {
    console.error(`Error in ${context}:`, error);
    let userMessage = 'An unexpected error occurred. Please try again later.';
    
    if (error.code) {
        switch (error.code) {
            case 'PERMISSION_DENIED':
                userMessage = 'You do not have permission to perform this action.';
                break;
            case 'NETWORK_ERROR':
                userMessage = 'Network error. Please check your internet connection.';
                break;
            // Add more specific error codes as needed
        }
    }
    
    displayError(userMessage);
}

function displayError(message) {
    const errorContainer = document.getElementById('error-container');
    if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
    } else {
        console.warn('Error container not found on the page.');
        alert(message); // Fallback to alert if container is not found
    }
}

document.addEventListener('DOMContentLoaded', function() {
    firebase.initializeApp(config);
    
    const analytics = firebase.analytics();
    analytics.logEvent('page_view', { page: 'captive_portal' });

    const database = firebase.database();

    // Parse Meraki supplied parameters
    const base_grant_url = decodeURIComponent(GetURLParameter("base_grant_url"));
    const user_continue_url = decodeURIComponent(GetURLParameter("user_continue_url"));
    const node_mac = GetURLParameter("node_mac");
    const client_ip = GetURLParameter("client_ip");
    const client_mac = GetURLParameter("client_mac");

    // Apply customization settings from Firebase
    firebase.database().ref('customization/').once('value')
     .then(snapshot => {
         const settings = snapshot.val();
         if (settings) {
             applySettings(settings);
         } else {
             handleError(new Error('No customization settings found'), 'retrieving settings');
         }
     })
     .catch(error => handleError(error, 'retrieving settings'));

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

    // Add event listener for page unload to log user disconnection
    window.addEventListener('beforeunload', function() {
        const sessionID = localStorage.getItem('sessionID');
        if (sessionID) {
            logUserDisconnection(sessionID);
        }
    });

    // Improved form validation
    const validationRules = {
        username: {
            test: (value) => {
                const nameParts = value.trim().split(/\s+/);
                return nameParts.length >= 2 && nameParts.every(part => /^[a-zA-Z'-]+$/.test(part));
            },
            message: "Please enter a valid full name (first name and surname)."
        },
        email: {
            test: (value) => /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/.test(value),
            message: "Please enter a valid email address."
        },
        company: {
            test: (value) => value.trim() !== "",
            message: "Please enter a valid company name."
        },
        terms: {
            test: (value) => value === true,
            message: "You must agree to the terms and conditions."
        }
    };

    function validateForm(formData) {
        let isValid = true;
        const errors = {};

        for (const [field, rule] of Object.entries(validationRules)) {
            if (!rule.test(formData[field])) {
                isValid = false;
                errors[field] = rule.message;
            }
        }

        return { isValid, errors };
    }

    // Handle Form Submission
    document.querySelector('form').addEventListener('submit', function(event) {
        event.preventDefault();
        removeValidationMessages();
        
        const formData = {
            username: document.querySelector("#username").value,
            email: document.querySelector("#email").value,
            company: document.querySelector("#company").value,
            terms: document.querySelector("#terms").checked
        };

        const { isValid, errors } = validateForm(formData);

        if (isValid) {
            analytics.logEvent('form_submission', formData);
            writeUserData(formData, client_mac, node_mac);

            let duration = 3600;
            let loginUrl = base_grant_url;
            if(user_continue_url !== "undefined"){
                loginUrl += "?continue_url=" + user_continue_url + "?duration=" + duration;
            }
            console.log("Logging in...", loginUrl);
            window.location.href = loginUrl;
        } else {
            for (const [field, message] of Object.entries(errors)) {
                showValidationMessage(document.querySelector(`#${field}`), message);
            }
        }
    });

    function showValidationMessage(element, message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'validation-message';
        messageElement.textContent = message;
        element.parentNode.appendChild(messageElement);
    }

    function removeValidationMessages() {
        document.querySelectorAll('.validation-message').forEach(el => el.remove());
    }

    // Function to write user data to Firebase
    function writeUserData(data, client_mac, node_mac) {
        const date = new Date();
        const localTimestamp = date.toLocaleString();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const sessionID = localStorage.getItem('sessionID') || generateNewSessionID();
        localStorage.setItem('sessionID', sessionID);
        const deviceType = navigator.userAgent;

        database.ref('wifiLogins/' + sessionID).set({
            name: data.username,
            email: data.email,
            company: data.company,
            macAddress: client_mac,
            accessPointMAC: node_mac,
            localTimeStamp: localTimestamp,
            timeZone: timeZone,
            deviceType: deviceType,
        }).catch(error => handleError(error, 'writing user data'));

        // Log user connection
        logUserConnection({
            name: data.username,
            email: data.email,
            company: data.company,
            macAddress: client_mac
        });
    }

    function applySettings(settings) {
        document.body.style.backgroundColor = settings.bgColor || '#ffffff';
        document.body.style.fontFamily = settings.font || 'Arial, sans-serif';
        document.body.style.fontSize = settings.fontSize ? settings.fontSize + 'px' : '14px';
    
        const logoElement = document.getElementById('logo');
        if (settings.logoURL && logoElement) {
            logoElement.src = settings.logoURL;
        } else {
            displayError('No logo URL found. Default logo will be displayed.');
        }
    }

    function generateNewSessionID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function storeUserPreferences(macAddress, preferences) {
        firebase.database().ref('users/' + macAddress).set(preferences)
            .then(() => console.log('Preferences saved for MAC:', macAddress))
            .catch(error => handleError(error, 'saving user preferences'));
    }

    function logUserConnection(data) {
        const date = new Date();
        const localTimestamp = date.toLocaleString();
        const sessionID = localStorage.getItem('sessionID') || generateNewSessionID();
        localStorage.setItem('sessionID', sessionID);
    
        const connectionData = {
            sessionID: sessionID,
            name: data.name,
            email: data.email,
            company: data.company,
            macAddress: data.macAddress,
            connectionTime: localTimestamp,
            status: 'connected'
        };
    
        firebase.database().ref('activeUsers/' + sessionID).set(connectionData)
            .catch(error => handleError(error, 'logging user connection'));
    }

    function logUserDisconnection(sessionID) {
        const disconnectionTime = new Date().toLocaleString();
    
        // Use a synchronous XMLHttpRequest to ensure the request is sent before the page unloads
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/log-disconnect', false);  // 'false' makes the request synchronous
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        xhr.send(JSON.stringify({
            sessionID: sessionID,
            disconnectionTime: disconnectionTime
        }));

        // Note: We're not using Firebase here because the page is unloading,
        // and we can't guarantee an asynchronous request will complete
    }

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

// Add this function outside the DOMContentLoaded event listener
// to handle the disconnect logging on the server side
function handleDisconnectLogging(req, res) {
    const { sessionID, disconnectionTime } = req.body;
    
    firebase.database().ref('activeUsers/' + sessionID).update({
        status: 'disconnected',
        disconnectionTime: disconnectionTime
    }).then(() => {
        res.status(200).send('Disconnection logged successfully');
    }).catch(error => {
        console.error('Error logging disconnection:', error);
        res.status(500).send('Error logging disconnection');
    });
}

// You'll need to set up a route in your server to handle this request, e.g.:
// app.post('/log-disconnect', handleDisconnectLogging);