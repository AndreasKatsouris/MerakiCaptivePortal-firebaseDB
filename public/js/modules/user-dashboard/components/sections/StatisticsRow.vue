<template>
  <div class="row mb-4">
    <div class="col-md-3">
      <StatCard
        :value="statistics.totalGuests"
        label="Total Guests"
        :locked="locked"
        @upgrade="$emit('upgrade', 'analyticsBasic')"
      />
    </div>
    <div class="col-md-3">
      <StatCard
        :value="statistics.activeCampaigns"
        label="Active Campaigns"
        :locked="locked"
        @upgrade="$emit('upgrade', 'analyticsBasic')"
      />
    </div>
    <div class="col-md-3">
      <StatCard
        :value="statistics.totalRewards"
        label="Rewards Issued"
        :locked="locked"
        @upgrade="$emit('upgrade', 'analyticsBasic')"
      />
    </div>
    <div class="col-md-3">
      <StatCard
        :value="statistics.engagementRate + '%'"
        label="Engagement Rate"
        :locked="locked"
        @upgrade="$emit('upgrade', 'analyticsBasic')"
      />
    </div>
  </div>
</template>

<script>
import StatCard from '../ui/StatCard.vue'

export default {
  name: 'StatisticsRow',
  components: { StatCard },
  props: {
    statistics: {
      type: Object,
      default: () => ({
        totalGuests: 0,
        activeCampaigns: 0,
        totalRewards: 0,
        engagementRate: 0
      })
    },
    locked: { type: Boolean, default: false }
  },
  emits: ['upgrade']
}
</script>
