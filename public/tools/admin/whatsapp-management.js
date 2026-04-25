/**
 * WhatsApp Multi-Location Management Interface
 * Version: 1.0.0-2025-07-17
 * 
 * Admin interface for managing WhatsApp numbers and location assignments
 * Integrates with Firebase Cloud Functions for WhatsApp management
 */

import { auth, rtdb, ref, get, set, update, remove } from '../../js/config/firebase-config.js';
import { authManager } from '../../js/auth/auth.js';

// Global variables
let currentUser = null;
let userTierLimits = null;
let whatsappNumbers = [];
let locationMappings = [];
let userLocations = [];
let currentWhatsAppNumberId = null;
let currentUserIsAdmin = false;

async function checkAdminStatus() {
    try {
        const adminClaimsRef = ref(rtdb, `admin-claims/${currentUser.uid}`);
        const snapshot = await get(adminClaimsRef);
        currentUserIsAdmin = snapshot.exists();
    } catch (e) {
        currentUserIsAdmin = false;
    }
}

function switchTab(tabName) {
    const tabs = ['numbers', 'mappings', 'templates', 'analytics'];
    tabs.forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (el) el.style.display = t === tabName ? 'block' : 'none';
    });
    document.querySelectorAll('#whatsappTabs .nav-link').forEach((link, i) => {
        link.classList.toggle('active', tabs[i] === tabName);
    });
    if (tabName === 'templates') loadTemplateTab();
}
window.switchTab = switchTab;

// API endpoints
const API_BASE_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net';
const ENDPOINTS = {
    initializeSchema: `${API_BASE_URL}/initializeWhatsAppSchema`,
    createNumber: `${API_BASE_URL}/createWhatsAppNumber`,
    assignToLocation: `${API_BASE_URL}/assignWhatsAppToLocation`,
    getByLocation: `${API_BASE_URL}/getWhatsAppByLocation`,
    getByNumber: `${API_BASE_URL}/getLocationByWhatsApp`,
    getUserNumbers: `${API_BASE_URL}/getUserWhatsAppNumbers`,
    getAnalytics: `${API_BASE_URL}/getWhatsAppAnalytics`,
    removeNumber: `${API_BASE_URL}/removeWhatsAppNumber`,
    checkMigration: `${API_BASE_URL}/checkMigrationStatus`,
    startMigration: `${API_BASE_URL}/startMigration`,
    getTemplateConfig: `${API_BASE_URL}/getWhatsAppTemplateConfig`,
    updateTemplateConfig: `${API_BASE_URL}/updateWhatsAppTemplateConfig`,
    testTemplateSend: `${API_BASE_URL}/sendWhatsAppTestMessage`,
    deleteTemplateConfig: `${API_BASE_URL}/deleteWhatsAppTemplateConfig`,
    addTemplateConfig: `${API_BASE_URL}/addWhatsAppTemplateConfig`
};

/**
 * Initialize the WhatsApp management interface
 */
async function init() {
    console.log('🚀 Initializing WhatsApp Management Interface...');

    try {
        // Properly initialize auth and wait for state
        console.log('🔐 Initializing authentication...');
        currentUser = await authManager.initialize();

        if (!currentUser) {
            console.log('❌ No authenticated user, redirecting to login');
            window.location.href = '../admin-login.html';
            return;
        }

        console.log('✅ User authenticated:', currentUser.email);

        // Verify admin access (optional - you may want to add this)
        // For now, we'll proceed if user is authenticated

        // Load initial data
        await loadInitialData();

        // Set up event listeners
        setupEventListeners();

        // Set initialization flag for admin dashboard integration
        window.whatsappManagementInitialized = true;

        // Auto-switch tab based on URL hash
        const hash = window.location.hash;
        if (hash === '#templates') switchTab('templates');

        console.log('✅ WhatsApp Management Interface initialized');

    } catch (error) {
        console.error('❌ Error initializing WhatsApp Management Interface:', error);
        // Show error message instead of redirecting immediately
        showError('Failed to initialize WhatsApp management interface. Please refresh the page.');
        // Still set the flag to prevent infinite waiting
        window.whatsappManagementInitialized = true;
    }
}

/**
 * Load initial data from Firebase
 */
async function loadInitialData() {
    try {
        showLoading(true);
        
        // Load user locations
        await loadUserLocations();

        // Check admin status before rendering numbers
        await checkAdminStatus();

        // Load WhatsApp numbers and tier information
        await loadWhatsAppData();
        
        // Load analytics if available
        await loadAnalytics();
        
        showLoading(false);
        
    } catch (error) {
        console.error('❌ Error loading initial data:', error);
        showError('Failed to load WhatsApp data. Please refresh the page.');
        showLoading(false);
    }
}

/**
 * Load user locations from Firebase
 */
async function loadUserLocations() {
    try {
        const userLocationsRef = ref(rtdb, `userLocations/${currentUser.uid}`);
        const userLocationsSnapshot = await get(userLocationsRef);
        
        if (userLocationsSnapshot.exists()) {
            const userLocationIds = Object.keys(userLocationsSnapshot.val());
            userLocations = [];
            
            for (const locationId of userLocationIds) {
                const locationRef = ref(rtdb, `locations/${locationId}`);
                const locationSnapshot = await get(locationRef);
                
                if (locationSnapshot.exists()) {
                    userLocations.push({
                        id: locationId,
                        ...locationSnapshot.val()
                    });
                }
            }
        }
        
        console.log('✅ Loaded user locations:', userLocations.length);
        
    } catch (error) {
        console.error('❌ Error loading user locations:', error);
        userLocations = [];
    }
}

