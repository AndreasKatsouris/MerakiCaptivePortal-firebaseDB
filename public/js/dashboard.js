// Create a new file: dashboard.js

class DashboardManager {
    constructor() {
        this.charts = {};
        this.dateRange = 'month';
        this.initializeListeners();
    }

    initializeListeners() {
        // Date range selector
        document.getElementById('dashboardDateRange').addEventListener('change', (e) => {
            this.dateRange = e.target.value;
            this.refreshDashboard();
        });

        // Add dashboard menu listener
        document.getElementById('dashboardMenu').addEventListener('click', (e) => {
            e.preventDefault();
            displaySection('dashboardContent');
            this.refreshDashboard();
        });
    }

    async refreshDashboard() {
        showLoading();
        try {
            await Promise.all([
                this.updateStats(),
                this.updateCharts(),
                this.updateRecentReceipts(),
                this.updateCampaignActivity()
            ]);
        } catch (error) {
            console.error('Error refreshing dashboard:', error);
            alert('Error updating dashboard');
        } finally {
            hideLoading();
        }
    }

    async updateStats() {
        const startDate = this.getDateRangeStart();
        
        // Fetch data from Firebase
        const stats = await this.fetchStats(startDate);
        
        // Update DOM
        document.getElementById('activeCampaignsCount').textContent = stats.activeCampaigns;
        document.getElementById('totalReceiptsCount').textContent = stats.totalReceipts;
        document.getElementById('activeUsersCount').textContent = stats.activeUsers;
        document.getElementById('conversionRate').textContent = `${stats.conversionRate}%`;
    }

    async fetchStats(startDate) {
        const campaignsSnapshot = await firebase.database()
            .ref('campaigns')
            .orderByChild('status')
            .equalTo('active')
            .once('value');

        const receiptsSnapshot = await firebase.database()
            .ref('receipts')
            .orderByChild('timestamp')
            .startAt(startDate.valueOf())
            .once('value');

        const usersSnapshot = await firebase.database()
            .ref('guests')
            .once('value');

        const campaigns = campaignsSnapshot.val() || {};
        const receipts = receiptsSnapshot.val() || {};
        const users = usersSnapshot.val() || {};

        const totalReceipts = Object.keys(receipts).length;
        const totalUsers = Object.keys(users).length;

        return {
            activeCampaigns: Object.keys(campaigns).length,
            totalReceipts,
            activeUsers: totalUsers,
            conversionRate: totalUsers > 0 ? 
                Math.round((totalReceipts / totalUsers) * 100) : 0
        };
    }

    async updateCharts() {
        await this.updateCampaignPerformanceChart();
        await this.updateReceiptStatusChart();
    }

    async updateCampaignPerformanceChart() {
        const data = await this.fetchCampaignPerformanceData();
        
        if (!this.charts.campaignPerformance) {
            const ctx = document.getElementById('campaignPerformanceChart').getContext('2d');
            this.charts.campaignPerformance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Receipts Submitted',
                        data: data.receipts,
                        borderColor: '#4a90e2',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        } else {
            this.charts.campaignPerformance.data.labels = data.labels;
            this.charts.campaignPerformance.data.datasets[0].data = data.receipts;
            this.charts.campaignPerformance.update();
        }
    }

    async updateReceiptStatusChart() {
        const data = await this.fetchReceiptStatusData();
        
        if (!this.charts.receiptStatus) {
            const ctx = document.getElementById('receiptStatusChart').getContext('2d');
            this.charts.receiptStatus = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Validated', 'Pending', 'Rejected'],
                    datasets: [{
                        data: [
                            data.validated || 0,
                            data.pending || 0,
                            data.rejected || 0
                        ],
                        backgroundColor: ['#28a745', '#ffc107', '#dc3545']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        } else {
            this.charts.receiptStatus.data.datasets[0].data = [
                data.validated || 0,
                data.pending || 0,
                data.rejected || 0
            ];
            this.charts.receiptStatus.update();
        }
    }

    async updateRecentReceipts() {
        const receipts = await this.fetchRecentReceipts();
        const tbody = document.querySelector('#recentReceiptsTable tbody');
        tbody.innerHTML = '';

        receipts.forEach(receipt => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${moment(receipt.timestamp).format('MMM D, HH:mm')}</td>
                <td>${receipt.customerName}</td>
                <td>R${receipt.amount.toFixed(2)}</td>
                <td><span class="badge badge-${this.getStatusBadgeClass(receipt.status)}">
                    ${receipt.status}
                </span></td>
            `;
            tbody.appendChild(row);
        });
    }

    async updateCampaignActivity() {
        const activities = await this.fetchCampaignActivity();
        const feed = document.getElementById('campaignActivityFeed');
        feed.innerHTML = '';

        activities.forEach(activity => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            item.innerHTML = `
                <div class="activity-icon ${this.getActivityIconClass(activity.type)}">
                    <i class="fas ${this.getActivityIcon(activity.type)}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-title">${activity.title}</div>
                    <div class="activity-time">${moment(activity.timestamp).fromNow()}</div>
                </div>
            `;
            feed.appendChild(item);
        });
    }

    // Helper methods
    getDateRangeStart() {
        const now = moment();
        switch (this.dateRange) {
            case 'today':
                return now.startOf('day');
            case 'week':
                return now.startOf('week');
            case 'month':
                return now.startOf('month');
            case 'year':
                return now.startOf('year');
            default:
                return now.startOf('month');
        }
    }

    getStatusBadgeClass(status) {
        switch (status.toLowerCase()) {
            case 'validated':
                return 'success';
            case 'pending':
                return 'warning';
            case 'rejected':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getActivityIcon(type) {
        switch (type) {
            case 'campaign_created':
                return 'fa-plus';
            case 'receipt_submitted':
                return 'fa-receipt';
            case 'receipt_validated':
                return 'fa-check';
            default:
                return 'fa-info';
        }
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardManager = new DashboardManager();
});