<template>
  <div class="subscription-info">
    <h4>Your Subscription</h4>
    <div class="subscription-details">
      <div class="detail">
        <label>Current Plan</label>
        <span>{{ planName }}</span>
      </div>
      <div class="detail">
        <label>Status</label>
        <span>{{ status }}</span>
      </div>
      <div class="detail">
        <label>Locations</label>
        <span>{{ locationCount }}</span>
      </div>
      <div class="detail">
        <a href="user-subscription.html" class="upgrade-btn" style="text-decoration: none;">Manage Subscription</a>
      </div>
      <div class="feature-badges">
        <FeatureBadge
          v-for="feature in features"
          :key="feature.id"
          :feature-id="feature.id"
          :name="feature.name"
          :icon="feature.icon"
          :has-access="featureAccess[feature.id] || false"
          @upgrade="$emit('upgrade', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script>
import FeatureBadge from '../ui/FeatureBadge.vue'
import { FEATURE_BADGES } from '../../constants/dashboard.constants.js'

export default {
  name: 'SubscriptionCard',
  components: { FeatureBadge },
  props: {
    planName: { type: String, default: 'Loading...' },
    status: { type: String, default: 'Loading...' },
    locationCount: { type: String, default: '0 / 0' },
    featureAccess: { type: Object, default: () => ({}) }
  },
  emits: ['upgrade'],
  computed: {
    features() {
      return FEATURE_BADGES
    }
  }
}
</script>
