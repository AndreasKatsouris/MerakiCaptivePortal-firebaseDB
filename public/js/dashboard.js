// dashboard.js

// Dashboard State Management
const dashboardState = {
    dateRange: 'month',
    charts: {
        campaignPerformance: null,
        receiptStatus: null
    }
};

// Dashboard Stats Functions
async function updateDashboardStats() {
    try {
        // Get stats from Firebase
        const [campaignsSnapshot, receiptsSnapshot, usersSnapshot] = await Promise.all([
            firebase.database().ref('campaigns').once('value'),
            firebase.database().ref('receipts').once('value'),
            firebase.database().ref('guests').once('value')
        ]);

        // Calculate active campaigns
        const campaigns = campaignsSnapshot.val() || {};
        const activeCampaigns = Object.values(campaigns).filter(c => c.status === 'active').length;
        document.getElementById('activeCampaignsCount').textContent = activeCampaigns;

        // Calculate total receipts
        const receipts = receiptsSnapshot.val() || {};
        const totalReceipts = Object.keys(receipts).length;
        document.getElementById('totalReceiptsCount').textContent = totalReceipts;

        // Calculate active users
        const users = usersSnapshot.val() || {};
        const activeUsers = Object.keys(users).length;
        document.getElementById('activeUsersCount').textContent = activeUsers;

        // Calculate conversion rate
        const conversionRate = totalReceipts > 0 && activeUsers > 0 
            ? ((totalReceipts / activeUsers) * 100).toFixed(1)
            : 0;
        document.getElementById('conversionRate').textContent = `${conversionRate}%`;

        // Update charts
        updateDashboardCharts(campaigns, receipts, users);

    } catch (error) {
        console.error('Error updating dashboard stats:', error);
    }
}

// Chart Functions
function updateDashboardCharts(campaigns, receipts, users) {
    updateCampaignPerformanceChart(campaigns, receipts);
    updateReceiptStatusChart(receipts);
}

function updateCampaignPerformanceChart(campaigns, receipts) {
    const ctx = document.getElementById('campaignPerformanceChart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (dashboardState.charts.campaignPerformance) {
        dashboardState.charts.campaignPerformance.destroy();
    }

    dashboardState.charts.campaignPerformance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.values(campaigns).map(c => c.name),
            datasets: [{
                label: 'Receipts',
                data: Object.values(campaigns).map(c => {
                    return Object.values(receipts)
                        .filter(r => r.campaignId === c.id).length;
                }),
                backgroundColor: 'rgba(54, 162, 235, 0.5)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function updateReceiptStatusChart(receipts) {
    const ctx = document.getElementById('receiptStatusChart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (dashboardState.charts.receiptStatus) {
        dashboardState.charts.receiptStatus.destroy();
    }

    const statusCounts = {
        pending_validation: 0,
        validated: 0,
        rejected: 0
    };

    Object.values(receipts).forEach(receipt => {
        if (statusCounts.hasOwnProperty(receipt.status)) {
            statusCounts[receipt.status]++;
        }
    });

    dashboardState.charts.receiptStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Validated', 'Rejected'],
            datasets: [{
                data: Object.values(statusCounts),
                backgroundColor: [
                    'rgba(255, 206, 86, 0.5)',
                    'rgba(75, 192, 192, 0.5)',
                    'rgba(255, 99, 132, 0.5)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Recent Activity Functions
function updateRecentReceipts(receipts) {
    const tableBody = document.querySelector('#recentReceiptsTable tbody');
    if (!tableBody) return;

    const recentReceipts = Object.entries(receipts)
        .sort(([, a], [, b]) => b.processedAt - a.processedAt)
        .slice(0, 5);

    tableBody.innerHTML = recentReceipts.map(([id, receipt]) => `
        <tr>
            <td>${new Date(receipt.processedAt).toLocaleDateString()}</td>
            <td>${receipt.guestPhoneNumber || 'Unknown'}</td>
            <td>R${receipt.totalAmount?.toFixed(2) || '0.00'}</td>
            <td>
                <span class="badge badge-${getStatusBadgeClass(receipt.status)}">
                    ${receipt.status}
                </span>
            </td>
        </tr>
    `).join('');
}

// Dashboard Event Listeners
function initializeDashboardListeners() {
    const dateRangeSelect = document.getElementById('dashboardDateRange');
    if (dateRangeSelect) {
        dateRangeSelect.addEventListener('change', (e) => {
            dashboardState.dateRange = e.target.value;
            updateDashboardStats();
        });
    }
}

// Export functions for use in admin-dashboard.js
export {
    updateDashboardStats,
    initializeDashboardListeners
};