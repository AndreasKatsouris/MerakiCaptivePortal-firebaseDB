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
    const addItemBtn = document.getElementById('addItemBtn');
    if (addItemBtn) {
        addItemBtn.addEventListener('click', function() {
            const nameInput = document.getElementById('itemName');
            const quantityInput = document.getElementById('itemQuantity');
            
            if (nameInput.value.trim()) {
                addRequiredItem(nameInput.value.trim(), quantityInput.value);
                nameInput.value = '';
                quantityInput.value = '1';
            }
        });
    }

}
function addRequiredItem(name, quantity) {
    const itemsList = document.getElementById('requiredItemsList');
    const itemElement = document.createElement('div');
    itemElement.className = 'list-group-item required-item d-flex justify-content-between align-items-center';
    itemElement.dataset.name = name;
    itemElement.dataset.quantity = quantity;
    
    itemElement.innerHTML = `
        <span>${name} (Qty: ${quantity})</span>
        <button type="button" class="btn btn-sm btn-danger remove-item">Remove</button>
    `;
    
    itemElement.querySelector('.remove-item').addEventListener('click', () => {
        itemElement.remove();
    });
    
    itemsList.appendChild(itemElement);
}

// function to get the required items when saving
function getRequiredItems() {
    const itemsList = document.querySelectorAll('#requiredItemsList .required-item');
    return Array.from(itemsList).map(item => ({
        name: item.dataset.name,
        quantity: parseInt(item.dataset.quantity),
        isRequired: true
    }));
}


function validateCampaignData(campaignData) {
    const errors = [];
    
    // Name validation
    if (!campaignData.name || campaignData.name.length < 3) {
        errors.push('Campaign name must be at least 3 characters');
    }
    
    // Brand validation
    if (!campaignData.brandName || campaignData.brandName.length < 2) {
        errors.push('Brand name must be at least 2 characters');
    }
    
    // Date validation
    const startDate = new Date(campaignData.startDate);
    const endDate = new Date(campaignData.endDate);
    const today = new Date();
    
    if (startDate < today) {
        errors.push('Start date cannot be in the past');
    }
    
    if (endDate <= startDate) {
        errors.push('End date must be after start date');
    }
    
    return errors;
}


async function handleSaveCampaign() {
    const form = document.getElementById('campaignForm');
    if (!form) {
        console.error('Campaign form not found');
        return;
    }

    showLoading();
    try {
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const campaignData = {
            name: document.getElementById('campaignName').value.trim(),
            brandName: document.getElementById('brandName').value.trim(),
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value,
            status: document.getElementById('campaignStatus').value,
            createdAt: Date.now(),
            minPurchaseAmount: document.getElementById('minPurchaseAmount').value || null,
            requiredItems: getRequiredItems()
        };

        // Validate dates
        if (new Date(campaignData.endDate) < new Date(campaignData.startDate)) {
            throw new Error('End date cannot be before start date');
        }

        // Check if we're editing or creating
        const editingKey = form.getAttribute('data-editing-key');
        
        if (editingKey) {
            await updateCampaign(editingKey, campaignData);
            console.log('Campaign updated successfully');
        } else {
            await createNewCampaign(campaignData);
            console.log('Campaign created successfully');
        }

        // Hide modal and refresh list
        $('#campaignFormModal').modal('hide');
        await loadCampaigns();

    } catch (error) {
        console.error('Error saving campaign:', error);
        alert(error.message || 'Failed to save campaign');
    } finally {
        hideLoading();
    }
}
function getRequiredItems() {
    const itemsList = document.querySelectorAll('#requiredItemsList .required-item');
    return Array.from(itemsList).map(item => ({
        name: item.dataset.name,
        quantity: parseInt(item.dataset.quantity),
        isRequired: true
    }));
}
async function createNewCampaign(campaignData) {
    console.log('Creating new campaign with data:', campaignData);
    try {
        const campaignRef = firebase.database().ref('campaigns').push();
        await campaignRef.set(campaignData);
        console.log('Campaign created successfully with ID:', campaignRef.key);
        return campaignRef.key;
    } catch (error) {
        console.error('Error in createNewCampaign:', error);
        throw error;
    }
}