/**
 * Load WhatsApp data from Cloud Functions
 */
async function loadWhatsAppData() {
    try {
        const token = await currentUser.getIdToken();
        
        const response = await fetch(ENDPOINTS.getUserNumbers, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            whatsappNumbers = data.whatsappNumbers || [];
            locationMappings = data.locationMappings || [];
            userTierLimits = data.tierLimits || {};
            
            console.log('✅ Loaded WhatsApp data:', {
                numbers: whatsappNumbers.length,
                mappings: locationMappings.length,
                tier: userTierLimits
            });
            
            // Update UI
            updateTierInformation(data.usage);
            renderWhatsAppNumbers();
            renderLocationMappings();
            
        } else {
            throw new Error(data.error || 'Failed to load WhatsApp data');
        }
        
    } catch (error) {
        console.error('❌ Error loading WhatsApp data:', error);
        
        // Handle deployment/CORS issues
        if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
            showDeploymentNeededMessage();
            return;
        }
        
        // Check if this is a tier limitation
        if (error.message.includes('not available') || userTierLimits?.whatsappNumbers === 0) {
            showUpgradePrompt();
        } else {
            showError(`Failed to load WhatsApp data: ${error.message}`);
        }
    }
}

/**
 * Load analytics data if available
 */
async function loadAnalytics() {
    try {
        if (!userTierLimits?.analyticsAccess) {
            console.log('📊 Analytics access not available in current tier');
            return;
        }
        
        const token = await currentUser.getIdToken();
        
        const response = await fetch(ENDPOINTS.getAnalytics, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success) {
                updateAnalytics(data.analytics);
                document.getElementById('tab-analytics').style.display = 'block';
            }
        }
        
    } catch (error) {
        console.error('❌ Error loading analytics:', error);
    }
}

/**
 * Update tier information display
 */
function updateTierInformation(usage) {
    const tierInfo = document.getElementById('tierInfo');
    const currentTier = document.getElementById('currentTier');
    const numbersProgress = document.getElementById('numbersProgress');
    const numbersUsage = document.getElementById('numbersUsage');
    const locationsProgress = document.getElementById('locationsProgress');
    const locationsUsage = document.getElementById('locationsUsage');
    const analyticsAccess = document.getElementById('analyticsAccess');
    
    // Show tier information
    tierInfo.style.display = 'block';
    
    // Update current tier
    const tierName = getTierDisplayName(userTierLimits);
    currentTier.textContent = tierName;
    currentTier.className = `badge tier-badge ${getTierBadgeClass(tierName)}`;
    
    // Update numbers usage
    const numbersPercent = userTierLimits.whatsappNumbers === -1 ? 0 : 
        (usage.numbersUsed / userTierLimits.whatsappNumbers) * 100;
    numbersProgress.style.width = `${numbersPercent}%`;
    numbersProgress.className = `progress-bar ${getProgressBarClass(numbersPercent)}`;
    
    const numbersLimit = userTierLimits.whatsappNumbers === -1 ? 'Unlimited' : userTierLimits.whatsappNumbers;
    numbersUsage.textContent = `${usage.numbersUsed} of ${numbersLimit} used`;
    
    // Update locations usage
    if (locationsProgress) {
        locationsProgress.style.width = usage.locationsWithWhatsApp > 0 ? '100%' : '0%';
        locationsProgress.className = 'progress-bar bg-info';
    }
    locationsUsage.textContent = `${usage.locationsWithWhatsApp} locations configured`;
    
    // Update analytics access
    analyticsAccess.textContent = userTierLimits.analyticsAccess ? 'Available' : 'Not Available';
    analyticsAccess.className = `badge ${userTierLimits.analyticsAccess ? 'bg-success' : 'bg-secondary'}`;
}

/**
 * Render WhatsApp numbers
 */
