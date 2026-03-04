// js/modules/wifi/WifiManager.js

class WifiManager {
    constructor() {
        this.state = {
            devices: [],
            reports: [],
            settings: null,
            loading: false,
            currentView: null,
            filters: {
                deviceType: null,
                location: null,
                dateRange: null
            }
        };

        // Store DOM element references
        this.elements = {
            settingsForm: null,
            devicesTable: null,
            reportsTable: null,
            filterInputs: null
        };

        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Cache DOM elements
            this.cacheElements();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Load initial data
            await this.loadInitialData();
            
            this.initialized = true;
            console.log('WiFi Manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize WiFi Manager:', error);
            throw error;
        }
    }

    cacheElements() {
        this.elements = {
            settingsForm: document.getElementById('wifiSettingsForm'),
            devicesTable: document.getElementById('devicesTable'),
            reportsTable: document.getElementById('wifiReportsTable'),
            filterInputs: {
                deviceType: document.getElementById('deviceTypeFilter'),
                location: document.getElementById('locationFilter'),
                dateRange: document.getElementById('dateRangeFilter')
            }
        };
    }

    setupEventListeners() {
        // Settings form submission
        if (this.elements.settingsForm) {
            this.elements.settingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleSettingsSubmit(new FormData(e.target));
            });
        }

        // Filter changes
        Object.entries(this.elements.filterInputs).forEach(([key, element]) => {
            if (element) {
                element.addEventListener('change', () => this.handleFilterChange(key));
            }
        });
    }

    async loadInitialData() {
        this.state.loading = true;
        try {
            const [devices, settings] = await Promise.all([
                this.fetchDevices(),
                this.fetchSettings()
            ]);

            this.state.devices = devices;
            this.state.settings = settings;

            this.renderCurrentView();
        } catch (error) {
            console.error('Error loading initial data:', error);
            throw error;
        } finally {
            this.state.loading = false;
        }
    }

    async fetchDevices() {
        const snapshot = await firebase.database().ref('wifiDevices').once('value');
        return snapshot.val() || [];
    }

    async fetchSettings() {
        const snapshot = await firebase.database().ref('wifiSettings').once('value');
        return snapshot.val() || this.getDefaultSettings();
    }

    async handleSettingsSubmit(formData) {
        try {
            const settings = this.processSettingsForm(formData);
            await this.saveSettings(settings);
            this.showSuccess('Settings saved successfully');
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showError('Failed to save settings');
        }
    }

    processSettingsForm(formData) {
        return {
            bgColor: formData.get('bgColor'),
            fontSize: formData.get('fontSize'),
            font: formData.get('font'),
            // Add other settings as needed
        };
    }

    async saveSettings(settings) {
        await firebase.database().ref('wifiSettings').set(settings);
        this.state.settings = settings;
    }

    async handleFilterChange(filterKey) {
        this.state.filters[filterKey] = this.elements.filterInputs[filterKey].value;
        await this.updateView();
    }

    async updateView() {
        const filteredDevices = this.filterDevices();
        this.renderDevicesTable(filteredDevices);
    }

    filterDevices() {
        return this.state.devices.filter(device => {
            const { deviceType, location } = this.state.filters;
            
            if (deviceType && device.type !== deviceType) return false;
            if (location && device.location !== location) return false;
            
            return true;
        });
    }

    renderDevicesTable(devices) {
        if (!this.elements.devicesTable) return;

        const tbody = this.elements.devicesTable.querySelector('tbody');
        if (!tbody) return;

        tbody.innerHTML = devices.map(device => `
            <tr>
                <td>${device.macAddress}</td>
                <td>${device.location}</td>
                <td>${device.type}</td>
                <td>${device.status}</td>
                <td>
                    <button onclick="wifiManager.editDevice('${device.id}')" 
                            class="btn btn-sm btn-primary">
                        Edit
                    </button>
                    <button onclick="wifiManager.deleteDevice('${device.id}')" 
                            class="btn btn-sm btn-danger">
                        Delete
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async editDevice(deviceId) {
        // Implementation for editing device
    }

    async deleteDevice(deviceId) {
        // Implementation for deleting device
    }

    showSuccess(message) {
        // Implementation for success message
    }

    showError(message) {
        // Implementation for error message
    }

    getDefaultSettings() {
        return {
            bgColor: '#ffffff',
            fontSize: '14px',
            font: 'Arial',
            // Add other default settings
        };
    }

    destroy() {
        // Remove event listeners
        if (this.elements.settingsForm) {
            this.elements.settingsForm.removeEventListener('submit');
        }

        Object.values(this.elements.filterInputs).forEach(element => {
            if (element) {
                element.removeEventListener('change');
            }
        });

        // Clear state
        this.state = null;
        this.elements = null;
        this.initialized = false;
    }
}

// Create and export singleton instance
const wifiManager = new WifiManager();
export default wifiManager;