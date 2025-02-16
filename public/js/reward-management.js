import { auth } from './config/firebase-config.js';

export function initializeRewardManagement() {
    console.log('Initializing reward management...');
    
    const app = Vue.createApp({
        data() {
            return {
                rewards: [],
                loading: false,
                error: null,
                filters: {
                    status: '',
                    guestName: '',
                    rewardType: ''
                },
                rewardTypes: [],
                campaigns: []
            };
        },

        methods: {
            async loadRewards() {
                this.loading = true;
                try {
                    const snapshot = await firebase.database().ref('rewards').once('value');
                    const data = snapshot.val() || {};
                    this.rewards = Object.entries(data).map(([id, reward]) => ({
                        id,
                        ...reward
                    }));
                    console.log('Rewards loaded:', this.rewards.length);
                } catch (error) {
                    console.error('Error loading rewards:', error);
                    this.error = 'Failed to load rewards';
                } finally {
                    this.loading = false;
                }
            },

            async loadRewardTypes() {
                try {
                    const snapshot = await firebase.database().ref('rewardTypes').once('value');
                    const data = snapshot.val() || {};
                    this.rewardTypes = Object.entries(data).map(([id, type]) => ({
                        id,
                        ...type
                    }));
                } catch (error) {
                    console.error('Error loading reward types:', error);
                }
            },

            async loadCampaigns() {
                try {
                    const snapshot = await firebase.database().ref('campaigns').once('value');
                    const data = snapshot.val() || {};
                    this.campaigns = Object.entries(data).map(([id, campaign]) => ({
                        id,
                        ...campaign
                    }));
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                }
            },

            getStatusBadgeClass(status) {
                const classes = {
                    available: 'bg-success',
                    redeemed: 'bg-primary',
                    expired: 'bg-danger',
                    default: 'bg-secondary'
                };
                return classes[status] || classes.default;
            },

            formatDate(date) {
                if (!date) return 'N/A';
                return new Date(date).toLocaleDateString();
            }
        },

        computed: {
            filteredRewards() {
                return this.rewards.filter(reward => {
                    const matchesStatus = !this.filters.status || 
                                        reward.status === this.filters.status;
                    const matchesGuest = !this.filters.guestName || 
                                       reward.guestName?.toLowerCase().includes(this.filters.guestName.toLowerCase());
                    const matchesType = !this.filters.rewardType || 
                                      reward.rewardTypeId === this.filters.rewardType;
                    return matchesStatus && matchesGuest && matchesType;
                });
            }
        },

        mounted() {
            console.log('Reward management component mounted');
            this.loadRewards();
            this.loadRewardTypes();
            this.loadCampaigns();
        }
    });

    // Mount the app
    const mountPoint = document.getElementById('rewardManagementContent');
    if (mountPoint) {
        app.mount(mountPoint);
        console.log('Reward management initialized');
    } else {
        console.error('Reward management mount point not found');
    }

    return app;
} 