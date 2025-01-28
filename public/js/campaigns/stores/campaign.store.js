const { defineStore } = Pinia
import { 
  validateCampaign, 
  calculateCampaignStatus,
  getCampaignMetrics 
} from '../utils/campaign.utils'
import { CAMPAIGN_STATUS, DEFAULT_CAMPAIGN_SETTINGS } from '../constants/campaign.constants'

export const useCampaignStore = defineStore('campaigns', {
  state: () => ({
    campaigns: [],
    loading: false,
    error: null,
    currentCampaign: null,
    metrics: {},
    filters: {
      status: null,
      brandName: null,
      dateRange: null
    }
  }),

  getters: {
    activeCampaigns: (state) => 
      state.campaigns.filter(campaign => 
        calculateCampaignStatus(campaign) === CAMPAIGN_STATUS.ACTIVE
      ),

    filteredCampaigns: (state) => {
      let filtered = [...state.campaigns]

      if (state.filters.status) {
        filtered = filtered.filter(campaign => 
          calculateCampaignStatus(campaign) === state.filters.status
        )
      }

      if (state.filters.brandName) {
        filtered = filtered.filter(campaign => 
          campaign.brandName.toLowerCase().includes(state.filters.brandName.toLowerCase())
        )
      }

      if (state.filters.dateRange) {
        const { start, end } = state.filters.dateRange
        filtered = filtered.filter(campaign => {
          const campaignStart = new Date(campaign.startDate)
          const campaignEnd = new Date(campaign.endDate)
          return campaignStart >= start && campaignEnd <= end
        })
      }

      return filtered
    },

    getCampaignById: (state) => (id) => 
      state.campaigns.find(campaign => campaign.id === id)
  },

  actions: {
    async fetchCampaigns() {
      this.loading = true
      this.error = null

      try {
        const snapshot = await firebase.database()
          .ref('campaigns')
          .once('value')

        const campaignsData = snapshot.val() || {}
        
        this.campaigns = Object.entries(campaignsData).map(([id, data]) => ({
          id,
          ...data
        }))

        // Fetch metrics for active campaigns
        await Promise.all(
          this.activeCampaigns.map(async (campaign) => {
            this.metrics[campaign.id] = await getCampaignMetrics(campaign.id)
          })
        )
      } catch (error) {
        console.error('Error fetching campaigns:', error)
        this.error = 'Failed to fetch campaigns'
        throw error
      } finally {
        this.loading = false
      }
    },

    async createCampaign(campaignData) {
      this.loading = true
      this.error = null

      try {
        // Validate campaign data
        const validationResult = validateCampaign(campaignData)
        if (!validationResult.isValid) {
          throw new Error(validationResult.errors.join(', '))
        }

        const campaignRef = firebase.database().ref('campaigns').push()
        
        const campaign = {
          ...campaignData,
          settings: {
            ...DEFAULT_CAMPAIGN_SETTINGS,
            ...campaignData.settings
          },
          id: campaignRef.key,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        }

        await campaignRef.set(campaign)
        
        // Update local state
        this.campaigns.push(campaign)
        
        return campaign
      } catch (error) {
        console.error('Error creating campaign:', error)
        this.error = 'Failed to create campaign'
        throw error
      } finally {
        this.loading = false
      }
    },

    async updateCampaign(campaignId, updateData) {
      this.loading = true
      this.error = null

      try {
        // Get existing campaign
        const existingCampaign = this.getCampaignById(campaignId)
        if (!existingCampaign) {
          throw new Error('Campaign not found')
        }

        // Merge update data with existing campaign
        const updatedCampaign = {
          ...existingCampaign,
          ...updateData,
          settings: {
            ...existingCampaign.settings,
            ...updateData.settings
          },
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        }

        // Validate updated campaign
        const validationResult = validateCampaign(updatedCampaign)
        if (!validationResult.isValid) {
          throw new Error(validationResult.errors.join(', '))
        }

        // Update in Firebase
        await firebase.database()
          .ref(`campaigns/${campaignId}`)
          .update(updatedCampaign)

        // Update local state
        const index = this.campaigns.findIndex(c => c.id === campaignId)
        if (index !== -1) {
          this.campaigns[index] = updatedCampaign
        }

        // Update metrics if campaign is active
        if (calculateCampaignStatus(updatedCampaign) === CAMPAIGN_STATUS.ACTIVE) {
          this.metrics[campaignId] = await getCampaignMetrics(campaignId)
        }

        return updatedCampaign
      } catch (error) {
        console.error('Error updating campaign:', error)
        this.error = 'Failed to update campaign'
        throw error
      } finally {
        this.loading = false
      }
    },

    async deleteCampaign(campaignId) {
      this.loading = true
      this.error = null

      try {
        // Check if campaign exists
        const campaign = this.getCampaignById(campaignId)
        if (!campaign) {
          throw new Error('Campaign not found')
        }

        // Check if campaign can be deleted (no active rewards)
        const rewardsSnapshot = await firebase.database()
          .ref('rewards')
          .orderByChild('campaignId')
          .equalTo(campaignId)
          .once('value')

        const rewards = rewardsSnapshot.val()
        if (rewards && Object.keys(rewards).length > 0) {
          throw new Error('Cannot delete campaign with existing rewards')
        }

        // Delete from Firebase
        await firebase.database()
          .ref(`campaigns/${campaignId}`)
          .remove()

        // Update local state
        this.campaigns = this.campaigns.filter(c => c.id !== campaignId)
        delete this.metrics[campaignId]

        if (this.currentCampaign?.id === campaignId) {
          this.currentCampaign = null
        }
      } catch (error) {
        console.error('Error deleting campaign:', error)
        this.error = 'Failed to delete campaign'
        throw error
      } finally {
        this.loading = false
      }
    },

    setCurrentCampaign(campaign) {
      this.currentCampaign = campaign
    },

    updateFilters(filters) {
      this.filters = {
        ...this.filters,
        ...filters
      }
    },

    resetFilters() {
      this.filters = {
        status: null,
        brandName: null,
        dateRange: null
      }
    },

    async refreshMetrics(campaignId) {
      try {
        if (campaignId) {
          this.metrics[campaignId] = await getCampaignMetrics(campaignId)
        } else {
          await Promise.all(
            this.activeCampaigns.map(async (campaign) => {
              this.metrics[campaign.id] = await getCampaignMetrics(campaign.id)
            })
          )
        }
      } catch (error) {
        console.error('Error refreshing metrics:', error)
        throw error
      }
    },

    resetState() {
      this.campaigns = []
      this.loading = false
      this.error = null
      this.currentCampaign = null
      this.metrics = {}
      this.filters = {
        status: null,
        brandName: null,
        dateRange: null
      }
    }
  }
})