async function updateCampaign(campaignKey, campaignData) {
    console.log('Updating campaign:', campaignKey, 'with data:', campaignData);
    try {
        await firebase.database().ref(`campaigns/${campaignKey}`).update({
            ...campaignData,
            updatedAt: Date.now()
        });
        console.log('Campaign updated successfully');
    } catch (error) {
        console.error('Error in updateCampaign:', error);
        throw error;
    }
}
//function to view campaign details
async function viewCampaignDetails(campaignId) {
    console.log('Attempting to view campaign:', campaignId);
    try {
        // Get campaign data
        const snapshot = await firebase.database().ref(`campaigns/${campaignId}`).once('value');
        const campaign = snapshot.val();
        console.log('Retrieved campaign data:', campaign);
        
        if (!campaign) {
            throw new Error('Campaign not found in database');
        }

        // Format dates
        const startDate = new Date(campaign.startDate).toLocaleDateString();
        const endDate = new Date(campaign.endDate).toLocaleDateString();
        const createdDate = new Date(campaign.createdAt).toLocaleString();

        // Prepare required items HTML if they exist
        const requiredItemsHtml = campaign.requiredItems && campaign.requiredItems.length > 0 
            ? `
                <tr>
                    <th>Required Items</th>
                    <td>
                        <div class="required-items-list">
                            ${campaign.requiredItems.map(item => `
                                <div class="required-item-detail">
                                    <span class="item-name">
                                        <i class="fas fa-check-circle text-success mr-2"></i>
                                        ${item.name}
                                    </span>
                                    <span class="item-quantity badge badge-info">
                                        Quantity: ${item.quantity}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </td>
                </tr>
            ` 
            : '';

        const detailsHtml = `
            <div class="campaign-details">
                <div class="row">
                    <div class="col-12">
                        <table class="table table-bordered">
                            <tr>
                                <th>Campaign Name</th>
                                <td>${campaign.name}</td>
                            </tr>
                            <tr>
                                <th>Brand Name</th>
                                <td>${campaign.brandName}</td>
                            </tr>
                            <tr>
                                <th>Start Date</th>
                                <td>${startDate}</td>
                            </tr>
                            <tr>
                                <th>End Date</th>
                                <td>${endDate}</td>
                            </tr>
                            <tr>
                                <th>Status</th>
                                <td>
                                    <span class="badge badge-${campaign.status === 'active' ? 'success' : 'secondary'} px-3 py-2">
                                        ${campaign.status === 'active' ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <th>Created</th>
                                <td>${createdDate}</td>
                            </tr>
                            ${requiredItemsHtml}
                            ${campaign.minPurchaseAmount ? `
                            <tr>
                                <th>Minimum Purchase</th>
                                <td>R${campaign.minPurchaseAmount}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Rest of your modal code remains the same
        let modalElement = document.getElementById('campaignDetailsModal');
        if (!modalElement) {
            console.log('Modal not found, creating it');
            const modalHtml = `
                <div class="modal fade" id="campaignDetailsModal" tabindex="-1" role="dialog">
                    <div class="modal-dialog" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Campaign Details</h5>
                                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                                    <span aria-hidden="true">&times;</span>
                                </button>
                            </div>
                            <div class="modal-body">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-primary edit-from-view" data-campaign-id="${campaignId}">Edit Campaign</button>
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modalElement = document.getElementById('campaignDetailsModal');
        }

        // Update modal content
        const modalBody = modalElement.querySelector('.modal-body');
        modalBody.innerHTML = detailsHtml;

        // Add edit button functionality
        const editButton = modalElement.querySelector('.edit-from-view');
        if (editButton) {
            editButton.addEventListener('click', () => {
                $('#campaignDetailsModal').modal('hide');
                editCampaign(campaignId);
            });
        }

        // Show the modal
        $('#campaignDetailsModal').modal('show');

    } catch (error) {
        console.error('Error in viewCampaignDetails:', error);
        alert(`Error viewing campaign details: ${error.message}`);
    }
}
async function editCampaign(campaignId) {
    console.log('Editing campaign:', campaignId);
    try {
        const snapshot = await firebase.database().ref(`campaigns/${campaignId}`).once('value');
        const campaign = snapshot.val();
        
        if (!campaign) {
            throw new Error('Campaign not found');
        }

        console.log('Retrieved campaign data for editing:', campaign);

        // Populate form fields
        document.getElementById('campaignName').value = campaign.name || '';
        document.getElementById('brandName').value = campaign.brandName || '';
        document.getElementById('startDate').value = campaign.startDate || '';
        document.getElementById('endDate').value = campaign.endDate || '';

        // Clear and populate required items
        const itemsList = document.getElementById('requiredItemsList');
        itemsList.innerHTML = '';
        
        if (campaign.requiredItems && campaign.requiredItems.length > 0) {
            campaign.requiredItems.forEach(item => {
                addRequiredItem(item.name, item.quantity);
            });
        }
       
        // Show editing notice
        const editNotice = document.getElementById('editNotice');
        const editingCampaignName = document.getElementById('editingCampaignName');
        if (editNotice) editNotice.style.display = 'block';
        if (editingCampaignName) editingCampaignName.textContent = campaign.name;

        // Mark form as editing
        const form = document.getElementById('campaignForm');
        if (form) form.setAttribute('data-editing-key', campaignId);

        // Update modal title
        const modalTitle = document.getElementById('campaignFormModalLabel');
        if (modalTitle) modalTitle.textContent = 'Edit Campaign';

        // Show modal
        $('#campaignFormModal').modal('show');

    } catch (error) {
        console.error('Error in editCampaign:', error);
        alert('Failed to load campaign for editing: ' + error.message);
    }
}

async function loadCampaigns() {
    console.log('Loading campaigns...');
    
    const campaignTable = document.querySelector('#campaignTable tbody');
    if (!campaignTable) {
        console.error('Campaign table not found in DOM');
        return;
    }

    try {
        showLoading();
        campaignTable.innerHTML = '<tr><td colspan="6" class="text-center">Loading campaigns...</td></tr>';

        const snapshot = await firebase.database().ref('campaigns').once('value');
        console.log('Campaigns data:', snapshot.val());

        const campaigns = snapshot.val();
        
        if (campaigns && Object.keys(campaigns).length > 0) {
            campaignTable.innerHTML = '';
            
            Object.keys(campaigns).forEach(key => {
                const campaign = campaigns[key];
                console.log('Processing campaign:', campaign);
                
                const row = document.createElement('tr');
                
                // Format dates with error handling
                let formattedStartDate = 'N/A';
                let formattedEndDate = 'N/A';
                
                try {
                    if (campaign.startDate) {
                        formattedStartDate = new Date(campaign.startDate).toLocaleDateString();
                    }
                    if (campaign.endDate) {
                        formattedEndDate = new Date(campaign.endDate).toLocaleDateString();
                    }
                } catch (dateError) {
                    console.error('Error formatting dates:', dateError);
                }

                row.innerHTML = `
            <td>${campaign.name || 'Unnamed Campaign'}</td>
            <td>${campaign.brandName || 'No Brand'}</td>
            <td>${formattedStartDate}</td>
            <td>${formattedEndDate}</td>
            <td>
                <div class="custom-control custom-switch">
                    <input type="checkbox" class="custom-control-input status-toggle" 
                        id="statusToggle_${key}" 
                        data-key="${key}" 
                        ${campaign.status === 'active' ? 'checked' : ''}>
                    <label class="custom-control-label" for="statusToggle_${key}">
                        <span class="badge badge-${campaign.status === 'active' ? 'success' : 'secondary'}">
                            ${campaign.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                    </label>
                </div>
                ${campaign.requiredItems && campaign.requiredItems.length > 0 ? 
                    `<span class="badge badge-info ml-2" title="Has required items">
                        <i class="fas fa-list"></i> ${campaign.requiredItems.length} items
                    </span>` : ''
                }
            </td>
            <td>
                <button class="btn btn-sm btn-info view-campaign mr-1" data-key="${key}">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="btn btn-sm btn-warning edit-campaign mr-1" data-key="${key}">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-sm btn-danger delete-campaign" data-key="${key}">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </td>
        `;  
                
                campaignTable.appendChild(row);
            });

            // Attach event listeners after adding rows
            attachCampaignEventListeners();
        } else {
            campaignTable.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">
                        <p class="mb-0">No campaigns available.</p>
                        <button class="btn btn-link" onclick="showCreateCampaignModal()">
                            Create your first campaign
                        </button>
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Error loading campaigns:', error);
        campaignTable.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-danger">
                    <p>Error loading campaigns: ${error.message}</p>
                    <button class="btn btn-link" onclick="loadCampaigns()">
                        Try again
                    </button>
                </td>
            </tr>
        `;
    } finally {
        hideLoading();
    }
}

async function toggleCampaignStatus(campaignId, isActive) {
    console.log('Toggling campaign status:', campaignId, isActive);
    try {
        showLoading();
        
        // Update campaign status in Firebase
        await firebase.database().ref(`campaigns/${campaignId}`).update({
            status: isActive ? 'active' : 'inactive',
            updatedAt: Date.now()
        });

        // Update UI without reloading the entire table
        const label = document.querySelector(`label[for="statusToggle_${campaignId}"]`);
        if (label) {
            const badge = label.querySelector('.badge');
            badge.className = `badge badge-${isActive ? 'success' : 'secondary'}`;
            badge.textContent = isActive ? 'Active' : 'Inactive';
        }

        // Show success message
        Swal.fire({
            icon: 'success',
            title: 'Status Updated',
            text: `Campaign is now ${isActive ? 'active' : 'inactive'}`,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });

    } catch (error) {
        console.error('Error toggling campaign status:', error);
        
        // Revert toggle if update failed
        const toggle = document.getElementById(`statusToggle_${campaignId}`);
        if (toggle) {
            toggle.checked = !isActive;
        }

        // Show error message
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to update campaign status',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });
    } finally {
        hideLoading();
    }
}

// Make sure event listeners are properly attached
function attachCampaignEventListeners() {
    console.log('Attaching campaign event listeners...');
    
    // View campaign details
    document.querySelectorAll('.view-campaign').forEach(button => {
        button.addEventListener('click', function(e) {
            console.log('View button clicked');
            const campaignId = this.getAttribute('data-key');
            console.log('Campaign ID:', campaignId);
            viewCampaignDetails(campaignId);
        });
    });

    // Edit campaign
    document.querySelectorAll('.edit-campaign').forEach(button => {
        button.addEventListener('click', (e) => {
            const campaignId = e.currentTarget.getAttribute('data-key');
            editCampaign(campaignId);
        });
    });

    // Delete campaign
    document.querySelectorAll('.delete-campaign').forEach(button => {
        button.addEventListener('click', async (e) => {
            const campaignId = e.currentTarget.getAttribute('data-key');
            if (await confirmDeleteCampaign(campaignId)) {
                deleteCampaign(campaignId);
            }
        });
    });

    // Status toggle listeners
    document.querySelectorAll('.status-toggle').forEach(toggle => {
        toggle.addEventListener('change', async function(e) {
            const campaignId = this.getAttribute('data-key');
            const isActive = this.checked;
            
            // Confirm status change
            const result = await Swal.fire({
                title: 'Confirm Status Change',
                text: `Are you sure you want to set this campaign to ${isActive ? 'active' : 'inactive'}?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Yes, update it!'
            });

            if (result.isConfirmed) {
                await toggleCampaignStatus(campaignId, isActive);
            } else {
                // Reset toggle if user cancels
                this.checked = !isActive;
            }
        });
    });
}

