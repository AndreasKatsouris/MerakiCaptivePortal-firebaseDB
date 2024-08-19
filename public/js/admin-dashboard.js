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
    // Event listener for Data Deletion menu item
    document.addEventListener('DOMContentLoaded', function() {
        const dataDeletionMenu = document.querySelector('#dataDeletionMenu');
        if (dataDeletionMenu) {
            dataDeletionMenu.addEventListener('click', function(e) {
                e.preventDefault();
                displaySection('dataDeletionContent');
                loadDataForDeletion();
            });
        } else {
            console.error("Element with ID 'dataDeletionMenu' not found.");
        }
    });
    

// FUNCTIONS FOR DELETING DATA FROM THE DATABASE
function loadDataForDeletion() {
    const ref = firebase.database().ref('scanningData/');
    ref.once('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            renderDataList(data);
        } else {
            console.log("No data available.");
        }
    }).catch(error => console.error('Error retrieving data:', error));
}
function renderDataList(data) {
    const tableBody = document.querySelector('#data-table tbody');
    tableBody.innerHTML = ''; // Clear existing rows

    Object.keys(data).forEach(key => {
        const item = data[key];
        const row = document.createElement('tr');

        row.innerHTML = `
            <td><input type="checkbox" class="delete-checkbox" data-key="${key}"></td>
            <td>${item.clientMac || 'N/A'}</td>
            <td>${item.apMac || 'N/A'}</td>
            <td>${item.rssi || 'N/A'}</td>
            <td>${item.manufacturer || 'N/A'}</td>
            <td><button class="btn btn-danger delete-button" data-key="${key}">Delete</button></td>
        `;

        tableBody.appendChild(row);
    });

    // Attach event listeners to the delete buttons
    document.querySelectorAll('.delete-button').forEach(button => {
        button.addEventListener('click', function() {
            const key = this.getAttribute('data-key');
            deleteData(key);
        });
    });

    // Attach event listener to the delete selected button
    document.querySelector('#delete-selected').addEventListener('click', function() {
        deleteSelectedData();
    });
}
function deleteSelectedData() {
    const checkboxes = document.querySelectorAll('.delete-checkbox:checked');
    const keysToDelete = Array.from(checkboxes).map(checkbox => checkbox.getAttribute('data-key'));

    keysToDelete.forEach(key => {
        deleteData(key);
    });
}

function deleteData(key) {
    const ref = firebase.database().ref('scanningData/' + key);
    ref.remove()
        .then(() => {
            console.log('Data successfully deleted from Firebase');
            loadDataForDeletion(); // Reload the data list after deletion
        })
        .catch(error => {
            console.error('Error deleting data:', error);
        });
}


});
