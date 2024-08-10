/*
This script will collect the form data and parameters sent by Meraki, store the results
in a Firebase database, then log the user into the Meraki WiFi network.
*/

// Initialize Firebase -- UPDATE THIS
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
    var database = firebase.database();

    // Parse Meraki supplied parameters
    var base_grant_url = decodeURIComponent(GetURLParameter("base_grant_url"));
    var user_continue_url = decodeURIComponent(GetURLParameter("user_continue_url"));
    var node_mac = GetURLParameter("node_mac");
    var client_ip = GetURLParameter("client_ip");
    var client_mac = GetURLParameter("client_mac");

    // Print Meraki provided parameters to console
    console.log("base_grant_url: " + base_grant_url);
    console.log("client_ip: " + client_ip);

    // Display Parameters for Demo
    $("div.baseGrantURL").text(base_grant_url);
    $("div.userContinueURL").text(user_continue_url);
    $("div.clientIP").text(client_ip);
    $("div.clientMAC").text(client_mac);
    $("div.nodeMAC").text(node_mac);

    function showValidationMessage(element, message) {
        var messageElement = document.createElement('div');
        messageElement.className = 'validation-message';
        messageElement.textContent = message;
        element.parentNode.appendChild(messageElement);
    }
    
    function removeValidationMessages() {
        var messages = document.querySelectorAll('.validation-message');
        messages.forEach(function(message) {
            message.remove();
        });
    }
    


    // Handle Form Submission
    $('form').submit(function(event) {    
        console.log("processing loginForm");
        removeValidationMessages();
        event.preventDefault();
        
        // Get form values
        var name = $("input#username").val();
        var email = $("input#email").val();
        var company = $("input#company").val();
        
        // Validate the inputs

        if (!validateName(name.val())) {
            showValidationMessage(name[0], "Please enter a valid full name (first name and surname).");
            return;
        }

        if (!validateEmail(email.val())) {
            showValidationMessage(email[0], "Please enter a valid email address.");
            return;
        }
    
        if (!validateCompany(company.val())) {
            showValidationMessage(company[0], "Please enter a valid company name.");
            return;
        }
    
        if (!$("#terms").is(":checked")) {
            alert("You must agree to the terms and conditions.");
            return;
        }
    
        // Store form data into variable
        var formData = {
            "name": $("input#username").val(),
            "email": $("input#email").val(),
            "company": $("input#company").val()
        };

        // Log the form submission event to Firebase Analytics
    const analytics = firebase.analytics();
    analytics.logEvent('form_submission', {
        name: formData.name,
        email: formData.email,
        company: formData.company
    });


        // Save Data to Firebase
        console.log("saving form data", formData);
        writeUserData(formData, client_mac, node_mac);

        // ******************
        // Login to Meraki by redirecting client to the base_grant_url 
        // The loginUrl will add a continue_url parameter for a final client
        // redirect
        // ****************** 
        var loginUrl = base_grant_url;
        if(user_continue_url !== "undefined"){
            // add the users intended website to the login parameters.
            // You could also re-write the user_continue_url if you wanted a custom 
            // landing page.
            loginUrl += "?continue_url=" + user_continue_url;
        }
        console.log("Logging in... ", loginUrl);
        // redirect browser to meraki auth URL.
        window.location.href = loginUrl;
    });

    function validateName(name) {
        // Trim the name to remove extra spaces
        name = name.trim();
    
        // Split the name by spaces
        var nameParts = name.split(/\s+/);
    
        // Check if there are at least two parts (first name and last name)
        if (nameParts.length < 2) {
            return false;
        }
    
        // Ensure all parts of the name contain only letters and optional hyphens/apostrophes
        for (var i = 0; i < nameParts.length; i++) {
            if (!/^[a-zA-Z'-]+$/.test(nameParts[i])) {
                return false;
            }
        }
    
        return true;
    }
    
    function validateEmail(email) {
        // Basic email format validation
        var emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        return emailPattern.test(email);
    }
    
    function validateCompany(company) {
        // Example validation: Company name must not be empty
        return company.trim() !== "";
    }

    // Write to Firebase database
    function writeUserData(data, client_mac, node_mac) {
        var timestamp = new Date().toISOString();
        database.ref('wifiLogins/' + Date.now()).set({
            name: data.name,
            email: data.email,
            company: data.company,
            macAddress: client_mac,
            accessPointMAC: node_mac,
            timeStamp: timestamp
        });
    }

    // Helper function to parse URL
    function GetURLParameter(sParam) {
        var sPageURL = window.location.search.substring(1);
        var sURLVariables = sPageURL.split('&');
        for (var i = 0; i < sURLVariables.length; i++) {
            var sParameterName = sURLVariables[i].split('=');
            if (sParameterName[0] == sParam) {
                return sParameterName[1];
            }
        }
        return null;
    }
});
