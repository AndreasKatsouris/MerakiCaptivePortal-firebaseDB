document.addEventListener('DOMContentLoaded', function() {
    // Ensure the user is authenticated before allowing access to the dashboard
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            console.log("User is authenticated:", user.uid);
            // Proceed with the rest of your script
        } else {
            console.log("User is not authenticated");
            window.location.href = 'admin-login.html'; // Redirect to login if not authenticated
        }
    });

    // Event listener for menu items
    document.querySelectorAll('.menu-item > a').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            let submenu = this.nextElementSibling;
            if (submenu) {
                submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block';
            }
        });
    });

    const liveDataMenu = document.querySelector('#liveDataMenu');
    if (liveDataMenu) {
        liveDataMenu.addEventListener('click', function() {
            displayActiveUsers();
            document.getElementById('liveDataContent').style.display = 'block';
            // Hide other content sections as needed
        });
    } else {
        console.error("Element with ID 'liveDataMenu' not found.");
    }

    document.getElementById('customizationForm').addEventListener('submit', function(event) {
        event.preventDefault();
        const bgColor = document.getElementById('bgColor').value;
        const font = document.getElementById('font').value;
        const fontSize = document.getElementById('fontSize').value;
        const logo = document.getElementById('logo').files[0];

        // Store customization settings in Firebase
        const storageRef = firebase.storage().ref();
        if (logo) {
            const logoRef = storageRef.child('logos/' + logo.name);
            logoRef.put(logo).then(snapshot => {
                snapshot.ref.getDownloadURL().then(url => {
                    saveCustomization({ bgColor, font, fontSize, logoURL: url });
                });
            });
        } else {
            saveCustomization({ bgColor, font, fontSize });
        }
    });

    function saveCustomization(settings) {
        console.log('Saving settings:', settings); // Debugging statement
        firebase.database().ref('customization/').set(settings)
            .then(() => console.log('Customization saved!'))
            .catch(error => console.error('Error saving customization:', error));
    }
});
