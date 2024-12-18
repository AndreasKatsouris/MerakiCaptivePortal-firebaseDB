// admin-dashboard.js
document.addEventListener('DOMContentLoaded', function () {
    // Initialize all event listeners after DOM is loaded
    initializeAuthentication();
    initializeMenuListeners();
    initializeLoyaltyListeners();
    initializeCampaignListeners();
    initializeWiFiListeners();
    initializeLiveDataListeners();
    initializeDataDeletionListeners();
});

// ==================== Authentication Section ====================
function initializeAuthentication() {
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            console.log("User is authenticated:", user.uid);
            loadInitialData();
        } else {
            console.log("User is not authenticated");
            window.location.href = 'admin-login.html';
        }
    });

    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
}

function handleLogout() {
    firebase.auth().signOut()
        .then(() => {
            console.log('User signed out');
            window.location.href = 'admin-login.html';
        })
        .catch((error) => {
            console.error('Error signing out:', error);
        });
}

function addEventListenerSafely(elementId, event, handler) {
    const element = document.getElementById(elementId);
    if (element) {
        element.addEventListener(event, handler);
    } else {
        console.warn(`Element with id '${elementId}' not found`);
    }
}

// ==================== Loyalty Program Section ====================
function initializeLoyaltyListeners() {
    // Campaign Management
    addEventListenerSafely('campaignManagementMenu', 'click', function(e) {
        e.preventDefault();
        displaySection('campaignManagementContent');
        loadCampaigns();
    });

    // Receipt Management
    addEventListenerSafely('receiptScanningMenu', 'click', function(e) {
        e.preventDefault();
        displaySection('receiptManagementContent');
        loadReceipts();
    });

    // Loyalty Settings
    addEventListenerSafely('loyaltySettingsMenu', 'click', function(e) {
        e.preventDefault();
        displaySection('loyaltySettingsContent');
    });
}

// ==================== Menu Section ====================
function initializeMenuListeners() {
    addEventListenerSafely('dashboardMenu', 'click', function(e) {
        e.preventDefault();
        displaySection('dashboardContent');
    });

    document.querySelectorAll('.menu-item > a').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.submenu').forEach(menu => {
                // Skip the current submenu
                if (menu !== this.nextElementSibling) {
                    menu.style.display = 'none';
                }
            });
            const submenu = this.nextElementSibling;
            if (submenu) {
                submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block';
            }
        });
    });
}

// ==================== Campaign Management Section ====================
function initializeCampaignListeners() {
    addEventListenerSafely('campaignManagementMenu', 'click', function(e) {
        e.preventDefault();
        displaySection('campaignManagementContent');
        loadCampaigns();
    });

    addEventListenerSafely('saveCampaignBtn', 'click', handleSaveCampaign);
    addEventListenerSafely('cancelEditButton', 'click', resetCampaignForm);

    addEventListenerSafely('campaignForm', 'submit', async function(e) {
        e.preventDefault();
        const submitButton = this.querySelector('button[type="submit"]');
        if (submitButton) {
            const originalText = submitButton.innerHTML;
            try {
                submitButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
                submitButton.disabled = true;
                await handleSaveCampaign();
            } finally {
                submitButton.innerHTML = originalText;
                submitButton.disabled = false;
            }
        }
    });

}

function showCreateCampaignModal() {
    resetCampaignForm();
    const editNotice = document.getElementById('editNotice');
    if (editNotice) {
        editNotice.style.display = 'none';
    }
    document.getElementById('campaignFormModalLabel').textContent = 'Create New Campaign';
    $('#campaignFormModal').modal('show');
}

