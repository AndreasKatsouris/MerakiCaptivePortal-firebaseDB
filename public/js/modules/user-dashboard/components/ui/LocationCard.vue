<template>
  <div class="location-card">
    <span class="badge bg-success">Active</span>
    <h5>{{ location.name }}</h5>
    <p class="mb-2"><i class="fas fa-map-marker-alt me-2"></i>{{ location.address }}</p>
    <p class="mb-2"><i class="fas fa-phone me-2"></i>{{ location.phone }}</p>
    <p class="mb-2"><i class="fas fa-building me-2"></i>{{ formattedType }}</p>

    <!-- WhatsApp Info -->
    <div v-if="whatsappMapping && whatsappMapping.isActive" class="mt-2 p-2 bg-light rounded">
      <p class="mb-1">
        <i class="fab fa-whatsapp me-2 text-success"></i>
        <strong>WhatsApp:</strong>
        <span class="font-monospace">{{ whatsappMapping.phoneNumber }}</span>
        <span class="badge bg-success ms-2" style="font-size: 0.7em;">Active</span>
      </p>
      <small class="text-muted">
        <i class="fas fa-info-circle me-1"></i>
        Messages to this number will be routed to {{ location.name }}
      </small>
    </div>
    <div v-else class="mt-2 p-2 bg-light rounded">
      <p class="mb-1 text-muted">
        <i class="fab fa-whatsapp me-2"></i>
        <strong>WhatsApp:</strong> Not configured
      </p>
      <small class="text-muted">
        <i class="fas fa-info-circle me-1"></i>
        Configure WhatsApp messaging for this location
      </small>
    </div>

    <!-- Actions -->
    <div class="mt-3">
      <button class="btn btn-sm btn-outline-primary" @click="$emit('edit', location.id)">
        <i class="fas fa-edit me-1"></i>Edit
      </button>
      <button class="btn btn-sm btn-outline-danger" @click="$emit('delete', location.id)">
        <i class="fas fa-trash me-1"></i>Delete
      </button>
      <button class="btn btn-sm btn-outline-secondary" @click="$emit('view-analytics', location.id)">
        <i class="fas fa-chart-bar me-1"></i>Analytics
      </button>
      <button
        v-if="whatsappMapping"
        class="btn btn-sm btn-outline-success"
        @click="$emit('manage-whatsapp', location.id)"
      >
        <i class="fab fa-whatsapp me-1"></i>Manage WhatsApp
      </button>
      <button
        v-else
        class="btn btn-sm btn-success"
        @click="$emit('setup-whatsapp', location.id)"
      >
        <i class="fab fa-whatsapp me-1"></i>Setup WhatsApp
      </button>
    </div>
  </div>
</template>

<script>
import { LOCATION_TYPE_MAP } from '../../constants/dashboard.constants.js'

export default {
  name: 'LocationCard',
  props: {
    location: { type: Object, required: true },
    whatsappMapping: { type: Object, default: null }
  },
  emits: ['edit', 'delete', 'view-analytics', 'manage-whatsapp', 'setup-whatsapp'],
  computed: {
    formattedType() {
      return LOCATION_TYPE_MAP[this.location.type] || this.location.type
    }
  }
}
</script>
