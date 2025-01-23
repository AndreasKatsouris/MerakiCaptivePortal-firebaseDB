const admin = require('firebase-admin');
const { validateCampaignData } = require('./guardRail');

// Ensure Firebase is initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

/**
 * Fetch all active campaigns from Firebase
 * @returns {Promise<object[]>} - List of active campaigns
 */
async function fetchCampaigns() {
    try {
        const snapshot = await admin.database().ref('campaigns').once('value');
        const campaigns = snapshot.val();
        return campaigns ? Object.values(campaigns) : [];
    } catch (error) {
        console.error('Error fetching campaigns:', error);
        throw new Error('Failed to fetch campaigns.');
    }
}

/**
 * Get details of a specific campaign by name
 * @param {string} campaignName - The name of the campaign
 * @returns {Promise<object>} - Campaign details
 */
async function getCampaignDetails(campaignName) {
    const campaigns = await fetchCampaigns();
    return campaigns.find(campaign => campaign.name.toLowerCase() === campaignName.toLowerCase());
}

export function initializeCampaignManagement() {
    addEventListenerSafely('campaignManagementMenu', 'click', (e) => {
        e.preventDefault();
        displaySection('campaignManagementContent');
        loadCampaigns();
    });

    addEventListenerSafely('createCampaignBtn', 'click', showCreateCampaignModal);
    addEventListenerSafely('saveCampaignBtn', 'click', handleSaveCampaign);
}

async function loadCampaigns() {
    const campaignTable = document.querySelector('#campaignTable tbody');
    if (!campaignTable) return;

    try {
        showLoading();
        const snapshot = await firebase.database().ref('campaigns').once('value');
        const campaigns = snapshot.val();
        
        if (!campaigns) {
            campaignTable.innerHTML = getEmptyTableHTML();
            return;
        }

        campaignTable.innerHTML = Object.entries(campaigns)
            .map(([key, campaign]) => createCampaignRow(key, campaign))
            .join('');

        attachCampaignEventListeners();
    } catch (error) {
        console.error('Error loading campaigns:', error);
        showError('Failed to load campaigns');
    } finally {
        hideLoading();
    }
}