function renderWhatsAppNumbers() {
    const container = document.getElementById('numbersContainer');
    
    if (whatsappNumbers.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fab fa-whatsapp fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">No WhatsApp Numbers</h5>
                <p class="text-muted">Add your first WhatsApp number to get started with multi-location messaging.</p>
                <button class="btn btn-success" onclick="showAddNumberModal()">
                    <i class="fas fa-plus"></i> Add WhatsApp Number
                </button>
            </div>
        `;
    } else {
        container.innerHTML = whatsappNumbers.map(number => `
            <div class="card whatsapp-card mb-3">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-md-6">
                            <h6 class="card-title mb-1">
                                <span class="status-indicator ${getStatusClass(number.status)}"></span>
                                ${number.displayName}
                            </h6>
                            <p class="card-text mb-1">
                                <span class="number-input">${number.phoneNumber}</span>
                            </p>
                            <small class="text-muted">
                                Status: ${formatStatus(number.status)} • 
                                Created: ${formatDate(number.createdAt)}
                            </small>
                        </div>
                        <div class="col-md-3">
                            <div class="text-center">
                                <h6 class="mb-1">${number.usage?.totalMessages || 0}</h6>
                                <small class="text-muted">Total Messages</small>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="dropdown">
                                <button class="btn btn-outline-secondary dropdown-toggle" type="button" 
                                        data-bs-toggle="dropdown">
                                    Actions
                                </button>
                                <ul class="dropdown-menu">
                                    <li>
                                        <a class="dropdown-item" href="#" onclick="showAssignLocationModal('${number.id}')">
                                            <i class="fas fa-map-marker-alt"></i> Assign to Location
                                        </a>
                                    </li>
                                    <li>
                                        <a class="dropdown-item" href="#" onclick="editWhatsAppNumber('${number.id}')">
                                            <i class="fas fa-edit"></i> Edit
                                        </a>
                                    </li>
                                    ${currentUserIsAdmin ? `
                                    <li><hr class="dropdown-divider"></li>
                                    <li>
                                        <a class="dropdown-item text-danger" href="#" onclick="removeWhatsAppNumber('${number.id}')">
                                            <i class="fas fa-trash"></i> Remove
                                        </a>
                                    </li>` : ''}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
}

/**
 * Render location mappings
 */
function renderLocationMappings() {
    const container = document.getElementById('mappingsContainer');
    
    if (locationMappings.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-map-marker-alt fa-2x text-muted mb-3"></i>
                <h6 class="text-muted">No Location Mappings</h6>
                <p class="text-muted">Assign WhatsApp numbers to locations to enable location-specific messaging.</p>
            </div>
        `;
    } else {
        container.innerHTML = locationMappings.map(mapping => `
            <div class="location-mapping">
                <div class="row align-items-center">
                    <div class="col-md-6">
                        <h6 class="mb-1">
                            <i class="fas fa-map-marker-alt text-primary"></i>
                            ${mapping.locationName}
                        </h6>
                        <p class="mb-1">
                            <i class="fab fa-whatsapp text-success"></i>
                            <span class="number-input">${mapping.phoneNumber}</span>
                        </p>
                        <small class="text-muted">
                            Assigned: ${formatDate(mapping.assignedAt)}
                        </small>
                    </div>
                    <div class="col-md-3">
                        <div class="text-center">
                            <h6 class="mb-1">${mapping.analytics?.messagesSent || 0}</h6>
                            <small class="text-muted">Messages Sent</small>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="text-center">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" 
                                       id="active_${mapping.locationId}" 
                                       ${mapping.isActive ? 'checked' : ''}
                                       onchange="toggleLocationMapping('${mapping.locationId}')">
                                <label class="form-check-label" for="active_${mapping.locationId}">
                                    Active
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
}

/**
 * Update analytics display
 */
function updateAnalytics(analytics) {
    document.getElementById('totalMessages').textContent = analytics.totalMessages || 0;
    document.getElementById('activeLocations').textContent = Object.keys(analytics.messagesByLocation || {}).length;
    document.getElementById('avgResponseTime').textContent = '< 2'; // Placeholder
}

/**
 * Show add number modal
 */
function showAddNumberModal() {
    // Check tier limits
    if (userTierLimits && userTierLimits.whatsappNumbers !== -1) {
        if (whatsappNumbers.length >= userTierLimits.whatsappNumbers) {
            showUpgradePrompt();
            return;
        }
    }
    
    // Reset form
    document.getElementById('addNumberForm').reset();
    
    // Show modal
    new bootstrap.Modal(document.getElementById('addNumberModal')).show();
}

/**
 * Show assign location modal
 */
function showAssignLocationModal(whatsappNumberId) {
    const number = whatsappNumbers.find(n => n.id === whatsappNumberId);
    if (!number) return;
    
    currentWhatsAppNumberId = whatsappNumberId;
    
    // Populate location dropdown
    const locationSelect = document.getElementById('selectedLocation');
    locationSelect.innerHTML = '<option value="">Choose a location...</option>';
    
    userLocations.forEach(location => {
        // Check if location already has a WhatsApp number
        const hasMapping = locationMappings.some(m => m.locationId === location.id);
        const disabled = hasMapping ? 'disabled' : '';
        const suffix = hasMapping ? ' (Already has WhatsApp)' : '';
        
        locationSelect.innerHTML += `
            <option value="${location.id}" ${disabled}>
                ${location.name}${suffix}
            </option>
        `;
    });
    
    // Set WhatsApp number
    document.getElementById('assigningNumber').value = number.phoneNumber;
    
    // Show modal
    new bootstrap.Modal(document.getElementById('assignLocationModal')).show();
}

/**
 * Add WhatsApp number
 */
async function addWhatsAppNumber() {
    try {
        const phoneNumber = document.getElementById('phoneNumber').value.trim();
        const displayName = document.getElementById('displayName').value.trim();
        const description = document.getElementById('description').value.trim();
        
        if (!phoneNumber || !displayName) {
            showError('Please fill in all required fields');
            return;
        }
        
        // Validate phone number format
        if (!isValidPhoneNumber(phoneNumber)) {
            showError('Please enter a valid phone number in international format (e.g., +27123456789)');
            return;
        }
        
        const token = await currentUser.getIdToken();
        
        const response = await fetch(ENDPOINTS.createNumber, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phoneNumber,
                displayName,
                metadata: {
                    description: description || null
                }
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('addNumberModal')).hide();
            
            // Show success message
            showSuccess('WhatsApp number added successfully!');
            
            // Refresh data
            await loadWhatsAppData();
            
        } else {
            if (data.upgradeRequired) {
                showUpgradePrompt(data.recommendedTier);
            } else {
                showError(data.error || 'Failed to add WhatsApp number');
            }
        }
        
    } catch (error) {
        console.error('❌ Error adding WhatsApp number:', error);
        showError('Failed to add WhatsApp number. Please try again.');
    }
}

/**
 * Assign WhatsApp number to location
 */
async function assignToLocation() {
    try {
        const locationId = document.getElementById('selectedLocation').value;
        const autoResponder = document.getElementById('enableAutoResponder').checked;
        
        if (!locationId) {
            showError('Please select a location');
            return;
        }
        
        const token = await currentUser.getIdToken();
        
        const response = await fetch(ENDPOINTS.assignToLocation, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                locationId,
                whatsappNumberId: currentWhatsAppNumberId
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('assignLocationModal')).hide();
            
            // Show success message
            showSuccess('WhatsApp number assigned to location successfully!');
            
            // Refresh data
            await loadWhatsAppData();
            
        } else {
            if (data.upgradeRequired) {
                showUpgradePrompt(data.recommendedTier);
            } else {
                showError(data.error || 'Failed to assign WhatsApp number to location');
            }
        }
        
    } catch (error) {
        console.error('❌ Error assigning WhatsApp number:', error);
        showError('Failed to assign WhatsApp number. Please try again.');
    }
}