async function handleSaveCampaign() {
    showLoading();
    try {
        const form = document.getElementById('campaignForm');
        if (!form) {
            throw new Error('Campaign form not found');
        }

        if (form.checkValidity()) {
            const campaignData = {
                name: document.getElementById('campaignName').value.trim(),
                brandName: document.getElementById('brandName').value.trim(),
                startDate: document.getElementById('startDate').value,
                endDate: document.getElementById('endDate').value,
                status: 'active',
                createdAt: Date.now()
            };

            if (new Date(campaignData.endDate) < new Date(campaignData.startDate)) {
                throw new Error('End date cannot be before start date');
            }

            const editingKey = form.getAttribute('data-editing-key');
            if (editingKey) {
                await updateCampaign(editingKey, campaignData);
            } else {
                await createNewCampaign(campaignData);
            }
            
            $('#campaignFormModal').modal('hide');
            resetCampaignForm();
            await loadCampaigns();
        } else {
            form.reportValidity();
        }
    } catch (error) {
        console.error('Error saving campaign:', error);
        alert(error.message || 'Failed to save campaign');
    } finally {
        hideLoading();
    }
}
async function createNewCampaign(campaignData) {
    const campaignRef = firebase.database().ref('campaigns').push();
    await campaignRef.set(campaignData);
    alert('Campaign created successfully');
}

async function updateCampaign(campaignKey, campaignData) {
    await firebase.database().ref(`campaigns/${campaignKey}`).update({
        ...campaignData,
        updatedAt: Date.now()
    });
    alert('Campaign updated successfully');
}

async function loadCampaigns() {
    const campaignTable = document.querySelector('#campaignTable tbody');
    campaignTable.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
        const snapshot = await firebase.database().ref('campaigns').once('value');
        const campaigns = snapshot.val();

        if (campaigns) {
            campaignTable.innerHTML = '';
            Object.keys(campaigns).forEach(key => {
                const campaign = campaigns[key];
                const row = document.createElement('tr');
                
                const formattedStartDate = campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : 'N/A';
                const formattedEndDate = campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'N/A';
                
                row.innerHTML = `
                    <td>${campaign.name}</td>
                    <td>${campaign.brandName}</td>
                    <td>${formattedStartDate}</td>
                    <td>${formattedEndDate}</td>
                    <td><span class="badge badge-${campaign.status === 'active' ? 'success' : 'secondary'}">${campaign.status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-warning edit-campaign" data-key="${key}">Edit</button>
                        <button class="btn btn-sm btn-danger delete-campaign" data-key="${key}">Delete</button>
                    </td>
                `;
                campaignTable.appendChild(row);
            });

            attachCampaignEventListeners();
        } else {
            campaignTable.innerHTML = '<tr><td colspan="6">No campaigns available</td></tr>';
        }
    } catch (error) {
        console.error('Error loading campaigns:', error);
        campaignTable.innerHTML = '<tr><td colspan="6">Error loading campaigns. Please try again.</td></tr>';
    }
}

function attachCampaignEventListeners() {
    // Edit button listeners
    document.querySelectorAll('.edit-campaign').forEach(button => {
        button.addEventListener('click', function() {
            editCampaign(this.getAttribute('data-key'));
        });
    });

    // Delete button listeners
    document.querySelectorAll('.delete-campaign').forEach(button => {
        button.addEventListener('click', function() {
            deleteCampaign(this.getAttribute('data-key'));
        });
    });
}

async function editCampaign(campaignKey) {
    try {
        const snapshot = await firebase.database().ref(`campaigns/${campaignKey}`).once('value');
        const campaign = snapshot.val();
        
        if (!campaign) {
            alert('Campaign not found');
            return;
        }

        // Populate form fields
        document.getElementById('campaignName').value = campaign.name;
        document.getElementById('brandName').value = campaign.brandName;
        document.getElementById('startDate').value = campaign.startDate;
        document.getElementById('endDate').value = campaign.endDate;

        // Show editing notice
        const editNotice = document.getElementById('editNotice');
        const editingCampaignName = document.getElementById('editingCampaignName');
        editNotice.style.display = 'block';
        editingCampaignName.textContent = campaign.name;

        // Mark form as editing
        document.getElementById('campaignForm').setAttribute('data-editing-key', campaignKey);

        // Show cancel button
        document.getElementById('cancelEditButton').style.display = 'inline-block';

        // Show modal
        $('#campaignFormModal').modal('show');
    } catch (error) {
        console.error('Error fetching campaign:', error);
        alert('Error loading campaign data');
    }
}

