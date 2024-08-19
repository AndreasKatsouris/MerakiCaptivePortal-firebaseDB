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

// Add event listener for the Live Data menu item
    document.querySelector('.menu-item-live-data > a').addEventListener('click', function(e) {
    e.preventDefault();
    displaySection('liveDataContent'); // Display the live data section
    fetchLiveData(); // Fetch and display the live data
});

// Function to fetch live data from Firebase
function fetchLiveData() {
    const liveDataDisplay = document.getElementById('liveDataDisplay');
    liveDataDisplay.innerHTML = ''; // Clear any previous data

    firebase.database().ref('scanningData/').limitToLast(10).once('value')
        .then(snapshot => {
            const data = snapshot.val();
            if (data) {
                Object.keys(data).forEach(key => {
                    const record = data[key];
                    const recordElement = document.createElement('div');
                    recordElement.className = 'live-data-record';
                    recordElement.innerHTML = `
                        <p><strong>Client MAC:</strong> ${record.clientMac}</p>
                        <p><strong>Access Point MAC:</strong> ${record.apMac}</p>
                        <p><strong>Signal Strength (RSSI):</strong> ${record.rssi}</p>
                        <p><strong>Manufacturer:</strong> ${record.manufacturer}</p>
                        <hr/>
                    `;
                    liveDataDisplay.appendChild(recordElement);
                });
            } else {
                liveDataDisplay.innerHTML = '<p>No live data available.</p>';
            }
        })
        .catch(error => {
            console.error('Error fetching live data:', error);
            liveDataDisplay.innerHTML = '<p>Error fetching live data. Please try again later.</p>';
        });
}

// Function to show the selected content section and hide others
function displaySection(sectionId) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = section.id === sectionId ? 'block' : 'none';
    });
}



// Customization Form Handling:
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
