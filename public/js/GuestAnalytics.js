// Access lodash from window object
const _ = window._;

// Memoize expensive calculations
const memoizedSortDates = _.memoize(dates => _.sortBy(dates));
const memoizedMean = _.memoize(arr => _.mean(arr));

// Create the GuestAnalytics React component
class GuestAnalytics extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            analytics: null
        };

        // Bind methods
        this.loadGuestAnalytics = this.loadGuestAnalytics.bind(this);
        this.processAnalytics = this.processAnalytics.bind(this);
        this.calculateVisitFrequency = this.calculateVisitFrequency.bind(this);
        this.calculateItemFrequency = this.calculateItemFrequency.bind(this);
    }

    static defaultProps = {
        phoneNumber: null
    };

    componentDidMount() {
        if (this.props.phoneNumber) {
            this.loadGuestAnalytics(this.props.phoneNumber).catch(error => {
                console.error('Error loading guest analytics:', error);
                this.setState({ error: 'Failed to load analytics', loading: false });
            });
        } else {
            this.setState({ error: 'No phone number provided', loading: false });
        }
    }

    async loadGuestAnalytics(phoneNumber) {
        try {
            const [guestSnapshot, receiptSnapshot] = await Promise.all([
                firebase.database().ref(`guests/${phoneNumber}`).once('value'),
                firebase.database().ref('guest-receipts').child(phoneNumber).once('value')
            ]);

            const guest = guestSnapshot.val();
            const receipts = receiptSnapshot.val() || {};

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
        const visitDates = receiptsList.map(r => new Date(r.processedAt).getTime());

        return {
            totalSpent: _.sumBy(receiptsList, 'totalAmount'),
            visitCount: receiptsList.length,
            averageSpend: receiptsList.length > 0 ? _.sumBy(receiptsList, 'totalAmount') / receiptsList.length : 0,
            visitFrequency: this.calculateVisitFrequency(visitDates),
            popularItems: this.calculateItemFrequency(receiptsList),
            lastVisit: _.max(visitDates) || null
        };
    }

    calculateVisitFrequency(dates) {
        if (dates.length < 2) return 'Insufficient data';
        
        const sortedDates = memoizedSortDates(dates);
        const differences = [];
        
        for (let i = 1; i < sortedDates.length; i++) {
            differences.push((sortedDates[i] - sortedDates[i-1]) / (1000 * 60 * 60 * 24));
        }
        
        return `${memoizedMean(differences).toFixed(1)} days`;
    }

    calculateItemFrequency(receipts) {
        const items = receipts.reduce((acc, receipt) => {
            (receipt.items || []).forEach(item => {
                acc[item.name] = (acc[item.name] || 0) + 1;
            });
            return acc;
        }, {});
        
        return _(items)
            .map((count, name) => ({ name, count }))
            .orderBy('count', 'desc')
            .take(5)
            .value();
    }

    // Separate render methods for better organization
    renderLoading() {
        return React.createElement('div', { className: 'text-center p-4' }, 'Loading analytics...');
    }

    renderError() {
        return React.createElement('div', { className: 'alert alert-danger' }, this.state.error);
    }

    renderAnalytics() {
        const { analytics } = this.state;
        
        const visitStats = React.createElement('div', { className: 'card-body' }, [
            this.renderStatItem('Total Visits', analytics.visitCount),
            this.renderStatItem('Average Visit Frequency', analytics.visitFrequency),
            this.renderStatItem('Last Visit', analytics.lastVisit ? new Date(analytics.lastVisit).toLocaleDateString() : 'Never')
        ]);

        const spendingStats = React.createElement('div', { className: 'card-body' }, [
            this.renderStatItem('Total Spent', `R${analytics.totalSpent.toFixed(2)}`),
            this.renderStatItem('Average Spend per Visit', `R${analytics.averageSpend.toFixed(2)}`)
        ]);

        return React.createElement('div', { className: 'guest-analytics row' }, [
            this.renderCard('Visit Statistics', visitStats, 'visits'),
            this.renderCard('Spending Analysis', spendingStats, 'spending')
        ]);
    }

    renderStatItem(label, value) {
        return React.createElement('p', { key: label }, [
            React.createElement('strong', null, `${label}: `),
            value.toString()
        ]);
    }

    renderCard(title, content, key) {
        return React.createElement('div', { className: 'col-md-6 mb-4', key }, 
            React.createElement('div', { className: 'card' }, [
                React.createElement('div', { className: 'card-header' },
                    React.createElement('h6', { className: 'mb-0' }, title)
                ),
                content
            ])
        );
    }

    render() {
        const { loading, error, analytics } = this.state;

        if (loading) return this.renderLoading();
        if (error) return this.renderError();
        if (!analytics) return React.createElement('div', { className: 'alert alert-warning' }, 'No data available');

        return this.renderAnalytics();
    }
}

// Just keep the window assignment
window.GuestAnalytics = GuestAnalytics;