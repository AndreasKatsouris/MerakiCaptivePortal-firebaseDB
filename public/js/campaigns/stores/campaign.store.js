// stores/campaign.store.js
import { defineStore } from 'pinia';
import { CampaignStatus } from './types/campaign.types';

export const useCampaignStore = defineStore('campaigns', {
  state: () => ({
    campaigns: [],
    loading: false,
    currentCampaign: null,
    error: null,
    validationStatus: {},
    filters: {
      status: null,
      brandName: null,
      dateRange: null
    }
  }),

  getters: {
    // Get all active campaigns
    activeCampaigns: (state) => 
      state.campaigns.filter(campaign => campaign.status === CampaignStatus.ACTIVE),

    // Get campaigns by brand
    getCampaignsByBrand: (state) => (brandName) => 
      state.campaigns.filter(campaign => campaign.brandName === brandName),

    // Get filtered campaigns based on current filters
    filteredCampaigns: (state) => {
      let filtered = [...state.campaigns];

      if (state.filters.status) {
        filtered = filtered.filter(campaign => campaign.status === state.filters.status);
      }

      if (state.filters.brandName) {
        filtered = filtered.filter(campaign => 
          campaign.brandName.toLowerCase().includes(state.filters.brandName.toLowerCase())
        );
      }

      if (state.filters.dateRange) {
        const { start, end } = state.filters.dateRange;
        filtered = filtered.filter(campaign => {
          const campaignStart = new Date(campaign.startDate);
          const campaignEnd = new Date(campaign.endDate);
          return campaignStart >= start && campaignEnd <= end;
        });
      }

      return filtered;
    },

    // Check if a campaign is valid
    isValidCampaign: (state) => (campaignId) => 
      state.validationStatus[campaignId]?.isValid || false,

    // Get campaign validation errors
    getCampaignErrors: (state) => (campaignId) => 
      state.validationStatus[campaignId]?.errors || []
  },

  actions: {
    // Fetch all campaigns
    async fetchCampaigns() {
      this.loading = true;
      this.error = null;

      try {
        const snapshot = await firebase.database()
          .ref('campaigns')
          .once('value');

        const campaignsData = snapshot.val() || {};
        
        this.campaigns = Object.entries(campaignsData)
          .map(([id, data]) => ({
            id,
            ...data,
            startDate: new Date(data.startDate),
            endDate: new Date(data.endDate)
          }));
      } catch (error) {
        console.error('Error fetching campaigns:', error);
        this.error = 'Failed to fetch campaigns';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    // Set current campaign
    setCurrentCampaign(campaign) {
      this.currentCampaign = campaign;
    },

    // Update filters
    updateFilters(filters) {
      this.filters = {
        ...this.filters,
        ...filters
      };
    },

    // Create new campaign
    async createCampaign(campaignData) {
      this.loading = true;
      this.error = null;

      try {
        // Validate campaign data
        const validationResult = await this.validateCampaign(campaignData);
        if (!validationResult.isValid) {
          throw new Error(validationResult.errors.join(', '));
        }

        const campaignRef = firebase.database().ref('campaigns').push();
        
        const campaign = {
          ...campaignData,
          id: campaignRef.key,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        await campaignRef.set(campaign);
        this.campaigns.push(campaign);
        
        return campaign;
      } catch (error) {
        console.error('Error creating campaign:', error);
        this.error = 'Failed to create campaign';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    // Update existing campaign
    async updateCampaign(campaignId, updateData) {
      this.loading = true;
      this.error = null;

      try {
        // Validate update data
        const validationResult = await this.validateCampaign({
          ...this.campaigns.find(c => c.id === campaignId),
          ...updateData
        });

        if (!validationResult.isValid) {
          throw new Error(validationResult.errors.join(', '));
        }

        const updates = {
          ...updateData,
          updatedAt: Date.now()
        };

        await firebase.database()
          .ref(`campaigns/${campaignId}`)
          .update(updates);

        // Update local state
        const index = this.campaigns.findIndex(c => c.id === campaignId);
        if (index !== -1) {
          this.campaigns[index] = {
            ...this.campaigns[index],
            ...updates
          };
        }

        return this.campaigns[index];
      } catch (error) {
        console.error('Error updating campaign:', error);
        this.error = 'Failed to update campaign';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    // Delete campaign
    async deleteCampaign(campaignId) {
      this.loading = true;
      this.error = null;

      try {
        await firebase.database()
          .ref(`campaigns/${campaignId}`)
          .remove();

        this.campaigns = this.campaigns.filter(c => c.id !== campaignId);
        
        if (this.currentCampaign?.id === campaignId) {
          this.currentCampaign = null;
        }
      } catch (error) {
        console.error('Error deleting campaign:', error);
        this.error = 'Failed to delete campaign';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    // Validate campaign
    async validateCampaign(campaign) {
      try {
        const validationResult = await window.guardRail.validateCampaign(campaign);
        this.validationStatus[campaign.id] = validationResult;
        return validationResult;
      } catch (error) {
        console.error('Error validating campaign:', error);
        throw error;
      }
    },

    // Reset store state
    resetState() {
      this.campaigns = [];
      this.loading = false;
      this.currentCampaign = null;
      this.error = null;
      this.validationStatus = {};
      this.filters = {
        status: null,
        brandName: null,
        dateRange: null
      };
    }
  }
});