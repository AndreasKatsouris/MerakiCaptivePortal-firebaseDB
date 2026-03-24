<template>
  <div class="quick-actions">
    <ActionCard
      v-for="action in actions"
      :key="action.id"
      :icon="action.icon"
      :title="action.title"
      :description="action.description"
      :locked="isLocked(action)"
      :href="action.href"
      :action-type="action.action"
      :feature-id="action.featureId"
      @action="handleAction"
      @upgrade="$emit('upgrade', $event)"
    />
  </div>
</template>

<script>
import ActionCard from '../ui/ActionCard.vue'
import { QUICK_ACTIONS } from '../../constants/dashboard.constants.js'

export default {
  name: 'QuickActions',
  components: { ActionCard },
  props: {
    featureAccess: { type: Object, default: () => ({}) },
    canAddLocation: { type: Boolean, default: true }
  },
  emits: ['action', 'upgrade'],
  computed: {
    actions() {
      return QUICK_ACTIONS
    }
  },
  methods: {
    isLocked(action) {
      if (action.action === 'addLocation') {
        return !this.canAddLocation
      }
      if (action.featureId) {
        return !this.featureAccess[action.featureId]
      }
      return false
    },
    handleAction(actionType) {
      this.$emit('action', actionType)
    }
  }
}
</script>
