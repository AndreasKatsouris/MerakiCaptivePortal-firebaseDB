const dashboardState = {
    dateRange: 'month',
    charts: {
        campaignPerformance: null,
        receiptStatus: null
    }
};

async function updateDashboardStats() {
    try {
        const [campaignsSnapshot, receiptsSnapshot, usersSnapshot] = await Promise.all([
            firebase.database().ref('campaigns').once('value'),
            firebase.database().ref('receipts').once('value'),
            firebase.database().ref('guests').once('value')
        ]);

        const campaigns = campaignsSnapshot.val() || {};
        const receipts = receiptsSnapshot.val() || {};
        const users = usersSnapshot.val() || {};

        updateStatCounters(campaigns, receipts, users);
        updateDashboardCharts(campaigns, receipts);
        updateRecentReceipts(receipts);
    } catch (error) {
        console.error('Error updating dashboard:', error);
    }
}

function updateStatCounters(campaigns, receipts, users) {
    const activeCampaigns = Object.values(campaigns).filter(c => c.status === 'active').length;
    const totalReceipts = Object.keys(receipts).length;
    const activeUsers = Object.keys(users).length;
    const conversionRate = totalReceipts && activeUsers ? ((totalReceipts / activeUsers) * 100).toFixed(1) : 0;

    document.getElementById('activeCampaignsCount').textContent = activeCampaigns;
    document.getElementById('totalReceiptsCount').textContent = totalReceipts;
    document.getElementById('activeUsersCount').textContent = activeUsers;
    document.getElementById('conversionRate').textContent = `${conversionRate}%`;
}

function updateDashboardCharts(campaigns, receipts) {
    updateCampaignPerformanceChart(campaigns, receipts);
    updateReceiptStatusChart(receipts);
}

function updateCampaignPerformanceChart(campaigns, receipts) {
    const ctx = document.getElementById('campaignPerformanceChart');
    if (!ctx) return;

    if (dashboardState.charts.campaignPerformance) {
        dashboardState.charts.campaignPerformance.destroy();
    }

    const campaignData = Object.entries(campaigns).map(([id, campaign]) => ({
        name: campaign.name,
        count: Object.values(receipts).filter(r => r.campaignId === id).length
    }));

    dashboardState.charts.campaignPerformance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: campaignData.map(c => c.name),
            datasets: [{
                label: 'Receipts',
                data: campaignData.map(c => c.count),
                backgroundColor: 'rgba(54, 162, 235, 0.5)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

function updateReceiptStatusChart(receipts) {
    const ctx = document.getElementById('receiptStatusChart');
    if (!ctx) return;

    if (dashboardState.charts.receiptStatus) {
        dashboardState.charts.receiptStatus.destroy();
    }

    const statusCounts = Object.values(receipts).reduce((acc, receipt) => {
        const status = receipt.status || 'pending';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { pending_validation: 0, validated: 0, rejected: 0 });

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

function updateRecentReceipts(receipts) {
    const tableBody = document.querySelector('#recentReceiptsTable tbody');
    if (!tableBody) return;

    const recentReceipts = Object.entries(receipts)
        .sort(([, a], [, b]) => b.processedAt - a.processedAt)
        .slice(0, 5);

    tableBody.innerHTML = recentReceipts.map(([id, receipt]) => `
        <tr>
            <td>${formatDate(receipt.processedAt)}</td>
            <td>${receipt.guestPhoneNumber || 'Unknown'}</td>
            <td>R${(receipt.totalAmount || 0).toFixed(2)}</td>
            <td><span class="badge badge-${getStatusBadgeClass(receipt.status)}">${receipt.status || 'pending'}</span></td>
        </tr>
    `).join('');
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString();
}

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

function initializeDashboardListeners() {
    const dateRangeSelect = document.getElementById('dashboardDateRange');
    if (dateRangeSelect) {
        dateRangeSelect.addEventListener('change', e => {
            dashboardState.dateRange = e.target.value;
            updateDashboardStats();
        });
    }
}

// Change from export to window global
window.updateDashboardStats = async function() {
    // existing function code
};

window.initializeDashboardListeners = function() {
    // existing function code
};