// Add confirmation for delete
async function confirmDeleteCampaign(campaignId) {
    return await Swal.fire({
        title: 'Delete Campaign?',
        text: 'This action cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => result.isConfirmed);
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
    if (!form) {
        console.error('Campaign form not found');
        return;
    }

    // Reset the form
    form.reset();
    
    // Clear required items list
    const itemsList = document.getElementById('requiredItemsList');
    if (itemsList) {
        itemsList.innerHTML = '';
    }    
    // Remove editing key if it exists
    form.removeAttribute('data-editing-key');
    
    // Reset the edit notice
    const editNotice = document.getElementById('editNotice');
    if (editNotice) {
        editNotice.style.display = 'none';
    }
    
    // Reset modal title
    const modalTitle = document.getElementById('campaignFormModalLabel');
    if (modalTitle) {
        modalTitle.textContent = 'Create New Campaign';
    }
    
    // Clear any validation messages or error states
    const inputs = form.querySelectorAll('input');
    inputs.forEach(input => {
        input.classList.remove('is-invalid');
        const feedback = input.nextElementSibling;
        if (feedback && feedback.classList.contains('invalid-feedback')) {
            feedback.remove();
        }
    });
}

function showCreateCampaignModal() {
    const modal = document.getElementById('campaignFormModal');
    if (!modal) {
        console.error('Campaign form modal not found');
        return;
    }

    try {
        resetCampaignForm();
    } catch (error) {
        console.error('Error resetting form:', error);
    }

    // Show the modal
    $('#campaignFormModal').modal('show');
}

// Initialize all event listeners when the document is ready
document.addEventListener('DOMContentLoaded', function() {
    // Campaign form event listeners
    const saveCampaignBtn = document.getElementById('saveCampaignBtn');
    if (saveCampaignBtn) {
        saveCampaignBtn.addEventListener('click', handleSaveCampaign);
    }

    const campaignForm = document.getElementById('campaignForm');
    if (campaignForm) {
        campaignForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleSaveCampaign();
        });
    }

    // Create campaign button in the table view
    const createCampaignBtn = document.querySelector('.btn-create-campaign');
    if (createCampaignBtn) {
        createCampaignBtn.addEventListener('click', showCreateCampaignModal);
    }
});


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