function deleteCampaign(campaignKey) {
    if (confirm('Are you sure you want to delete this campaign?')) {
        firebase.database().ref(`campaigns/${campaignKey}`).remove()
            .then(() => {
                alert('Campaign deleted successfully');
                loadCampaigns();
            })
            .catch(error => {
                console.error('Error deleting campaign:', error);
                alert('Failed to delete campaign');
            });
    }
}

function resetCampaignForm() {
    const form = document.getElementById('campaignForm');
    form.reset();
    form.removeAttribute('data-editing-key');
    
    const editNotice = document.getElementById('editNotice');
    if (editNotice) {
        editNotice.style.display = 'none';
    }
    
    document.getElementById('cancelEditButton').style.display = 'none';
}

// ==================== WiFi Management Section ====================
function initializeWiFiListeners() {
    // WiFi Reports Menu
    document.querySelector('#wifiReportsMenu').addEventListener('click', function(e) {
        e.preventDefault();
        displaySection('wifiReportsContent');
        fetchWiFiReports();
    });

    // WiFi Devices Menu
    document.querySelector('#wifiDevicesMenu').addEventListener('click', function(e) {
        e.preventDefault();
        displaySection('wifiDevicesContent');
        loadDevices();
    });

    // WiFi Settings Menu
    document.getElementById('wifiSettingsMenu').addEventListener('click', function(e) {
        e.preventDefault();
        displaySection('wifiSettingsContent');
    });

    function handleWiFiDeviceSubmit(e) {
        e.preventDefault();
        const macAddress = document.querySelector('#deviceMac').value;
        const storeId = document.querySelector('#storeId').value;
        const location = document.querySelector('#location').value;
        const deviceType = document.querySelector('#deviceType').value;

        // Save to Firebase
        const deviceRef = firebase.database().ref('accessPoints/').push();
        deviceRef.set({
            macAddress,
            storeId,
            location,
            deviceType
        }).then(() => {
            alert('Device added successfully');
            loadDevices();
        }).catch(error => {
            console.error('Error adding device:', error);
        });
    }

    // WiFi Devices Form
    document.querySelector('#wifiDevicesForm').addEventListener('submit', handleWiFiDeviceSubmit);
}

// [Your existing WiFi-related functions here]

async function fetchWiFiReports() {
    showLoading();
    const tableBody = document.querySelector('#wifiReportsTable tbody');
    tableBody.innerHTML = '';

    try {
        const snapshot = await firebase.database().ref('wifiLogins/').once('value');
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
        } else {
            tableBody.innerHTML = '<tr><td colspan="5">No data available</td></tr>';
        }
    } catch (error) {
        console.error('Error fetching WiFi login data:', error);
        tableBody.innerHTML = '<tr><td colspan="5">Error loading data</td></tr>';
    } finally {
        hideLoading();
    }
}

// ==================== Live Data Section ====================
function initializeLiveDataListeners() {
    const liveDataMenu = document.querySelector('.menu-item-live-data > a');
    if (liveDataMenu) {
        liveDataMenu.addEventListener('click', function(e) {
            e.preventDefault();
            displaySection('liveDataContent');
            fetchLiveData();
        });
    }
}

// [Your existing live data functions here]

// ==================== Data Deletion Section ====================
function initializeDataDeletionListeners() {
    const dataDeletionMenu = document.getElementById('dataDeletionMenu');
    if (dataDeletionMenu) {
        dataDeletionMenu.addEventListener('click', function(e) {
            e.preventDefault();
            displaySection('dataDeletionContent');
            loadDataForDeletion();
        });
    }

    const deleteAllDataMenu = document.getElementById('deleteAllDataMenu');
    if (deleteAllDataMenu) {
        deleteAllDataMenu.addEventListener('click', handleDeleteAllData);
    }

    const selectAllCheckbox = document.getElementById('select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', handleSelectAll);
    }
}

// ==================== Receipt Management Section ====================
function initializeReceiptManagement() {
    // Event listeners for receipt filters
    addEventListenerSafely('receiptSearchBtn', 'click', handleReceiptSearch);
    addEventListenerSafely('receiptStatusFilter', 'change', handleReceiptSearch);
    addEventListenerSafely('receiptSearchGuest', 'input', handleReceiptSearch);
    addEventListenerSafely('receiptSearchInvoice', 'input', handleReceiptSearch);
}

