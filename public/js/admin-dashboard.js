// admin-dashboard.js
document.addEventListener('DOMContentLoaded', function () {
    // Initialize all event listeners after DOM is loaded
    initializeAuthentication();
    initializeMenuListeners();
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

// ==================== Menu Section ====================
function initializeMenuListeners() {
    document.querySelectorAll('.menu-item > a').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const submenu = this.nextElementSibling;
            if (submenu) {
                submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block';
            }
        });
    });
}

// ==================== Campaign Management Section ====================
function initializeCampaignListeners() {
    // Campaign Menu Click
    document.querySelector('#campaignManagementMenu').addEventListener('click', function(e) {
        e.preventDefault();
        displaySection('campaignManagementContent');
        loadCampaigns();
    });

    // Save Campaign Button in Modal
    document.getElementById('saveCampaignBtn').addEventListener('click', handleSaveCampaign);

    // Cancel Button
    document.getElementById('cancelEditButton').addEventListener('click', resetCampaignForm);
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
    const form = document.getElementById('campaignForm');
    if (form.checkValidity()) {
        const campaignData = {
            name: document.getElementById('campaignName').value.trim(),
            brandName: document.getElementById('brandName').value.trim(),
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value,
            status: 'active',
            createdAt: Date.now()
        };

        // Validate dates
        if (new Date(campaignData.endDate) < new Date(campaignData.startDate)) {
            alert('End date cannot be before start date');
            return;
        }

        // Check if we are in editing mode
        const editingKey = form.getAttribute('data-editing-key');
        try {
            if (editingKey) {
                await updateCampaign(editingKey, campaignData);
            } else {
                await createNewCampaign(campaignData);
            }
            $('#campaignFormModal').modal('hide');
            resetCampaignForm();
            loadCampaigns();
        } catch (error) {
            console.error('Error saving campaign:', error);
            alert('Failed to save campaign');
        }
    } else {
        form.reportValidity();
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

    // WiFi Devices Form
    document.querySelector('#wifiDevicesForm').addEventListener('submit', handleWiFiDeviceSubmit);
}

// [Your existing WiFi-related functions here]

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

// [Your existing data deletion functions here]

// ==================== Utility Functions ====================
function displaySection(sectionId) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = section.id === sectionId ? 'block' : 'none';
    });
}

function loadInitialData() {
    loadCampaigns();
    fetchWiFiReports();
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

// Update your loadCampaigns function to use loading states
async function loadCampaigns() {
    showLoading();
    const campaignTable = document.querySelector('#campaignTable tbody');
    campaignTable.innerHTML = '';

    try {
        const snapshot = await firebase.database().ref('campaigns').once('value');
        const campaigns = snapshot.val();

        if (campaigns) {
            Object.keys(campaigns).forEach(key => {
                const campaign = campaigns[key];
                const row = document.createElement('tr');
                row.classList.add('fade-in');  // Add animation
                
                // ... rest of your row creation code ...
                
                campaignTable.appendChild(row);
            });
        } else {
            campaignTable.innerHTML = `
                <tr class="fade-in">
                    <td colspan="5" class="text-center">No campaigns available</td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Error loading campaigns:', error);
        campaignTable.innerHTML = `
            <tr class="fade-in">
                <td colspan="5" class="text-center text-danger">Error loading campaigns</td>
            </tr>
        `;
    } finally {
        hideLoading();
    }
}

// Update saveCampaignToFirebase to show loading
async function saveCampaignToFirebase(campaignData) {
    showLoading();
    try {
        const campaignRef = firebase.database().ref('campaigns').push();
        await campaignRef.set(campaignData);
        
        $('#campaignFormModal').modal('hide');
        resetCampaignForm();
        await loadCampaigns();
        alert('Campaign created successfully');
    } catch (error) {
        console.error('Error saving campaign:', error);
        alert('Failed to save campaign');
    } finally {
        hideLoading();
    }
}

// Add loading state to section transitions
function displaySection(sectionId) {
    showLoading();
    document.querySelectorAll('.content-section').forEach(section => {
        if (section.id === sectionId) {
            section.style.display = 'block';
            section.classList.add('fade-in');
        } else {
            section.style.display = 'none';
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

// Update form submission
document.getElementById('campaignForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitButton = this.querySelector('button[type="submit"]');
    const originalText = submitButton.innerHTML;
    
    try {
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        submitButton.disabled = true;
        
        // Your existing save logic here
        
    } finally {
        submitButton.innerHTML = originalText;
        submitButton.disabled = false;
    }
});

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

// Update form submission
document.getElementById('campaignForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitButton = this.querySelector('button[type="submit"]');
    const originalText = submitButton.innerHTML;
    
    try {
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        submitButton.disabled = true;
        
        // Your existing save logic here
        
    } finally {
        submitButton.innerHTML = originalText;
        submitButton.disabled = false;
    }
});