function createCampaignRow(key, campaign) {
    const formattedStartDate = formatDate(campaign.startDate);
    const formattedEndDate = formatDate(campaign.endDate);
    const activeDays = formatActiveDays(campaign.activeDays);

    return `
        <tr>
            <td>${campaign.name || 'Unnamed Campaign'}</td>
            <td>${campaign.brandName || 'No Brand'}</td>
            <td>${campaign.storeName || 'All Stores'}</td>
            <td>${formattedStartDate}</td>
            <td>${formattedEndDate}</td>
            <td>${activeDays}</td>
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
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-info view-campaign" data-key="${key}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-warning edit-campaign" data-key="${key}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger delete-campaign" data-key="${key}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function formatActiveDays(activeDays) {
    if (!activeDays || activeDays.length === 0) return 'All days';
    
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return activeDays.map(day => daysOfWeek[day]).join(', ');
}

function getActiveDays() {
    const checkedDays = document.querySelectorAll('input[name="activeDays"]:checked');
    return Array.from(checkedDays).map(checkbox => parseInt(checkbox.value));
}

async function handleSaveCampaign() {
    try {
        const campaignData = {
            name: document.getElementById('campaignName').value.trim(),
            brandName: document.getElementById('brandName').value.trim(),
            storeName: document.getElementById('storeName').value || null,
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value,
            status: document.getElementById('campaignStatus').value,
            minPurchaseAmount: parseFloat(document.getElementById('minPurchaseAmount').value) || null,
            activeDays: getActiveDays(),
            requiredItems: getRequiredItems(),
            createdAt: Date.now()
        };

        const errors = validateCampaignData(campaignData);
        if (errors.length > 0) {
            throw new Error(errors.join('\n'));
        }

        const form = document.getElementById('campaignForm');
        const editingKey = form?.getAttribute('data-editing-key');

        if (editingKey) {
            await updateCampaign(editingKey, campaignData);
        } else {
            await createNewCampaign(campaignData);
        }

        $('#campaignFormModal').modal('hide');
        await loadCampaigns();
        showSuccess('Campaign saved successfully');

    } catch (error) {
        console.error('Error saving campaign:', error);
        showError(error.message);
    }
}

async function createNewCampaign(campaignData) {
    const campaignRef = firebase.database().ref('campaigns').push();
    await campaignRef.set(campaignData);
    return campaignRef.key;
}

async function updateCampaign(campaignKey, campaignData) {
    await firebase.database().ref(`campaigns/${campaignKey}`).update({
        ...campaignData,
        updatedAt: Date.now()
    });
}

async function viewCampaignDetails(campaignId) {
    try {
        const snapshot = await firebase.database().ref(`campaigns/${campaignId}`).once('value');
        const campaign = snapshot.val();
        
        if (!campaign) throw new Error('Campaign not found');

        const modalContent = generateCampaignDetailsHTML(campaign);
        showCampaignDetailsModal(modalContent, campaignId);
    } catch (error) {
        console.error('Error viewing campaign:', error);
        showError('Failed to load campaign details');
    }
}

function generateCampaignDetailsHTML(campaign) {
    const activeDays = formatActiveDays(campaign.activeDays);
    return `
        <div class="campaign-details">
            <table class="table table-bordered">
                <tr><th>Campaign Name</th><td>${campaign.name}</td></tr>
                <tr><th>Brand Name</th><td>${campaign.brandName}</td></tr>
                <tr><th>Store</th><td>${campaign.storeName || 'All Stores'}</td></tr>
                <tr><th>Date Range</th><td>${formatDate(campaign.startDate)} - ${formatDate(campaign.endDate)}</td></tr>
                <tr><th>Active Days</th><td>${activeDays}</td></tr>
                <tr><th>Minimum Purchase</th><td>${campaign.minPurchaseAmount ? `R${campaign.minPurchaseAmount}` : 'None'}</td></tr>
                <tr><th>Status</th><td><span class="badge badge-${campaign.status === 'active' ? 'success' : 'secondary'}">${campaign.status}</span></td></tr>
                ${generateRequiredItemsHTML(campaign.requiredItems)}
            </table>
        </div>
    `;
}

function generateRequiredItemsHTML(items) {
    if (!items?.length) return '';
    
    return `
        <tr>
            <th>Required Items</th>
            <td>
                <ul class="list-unstyled mb-0">
                    ${items.map(item => `
                        <li>
                            <i class="fas fa-check-circle text-success mr-2"></i>
                            ${item.name} (Qty: ${item.quantity})
                        </li>
                    `).join('')}
                </ul>
            </td>
        </tr>
    `;
}

async function editCampaign(campaignId) {
    try {
        const snapshot = await firebase.database().ref(`campaigns/${campaignId}`).once('value');
        const campaign = snapshot.val();
        
        if (!campaign) throw new Error('Campaign not found');

        populateCampaignForm(campaign, campaignId);
        $('#campaignFormModal').modal('show');
    } catch (error) {
        console.error('Error editing campaign:', error);
        showError('Failed to load campaign for editing');
    }
}

function populateCampaignForm(campaign, campaignId) {
    document.getElementById('campaignName').value = campaign.name || '';
    document.getElementById('brandName').value = campaign.brandName || '';
    document.getElementById('storeName').value = campaign.storeName || '';
    document.getElementById('startDate').value = campaign.startDate || '';
    document.getElementById('endDate').value = campaign.endDate || '';
    document.getElementById('minPurchaseAmount').value = campaign.minPurchaseAmount || '';
    document.getElementById('campaignStatus').value = campaign.status || 'inactive';

    // Set active days
    document.querySelectorAll('input[name="activeDays"]').forEach(checkbox => {
        checkbox.checked = campaign.activeDays?.includes(parseInt(checkbox.value));
    });

    // Set required items
    const itemsList = document.getElementById('requiredItemsList');
    itemsList.innerHTML = '';
    campaign.requiredItems?.forEach(item => addRequiredItem(item.name, item.quantity));

    // Mark form as editing
    const form = document.getElementById('campaignForm');
    if (form) form.setAttribute('data-editing-key', campaignId);
}

function attachCampaignEventListeners() {
    document.querySelectorAll('.view-campaign').forEach(button => {
        button.addEventListener('click', () => {
            const campaignId = button.getAttribute('data-key');
            viewCampaignDetails(campaignId);
        });
    });

    document.querySelectorAll('.edit-campaign').forEach(button => {
        button.addEventListener('click', () => {
            const campaignId = button.getAttribute('data-key');
            editCampaign(campaignId);
        });
    });

    document.querySelectorAll('.delete-campaign').forEach(button => {
        button.addEventListener('click', () => {
            const campaignId = button.getAttribute('data-key');
            deleteCampaign(campaignId);
        });
    });

    document.querySelectorAll('.status-toggle').forEach(toggle => {
        toggle.addEventListener('change', () => {
            const campaignId = toggle.getAttribute('data-key');
            updateCampaignStatus(campaignId, toggle.checked ? 'active' : 'inactive');
        });
    });
}

function showCampaignDetailsModal(modalContent) {
    const modalElement = document.getElementById('campaignDetailsModal');
    if (!modalElement) {
        // Create modal if it doesn't exist
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="campaignDetailsModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Campaign Details</h5>
                            <button type="button" class="close" data-dismiss="modal">
                                <span aria-hidden="true">&times;</span>
                            </button>
                        </div>
                        <div class="modal-body"></div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `);
    }

    const modalBody = document.querySelector('#campaignDetailsModal .modal-body');
    if (modalBody) {
        modalBody.innerHTML = modalContent;
    }

    $('#campaignDetailsModal').modal('show');
}

module.exports = {
    fetchCampaigns,
    getCampaignDetails,
    initializeCampaignManagement
};
