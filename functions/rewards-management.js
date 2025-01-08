console.log('Testing Firebase connection...');
const dbRef = firebase.database().ref();
dbRef.child('receipts').once('value')
  .then((snapshot) => {
    console.log('Successfully connected to Firebase. Data:', snapshot.val());
  })
  .catch((error) => {
    console.error('Firebase connection error:', error);
  });

// Event Listeners for Menu Items
document.querySelector('#receiptManagementMenu').addEventListener('click', function(e) {
    e.preventDefault();
    displaySection('receiptManagementContent');
    loadReceipts();
});

document.querySelector('#rewardsManagementMenu').addEventListener('click', function(e) {
    e.preventDefault();
    displaySection('rewardsManagementContent');
    loadRewards();
});

// Load and Display Receipts
async function loadReceipts(filters = {}) {
    console.log('Loading receipts with filters:', filters);
    const tableBody = document.querySelector('#receiptsTable tbody');
    
    if (!tableBody) {
        console.error('Receipt table body not found');
        return;
    }
    
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';

    try {
        let query = firebase.database().ref('receipts');
        
        // Apply filters
        if (filters.status) {
            query = query.orderByChild('status').equalTo(filters.status);
        }

        const snapshot = await query.once('value');
        const receipts = snapshot.val();
        
        if (receipts) {
            tableBody.innerHTML = '';
            
            Object.entries(receipts).forEach(([receiptId, receipt]) => {
                // Apply client-side filters
                if (filters.guest && !receipt.guestPhoneNumber?.includes(filters.guest)) return;
                if (filters.invoice && !receipt.invoiceNumber?.includes(filters.invoice)) return;

                const row = document.createElement('tr');
                const processedDate = receipt.processedAt ? new Date(receipt.processedAt).toLocaleDateString() : 'N/A';
                const amount = receipt.totalAmount ? `R${receipt.totalAmount.toFixed(2)}` : 'N/A';
                
                row.innerHTML = `
                    <td>${processedDate}</td>
                    <td>${receipt.guestPhoneNumber || 'N/A'}</td>
                    <td>${receipt.invoiceNumber || 'N/A'}</td>
                    <td>${receipt.storeName || 'N/A'}</td>
                    <td>${amount}</td>
                    <td>
                        <span class="badge badge-${getStatusBadgeClass(receipt.status)}">
                            ${receipt.status || 'unknown'}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-info view-receipt" data-receipt-id="${receiptId}">
                            View
                        </button>
                        ${receipt.status === 'pending_validation' ? `
                            <button class="btn btn-sm btn-success validate-receipt" data-receipt-id="${receiptId}">
                                Validate
                            </button>
                            <button class="btn btn-sm btn-danger reject-receipt" data-receipt-id="${receiptId}">
                                Reject
                            </button>
                        ` : ''}
                    </td>
                `;
                tableBody.appendChild(row);
            });

            // If no receipts were added to the table after filtering
            if (tableBody.children.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No receipts found</td></tr>';
            }
            
        } else {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No receipts found</td></tr>';
        }
        
        // Reattach event listeners
        attachReceiptActionListeners();
        
    } catch (error) {
        console.error('Error loading receipts:', error);
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading receipts</td></tr>';
    }
}

// Load and Display Rewards
async function loadRewards(filters = {}) {
    const tableBody = document.querySelector('#rewardsTable tbody');
    tableBody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';

    try {
        let query = firebase.database().ref('rewards');
        
        // Apply filters
        if (filters.status) {
            query = query.orderByChild('status').equalTo(filters.status);
        }

        const snapshot = await query.once('value');
        const rewards = snapshot.val();
        
        if (rewards) {
            tableBody.innerHTML = '';
            
            for (const [rewardId, reward] of Object.entries(rewards)) {
                // Apply client-side filters
                if (filters.guest && !reward.guestPhone.includes(filters.guest)) continue;
                if (filters.campaign && reward.campaignId !== filters.campaign) continue;

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${new Date(reward.createdAt).toLocaleDateString()}</td>
                    <td>${reward.guestName}<br><small>${reward.guestPhone}</small></td>
                    <td>${reward.campaignName}</td>
                    <td>${reward.receiptNumber}</td>
                    <td>R${reward.receiptAmount.toFixed(2)}</td>
                    <td>
                        <span class="badge badge-${getStatusBadgeClass(reward.status)}">
                            ${reward.status}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-info view-reward" data-reward-id="${rewardId}">
                            View
                        </button>
                        ${reward.status === 'pending' ? `
                            <button class="btn btn-sm btn-success approve-reward" data-reward-id="${rewardId}">
                                Approve
                            </button>
                            <button class="btn btn-sm btn-danger reject-reward" data-reward-id="${rewardId}">
                                Reject
                            </button>
                        ` : ''}
                    </td>
                `;
                tableBody.appendChild(row);
            }
            
            // Attach event listeners to action buttons
            attachRewardActionListeners();
        } else {
            tableBody.innerHTML = '<tr><td colspan="7">No rewards found</td></tr>';
        }
    } catch (error) {
        console.error('Error loading rewards:', error);
        tableBody.innerHTML = '<tr><td colspan="7">Error loading rewards</td></tr>';
    }
}

// Helper Functions
function getStatusBadgeClass(status) {
    const statusClasses = {
        pending: 'warning',
        pending_validation: 'warning',
        validated: 'success',
        approved: 'success',
        rejected: 'danger',
        completed: 'info'
    };
    return statusClasses[status] || 'secondary';
}

// Action Listeners
function attachReceiptActionListeners() {
    // View Receipt Details
    document.querySelectorAll('.view-receipt').forEach(button => {
        button.addEventListener('click', async function() {
            const receiptId = this.getAttribute('data-receipt-id');
            const receipt = await getReceiptDetails(receiptId);
            showReceiptModal(receipt);
        });
    });

    // Validate Receipt
    document.querySelectorAll('.validate-receipt').forEach(button => {
        button.addEventListener('click', async function() {
            const receiptId = this.getAttribute('data-receipt-id');
            if (confirm('Are you sure you want to validate this receipt?')) {
                await updateReceiptStatus(receiptId, 'validated');
                loadReceipts(); // Reload the table
            }
        });
    });

    // Reject Receipt
    document.querySelectorAll('.reject-receipt').forEach(button => {
        button.addEventListener('click', async function() {
            const receiptId = this.getAttribute('data-receipt-id');
            if (confirm('Are you sure you want to reject this receipt?')) {
                await updateReceiptStatus(receiptId, 'rejected');
                loadReceipts(); // Reload the table
            }
        });
    });
}

function attachRewardActionListeners() {
    // Similar structure for reward actions
    // Implement view, approve, and reject functionality for rewards
}

// Filter Event Listeners
document.getElementById('receiptSearchBtn').addEventListener('click', function() {
    const filters = {
        guest: document.getElementById('receiptSearchGuest').value,
        invoice: document.getElementById('receiptSearchInvoice').value,
        status: document.getElementById('receiptStatusFilter').value
    };
    loadReceipts(filters);
});

document.getElementById('rewardSearchBtn').addEventListener('click', function() {
    const filters = {
        guest: document.getElementById('rewardSearchGuest').value,
        campaign: document.getElementById('rewardCampaignFilter').value,
        status: document.getElementById('rewardStatusFilter').value
    };
    loadRewards(filters);
});