/**
 * Remove WhatsApp number
 */
async function removeWhatsAppNumber(whatsappNumberId) {
    try {
        const result = await Swal.fire({
            title: 'Remove WhatsApp Number?',
            text: 'This will remove the WhatsApp number and all its location assignments. This action cannot be undone.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Yes, remove it!'
        });
        
        if (!result.isConfirmed) return;
        
        const token = await currentUser.getIdToken();
        
        const response = await fetch(ENDPOINTS.removeNumber, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                whatsappNumberId
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showSuccess('WhatsApp number removed successfully!');
            await loadWhatsAppData();
        } else {
            showError(data.error || 'Failed to remove WhatsApp number');
        }
        
    } catch (error) {
        console.error('❌ Error removing WhatsApp number:', error);
        showError('Failed to remove WhatsApp number. Please try again.');
    }
}

/**
 * Toggle location mapping active status
 */
async function toggleLocationMapping(locationId) {
    try {
        const mapping = locationMappings.find(m => m.locationId === locationId);
        if (!mapping) return;
        
        const newStatus = !mapping.isActive;
        
        // Update in Firebase directly with proper field names
        const mappingRef = ref(rtdb, `location-whatsapp-mapping/${locationId}`);
        await update(mappingRef, {
            isActive: newStatus,
            active: newStatus, // Also set 'active' for compatibility
            updatedAt: Date.now(),
            // Ensure locationName is properly set
            locationName: mapping.locationName || 'Unknown Location'
        });
        
        console.log(`📝 Updated mapping for ${locationId}: isActive=${newStatus}, locationName="${mapping.locationName}"`);
        
        // Update local data
        mapping.isActive = newStatus;
        
        const statusText = newStatus ? 'enabled' : 'disabled';
        showSuccess(`WhatsApp messaging ${statusText} for ${mapping.locationName}`);
        
    } catch (error) {
        console.error('❌ Error toggling location mapping:', error);
        showError('Failed to update location mapping status');
        
        // Revert checkbox state
        document.getElementById(`active_${locationId}`).checked = !document.getElementById(`active_${locationId}`).checked;
    }
}

/**
 * Show deployment needed message
 */
function showDeploymentNeededMessage() {
    const container = document.getElementById('numbersContainer');
    container.innerHTML = `
        <div class="text-center py-5">
            <i class="fas fa-cloud-upload-alt fa-3x text-warning mb-3"></i>
            <h5 class="text-warning">Functions Deployment Required</h5>
            <p class="text-muted">WhatsApp management functions need to be deployed to Firebase Cloud Functions.</p>
            <div class="alert alert-info mt-3" role="alert">
                <h6><i class="fas fa-terminal"></i> Next Steps:</h6>
                <ol class="text-start mb-0">
                    <li>Open terminal in your project directory</li>
                    <li>Run: <code>firebase deploy --only functions</code></li>
                    <li>Wait for deployment to complete</li>
                    <li>Refresh this page</li>
                </ol>
            </div>
            <button class="btn btn-outline-primary" onclick="refreshData()">
                <i class="fas fa-sync"></i> Check Again
            </button>
        </div>
    `;
    document.getElementById('tab-numbers').style.display = 'block';
    document.getElementById('tierInfo').style.display = 'none';
    document.getElementById('tab-mappings').style.display = 'none';
    document.getElementById('tab-analytics').style.display = 'none';
}

/**
 * Show upgrade prompt
 */
function showUpgradePrompt(recommendedTier = 'starter') {
    document.getElementById('upgradePrompt').style.display = 'block';
    document.getElementById('tab-numbers').style.display = 'none';
    document.getElementById('tab-mappings').style.display = 'none';
    document.getElementById('tab-analytics').style.display = 'none';
}

