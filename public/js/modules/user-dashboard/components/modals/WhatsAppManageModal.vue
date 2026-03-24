<template>
  <div v-if="show" class="modal fade show d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Manage WhatsApp</h5>
          <button type="button" class="btn-close" @click="$emit('close')"></button>
        </div>
        <div class="modal-body text-start">
          <p><strong>Location:</strong> {{ locationName }}</p>
          <p><strong>WhatsApp Number:</strong> <span class="font-monospace">{{ phoneNumber }}</span></p>
          <p><strong>Status:</strong> <span class="badge bg-success">Active</span></p>
          <p class="text-muted mb-3">Messages sent to this WhatsApp number will be routed to {{ locationName }}.</p>
          <div class="alert alert-success">
            <i class="fas fa-check-circle me-2"></i>
            <strong>WhatsApp messaging is active</strong> for this location.
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Close</button>
          <button type="button" class="btn btn-success" @click="openAdmin">
            <i class="fab fa-whatsapp me-1"></i>Open Admin Dashboard
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'WhatsAppManageModal',
  props: {
    show: { type: Boolean, default: false },
    locationName: { type: String, default: '' },
    phoneNumber: { type: String, default: '' }
  },
  emits: ['close'],
  methods: {
    openAdmin() {
      window.open('/admin_tools/whatsapp-management.html', '_blank')
      this.$emit('close')
    }
  }
}
</script>
