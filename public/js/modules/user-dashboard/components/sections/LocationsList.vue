<template>
  <div class="dashboard-card">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h4>Your Locations</h4>
      <button class="add-location-btn" :disabled="!canAdd" @click="$emit('add')">
        <i class="fas fa-plus me-2"></i>Add Location
      </button>
    </div>

    <div v-if="locations.length === 0" class="text-center py-5">
      <i class="fas fa-store fa-3x text-muted mb-3"></i>
      <p class="text-muted">No locations added yet. Click "Add Location" to get started!</p>
    </div>

    <LocationCard
      v-for="location in locations"
      :key="location.id"
      :location="location"
      :whatsapp-mapping="getWhatsAppMapping(location.id)"
      @edit="$emit('edit', $event)"
      @delete="$emit('delete', $event)"
      @view-analytics="$emit('view-analytics', $event)"
      @manage-whatsapp="$emit('manage-whatsapp', $event)"
      @setup-whatsapp="$emit('setup-whatsapp', $event)"
    />
  </div>
</template>

<script>
import LocationCard from '../ui/LocationCard.vue'

export default {
  name: 'LocationsList',
  components: { LocationCard },
  props: {
    locations: { type: Array, default: () => [] },
    whatsappMappings: { type: Array, default: () => [] },
    canAdd: { type: Boolean, default: true }
  },
  emits: ['add', 'edit', 'delete', 'view-analytics', 'manage-whatsapp', 'setup-whatsapp'],
  methods: {
    getWhatsAppMapping(locationId) {
      return this.whatsappMappings.find(m => m.locationId === locationId) || null
    }
  }
}
</script>