/**
 * Show migration modal
 */
async function showMigrationModal() {
    const modal = new bootstrap.Modal(document.getElementById('migrationModal'));
    modal.show();
    
    // Check migration status
    await checkMigrationStatus();
}

/**
 * Check migration status
 */
async function checkMigrationStatus() {
    try {
        document.getElementById('migrationStatus').style.display = 'block';
        document.getElementById('migrationStatusText').textContent = 'Checking existing configuration...';
        
        const token = await currentUser.getIdToken();
        
        const response = await fetch(ENDPOINTS.checkMigration, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        document.getElementById('migrationStatus').style.display = 'none';
        
        if (response.ok && data.success) {
            if (data.canMigrate) {
                // Show migration details
                document.getElementById('migrationDetails').style.display = 'block';
                document.getElementById('existingNumber').textContent = data.existingNumber;
                document.getElementById('existingStatus').textContent = data.status;
                document.getElementById('existingStatus').className = `badge ${data.status === 'active' ? 'bg-success' : 'bg-warning'}`;
                document.getElementById('startMigrationBtn').disabled = false;
            } else {
                // Show error
                document.getElementById('migrationError').style.display = 'block';
                document.getElementById('migrationErrorText').textContent = data.message || 'No existing WhatsApp configuration found to migrate.';
            }
        } else {
            throw new Error(data.error || 'Failed to check migration status');
        }
        
    } catch (error) {
        console.error('❌ Error checking migration status:', error);
        document.getElementById('migrationStatus').style.display = 'none';
        document.getElementById('migrationError').style.display = 'block';
        document.getElementById('migrationErrorText').textContent = 'Failed to check migration status. Please try again.';
    }
}

/**
 * Start migration process
 */
async function startMigration() {
    try {
        const displayName = document.getElementById('migrationDisplayName').value.trim();
        
        if (!displayName) {
            showError('Please enter a display name for the migrated number');
            return;
        }
        
        document.getElementById('startMigrationBtn').disabled = true;
        document.getElementById('migrationStatus').style.display = 'block';
        document.getElementById('migrationStatusText').textContent = 'Starting migration process...';
        
        const token = await currentUser.getIdToken();
        
        const response = await fetch(ENDPOINTS.startMigration, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                displayName: displayName,
                description: 'Migrated from existing platform configuration'
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('migrationModal')).hide();
            
            // Show success message
            showSuccess(`Migration completed successfully! WhatsApp number ${data.migratedNumber} has been added to your multi-location system.`);
            
            // Refresh data
            await loadWhatsAppData();
            
        } else {
            throw new Error(data.error || 'Migration failed');
        }
        
    } catch (error) {
        console.error('❌ Error during migration:', error);
        showError(`Migration failed: ${error.message}`);
        document.getElementById('startMigrationBtn').disabled = false;
    } finally {
        document.getElementById('migrationStatus').style.display = 'none';
    }
}

/**
 * Refresh data
 */
async function refreshData() {
    await loadInitialData();
    showSuccess('Data refreshed successfully!');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Phone number input formatting
    document.getElementById('phoneNumber').addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        
        // Add + prefix for international numbers
        if (value.length > 0 && !value.startsWith('+')) {
            if (value.startsWith('27')) {
                value = '+' + value;
            } else if (value.startsWith('0')) {
                value = '+27' + value.substring(1);
            } else {
                value = '+' + value;
            }
        }
        
        e.target.value = value;
    });
}

/**
 * Utility functions
 */
function showLoading(show) {
    document.getElementById('loadingIndicator').style.display = show ? 'block' : 'none';
}

function showError(message) {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: message,
        confirmButtonColor: '#dc3545'
    });
}

function showSuccess(message) {
    Swal.fire({
        icon: 'success',
        title: 'Success',
        text: message,
        confirmButtonColor: '#28a745',
        timer: 3000,
        showConfirmButton: false
    });
}

function isValidPhoneNumber(phoneNumber) {
    // Basic validation for international format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
}

function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatStatus(status) {
    switch (status) {
        case 'active': return 'Active';
        case 'inactive': return 'Inactive';
        case 'pending_verification': return 'Pending Verification';
        case 'verification_failed': return 'Verification Failed';
        default: return 'Unknown';
    }
}

function getStatusClass(status) {
    switch (status) {
        case 'active': return 'status-active';
        case 'inactive': return 'status-inactive';
        case 'pending_verification': return 'status-pending';
        case 'verification_failed': return 'status-inactive';
        default: return 'status-inactive';
    }
}

function getTierDisplayName(tierLimits) {
    if (!tierLimits) return 'Unknown';
    
    if (tierLimits.whatsappNumbers === 0) return 'Free';
    if (tierLimits.whatsappNumbers === 1) return 'Starter';
    if (tierLimits.whatsappNumbers === 3) return 'Professional';
    if (tierLimits.whatsappNumbers === 20) return 'Enterprise';
    
    return 'Custom';
}

function getTierBadgeClass(tierName) {
    switch (tierName.toLowerCase()) {
        case 'free': return 'bg-secondary';
        case 'starter': return 'bg-primary';
        case 'professional': return 'bg-success';
        case 'enterprise': return 'bg-warning';
        default: return 'bg-info';
    }
}