async function loadReceipts(filters = {}) {
    showLoading();
    const tableBody = document.querySelector('#receiptsTable tbody');
    tableBody.innerHTML = '';

    try {
        const snapshot = await firebase.database().ref('processedReceipts').once('value');
        const receipts = snapshot.val();

        if (receipts) {
            Object.keys(receipts).forEach(key => {
                const receipt = receipts[key];
                
                // Apply filters
                if (!matchesReceiptFilters(receipt, filters)) return;

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${formatDate(receipt.processedAt)}</td>
                    <td>${receipt.guestName || 'N/A'}</td>
                    <td>${receipt.invoiceNumber || 'N/A'}</td>
                    <td>${receipt.parsedData.storeName || 'N/A'}</td>
                    <td>R${receipt.parsedData.totalAmount.toFixed(2)}</td>
                    <td><span class="badge badge-${getStatusBadgeClass(receipt.status)}">${receipt.status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-info view-receipt" data-receipt-id="${key}">
                            View
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });

            // Attach event listeners to view buttons
            attachReceiptViewListeners();
        } else {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No receipts found</td></tr>';
        }
    } catch (error) {
        console.error('Error loading receipts:', error);
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading receipts</td></tr>';
    } finally {
        hideLoading();
    }
}

function matchesReceiptFilters(receipt, filters) {
    if (filters.guest && !receipt.guestName?.toLowerCase().includes(filters.guest.toLowerCase())) return false;
    if (filters.invoice && !receipt.invoiceNumber?.toLowerCase().includes(filters.invoice.toLowerCase())) return false;
    if (filters.status && receipt.status !== filters.status) return false;
    return true;
}

function handleReceiptSearch() {
    const filters = {
        guest: document.getElementById('receiptSearchGuest').value,
        invoice: document.getElementById('receiptSearchInvoice').value,
        status: document.getElementById('receiptStatusFilter').value
    };
    loadReceipts(filters);
}

function attachReceiptViewListeners() {
    document.querySelectorAll('.view-receipt').forEach(button => {
        button.addEventListener('click', function() {
            const receiptId = this.getAttribute('data-receipt-id');
            showReceiptModal(receiptId);
        });
    });
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
}

async function loadInitialData() {
    try {
        displaySection('dashboardContent');
        await Promise.all([
            loadCampaigns(),
            fetchWiFiReports(),
            updateDashboardStats()
        ]);
    } catch (error) {
        console.error('Error loading initial data:', error);
    }
}

// Add error handling wrapper for async functions
function asyncErrorHandler(fn) {
    return async function(...args) {
        try {
            await fn(...args);
        } catch (error) {
            console.error(`Error in ${fn.name}:`, error);
            alert('An error occurred. Please try again.');
        }
    };
}

// Loading state management
function showLoading() {
    document.getElementById('globalLoadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('globalLoadingOverlay').style.display = 'none';
}

// Add loading state to section transitions
function displaySection(sectionId) {
    showLoading();
    console.log('Displaying section:', sectionId); // Debug
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });
    document.querySelectorAll('.content-section').forEach(section => {
        if (section.id === sectionId) {
            section.style.display = 'block';
            section.classList.add('fade-in');
            console.log(section.id, section.style.display); // Debug
        } else {
            section.style.display = 'none';
            console.log(section.id, section.style.display); // Debug
        }
    });
    setTimeout(hideLoading, 300); // Short delay to show transition
}

function showTableLoading(tableId) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = `
        <tr>
            <td colspan="100%" class="text-center p-5">
                <div class="loading-spinner"></div>
                <p class="mt-3">Loading data...</p>
            </td>
        </tr>
    `;
}


// Update showReceiptModal
async function showReceiptModal(receiptId) {
    showLoading();
    try {
        const receipt = await fetchReceiptDetails(receiptId);
        populateReceiptModal(receipt);
        $('#receiptDetailsModal').modal('show');
    } catch (error) {
        console.error('Error showing receipt details:', error);
        alert('Error loading receipt details');
    } finally {
        hideLoading();
    }
}

