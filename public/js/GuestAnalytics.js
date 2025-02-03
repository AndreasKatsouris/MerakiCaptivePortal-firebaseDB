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
            console.log('Loaded guest data:', guestSnapshot.val()); // Debug log
            console.log('Loaded receipts:', receiptSnapshot.val()); // Debug log
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
        console.log('Processing receipts:', receiptsList); // Debug log

            // Add defensive total calculation
        const totalSpent = _.sumBy(receiptsList, receipt => {
        const amount = receipt?.totalAmount;
        return typeof amount === 'number' ? amount : 0;
        }) || 0;

        return {
            totalSpent,
            visitCount: receiptsList.length,
            averageSpend: receiptsList.length > 0 ? totalSpent / receiptsList.length : 0,
            visitFrequency: this.calculateVisitFrequency(receiptsList.map(r => r.processedAt || 0)),
            popularItems: this.calculateItemFrequency(receiptsList),
            lastVisit: _.max(receiptsList.map(r => r.processedAt)) || null
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
        
    // Add defensive rendering
    const visitStats = React.createElement('div', { className: 'card-body' }, [
        this.renderStatItem('Total Visits', analytics.visitCount || 0),
        this.renderStatItem('Average Visit Frequency', analytics.visitFrequency || 'N/A'),
        this.renderStatItem('Last Visit', 
            analytics.lastVisit ? new Date(analytics.lastVisit).toLocaleDateString() : 'Never')
    ]);

    const spendingStats = React.createElement('div', { className: 'card-body' }, [
        this.renderStatItem('Total Spent', 
            `R${(analytics.totalSpent || 0).toFixed(2)}`),
        this.renderStatItem('Average Spend per Visit', 
            `R${(analytics.averageSpend || 0).toFixed(2)}`)
    ]);

    return React.createElement('div', { className: 'guest-analytics row' }, [
        this.renderCard('Visit Statistics', visitStats, 'visits'),
        this.renderCard('Spending Analysis', spendingStats, 'spending')
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
// Add proper error boundary
componentDidCatch(error, errorInfo) {
    console.error('Error in GuestAnalytics:', error, errorInfo);
    this.setState({
        error: 'Failed to load analytics'
    });
}    

    render() {
        const { loading, error, analytics } = this.state;

        if (loading) return this.renderLoading();
        if (error) return this.renderError();
        if (!analytics) return React.createElement('div', { className: 'alert alert-warning' }, 'No data available');

        try {
            return this.renderAnalytics();
        } catch (error) {
            console.error('Render error:', error);
            return this.renderError();
        }
    }
}

// Just keep the window assignment
window.GuestAnalytics = GuestAnalytics;