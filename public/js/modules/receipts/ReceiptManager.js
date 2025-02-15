// js/modules/receipts/ReceiptManager.js

import { _ } from 'lodash';

class ReceiptManager {
    constructor() {
        this.state = {
            receipts: {},
            loading: false,
            filters: {
                status: '',
                guestPhone: '',
                invoiceNumber: '',
                dateRange: null
            },
            currentReceipt: null
        };

        this.elements = {
            receiptTable: null,
            searchInputs: {},
            loadingIndicator: null,
            errorAlert: null,
            noResultsMessage: null
        };

        // Modal reference
        this.detailsModal = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Cache DOM elements
            this.cacheElements();
            
            // Initialize Bootstrap modal
            this.initializeModal();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Load initial data
            await this.loadReceipts();

            this.initialized = true;
            console.log('Receipt Manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Receipt Manager:', error);
            this.showError('Initialization failed');
        }
    }

    cacheElements() {
        this.elements = {
            receiptTable: document.getElementById('receiptsTable'),
            searchInputs: {
                guestPhone: document.getElementById('receiptSearchGuest'),
                invoiceNumber: document.getElementById('receiptSearchInvoice'),
                status: document.getElementById('receiptStatusFilter')
            },
            loadingIndicator: document.getElementById('receiptLoadingIndicator'),
            errorAlert: document.getElementById('receiptErrorAlert'),
            errorMessage: document.getElementById('receiptErrorMessage'),
            noResultsMessage: document.getElementById('noReceiptsMessage'),
            searchButton: document.getElementById('receiptSearchBtn'),
            refreshButton: document.getElementById('refreshReceipts')
        };
    }

    initializeModal() {
        this.detailsModal = new bootstrap.Modal(
            document.getElementById('receiptDetailsModal')
        );
    }

    setupEventListeners() {
        // Search button click
        if (this.elements.searchButton) {
            this.elements.searchButton.addEventListener('click', () => {
                this.handleSearch();
            });
        }

        // Refresh button click
        if (this.elements.refreshButton) {
            this.elements.refreshButton.addEventListener('click', () => {
                this.loadReceipts();
            });
        }

        // Search input enter key
        Object.values(this.elements.searchInputs).forEach(input => {
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.handleSearch();
                    }
                });
            }
        });
    }

    async loadReceipts() {
        this.showLoading(true);
        try {
            const snapshot = await firebase.database()
                .ref('receipts')
                .once('value');

            this.state.receipts = snapshot.val() || {};
            await this.renderReceipts();
        } catch (error) {
            console.error('Error loading receipts:', error);
            this.showError('Failed to load receipts');
        } finally {
            this.showLoading(false);
        }
    }

    async handleSearch() {
        // Update filters from inputs
        Object.entries(this.elements.searchInputs).forEach(([key, element]) => {
            if (element) {
                this.state.filters[key] = element.value;
            }
        });

        await this.renderReceipts();
    }

    async renderReceipts() {
        const filteredReceipts = this.filterReceipts();
        const tbody = this.elements.receiptTable?.querySelector('tbody');
        
        if (!tbody) return;

        if (filteredReceipts.length === 0) {
            this.showNoResults(true);
            tbody.innerHTML = '';
            return;
        }

        this.showNoResults(false);
        tbody.innerHTML = filteredReceipts.map(receipt => this.generateReceiptRow(receipt)).join('');
    }

    filterReceipts() {
        return Object.entries(this.state.receipts)
            .filter(([_, receipt]) => this.matchesFilters(receipt))
            .map(([id, receipt]) => ({
                id,
                ...receipt
            }))
            .sort((a, b) => b.processedAt - a.processedAt);
    }

    matchesFilters(receipt) {
        const { status, guestPhone, invoiceNumber } = this.state.filters;

        if (status && receipt.status !== status) return false;
        
        if (guestPhone && !receipt.guestPhoneNumber?.includes(guestPhone)) return false;
        
        if (invoiceNumber && !receipt.invoiceNumber?.includes(invoiceNumber)) return false;

        return true;
    }

    generateReceiptRow(receipt) {
        return `
            <tr>
                <td>${this.formatDate(receipt.processedAt)}</td>
                <td>${receipt.guestPhoneNumber || 'Unknown'}</td>
                <td>${receipt.invoiceNumber || 'N/A'}</td>
                <td>${receipt.storeName || 'Unknown Store'}</td>
                <td>R${(receipt.totalAmount || 0).toFixed(2)}</td>
                <td>
                    <span class="badge bg-${this.getStatusBadgeClass(receipt.status)}">
                        ${receipt.status || 'pending'}
                    </span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button 
                            class="btn btn-info" 
                            onclick="receiptManager.viewReceipt('${receipt.id}')"
                            title="View Details"
                        >
                            <i class="fas fa-eye"></i>
                        </button>
                        <button 
                            class="btn btn-primary" 
                            onclick="receiptManager.validateReceipt('${receipt.id}')"
                            title="Validate"
                            ${receipt.status === 'validated' ? 'disabled' : ''}
                        >
                            <i class="fas fa-check"></i>
                        </button>
                        <button 
                            class="btn btn-danger" 
                            onclick="receiptManager.rejectReceipt('${receipt.id}')"
                            title="Reject"
                            ${receipt.status === 'rejected' ? 'disabled' : ''}
                        >
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    async viewReceipt(receiptId) {
        try {
            const receipt = this.state.receipts[receiptId];
            if (!receipt) {
                throw new Error('Receipt not found');
            }

            this.populateReceiptModal(receipt);
            this.detailsModal.show();
        } catch (error) {
            console.error('Error viewing receipt:', error);
            this.showError('Failed to load receipt details');
        }
    }

    populateReceiptModal(receipt) {
        // Populate store information
        document.getElementById('modalBrandName').textContent = receipt.brandName || 'N/A';
        document.getElementById('modalStoreName').textContent = receipt.storeName || 'N/A';
        document.getElementById('modalStoreAddress').textContent = receipt.storeAddress || 'N/A';

        // Populate receipt details
        document.getElementById('modalInvoiceNumber').textContent = receipt.invoiceNumber || 'N/A';
        document.getElementById('modalDate').textContent = this.formatDate(receipt.processedAt);
        document.getElementById('modalTime').textContent = this.formatTime(receipt.processedAt);
        document.getElementById('modalStatus').textContent = receipt.status || 'pending';

        // Populate guest information
        document.getElementById('modalGuestPhone').textContent = receipt.guestPhoneNumber || 'N/A';
        document.getElementById('modalGuestName').textContent = receipt.guestName || 'Unknown';

        // Populate items table
        const itemsTable = document.getElementById('modalItemsTable');
        if (itemsTable && receipt.items) {
            itemsTable.innerHTML = receipt.items.map(item => `
                <tr>
                    <td>${item.name}</td>
                    <td class="text-center">${item.quantity}</td>
                    <td class="text-right">R${item.unitPrice.toFixed(2)}</td>
                    <td class="text-right">R${(item.quantity * item.unitPrice).toFixed(2)}</td>
                </tr>
            `).join('');
        }

        // Set total
        document.getElementById('modalTotal').textContent = `R${receipt.totalAmount.toFixed(2)}`;

        // Show receipt image if available
        const imageElement = document.getElementById('modalReceiptImage');
        if (imageElement) {
            imageElement.src = receipt.imageUrl || '/images/placeholder-receipt.png';
        }
    }

    async validateReceipt(receiptId) {
        try {
            await firebase.database()
                .ref(`receipts/${receiptId}`)
                .update({
                    status: 'validated',
                    validatedAt: Date.now(),
                    validatedBy: firebase.auth().currentUser.email
                });

            await this.loadReceipts();
            this.showSuccess('Receipt validated successfully');
        } catch (error) {
            console.error('Error validating receipt:', error);
            this.showError('Failed to validate receipt');
        }
    }

    async rejectReceipt(receiptId) {
        const reason = await this.promptRejectionReason();
        if (!reason) return;

        try {
            await firebase.database()
                .ref(`receipts/${receiptId}`)
                .update({
                    status: 'rejected',
                    rejectedAt: Date.now(),
                    rejectedBy: firebase.auth().currentUser.email,
                    rejectionReason: reason
                });

            await this.loadReceipts();
            this.showSuccess('Receipt rejected successfully');
        } catch (error) {
            console.error('Error rejecting receipt:', error);
            this.showError('Failed to reject receipt');
        }
    }

    async promptRejectionReason() {
        const { value: reason } = await Swal.fire({
            title: 'Rejection Reason',
            input: 'textarea',
            inputLabel: 'Please provide a reason for rejection',
            inputPlaceholder: 'Enter rejection reason...',
            showCancelButton: true,
            inputValidator: (value) => {
                if (!value) {
                    return 'You need to provide a reason for rejection!';
                }
            }
        });

        return reason;
    }

    // Utility methods
    formatDate(timestamp) {
        return new Date(timestamp).toLocaleDateString();
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString();
    }

    getStatusBadgeClass(status) {
        const statusClasses = {
            pending: 'warning',
            validated: 'success',
            rejected: 'danger'
        };
        return statusClasses[status] || 'secondary';
    }

    showLoading(show) {
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.style.display = show ? 'block' : 'none';
        }
    }

    showError(message) {
        if (this.elements.errorAlert && this.elements.errorMessage) {
            this.elements.errorMessage.textContent = message;
            this.elements.errorAlert.style.display = 'block';
            setTimeout(() => {
                this.elements.errorAlert.style.display = 'none';
            }, 5000);
        }
    }

    showSuccess(message) {
        Swal.fire({
            icon: 'success',
            title: 'Success',
            text: message,
            timer: 2000,
            showConfirmButton: false
        });
    }

    showNoResults(show) {
        if (this.elements.noResultsMessage) {
            this.elements.noResultsMessage.style.display = show ? 'block' : 'none';
        }
    }

    destroy() {
        // Remove event listeners
        if (this.elements.searchButton) {
            this.elements.searchButton.removeEventListener('click');
        }

        if (this.elements.refreshButton) {
            this.elements.refreshButton.removeEventListener('click');
        }

        Object.values(this.elements.searchInputs).forEach(input => {
            if (input) {
                input.removeEventListener('keypress');
            }
        });

        // Destroy modal
        if (this.detailsModal) {
            this.detailsModal.dispose();
        }

        // Clear state
        this.state = null;
        this.elements = null;
        this.initialized = false;
    }
}

// Create and export singleton instance
const receiptManager = new ReceiptManager();
export default receiptManager;

// Make it available globally for onclick handlers
window.receiptManager = receiptManager;