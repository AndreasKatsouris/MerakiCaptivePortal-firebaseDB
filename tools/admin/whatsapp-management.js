/**
 * WhatsApp Multi-Location Management Interface
 * Version: 1.0.0-2025-07-17
 * 
 * Admin interface for managing WhatsApp numbers and location assignments
 * Integrates with Firebase Cloud Functions for WhatsApp management
 */

import { auth, rtdb, ref, get, set, update, remove } from '../js/config/firebase-config.js';
import { authManager } from '../js/auth/auth.js';

// Global variables
let currentUser = null;
let userTierLimits = null;
let whatsappNumbers = [];
let locationMappings = [];
let userLocations = [];
let currentWhatsAppNumberId = null;

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
    startMigration: `${API_BASE_URL}/startMigration`
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
                document.getElementById('analyticsSection').style.display = 'block';
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
    const tierName = getTierDisplayName(usage.tierLimits);
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
    locationsProgress.style.width = usage.locationsWithWhatsApp > 0 ? '100%' : '0%';
    locationsProgress.className = 'progress-bar bg-info';
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
    const numbersSection = document.getElementById('whatsappNumbers');
    
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
                                    <li><hr class="dropdown-divider"></li>
                                    <li>
                                        <a class="dropdown-item text-danger" href="#" onclick="removeWhatsAppNumber('${number.id}')">
                                            <i class="fas fa-trash"></i> Remove
                                        </a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    numbersSection.style.display = 'block';
}

/**
 * Render location mappings
 */
function renderLocationMappings() {
    const container = document.getElementById('mappingsContainer');
    const mappingsSection = document.getElementById('locationMappings');
    
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
    
    mappingsSection.style.display = 'block';
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
    document.getElementById('whatsappNumbers').style.display = 'block';
    document.getElementById('tierInfo').style.display = 'none';
    document.getElementById('locationMappings').style.display = 'none';
    document.getElementById('analyticsSection').style.display = 'none';
}

/**
 * Show upgrade prompt
 */
function showUpgradePrompt(recommendedTier = 'starter') {
    document.getElementById('upgradePrompt').style.display = 'block';
    document.getElementById('whatsappNumbers').style.display = 'none';
    document.getElementById('locationMappings').style.display = 'none';
    document.getElementById('analyticsSection').style.display = 'none';
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