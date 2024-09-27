document.addEventListener('DOMContentLoaded', function () {
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

    // Event listener for menu items (WiFi, Loyalty)
    document.querySelectorAll('.menu-item > a').forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            let submenu = this.nextElementSibling;
            if (submenu) {
                submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block';
            }
        });
    });
    // Logout Button Event Listener
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', function() {
            firebase.auth().signOut().then(() => {
                console.log('User signed out');
                window.location.href = 'admin-login.html'; // Redirect to login page after logout
            }).catch((error) => {
                console.error('Error signing out:', error);
            });
        });
    }

    // Event listener for WiFi Reports menu item
document.querySelector('#wifiReportsMenu').addEventListener('click', function(e) {
    e.preventDefault();
    displaySection('wifiReportsContent'); // Display the WiFi Reports section
    fetchWiFiReports(); // Fetch and display the WiFi reports
});

// Function to fetch WiFi Login data from Firebase
function fetchWiFiReports() {
    const tableBody = document.querySelector('#wifiReportsTable tbody');
    tableBody.innerHTML = ''; // Clear existing rows

    firebase.database().ref('wifiLogins/').once('value')
        .then(snapshot => {
            const data = snapshot.val();
            if (data) {
                Object.keys(data).forEach(key => {
                    const record = data[key];
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${record.name || 'N/A'}</td>
                        <td>${record.email || 'N/A'}</td>
                        <td>${record.localTimeStamp || 'N/A'}</td>
                        <td>${record.accessPointMAC || 'N/A'}</td>
                        <td>${key}</td>
                    `;
                    tableBody.appendChild(row);
                });
                applyFilters(); // Apply filters after loading data
            } else {
                tableBody.innerHTML = '<tr><td colspan="5">No data available</td></tr>';
            }
        })
        .catch(error => {
            console.error('Error fetching WiFi login data:', error);
        });
}

// Function to apply filters to the table
function applyFilters() {
    const nameFilter = document.querySelector('#nameFilter');
    const emailFilter = document.querySelector('#emailFilter');
    const timestampFilter = document.querySelector('#timestampFilter');
    const apMacFilter = document.querySelector('#apMacFilter');
    const sessionIdFilter = document.querySelector('#sessionIdFilter');

    const tableRows = document.querySelectorAll('#wifiReportsTable tbody tr');

    [nameFilter, emailFilter, timestampFilter, apMacFilter, sessionIdFilter].forEach(filter => {
        filter.addEventListener('input', function() {
            const nameValue = nameFilter.value.toLowerCase();
            const emailValue = emailFilter.value.toLowerCase();
            const timestampValue = timestampFilter.value.toLowerCase();
            const apMacValue = apMacFilter.value.toLowerCase();
            const sessionIdValue = sessionIdFilter.value.toLowerCase();

            tableRows.forEach(row => {
                const [nameCell, emailCell, timestampCell, apMacCell, sessionIdCell] = row.children;
                const matchesName = nameCell.textContent.toLowerCase().includes(nameValue);
                const matchesEmail = emailCell.textContent.toLowerCase().includes(emailValue);
                const matchesTimestamp = timestampCell.textContent.toLowerCase().includes(timestampValue);
                const matchesApMac = apMacCell.textContent.toLowerCase().includes(apMacValue);
                const matchesSessionId = sessionIdCell.textContent.toLowerCase().includes(sessionIdValue);

                if (matchesName && matchesEmail && matchesTimestamp && matchesApMac && matchesSessionId) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    });
}



    // Event listener for the Live Data menu item
    const liveDataMenu = document.querySelector('.menu-item-live-data > a');
    if (liveDataMenu) {
        liveDataMenu.addEventListener('click', function (e) {
            e.preventDefault();
            displaySection('liveDataContent'); // Display the live data section
            fetchLiveData(); // Fetch and display the live data
        });
    } else {
        console.error("Element with class 'menu-item-live-data' and 'a' tag not found.");
    }

    // Event listener for Data Deletion menu item
    const dataDeletionMenu = document.querySelector('#dataDeletionMenu');
    if (dataDeletionMenu) {
        dataDeletionMenu.addEventListener('click', function (e) {
            e.preventDefault();
            displaySection('dataDeletionContent');
            loadDataForDeletion();
        });
    } else {
        console.error("Element with ID 'dataDeletionMenu' not found.");
    }

    // Add event listener for "Select All" checkbox
    const selectAllCheckbox = document.getElementById('select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.delete-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
        });
    }

    // Display WiFi Settings when the corresponding menu is clicked
    document.getElementById('wifiSettingsMenu').addEventListener('click', function(e) {
        e.preventDefault();
        displaySection('wifiSettingsContent');
    });

    // Customization Form Handling
    document.getElementById('customizationForm').addEventListener('submit', function (event) {
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

    // Functions for Fetching and Displaying Live Data
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

    // Functions for Deleting Data from the Database
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
            button.addEventListener('click', function () {
                const key = this.getAttribute('data-key');
                deleteData(key);
            });
        });

        // Attach event listener to the delete selected button
        document.querySelector('#delete-selected').addEventListener('click', function () {
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

    // Function to show the selected content section and hide others
    function displaySection(sectionId) {
        document.querySelectorAll('.content-section').forEach(section => {
            section.style.display = section.id === sectionId ? 'block' : 'none';
        });
    }


    // Add event listener for the "Delete All Data" option in the sidebar
    const deleteAllDataMenu = document.getElementById('deleteAllDataMenu');
    if (deleteAllDataMenu) {
        deleteAllDataMenu.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm("Are you sure you want to delete all data? This action cannot be undone.")) {
                deleteAllScanningData();
            }
        });
    }

    // Function to delete all data from Firebase without loading it
    function deleteAllScanningData() {
        const ref = firebase.database().ref('scanningData/');
        ref.remove()
            .then(() => {
                console.log('All data successfully deleted from Firebase');
                alert('All data has been deleted.');
            })
            .catch(error => {
                console.error('Error deleting all data:', error);
                alert('Error deleting data. Please try again later.');
            });
        }
});
