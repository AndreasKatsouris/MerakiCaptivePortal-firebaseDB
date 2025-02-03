// Access lodash from window object
const _ = window._;

// Create the GuestAnalytics React component
window.GuestAnalytics = class GuestAnalytics extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            analytics: null
        };
    }

    async componentDidMount() {
        try {
            const { phoneNumber } = this.props;
            await this.loadGuestAnalytics(phoneNumber);
        } catch (error) {
            console.error('Error loading guest analytics:', error);
            this.setState({ error: 'Failed to load analytics', loading: false });
        }
    }

    async loadGuestAnalytics(phoneNumber) {
        try {
            // Fetch guest data from Firebase
            const guestSnapshot = await firebase.database()
                .ref(`guests/${phoneNumber}`)
                .once('value');
            
            const receiptSnapshot = await firebase.database()
                .ref('guest-receipts')
                .child(phoneNumber)
                .once('value');

            const guest = guestSnapshot.val();
            const receipts = receiptSnapshot.val() || {};

            // Process analytics data
            const analytics = this.processAnalytics(guest, receipts);
            this.setState({ analytics, loading: false });
        } catch (error) {
            console.error('Error in loadGuestAnalytics:', error);
            this.setState({ error: 'Failed to load guest data', loading: false });
        }
    }

    processAnalytics(guest, receipts) {
        if (!guest) return null;

        const receiptsList = Object.values(receipts);
        const totalSpent = _.sumBy(receiptsList, 'totalAmount');
        const visitCount = receiptsList.length;
        const averageSpend = visitCount > 0 ? totalSpent / visitCount : 0;

        // Get visit frequency
        const visitDates = receiptsList.map(r => new Date(r.processedAt).getTime());
        const visitFrequency = this.calculateVisitFrequency(visitDates);

        // Get popular items
        const itemFrequency = this.calculateItemFrequency(receiptsList);

        return {
            totalSpent,
            visitCount,
            averageSpend,
            visitFrequency,
            popularItems: itemFrequency,
            lastVisit: _.max(visitDates) || null
        };
    }

    calculateVisitFrequency(dates) {
        if (dates.length < 2) return 'Insufficient data';
        
        const sortedDates = _.sortBy(dates);
        const differences = [];
        
        for (let i = 1; i < sortedDates.length; i++) {
            const diff = sortedDates[i] - sortedDates[i-1];
            differences.push(diff / (1000 * 60 * 60 * 24)); // Convert to days
        }
        
        return _.mean(differences).toFixed(1) + ' days';
    }

    calculateItemFrequency(receipts) {
        const items = {};
        receipts.forEach(receipt => {
            (receipt.items || []).forEach(item => {
                items[item.name] = (items[item.name] || 0) + 1;
            });
        });
        
        return _(items)
            .map((count, name) => ({ name, count }))
            .orderBy('count', 'desc')
            .take(5)
            .value();
    }

    render() {
        const { loading, error, analytics } = this.state;

        if (loading) {
            return <div className="text-center p-4">Loading analytics...</div>;
        }

        if (error) {
            return <div className="alert alert-danger">{error}</div>;
        }

        if (!analytics) {
            return <div className="alert alert-warning">No data available</div>;
        }

        return (
            <div className="guest-analytics">
                <div className="row">
                    <div className="col-md-6 mb-4">
                        <div className="card">
                            <div className="card-header">
                                <h6 className="mb-0">Visit Statistics</h6>
                            </div>
                            <div className="card-body">
                                <p><strong>Total Visits:</strong> {analytics.visitCount}</p>
                                <p><strong>Average Visit Frequency:</strong> {analytics.visitFrequency}</p>
                                <p><strong>Last Visit:</strong> {analytics.lastVisit ? new Date(analytics.lastVisit).toLocaleDateString() : 'Never'}</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6 mb-4">
                        <div className="card">
                            <div className="card-header">
                                <h6 className="mb-0">Spending Analysis</h6>
                            </div>
                            <div className="card-body">
                                <p><strong>Total Spent:</strong> R{analytics.totalSpent.toFixed(2)}</p>
                                <p><strong>Average Spend per Visit:</strong> R{analytics.averageSpend.toFixed(2)}</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="card mb-4">
                    <div className="card-header">
                        <h6 className="mb-0">Most Purchased Items</h6>
                    </div>
                    <div className="card-body">
                        <ul className="list-unstyled mb-0">
                            {analytics.popularItems.map((item, index) => (
                                <li key={index} className="mb-2">
                                    {item.name} - {item.count} times
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        );
    }
};