//======================================================= Console Log =================================================
// Add logging functions
function initializeLogging() {
    // Override console.log
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = function() {
        addLogEntry(arguments, 'log');
        originalLog.apply(console, arguments);
    };

    console.error = function() {
        addLogEntry(arguments, 'error');
        originalError.apply(console, arguments);
    };

    console.warn = function() {
        addLogEntry(arguments, 'warning');
        originalWarn.apply(console, arguments);
    };
}

function addLogEntry(args, type) {
    const logContainer = document.getElementById('logContainer');
    if (!logContainer) return;

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    
    const timestamp = new Date().toLocaleTimeString();
    const message = Array.from(args).map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
    ).join(' ');

    entry.textContent = `[${timestamp}] ${message}`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function clearLogs() {
    const logContainer = document.getElementById('logContainer');
    if (logContainer) {
        logContainer.innerHTML = '';
    }
}

function toggleConsole() {
    const consolePanel = document.querySelector('.console-panel');
    if (consolePanel) {
        consolePanel.style.display = consolePanel.style.display === 'none' ? 'block' : 'none';
    }
}

// Add keyboard shortcut to toggle console (Ctrl+`)
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === '`') {
        toggleConsole();
    }
});

// Initialize logging when the document is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeLogging();
    // ... rest of your initialization code
});