function getProgressBarClass(percent) {
    if (percent < 50) return 'bg-success';
    if (percent < 80) return 'bg-warning';
    return 'bg-danger';
}

function upgradeToTier(tier) {
    window.location.href = `../user-subscription.html?upgrade=${tier}`;
}

// ── Numbers Tab — Edit ────────────────────────────────────────────────────────

async function editWhatsAppNumber(whatsappNumberId) {
    const number = whatsappNumbers.find(n => n.id === whatsappNumberId);
    if (!number) return;

    const { value: newName } = await Swal.fire({
        title: 'Edit Display Name',
        input: 'text',
        inputValue: number.displayName,
        showCancelButton: true,
        inputValidator: v => !v && 'Display name cannot be empty'
    });
    if (!newName) return;

    try {
        const numberRef = ref(rtdb, `whatsapp-numbers/${whatsappNumberId}`);
        await update(numberRef, { displayName: newName });
        whatsappNumbers = whatsappNumbers.map(n => n.id === whatsappNumberId ? { ...n, displayName: newName } : n);
        renderWhatsAppNumbers();
        Swal.fire({ icon: 'success', title: 'Updated', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Update failed', text: err.message });
    }
}
window.editWhatsAppNumber = editWhatsAppNumber;

// ── Templates Tab ─────────────────────────────────────────────────────────────

// Template body definitions mirrored from functions/utils/whatsappTemplates.js
// (Cannot import a CommonJS module in a browser ES module — static copy.)
const TEMPLATE_BODIES = {
    booking_confirmation: '🎉 *Booking Confirmed!*\n\nHi {{1}},\n\nYour table reservation has been confirmed:\n\n📋 *Booking Details:*\n• Booking ID: {{2}}\n• Date: {{3}}\n• Time: {{4}}\n• Location: {{5}}\n• Section: {{6}}\n• Number of Guests: {{7}}\n• Special Requests: {{8}}\n\n✅ *Status:* {{9}}\n\nWe look forward to serving you! If you need to make any changes, please contact us.\n\n🤖 This is an automated message. Reply if you have questions.',
    booking_status_update: '{{1}} *Booking Status Update*\n\nHi {{2}},\n\n{{3}}\n\n📋 *Booking Details:*\n• Booking ID: {{4}}\n• Date: {{5}}\n• Time: {{6}}\n• Location: {{7}}\n• Section: {{8}}\n• Number of Guests: {{9}}\n• Special Requests: {{10}}\n\n🤖 Reply to this message if you have any questions.',
    booking_reminder: '⏰ *Booking Reminder*\n\nHi {{1}},\n\nThis is a friendly reminder about your upcoming reservation:\n\n📋 *Booking Details:*\n• Date: {{2}}\n• Time: {{3}}\n• Location: {{4}}\n• Number of Guests: {{5}}\n\nWe look forward to seeing you!\n\n🤖 Need to change your booking? Just reply to this message.',
    receipt_confirmation: '🎉 *Receipt Processed!*\n\nCongratulations {{1}}! 🎉\n\nYour receipt has been successfully processed and you\'ve earned:\n\n{{2}}\n\n🎁 *Total Points:* {{3}}\n\nReply "view rewards" anytime to check your rewards!\n\n🤖 Keep sending receipts to earn more rewards!',
    welcome_message: '👋 *Welcome to Our Rewards Program!*\n\nHi {{1}}!\n\nWelcome to our rewards program! I\'m your rewards bot assistant.\n\n🎁 *Here\'s how I can help you:*\n• 📸 Send a photo of your receipt to earn rewards\n• 🎯 Type "check my points" to see your point balance\n• 🏆 Type "view rewards" to see your available rewards\n• 📅 Type "make booking" to reserve a table\n• ❓ Type "help" for more commands\n\nStart by sending me a receipt photo to begin earning rewards!\n\n🤖 Reply anytime for assistance!',
    queue_manual_addition: '🎫 *Added to Queue!*\n\nHi {{1}}!\n\nYou have been added to the queue at {{2}}.\n\n📋 *Queue Details:*\n• Position: {{3}}\n• Party Size: {{4}}\n• Estimated Wait Time: {{5}} minutes\n• Special Requests: {{6}}\n\n✅ *Status:* Waiting\n\nWe\'ll notify you when your table is ready!\n\n💬 You can check your queue status anytime by typing "queue status".\n\n🤖 This is an automated message. Reply if you have questions.',
    admin_new_booking_notification: '🍽️ *New Booking Request*\n\nHi {{1}},\n\nA new booking has been received and requires your attention.\n\n📋 *Booking Details:*\n• Guest: {{2}}\n• Booking ID: {{3}}\n• Date: {{4}}\n• Time: {{5}}\n• Location: {{6}}\n• Section: {{7}}\n• Number of Guests: {{8}}\n• Phone: {{9}}\n• Special Requests: {{10}}\n\n⏰ *Status:* Pending Confirmation\n\nPlease review and confirm this booking in the admin panel.\n\n🤖 This is an automated admin notification.'
};

// Sample data for template preview variable substitution
const TEMPLATE_SAMPLE_DATA = {
    '1': 'John Doe',
    '2': 'BK-00123',
    '3': '25/02/2026',
    '4': '19:00',
    '5': 'Sparks Grill',
    '6': 'Main Section',
    '7': '4',
    '8': 'None',
    '9': 'Confirmed',
    '10': 'None'
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Preview a template by substituting sample data into {{N}} placeholders
 * and displaying the result in a SweetAlert2 modal.
 */
function previewTemplate(templateKey) {
    const rawBody = TEMPLATE_BODIES[templateKey];
    if (!rawBody) {
        Swal.fire({ icon: 'info', title: 'No Preview Available', text: 'No template body definition found for this key.' });
        return;
    }
    const rendered = rawBody.replace(/\{\{(\d+)\}\}/g, (_, n) => TEMPLATE_SAMPLE_DATA[n] || `{{${n}}}`);
    const htmlBody = escapeHtml(rendered).replace(/\n/g, '<br>');
    const cfg = _templateConfig[templateKey] || {};
    Swal.fire({
        title: escapeHtml(cfg.label || templateKey),
        html: `
            <div class="text-start p-2" style="background:#f8f9fa;border-radius:8px;font-family:monospace;font-size:0.875rem;line-height:1.6;">
                ${htmlBody}
            </div>
            <div class="mt-2 text-muted small text-start">
                <i class="fas fa-info-circle"></i> Variables shown with sample data substituted.
            </div>`,
        width: 620,
        confirmButtonText: 'Close'
    });
}
window.previewTemplate = previewTemplate;

let _templateConfig = {};

async function loadTemplateTab() {
    const container = document.getElementById('templatesContainer');
    container.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-success"></div> Loading templates...</div>';

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(ENDPOINTS.getTemplateConfig, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        _templateConfig = data.config || {};
        renderTemplateCards();
    } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">Failed to load template config: ${escapeHtml(err.message)}</div>`;
    }
}

function renderTemplateCards() {
    const container = document.getElementById('templatesContainer');
    const entries = Object.entries(_templateConfig);

    const adminHeader = currentUserIsAdmin
        ? `<div class="d-flex justify-content-end mb-3">
               <button class="btn btn-success btn-sm" onclick="showAddTemplateModal()">
                   <i class="fas fa-plus me-1"></i>Add Template
               </button>
           </div>`
        : '';

    if (entries.length === 0) {
        container.innerHTML = adminHeader + '<div class="alert alert-warning">No template config found in RTDB. Run the seed function first.</div>';
        return;
    }

    const cards = entries.map(([key, cfg]) => {
        const status = cfg.enabled && cfg.contentSid && /^HX[a-f0-9]{32}$/.test(cfg.contentSid)
            ? '<span class="badge bg-success">Configured</span>'
            : cfg.enabled === false
                ? '<span class="badge bg-secondary">Disabled</span>'
                : '<span class="badge bg-warning text-dark">Fallback</span>';

        const deleteBtn = currentUserIsAdmin
            ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteTemplateConfig('${escapeHtml(key)}')">
                   <i class="fas fa-trash"></i> Delete
               </button>`
            : '';

        return `
        <div class="card mb-3" id="template-card-${escapeHtml(key)}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <h6 class="mb-0">${escapeHtml(cfg.label || key)}</h6>
                        <small class="text-muted">${cfg.variableCount || 0} variables · Utility</small>
                    </div>
                    <div>${status}</div>
                </div>
                <div class="row g-2 align-items-center">
                    <div class="col">
                        <input type="text" class="form-control form-control-sm font-monospace"
                               id="sid-input-${escapeHtml(key)}"
                               value="${escapeHtml(cfg.contentSid || '')}"
                               placeholder="HX________________________________"
                               maxlength="34">
                    </div>
                    <div class="col-auto">
                        <div class="form-check form-switch mb-0">
                            <input class="form-check-input" type="checkbox" id="enabled-${escapeHtml(key)}"
                                   ${cfg.enabled ? 'checked' : ''}>
                            <label class="form-check-label" for="enabled-${escapeHtml(key)}">Enabled</label>
                        </div>
                    </div>
                    <div class="col-auto">
                        <button class="btn btn-sm btn-outline-info" onclick="previewTemplate('${escapeHtml(key)}')">
                            <i class="fas fa-eye"></i> Preview
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="testTemplateSend('${escapeHtml(key)}')">
                            <i class="fas fa-paper-plane"></i> Test
                        </button>
                        <button class="btn btn-sm btn-success" onclick="saveTemplateConfig('${escapeHtml(key)}')">
                            Save
                        </button>
                        ${deleteBtn}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = adminHeader + cards;
}
window.loadTemplateTab = loadTemplateTab;
window.renderTemplateCards = renderTemplateCards;

async function saveTemplateConfig(templateKey) {
    const sidInput = document.getElementById(`sid-input-${templateKey}`);
    const enabledInput = document.getElementById(`enabled-${templateKey}`);
    const contentSid = sidInput.value.trim();
    const enabled = enabledInput.checked;

    if (contentSid && !/^HX[a-f0-9]{32}$/.test(contentSid)) {
        Swal.fire({ icon: 'error', title: 'Invalid ContentSid', text: 'Must start with HX and be exactly 34 characters of hex.' });
        return;
    }

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(ENDPOINTS.updateTemplateConfig, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateKey, contentSid, enabled })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        _templateConfig[templateKey] = { ..._templateConfig[templateKey], contentSid, enabled };
        renderTemplateCards();
        Swal.fire({ icon: 'success', title: 'Saved', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Save failed', text: err.message });
    }
}
window.saveTemplateConfig = saveTemplateConfig;

async function testTemplateSend(templateKey) {
    const { value: phone } = await Swal.fire({
        title: 'Test Send',
        input: 'tel',
        inputLabel: 'Send test to phone number (E.164 format)',
        inputPlaceholder: '+27123456789',
        showCancelButton: true
    });
    if (!phone) return;

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(ENDPOINTS.testTemplateSend, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateKey, toPhone: phone })
        });
        const data = await response.json();

        if (data.success) {
            Swal.fire({ icon: 'success', title: 'Sent!', text: `Message SID: ${data.messageSid}` });
        } else if (data.twilioError) {
            Swal.fire({
                icon: 'error',
                title: `Twilio Error ${data.twilioError.code}`,
                text: data.twilioError.message,
                footer: data.twilioError.moreInfo ? `<a href="${data.twilioError.moreInfo}" target="_blank">More info</a>` : ''
            });
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Test failed', text: err.message });
    }
}
window.testTemplateSend = testTemplateSend;

/**
 * Delete a template config entry (admin only).
 */
async function deleteTemplateConfig(templateKey) {
    const cfg = _templateConfig[templateKey] || {};
    const result = await Swal.fire({
        title: 'Delete Template?',
        html: `Delete <strong>${escapeHtml(cfg.label || templateKey)}</strong>? This cannot be undone.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Delete'
    });
    if (!result.isConfirmed) return;

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(ENDPOINTS.deleteTemplateConfig, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateKey })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        // Immutable rebuild: exclude deleted key
        const { [templateKey]: _removed, ...remaining } = _templateConfig;
        _templateConfig = remaining;
        renderTemplateCards();
        Swal.fire({ icon: 'success', title: 'Deleted', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Delete failed', text: escapeHtml(err.message) });
    }
}
window.deleteTemplateConfig = deleteTemplateConfig;

/**
 * Show SweetAlert2 form to add a new template config entry (admin only).
 */
async function showAddTemplateModal() {
    const { value: formValues } = await Swal.fire({
        title: 'Add Template',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label fw-semibold">Template Key</label>
                    <input id="swal-key" class="form-control" placeholder="e.g. queue_manual_addition">
                    <div class="form-text">Lowercase letters, numbers, and underscores only.</div>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold">Display Name</label>
                    <input id="swal-name" class="form-control" placeholder="e.g. Queue Manual Addition">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold">ContentSid</label>
                    <input id="swal-sid" class="form-control font-monospace" placeholder="HX________________________________">
                    <div class="form-text">Optional. Must be HX + 32 hex characters if provided.</div>
                </div>
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="swal-enabled" checked>
                    <label class="form-check-label" for="swal-enabled">Enabled</label>
                </div>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Add',
        confirmButtonColor: '#28a745',
        width: 520,
        preConfirm: () => {
            const key = document.getElementById('swal-key').value.trim();
            const name = document.getElementById('swal-name').value.trim();
            const sid = document.getElementById('swal-sid').value.trim();
            const enabled = document.getElementById('swal-enabled').checked;
            if (!key || !name) {
                Swal.showValidationMessage('Template Key and Display Name are required.');
                return false;
            }
            if (!/^[a-z0-9_]+$/.test(key)) {
                Swal.showValidationMessage('Key must be lowercase letters, numbers, and underscores only.');
                return false;
            }
            if (key in _templateConfig) {
                Swal.showValidationMessage(`Template key "${key}" already exists.`);
                return false;
            }
            if (sid && !/^HX[a-f0-9]{32}$/.test(sid)) {
                Swal.showValidationMessage('ContentSid must be HX followed by exactly 32 hex characters.');
                return false;
            }
            return { key, name, sid, enabled };
        }
    });
    if (!formValues) return;
    await addTemplateConfig(formValues);
}
window.showAddTemplateModal = showAddTemplateModal;

/**
 * POST new template config entry to backend, then update local state immutably.
 */
async function addTemplateConfig({ key, name, sid, enabled }) {
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(ENDPOINTS.addTemplateConfig, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateKey: key, label: name, contentSid: sid || '', enabled })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        // Immutable: spread in new entry
        _templateConfig = { ..._templateConfig, [key]: { label: name, contentSid: sid || '', enabled } };
        renderTemplateCards();
        Swal.fire({ icon: 'success', title: 'Added', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Add failed', text: escapeHtml(err.message) });
    }
}

// Global functions for HTML onclick handlers
window.showAddNumberModal = showAddNumberModal;
window.showAssignLocationModal = showAssignLocationModal;
window.addWhatsAppNumber = addWhatsAppNumber;
window.assignToLocation = assignToLocation;
window.removeWhatsAppNumber = removeWhatsAppNumber;
window.toggleLocationMapping = toggleLocationMapping;
window.refreshData = refreshData;
window.upgradeToTier = upgradeToTier;
window.showMigrationModal = showMigrationModal;
window.startMigration = startMigration;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);